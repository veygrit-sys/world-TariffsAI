import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Ajv } from "ajv";
import addFormatsModule from "ajv-formats";
import { reconcileInvoice, type InvoiceReconciliationInput } from "../src/invoice-reconciliation.ts";
import { quotePilotShipment, type PilotQuoteRequest } from "../src/pilot-quote.ts";
import { releaseReadiness } from "../src/release-readiness.ts";
import { loadTariffCatalog } from "../src/tariffs.ts";
import { quoteVeygritOrder, reconcileVeygritInvoice, type PilotOrderSnapshot } from "../src/veygrit-pilot.ts";
import type { VeygritPorts } from "../src/veygrit.ts";
import { data } from "./helpers.ts";

const readJson = <T>(name: string): T =>
  JSON.parse(readFileSync(new URL("../" + name, import.meta.url), "utf8")) as T;
const now = new Date("2026-11-12T00:00:00Z");
const catalog = loadTariffCatalog(data);
const quoteInput = readJson<PilotQuoteRequest>("examples/pilot-quote-jp-us.json");
const reconciliationInput = readJson<InvoiceReconciliationInput>("examples/pilot-reconcile-jp-us.json");
const { orderId, plan, ...pilotQuote } = quoteInput;
const { shipment, ...customs } = plan;
const merchantId = "synthetic-merchant";
const order: PilotOrderSnapshot = {
  merchantId, orderId, cartVersion: "cart-1", addressTokenRef: "private-address-token",
  addressVersion: "address-1", grantRef: "private-grant", shipment, customs, pilotQuote,
};
const orderRequest = { authenticatedMerchantId: merchantId, orderId, expectedCartVersion: order.cartVersion };
const orderPorts: VeygritPorts<PilotOrderSnapshot> = {
  loadOrder: async () => order,
  verifyGrant: async () => ({
    allowed: true, revoked: false, purpose: "shipment", expiresAt: "2026-11-12T00:01:00Z",
    merchantId, orderId, addressVersion: order.addressVersion, addressTokenRef: order.addressTokenRef,
  }),
  resolveCustomsScope: async () => ({ country: "US", zone: "standard" }),
  snapshotIsCurrent: async () => true,
};

test("merchant quote uses the verified order, grant expiry and current address scope", async () => {
  const quote = await quoteVeygritOrder(orderRequest, orderPorts, data, catalog, now);
  assert.equal(quote.context, "verified_order_pilot");
  assert.equal(quote.status, "estimated");
  assert.equal(quote.expiresAt, "2026-11-12T00:01:00.000Z");
  assert.equal(quote.cartVersion, "cart-1");
  assert.deepEqual(quote.estimate, reconciliationInput.estimate);
  assert.equal(quote.productionAuthorized, false);
  assert.ok(!JSON.stringify(quote).includes("private-address-token"));
  assert.ok(!JSON.stringify(quote).includes("private-grant"));
  await assert.rejects(() => quoteVeygritOrder(
    { ...orderRequest, authenticatedMerchantId: "another-merchant" }, orderPorts, data, catalog, now,
  ), /ORDER_NOT_FOUND/);
  await assert.rejects(() => quoteVeygritOrder(
    orderRequest, { ...orderPorts, snapshotIsCurrent: async () => false }, data, catalog, now,
  ), /ORDER_CHANGED_REQUOTE_REQUIRED/);
});

test("merchant reconciliation loads saved records scoped by merchant, order and exact IDs", async () => {
  const { estimate, invoice } = reconciliationInput;
  const request = { authenticatedMerchantId: merchantId, orderId, estimateId: estimate.estimateId, invoiceId: invoice.invoiceId };
  const result = await reconcileVeygritInvoice(request, {
    loadEstimate: async (query) => {
      assert.deepEqual(query, { authenticatedMerchantId: merchantId, orderId, estimateId: estimate.estimateId });
      return { merchantId, estimate };
    },
    loadInvoice: async (query) => {
      assert.deepEqual(query, { authenticatedMerchantId: merchantId, orderId, invoiceId: invoice.invoiceId });
      return { merchantId, invoice };
    },
  });
  assert.equal(result.status, "differences");
  assert.equal(result.differenceTotal, "0.50");
  assert.equal(result.lines.find(({ category }) => category === "carrier_fee")?.explanation?.reason, "fee");
  await assert.rejects(() => reconcileVeygritInvoice(request, {
    loadEstimate: async () => ({ merchantId, estimate: { ...estimate, estimateId: "other-estimate" } }),
    loadInvoice: async () => ({ merchantId, invoice }),
  }), /ORDER_SETTLEMENT_RECORD_NOT_FOUND/);
  await assert.rejects(() => reconcileVeygritInvoice(request, {
    loadEstimate: async () => ({ merchantId: "other-merchant", estimate }),
    loadInvoice: async () => ({ merchantId, invoice }),
  }), /ORDER_SETTLEMENT_RECORD_NOT_FOUND/);
});

test("commercial evidence keeps opaque source IDs and removes private URL components", () => {
  const input = structuredClone(quoteInput);
  const proof = input.charges[0]!.evidence;
  proof.sourceUrl = "https://broker.example/private-path?token=synthetic-private-token#private-fragment";
  const result = quotePilotShipment(input, data, catalog, now);
  assert.equal(result.status, "estimated");
  assert.equal(result.charges[0]?.evidence?.id, proof.id);
  assert.equal(result.charges[0]?.evidence?.sourceUrl, "https://broker.example");
  assert.ok(!JSON.stringify(result).includes("synthetic-private-token"));
  proof.sourceUrl = "https://private-user:private-password@broker.example/";
  const blocked = quotePilotShipment(input, data, catalog, now);
  assert.equal(blocked.estimate, null);
  assert.ok(blocked.findings.some(({ code }) => code === "EVIDENCE_URL_CREDENTIALS"));
  assert.ok(!JSON.stringify(blocked).includes("private-password"));
});

test("changing the reviewed U.S. jurisdiction decision invalidates the quote evidence", () => {
  const result = quotePilotShipment({ ...quoteInput, usJurisdictionApplies: true }, data, catalog, now);
  assert.equal(result.status, "review_required");
  assert.equal(result.estimate, null);
  assert.ok(result.findings.some(({ code }) => code === "REVIEWED_SHIPMENT_MISMATCH"));
});

test("the generated OpenAPI contracts validate the release API inputs and outputs", () => {
  const spec = readJson<{
    components: { schemas: Record<string, object> };
    paths: Record<string, { get: { responses: Record<string, { content: { "application/json": { schema: object } } }> } }>;
  }>("docs/openapi.json");
  const ajv = new Ajv({ strict: true, allowUnionTypes: true });
  (addFormatsModule as unknown as (instance: Ajv) => void)(ajv);
  const examples: [object, unknown][] = [
    [spec.components.schemas.PilotQuoteRequest!, quoteInput],
    [spec.components.schemas.PilotQuote!, quotePilotShipment(quoteInput, data, catalog, now)],
    [spec.components.schemas.InvoiceReconciliationInput!, reconciliationInput],
    [spec.components.schemas.InvoiceReconciliation!, reconcileInvoice(reconciliationInput)],
    [spec.paths["/v1/release-readiness"]!.get.responses["200"]!.content["application/json"].schema,
      releaseReadiness(data, now)],
  ];
  for (const [schema, example] of examples) {
    const check = ajv.compile(schema);
    assert.ok(check(example), JSON.stringify(check.errors));
  }
});
