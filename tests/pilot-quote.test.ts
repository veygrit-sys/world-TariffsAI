import assert from "node:assert/strict";
import test from "node:test";
import { reconcileInvoice } from "../src/invoice-reconciliation.ts";
import { pilotChargeCategories, pilotQuoteShipmentDigest, quotePilotShipment, type PilotQuoteCharge, type PilotQuoteRequest } from "../src/pilot-quote.ts";
import { InputError } from "../src/schema.ts";
import { loadTariffCatalog } from "../src/tariffs.ts";
import { data, now, shipment } from "./helpers.ts";

const catalog = loadTariffCatalog(data);

function request(terms: "DAP" | "DDP" = "DAP"): PilotQuoteRequest {
  const draft: PilotQuoteRequest = {
    orderId: "order-1",
    estimateId: "quote-1",
    plan: {
      shipment: shipment({
        originCountry: "JP", destinationCountry: "US", currency: "USD",
        incoterm: terms, customsValue: "200", customsValueConfirmed: true,
        freight: "10.00", insurance: "1.50",
        items: [{
          id: "line1", description: "Synthetic ordinary item", quantity: 2, unitValue: "100.00",
          originCountry: "JP", goodsType: "ordinary", hs6: "691200", classificationConfirmed: true,
        }],
      }),
      lines: [{ itemId: "line1", tariffCode: "6912001000" }],
    },
    charges: pilotChargeCategories.map((category) => ({
      category,
      method: "not_applicable",
      evidence: {
        id: "synthetic-" + category,
        sourceUrl: "https://review.example/synthetic",
        sourceType: category === "carrier_fee" ? "carrier" : "customs_broker",
        destinationCountry: "US",
        currency: "USD",
        reviewedOn: "2026-11-11",
        effectiveFrom: "2026-11-01",
        effectiveThrough: "2026-11-11",
        reviewBy: "2026-11-11",
      },
    })),
  };
  draft.reviewedShipmentDigest = pilotQuoteShipmentDigest(draft.plan, draft.orderId);
  return draft;
}

function updateCharge(
  draft: PilotQuoteRequest,
  category: PilotQuoteCharge["category"],
  changes: Omit<Extract<PilotQuoteCharge, { method: "confirmed_amount" }>, "category" | "evidence"> |
    Omit<Extract<PilotQuoteCharge, { method: "ad_valorem" }>, "category" | "evidence">,
): void {
  draft.charges = draft.charges.map((charge) =>
    charge.category === category ? { category, evidence: charge.evidence, ...changes } : charge);
}

test("confirmed amounts, explicit zero, and reviewed percent produce an auditable DAP estimate", () => {
  const draft = request();
  updateCharge(draft, "customs_duty", { method: "confirmed_amount", amount: "12.00", timing: "import", payer: "buyer" });
  updateCharge(draft, "import_vat_gst", {
    method: "ad_valorem", ratePercent: "7.125", taxBase: "80.00",
    rounding: "half_up_minor_unit", timing: "import", payer: "buyer",
  });
  updateCharge(draft, "carrier_fee", { method: "confirmed_amount", amount: "2.50", timing: "import", payer: "buyer" });
  updateCharge(draft, "checkout_tax", { method: "confirmed_amount", amount: "4.25", timing: "checkout", payer: "buyer" });
  const result = quotePilotShipment(draft, data, catalog, now);
  assert.equal(result.status, "estimated");
  assert.deepEqual(result.buyerAtCheckout, { currency: "USD", value: "215.75" });
  assert.deepEqual(result.buyerAtImport, { currency: "USD", value: "20.20" });
  assert.deepEqual(result.buyerTotal, { currency: "USD", value: "235.95" });
  assert.deepEqual(result.charges.find(({ category }) => category === "import_vat_gst")?.calculation, {
    method: "ad_valorem", ratePercent: "7.125", taxBase: { currency: "USD", value: "80.00" }, rounding: "half_up_minor_unit",
  });
  assert.deepEqual(result.charges.find(({ category }) => category === "excise")?.amount, { currency: "USD", value: "0.00" });
  assert.equal(result.productionAuthorized, false);
  assert.equal(result.checkoutReady, false);
  assert.equal(result.shippingAuthorized, false);
  assert.ok(result.estimate);
  assert.equal(result.estimate.charges.length, 6);
  const actual = result.estimate.charges.map(({ category, amount }) => ({ category, amount: amount! }));
  assert.equal(reconcileInvoice({
    estimate: result.estimate,
    invoice: { invoiceId: "invoice-1", orderId: "order-1", estimateId: "quote-1",
      currency: "USD", issuedOn: "2026-11-11", charges: actual },
  }).status, "matched");
});

test("DDP records seller import charges and avoids charging them to the buyer twice", () => {
  const draft = request("DDP");
  updateCharge(draft, "customs_duty", { method: "confirmed_amount", amount: "12", timing: "import", payer: "seller" });
  const quote = quotePilotShipment(draft, data, catalog, now);
  assert.equal(quote.status, "estimated");
  assert.equal(quote.importChargesTotal?.value, "12.00");
  assert.equal(quote.buyerAtImport?.value, "0.00");
  assert.equal(quote.buyerTotal?.value, "211.50");
  updateCharge(draft, "customs_duty", { method: "confirmed_amount", amount: "12", timing: "import", payer: "buyer" });
  const conflict = quotePilotShipment(draft, data, catalog, now);
  assert.equal(conflict.status, "review_required");
  assert.equal(conflict.buyerTotal, null);
  assert.ok(conflict.findings.some(({ code }) => code === "CHARGE_PAYMENT_SCOPE_REVIEW_REQUIRED"));
});

test("Japan low-value relief holds conflicting duty and consumption tax charges", () => {
  const draft = request();
  draft.loadingCountry = "CN";
  draft.plan.shipment = {
    ...draft.plan.shipment,
    originCountry: "CN",
    destinationCountry: "JP",
    currency: "JPY",
    freight: "500",
    insurance: "0",
    customsValue: "10000",
    items: [{
      ...draft.plan.shipment.items[0]!,
      originCountry: "CN",
      hs6: "691390",
      unitValue: "4750",
      japanReliefEligibility: "eligible",
    }],
  };
  draft.plan.lines = [{ itemId: "line1", tariffCode: "691390000" }];
  draft.reviewedShipmentDigest = pilotQuoteShipmentDigest(draft.plan, draft.orderId, draft.loadingCountry);
  for (const { evidence } of draft.charges) {
    evidence.destinationCountry = "JP";
    evidence.currency = "JPY";
  }
  updateCharge(draft, "carrier_fee", { method: "confirmed_amount", amount: "500", timing: "import", payer: "buyer" });

  for (const category of ["customs_duty", "import_vat_gst"] as const) {
    updateCharge(draft, category, { method: "confirmed_amount", amount: "100", timing: "import", payer: "buyer" });
    const conflicting = quotePilotShipment(draft, data, catalog, now);
    assert.equal(conflicting.status, "review_required");
    assert.equal(conflicting.estimate, null);
    assert.equal(conflicting.buyerTotal, null);
    assert.deepEqual(conflicting.findings, [{ code: "CHARGE_CONFLICTS_WITH_APPLICABLE_RULE", category }]);
    updateCharge(draft, category, { method: "confirmed_amount", amount: "0", timing: "import", payer: "buyer" });
  }

  const matching = quotePilotShipment(draft, data, catalog, now);
  assert.equal(matching.status, "estimated");
  assert.deepEqual(matching.buyerAtImport, { currency: "JPY", value: "500" });
  assert.deepEqual(matching.buyerTotal, { currency: "JPY", value: "10500" });
});

test("partial evidence holds totals and issued estimate", () => {
  const draft = request();
  draft.charges = draft.charges.filter(({ category }) => category !== "customs_duty");
  const evidence = draft.charges.find(({ category }) => category === "carrier_fee")!.evidence;
  evidence.reviewBy = "2026-11-10";
  const quote = quotePilotShipment(draft, data, catalog, now);
  assert.equal(quote.status, "review_required");
  assert.equal(quote.estimate, null);
  assert.equal(quote.buyerTotal, null);
  assert.ok(quote.findings.some(({ code, category }) => code === "CHARGE_EVIDENCE_REQUIRED" && category === "customs_duty"));
  assert.ok(quote.findings.some(({ code, category }) => code === "EVIDENCE_DATE_REVIEW_REQUIRED" && category === "carrier_fee"));
});

test("out-of-scope evidence and cart changes cannot create a numeric quote", () => {
  const draft = request();
  const proof = draft.charges.find(({ category }) => category === "excise")!.evidence;
  proof.destinationCountry = "JP";
  const quote = quotePilotShipment(draft, data, catalog, now);
  assert.ok(quote.findings.some(({ code, category }) => code === "EVIDENCE_SCOPE_MISMATCH" && category === "excise"));
  proof.destinationCountry = "US";
  draft.plan.shipment.items[0]!.quantity = 3;
  assert.ok(quotePilotShipment(draft, data, catalog, now).findings.some(({ code }) => code === "REVIEWED_SHIPMENT_MISMATCH"));
});

test("the evidence expiry caps the quote lifetime at the JST date boundary", () => {
  const quote = quotePilotShipment(request(), data, catalog, new Date("2026-11-11T14:55:00.000Z"));
  assert.equal(quote.status, "estimated");
  assert.equal(quote.expiresAt, "2026-11-11T15:00:00.000Z");
});

test("ad-valorem rounding and settlement amount bounds are enforced", () => {
  const draft = request();
  updateCharge(draft, "customs_duty", {
    method: "ad_valorem", ratePercent: "0.5000", taxBase: "1.00",
    rounding: "half_up_minor_unit", timing: "import", payer: "buyer",
  });
  const rounded = quotePilotShipment(draft, data, catalog, now);
  assert.equal(rounded.estimate?.charges.find(({ category }) => category === "customs_duty")?.amount, "0.01");
  updateCharge(draft, "customs_duty", {
    method: "ad_valorem", ratePercent: "200", taxBase: "999999999999.99",
    rounding: "half_up_minor_unit", timing: "import", payer: "buyer",
  });
  const oversized = quotePilotShipment(draft, data, catalog, now);
  assert.ok(oversized.findings.some(({ code }) => code === "CHARGE_AMOUNT_OUT_OF_RANGE"));
  assert.equal(oversized.estimate, null);
  assert.equal(oversized.buyerTotal, null);
  const malformed = structuredClone(draft);
  Object.assign(malformed.charges.find(({ category }) => category === "customs_duty")!, { ratePercent: "-0.1" });
  assert.throws(() => quotePilotShipment(malformed, data, catalog, now), InputError);
});

test("schema and semantic checks reject duplicate rows, unknown fields, and competing loading facts", () => {
  const draft = request();
  draft.charges.pop();
  draft.charges.push(draft.charges[0]!);
  assert.throws(() => quotePilotShipment(draft, data, catalog, now), (error) =>
    error instanceof InputError && error.issues[0]?.code === "DUPLICATE_CHARGE_CATEGORY");
  assert.throws(() => quotePilotShipment({ ...request(), consigneeAddress: "example" }, data, catalog, now), InputError);
  const conflict = request();
  conflict.plan.shipment.loadingCountry = "JP";
  conflict.loadingCountry = "KR";
  assert.throws(() => quotePilotShipment(conflict, data, catalog, now), (error) =>
    error instanceof InputError && error.issues[0]?.code === "LOADING_COUNTRY_MISMATCH");
});
