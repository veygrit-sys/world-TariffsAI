import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { createHandler } from "../src/http.ts";
import type { ImportSettlementPlanInput } from "../src/import-settlement-plan.ts";
import { reconcileImportSettlement, type ImportSettlementReconciliationInput } from "../src/import-settlement-reconciliation.ts";
import { pilotQuoteShipmentDigest, type PilotQuoteRequest, type PilotQuote } from "../src/pilot-quote.ts";
import { InputError } from "../src/schema.ts";
import { loadTariffCatalog } from "../src/tariffs.ts";
import { data, shipment } from "./helpers.ts";

const testDate = "2026-11-13";
const now = new Date("2026-11-13T02:00:00+09:00");
const later = new Date("2026-11-14T12:00:00+09:00");
const sourceUrl = "https://test.example/synthetic/settlement";
const root = mkdtempSync(join(tmpdir(), "import-settlement-test-"));
after(() => rmSync(root, { recursive: true, force: true }));
const source = join(root, "source.json");
const lines = join(root, "lines.json");
const pack = join(root, "pack");
writeFileSync(source, JSON.stringify({
  id: "settlement-test", jurisdiction: "JP", countries: ["JP"], zone: "standard", edition: "Synthetic",
  hsEdition: "HS 2022", availableFrom: testDate, availableThrough: testDate, checkedOn: testDate,
  scope: "published_baseline", authority: "Test source", sourceUrl, termsUrl: sourceUrl,
  terms: "Test only", inputFiles: [{ url: sourceUrl, sha256: "0".repeat(64) }], limitations: ["Synthetic test"],
}));
writeFileSync(lines, JSON.stringify([{
  code: "691390000", reference: "Synthetic ornament",
  rates: [{ charge: "customs_duty", treatment: "mfn", label: "Example only", expression: "2.3%" }],
}]));
execFileSync(process.execPath, [fileURLToPath(new URL("../scripts/tariffs/import.ts", import.meta.url)), source, lines, pack]);
const tariffs = loadTariffCatalog(data, pack);
const apiKey = "synthetic-import-settlement-test-key-123456";
const handler = createHandler({ dataset: data, tariffs, apiKey, now: () => now });
async function api(path: string, input: unknown, expectedStatus = 200, key = apiKey) {
  const response = await handler(new Request("http://localhost/v1/" + path, {
    method: "POST", headers: { authorization: "Bearer " + key, "content-type": "application/json" },
    body: JSON.stringify(input),
  }), { peer: "127.0.0.1" });
  assert.equal(response.headers.get("cache-control"), "no-store");
  const output = await response.json();
  assert.equal(response.status, expectedStatus, JSON.stringify(output));
  return output;
}
const planEndpoint = "import-settlement/plan";
const invoiceEndpoint = "import-settlement/reconcile";

function draft(terms: "DAP" | "DDP"): ImportSettlementPlanInput {
  const reference = JSON.parse(readFileSync(new URL("../examples/pilot-quote-jp-us.json", import.meta.url), "utf8")) as PilotQuoteRequest;
  const party = terms === "DDP" ? "seller" : "buyer";
  const orderId = "order-" + terms;
  const amounts = { customs_duty: "6900", import_vat_gst: "30500", customs_fee: "200", carrier_fee: "500",
    additional_duty: "0", excise: "0", checkout_tax: "0" };
  const quoteRequest: PilotQuoteRequest = {
    ...reference, orderId, estimateId: "estimate-" + terms, loadingCountry: "CN",
    plan: {
      shipment: shipment({
        originCountry: "CN", destinationCountry: "JP", currency: "JPY", incoterm: terms, importDate: testDate,
        freight: "9000", insurance: "1000", customsValue: "300000", customsValueConfirmed: true,
        veygrit: { merchantId: "merchant", orderId, cartVersion: "cart-1",
          addressTokenRef: "address-token", addressVersion: "address-1", grantRef: "address-grant" },
        items: [{
          id: "ornament", description: "Synthetic ceramic ornament", originCountry: "CN",
          goodsType: "ordinary", quantity: 1, unitValue: "290000", hs6: "691390", classificationConfirmed: true,
        }],
      }),
      lines: [{ itemId: "ornament", tariffCode: "691390000", rateTreatment: "mfn" }],
      availableDocuments: ["COMMERCIAL_INVOICE", "PACKING_LIST", "TRANSPORT_DOCUMENT"],
    },
    charges: reference.charges.map(({ category, evidence }) => {
      const proof = { ...evidence, sourceUrl, destinationCountry: "JP", currency: "JPY", reviewedOn: testDate,
        effectiveFrom: testDate, effectiveThrough: testDate, reviewBy: testDate };
      return amounts[category] === "0" ? { category, method: "not_applicable", evidence: proof }
        : { category, method: "confirmed_amount", evidence: proof, amount: amounts[category], payer: party, timing: "import" };
    }),
  };
  quoteRequest.reviewedShipmentDigest = pilotQuoteShipmentDigest(quoteRequest.plan, orderId, "CN");
  return {
    merchantId: "merchant", shipmentId: "shipment-" + terms, quoteRequest, carrierId: "fixture-carrier",
    carrierService: "fixture-courier", parcelCount: 1, direct: true, remittanceRoute: "carrier_advance",
    buyerIsRecipient: true, requestedBillTo: { party, accountRef: "account-" + party },
    importerReview: { importerRef: "importer", brokerRef: "broker", evidenceRef: "importer-proof" },
  };
}
async function accepted(terms: "DAP" | "DDP") {
  const input = draft(terms);
  const before = await api(planEndpoint, input);
  assert.deepEqual(before.findings, ["CARRIER_ACCEPTANCE_REQUIRED"]);
  assert.equal(before.billingBinding, null);
  input.carrierAcceptance = {
    scopeDigest: before.scopeDigest, billTo: input.requestedBillTo, evidenceRef: "bill-to-confirmation",
    acceptedAt: "2026-11-12T16:45:00.000Z", expiresAt: "2026-11-12T17:15:00.000Z",
  };
  return input;
}

test("DAP and DDP require a current accepted bill-to for the same order and quote", async () => {
  for (const [terms, party, due] of [["DDP", "seller", "0"], ["DAP", "buyer", "38100"]] as const) {
    const input = await accepted(terms);
    const plan = await api(planEndpoint, input);
    const quote = await api("pilot/quote", input.quoteRequest) as PilotQuote;
    assert.equal(plan.status, "ready");
    assert.equal(plan.billingBinding.billingAccountRef, input.requestedBillTo.accountRef);
    assert.equal(plan.billingParty, party);
    assert.equal(plan.quoteRequestDigest, quote.requestDigest);
    assert.equal(plan.ruleSetVersion, quote.ruleSetVersion);
    assert.deepEqual(plan.quoteEstimate, quote.estimate);
    assert.equal(plan.expiresAt, input.carrierAcceptance!.expiresAt);
    assert.equal(quote.buyerAtCheckout?.value, "300000");
    assert.equal(quote.buyerAtImport?.value, due);
    assert.equal(plan.shippingAuthorized, false);
    assert.equal(plan.productionAuthorized, false);
  }
});

test("wrong account, old cart/address scope, expiry and deferred routes hold billing", async () => {
  const source = await accepted("DDP");
  const cases: [string, (input: ImportSettlementPlanInput) => void][] = [
    ["CARRIER_BILL_TO_MISMATCH", (input) => { input.carrierAcceptance!.billTo = { party: "recipient", accountRef: "other" }; }],
    ["CARRIER_ACCEPTANCE_SCOPE_MISMATCH", (input) => { input.quoteRequest.plan.shipment.veygrit!.cartVersion = "cart-2"; }],
    ["CARRIER_ACCEPTANCE_SCOPE_MISMATCH", (input) => { input.quoteRequest.plan.shipment.veygrit!.addressVersion = "address-2"; }],
    ["CARRIER_ACCEPTANCE_SCOPE_MISMATCH", (input) => { input.carrierService = "other-service"; }],
    ["CARRIER_ACCEPTANCE_DATE_INVALID", (input) => { input.carrierAcceptance!.expiresAt = now.toISOString(); }],
    ["IMPORTER_REVIEW_REQUIRED", (input) => { delete input.importerReview; }],
    ["SETTLEMENT_ROUTE_OUT_OF_SCOPE", (input) => { input.remittanceRoute = "postal_delegation"; }],
    ["SETTLEMENT_ROUTE_OUT_OF_SCOPE", (input) => { input.remittanceRoute = "direct_payment"; }],
    ["PARCEL_ALLOCATION_REQUIRED", (input) => { input.parcelCount = 2; }],
  ];
  for (const [finding, mutate] of cases) {
    const input = structuredClone(source);
    mutate(input);
    const result = await api(planEndpoint, input);
    assert.notEqual(result.status, "ready");
    assert.ok(result.findings.includes(finding), JSON.stringify(result));
    assert.equal(result.billingBinding, null);
    assert.equal(result.expiresAt, null);
  }
  const buyer = await accepted("DAP");
  buyer.buyerIsRecipient = false;
  assert.ok((await api(planEndpoint, buyer)).findings.includes("RECIPIENT_BILLING_REVIEW_REQUIRED"));
  await api(planEndpoint, { ...source, merchantId: "another-merchant" }, 400);
  await api(planEndpoint, { ...source, recipientAddress: "unexpected field" }, 400);
  await api(planEndpoint, source, 401, "invalid-key");
});

async function evidence(terms: "DAP" | "DDP" = "DDP"): Promise<ImportSettlementReconciliationInput> {
  const input = await accepted(terms);
  const plan = await api(planEndpoint, input);
  const quote = await api("pilot/quote", input.quoteRequest) as PilotQuote;
  assert.ok(quote.estimate);
  const scope = { ...plan.billingBinding, declarationId: "test-declaration" };
  const charges = quote.estimate.charges.map(({ category, amount }) => ({ category, amount: amount! }));
  return {
    scope, estimate: quote.estimate,
    remittances: [{ ...scope, remittanceId: "test-remittance", currency: "JPY", paidOn: testDate, taxes: charges.slice(0, 4) }],
    carrierInvoices: [{ ...scope, invoice: { orderId: quote.orderId, estimateId: quote.estimateId,
      invoiceId: "test-invoice", currency: "JPY", issuedOn: testDate, charges } }],
    carrierPayments: [{ ...scope, receiptId: "test-receipt", invoiceId: "test-invoice", currency: "JPY",
      paidOn: testDate, amount: "38100" }],
  };
}

test("recorded tax payment and carrier settlement can arrive independently and replay safely", async () => {
  for (const terms of ["DAP", "DDP"] as const) {
    const input = await evidence(terms);
    const { carrierPayments, remittances, ...partial } = input;
    const unpaid = await api(invoiceEndpoint, { ...partial, remittances });
    assert.equal(unpaid.status, "pending");
    assert.equal(unpaid.customsRemittance.status, "confirmed");
    assert.equal(unpaid.carrierSettlement.status, "missing");
    const taxProofMissing = await api(invoiceEndpoint, { ...partial, carrierPayments });
    assert.equal(taxProofMissing.customsRemittance.status, "missing");
    assert.equal(taxProofMissing.carrierSettlement.status, "confirmed");
    const result = await api(invoiceEndpoint, {
      ...input, carrierPayments: [...carrierPayments!, ...carrierPayments!],
      remittances: [...remittances!, ...remittances!],
    });
    assert.equal(result.status, "reconciled");
    assert.deepEqual(result.totals, { customsTax: "37400", carrierFees: "700", importCost: "38100" });
    assert.equal(result.carrierSettlement.paidAmount, "38100");
    assert.deepEqual(result.carrierSettlement.receiptIds, ["test-receipt"]);
  }
});

test("a conflicting receipt, another tenant, invoice difference, and missing tax line are visible", async () => {
  const input = await evidence();
  const conflict = structuredClone(input);
  conflict.carrierPayments!.push({ ...conflict.carrierPayments![0]!, amount: "10" });
  assert.equal((await api(invoiceEndpoint, conflict)).status, "needs_review");
  const mismatch = structuredClone(input);
  mismatch.carrierInvoices![0]!.merchantId = "another-merchant";
  assert.equal((await api(invoiceEndpoint, mismatch)).totals.importCost, null);
  const difference = structuredClone(input);
  difference.carrierInvoices![0]!.invoice.charges.find(({ category }) => category === "carrier_fee")!.amount = "800";
  const changed = await api(invoiceEndpoint, difference);
  assert.equal(changed.invoiceReconciliation.differenceTotal, "300");
  assert.equal(changed.status, "needs_review");
  const missing = structuredClone(input);
  missing.remittances![0]!.taxes.pop();
  assert.equal((await api(invoiceEndpoint, missing)).customsRemittance.status, "partial");
  const wrong = { ...input, estimate: { ...input.estimate, estimateId: "wrong-estimate" } };
  assert.throws(() => reconcileImportSettlement(wrong, later), InputError);
});

test("known invoice differences require review even when another estimate amount is unknown", async () => {
  const input = await evidence();
  input.estimate.charges.find(({ category }) => category === "import_vat_gst")!.amount = null;
  const incomplete = await api(invoiceEndpoint, input);
  assert.equal(incomplete.status, "pending");

  const carrierInvoice = input.carrierInvoices![0]!.invoice;
  carrierInvoice.charges.find(({ category }) => category === "carrier_fee")!.amount = "800";
  input.carrierPayments![0]!.amount = "38400";
  const result = await api(invoiceEndpoint, input);
  assert.equal(result.invoiceReconciliation.status, "needs_review");
  assert.equal(result.carrierSettlement.status, "confirmed");
  assert.equal(result.status, "needs_review");
  assert.deepEqual(result.issues, [{ path: "/carrierInvoices/invoice", code: "ESTIMATE_INVOICE_DIFFERENCE" }]);
});

test("multiple ordinary products and parcels require complete allocation and renewed carrier acceptance", async () => {
  const input = await accepted("DDP");
  const first = input.quoteRequest.plan.shipment.items[0]!;
  first.quantity = 2;
  first.unitValue = "100000";
  input.quoteRequest.plan.shipment.items.push({ ...first, id: "ornament-2", quantity: 1, unitValue: "90000" });
  input.quoteRequest.plan.lines![0]!.customsValue = "200000";
  input.quoteRequest.plan.lines!.push({ itemId: "ornament-2", tariffCode: "691390000", rateTreatment: "mfn", customsValue: "100000" });
  input.quoteRequest.reviewedShipmentDigest = pilotQuoteShipmentDigest(input.quoteRequest.plan, input.quoteRequest.orderId, "CN");
  input.parcelCount = 2;
  input.parcels = [
    { parcelId: "parcel-1", items: [{ itemId: "ornament", quantity: 1 }] },
    { parcelId: "parcel-2", items: [{ itemId: "ornament", quantity: 1 }, { itemId: "ornament-2", quantity: 1 }] },
  ];
  const actualQuote = await api("pilot/quote", input.quoteRequest);
  assert.equal(actualQuote.status, "estimated", JSON.stringify(actualQuote));
  const before = await api(planEndpoint, input);
  assert.ok(before.findings.includes("CARRIER_ACCEPTANCE_SCOPE_MISMATCH"));
  input.carrierAcceptance!.scopeDigest = before.scopeDigest;
  const acceptedMulti = await api(planEndpoint, input);
  assert.equal(acceptedMulti.status, "ready", JSON.stringify(acceptedMulti));
  input.parcels[1]!.items[0]!.quantity = 2;
  const invalid = await api(planEndpoint, input);
  assert.ok(invalid.findings.includes("PARCEL_ALLOCATION_MISMATCH"));
  assert.notEqual(invalid.status, "ready");
});
