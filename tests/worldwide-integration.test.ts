import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Ajv } from "ajv";
import addFormatsModule from "ajv-formats";
import { createHandler } from "../src/http.ts";
import type { PilotQuote, WorldQuoteRequest } from "../src/pilot-quote.ts";
import { loadTariffCatalog } from "../src/tariffs.ts";
import type { VeygritPorts } from "../src/veygrit.ts";
import { quoteVeygritWorldOrder, type WorldOrderSnapshot } from "../src/veygrit-pilot.ts";
import { VERSION } from "../src/version.ts";
import type { WorldDirectionCoverage, WorldDirectionResponse } from "../src/world-directions.ts";
import { data } from "./helpers.ts";

const now = new Date("2026-11-12T00:00:00Z");
const example = JSON.parse(readFileSync(
  new URL("../examples/worldwide-quote-br-de.json", import.meta.url), "utf8",
)) as WorldQuoteRequest;
const catalog = loadTariffCatalog(data);
const apiKey = "synthetic-worldwide-auth-test-key";
const handler = createHandler({ dataset: data, tariffs: catalog, apiKey, now: () => now });
const peer = { peer: "127.0.0.1" };

function get(path: string, authenticated = true) {
  return handler(new Request("http://localhost" + path, {
    headers: authenticated ? { authorization: "Bearer " + apiKey } : {},
  }), peer);
}

function post(path: string, payload: unknown) {
  return handler(new Request("http://localhost" + path, {
    method: "POST",
    headers: { authorization: "Bearer " + apiKey, "content-type": "application/json" },
    body: JSON.stringify(payload),
  }), peer);
}

test("worldwide HTTP exposes exact directional coverage and date-dependent reference counts", async () => {
  const historical = await get("/v1/worldwide/coverage?date=2026-11-11");
  assert.equal(historical.status, 200);
  assert.equal(historical.headers.get("cache-control"), "no-store");
  const report = await historical.json() as WorldDirectionCoverage;
  assert.equal(report.totals.registryDestinations, 249);
  assert.equal(report.totals.candidateDirections, 61_256);
  assert.equal(report.totals.withStandardTariffReferenceOnDate, 86);
  assert.equal(report.totals.productionVerifiedDirections, 0);
  const current = await (await get("/v1/worldwide/coverage?date=2026-11-12")).json() as WorldDirectionCoverage;
  assert.equal(current.totals.withStandardTariffReferenceOnDate, 111);
  assert.equal(current.passes.find((row) => row.pass === 2)?.withStandardTariffReferenceOnDate, 26);
  const after = await (await get("/v1/worldwide/coverage?date=2026-11-13")).json() as WorldDirectionCoverage;
  assert.equal(after.totals.withStandardTariffReferenceOnDate, 0);
  assert.equal((await get("/v1/worldwide/coverage", false)).status, 401);
  assert.equal((await get("/v1/worldwide/coverage?date=2026-11-11&date=2026-11-12")).status, 400);
  const direction = await (await get("/v1/worldwide/direction?originCountry=BR&destinationCountry=DE&date=2026-11-11")).json() as WorldDirectionResponse;
  assert.equal(direction.direction, "BR-DE");
  assert.equal(direction.destinationRollout?.pass, 3);
  assert.ok(direction.destination.officialSources.length);
  assert.equal(direction.productionAuthorized, false);
  assert.equal((await get("/v1/worldwide/direction?originCountry=BR&destinationCountry=ZZ")).status, 400);
});

test("worldwide HTTP links a quote outside the pilot to its reconciled invoice", async () => {
  const legacy = structuredClone(example);
  delete legacy.tradeReview;
  const oldResponse = await post("/v1/pilot/quote", legacy);
  assert.equal(oldResponse.status, 200);
  assert.equal((await oldResponse.json() as PilotQuote).status, "out_of_scope");
  const newResponse = await post("/v1/worldwide/quote", example);
  assert.equal(newResponse.status, 200);
  const quote = await newResponse.json() as PilotQuote;
  assert.equal(quote.status, "estimated");
  assert.deepEqual(quote.buyerTotal, { currency: "EUR", value: "275.00" });
  assert.equal(quote.productionAuthorized, false);
  assert.ok(quote.estimate);
  const { estimate } = quote;
  const result = await post("/v1/worldwide/reconcile", {
    estimate,
    invoice: {
      ...estimate,
      invoiceId: "synthetic-invoice-br-de",
      issuedOn: "2026-11-13",
      charges: estimate.charges.map((line) => line.category === "carrier_fee" ? { ...line, amount: "5.50" } : line),
    },
  });
  assert.equal(result.status, 200);
  assert.equal((await result.json() as { differenceTotal: string }).differenceTotal, "0.50");
  const held = await (await post("/v1/worldwide/quote", legacy)).json() as PilotQuote;
  assert.equal(held.status, "review_required");
  assert.equal(held.buyerTotal, null);
  assert.ok(held.findings.some(({ code }) => code === "WORLDWIDE_TRADE_REVIEW_REQUIRED"));
});

test("worldwide SDK verifies merchant order and caps the estimate at address-grant expiry", async () => {
  const { orderId, plan, ...worldQuote } = example;
  const { shipment, ...customs } = plan;
  const order: WorldOrderSnapshot = {
    merchantId: "synthetic-merchant", orderId, cartVersion: "v1", addressTokenRef: "private-address-token",
    addressVersion: "v1", grantRef: "private-grant", shipment, customs, worldQuote,
  };
  const ports: VeygritPorts<WorldOrderSnapshot> = {
    loadOrder: async () => order,
    verifyGrant: async () => ({
      allowed: true, revoked: false, purpose: "shipment", expiresAt: "2026-11-12T00:01:00Z",
      merchantId: order.merchantId, orderId, addressTokenRef: order.addressTokenRef, addressVersion: order.addressVersion,
    }),
    resolveCustomsScope: async () => ({ country: shipment.destinationCountry, zone: shipment.destinationZone }),
    snapshotIsCurrent: async () => true,
  };
  const request = { authenticatedMerchantId: order.merchantId, orderId, expectedCartVersion: order.cartVersion };
  const result = await quoteVeygritWorldOrder(request, ports, data, catalog, now);
  assert.equal(result.context, "verified_order_worldwide");
  assert.equal(result.status, "estimated");
  assert.equal(result.expiresAt, "2026-11-12T00:01:00.000Z");
  assert.ok(!JSON.stringify(result).includes("private-address-token"));
  await assert.rejects(() => quoteVeygritWorldOrder(
    request, { ...ports, snapshotIsCurrent: async () => false }, data, catalog, now,
  ), /ORDER_CHANGED_REQUOTE_REQUIRED/);
});

test("OpenAPI validates examples and generated worldwide HTTP responses", async () => {
  const doc = JSON.parse(readFileSync(new URL("../docs/openapi.json", import.meta.url), "utf8")) as {
    info: { version: string };
    components: { schemas: Record<string, object> };
    paths: Record<string, { get: { responses: Record<string, { content: { "application/json": { schema: object } } }> } }>;
  };
  assert.equal(doc.info.version, VERSION);
  const ajv = new Ajv({ strict: true, allowUnionTypes: true });
  (addFormatsModule as unknown as (instance: Ajv) => void)(ajv);
  const check = (schema: object, value: unknown) => {
    const valid = ajv.compile(schema);
    assert.ok(valid(value), JSON.stringify(valid.errors));
  };
  const schema = (path: string) => doc.paths[path]!.get.responses["200"]!.content["application/json"].schema;
  check(doc.components.schemas.WorldQuoteRequest!, example);
  check(doc.components.schemas.PilotQuote!, await (await post("/v1/worldwide/quote", example)).json());
  check(schema("/v1/worldwide/coverage"), await (await get("/v1/worldwide/coverage?date=2026-11-11")).json());
  check(schema("/v1/worldwide/direction"), await (await get("/v1/worldwide/direction?originCountry=DE&destinationCountry=BR")).json());
});
