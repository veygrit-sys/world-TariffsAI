import assert from "node:assert/strict";
import test from "node:test";
import { money } from "../src/money.ts";
import {
  pilotChargeCategories,
  pilotQuoteShipmentDigest,
  quotePilotShipment,
  quoteWorldShipment,
  type WorldQuoteRequest,
} from "../src/pilot-quote.ts";
import { InputError } from "../src/schema.ts";
import { loadTariffCatalog } from "../src/tariffs.ts";
import { data, shipment } from "./helpers.ts";

const importDate = "2026-11-12";
const now = new Date(importDate + "T00:00:00Z");

const catalog = loadTariffCatalog(data);

const exactFixtureCodes: Record<string, string> = {
  TW: "69120010003", CH: "69120000", NZ: "6912000900",
  MX: "6912000300", CL: "69120010", KE: "69120000",
};

function request(originCountry: string, destinationCountry: string, currency = "USD"): WorldQuoteRequest {
  const dates = {
    reviewedOn: "2026-11-11",
    effectiveFrom: "2026-11-01",
    effectiveThrough: "2026-11-30",
    reviewBy: "2026-11-30",
  };
  const draft: WorldQuoteRequest = {
    orderId: "world-order",
    estimateId: "world-quote",
    plan: {
      shipment: shipment({
        originCountry, destinationCountry, currency, importDate, freight: "10", insurance: "0",
        incoterm: "DAP", customsValue: "100", customsValueConfirmed: true,
        items: [{
          id: "line1", description: "Synthetic ordinary item", quantity: 1, unitValue: "100",
          originCountry, goodsType: "ordinary", hs6: "691200", classificationConfirmed: true,
        }],
      }),
      lines: [{ itemId: "line1", tariffCode: exactFixtureCodes[destinationCountry] ?? "6912001000" }],
    },
    loadingCountry: originCountry,
    tradeReview: {
      status: "confirmed",
      evidence: {
        ...dates, id: "synthetic-trade-review", sourceUrl: "https://review.example/synthetic",
        sourceType: "customs_broker", dispatchCountry: originCountry, destinationCountry,
      },
    },
    charges: pilotChargeCategories.map((category) => {
      const evidence = {
        ...dates, id: "synthetic-" + category, sourceUrl: "https://review.example/synthetic",
        sourceType: category === "carrier_fee" ? "carrier" as const : "customs_broker" as const,
        destinationCountry, currency,
      };
      if (category === "customs_duty") return {
        category, evidence, method: "confirmed_amount", amount: "2", timing: "import", payer: "buyer",
      };
      return { category, evidence, method: "not_applicable" };
    }),
  };
  draft.reviewedShipmentDigest = pilotQuoteShipmentDigest(draft.plan, draft.orderId, draft.loadingCountry);
  return draft;
}

for (const [from, to, currency, due] of [
  ["KR", "TW", "TWD", "112.00"], ["GB", "CH", "CHF", "112.00"], ["CA", "MX", "MXN", "112.00"],
  ["BR", "CL", "CLP", "112"], ["ZA", "NZ", "NZD", "112.00"],
] as const) {
  test(`synthetic worldwide quote applies reviewed trade and charges for ${from}→${to}`, () => {
    const quote = quoteWorldShipment(request(from, to, currency), data, catalog, now);
    assert.equal(quote.tradePolicy.status, "eligible_for_review");
    assert.equal(quote.status, "estimated");
    assert.deepEqual(quote.buyerTotal, { currency, value: due });
    assert.equal(quote.estimate?.charges.length, 6);
    assert.equal(quote.checkoutReady, false);
    assert.equal(quote.shippingAuthorized, false);
    assert.equal(quote.productionAuthorized, false);
  });
}

test("broker amounts hold when the Kenya tariff evidence is a compiled reference", () => {
  const quote = quoteWorldShipment(request("AE", "KE", "KES"), data, catalog, now);
  assert.equal(quote.tradePolicy.status, "eligible_for_review");
  assert.equal(quote.status, "review_required");
  assert.equal(quote.buyerTotal, null);
  assert.equal(quote.estimate, null);
  assert.ok(quote.findings.some(({ code }) => code === "DATED_TARIFF_REFERENCE_REQUIRED"));
});

test("worldwide confirmation is additive to the existing six-direction contract", () => {
  const draft = request("JP", "US");
  const { tradeReview: _tradeReview, ...pilot } = draft;
  assert.equal(quotePilotShipment(pilot, data, catalog, now).status, "estimated");
  const world = quoteWorldShipment(pilot, data, catalog, now);
  assert.equal(world.status, "review_required");
  assert.equal(world.buyerTotal, null);
  assert.equal(world.estimate, null);
  assert.ok(world.findings.some(({ code }) => code === "WORLDWIDE_TRADE_REVIEW_REQUIRED"));
  assert.throws(() => quotePilotShipment(draft, data, catalog, now), InputError);
});

test("missing, stale, or route-mismatched trade evidence holds an otherwise complete quote", () => {
  const missing = request("CA", "MX");
  delete missing.tradeReview;
  const unresolved = request("CA", "MX");
  unresolved.tradeReview = { status: "review_required" };
  const stale = request("CA", "MX");
  assert.equal(stale.tradeReview?.status, "confirmed");
  stale.tradeReview.evidence.reviewBy = "2026-11-10";
  const wrongDirection = request("CA", "MX");
  assert.equal(wrongDirection.tradeReview?.status, "confirmed");
  wrongDirection.tradeReview.evidence.dispatchCountry = "MX";
  for (const [draft, finding] of [
    [missing, "WORLDWIDE_TRADE_REVIEW_REQUIRED"], [unresolved, "WORLDWIDE_TRADE_REVIEW_REQUIRED"],
    [stale, "TRADE_EVIDENCE_DATE_REVIEW_REQUIRED"], [wrongDirection, "TRADE_EVIDENCE_SCOPE_MISMATCH"],
  ] as const) {
    const quote = quoteWorldShipment(draft, data, catalog, now);
    assert.equal(quote.status, "review_required");
    assert.equal(quote.estimate, null);
    assert.equal(quote.buyerTotal, null);
    assert.ok(quote.charges.every(({ amount }) => amount === null));
    assert.ok(quote.findings.some(({ code }) => code === finding));
  }
});

test("the trade confirmation also limits the quote lifetime", () => {
  const draft = request("CA", "MX");
  assert.equal(draft.tradeReview?.status, "confirmed");
  draft.tradeReview.evidence.effectiveThrough = importDate;
  const quote = quoteWorldShipment(draft, data, catalog, new Date("2026-11-12T14:55:00.000Z"));
  assert.equal(quote.status, "estimated");
  assert.equal(quote.expiresAt, "2026-11-12T15:00:00.000Z");
});

test("a dated tariff caps the quote lifetime even when all broker evidence remains current", () => {
  const quote = quoteWorldShipment(request("CA", "MX"), data, catalog, new Date("2026-11-12T14:55:00.000Z"));
  assert.equal(quote.status, "estimated");
  assert.equal(quote.expiresAt, "2026-11-12T15:00:00.000Z");
});

test("stale monetary evidence, missing charges and changed shipments require a new estimate", () => {
  const draft = request("CA", "MX");
  draft.charges.find(({ category }) => category === "customs_duty")!.evidence.reviewBy = "2026-11-10";
  draft.charges = draft.charges.filter(({ category }) => category !== "carrier_fee");
  draft.plan.shipment.items[0]!.quantity = 2;
  const quote = quoteWorldShipment(draft, data, catalog, now);
  assert.equal(quote.status, "review_required");
  assert.equal(quote.estimate, null);
  assert.equal(quote.buyerTotal, null);
  for (const code of ["EVIDENCE_DATE_REVIEW_REQUIRED", "CHARGE_EVIDENCE_REQUIRED", "REVIEWED_SHIPMENT_MISMATCH"])
    assert.ok(quote.findings.some((finding) => finding.code === code));
});

test("country exclusions and route review still apply despite complete amounts", () => {
  const kp = quoteWorldShipment(request("KP", "MX"), data, catalog, now);
  assert.equal(kp.tradePolicy.reasonCode, "KP_COMMERCIAL_EXCLUDED");
  assert.equal(kp.status, "blocked");
  assert.equal(kp.buyerTotal, null);
  const kpLoading = request("KR", "JP");
  kpLoading.loadingCountry = "KP";
  assert.equal(quoteWorldShipment(kpLoading, data, catalog, now).tradePolicy.reasonCode, "JP_KP_ORIGIN_OR_LOADING_EXCLUDED");
  const noLoading = request("KR", "JP");
  delete noLoading.loadingCountry;
  const japan = quoteWorldShipment(noLoading, data, catalog, now);
  assert.equal(japan.tradePolicy.reasonCode, "JP_LOADING_COUNTRY_REQUIRED");
  assert.equal(japan.buyerTotal, null);
  const restricted = quoteWorldShipment(request("RU", "MX"), data, catalog, now);
  assert.equal(restricted.tradePolicy.reasonCode, "RU_BY_TRADE_REVIEW");
  assert.equal(restricted.buyerTotal, null);
  const unknown = quoteWorldShipment(request("IR", "MX"), data, catalog, now);
  assert.equal(unknown.tradePolicy.reasonCode, "US_JURISDICTION_REVIEW_REQUIRED");
  assert.equal(unknown.buyerTotal, null);
  const excluded = quoteWorldShipment(request("CA", "AQ"), data, catalog, now);
  assert.equal(excluded.status, "out_of_scope");
  assert.equal(excluded.buyerTotal, null);
  assert.throws(() => quoteWorldShipment(request("CA", "ZZ"), data, catalog, now), InputError);
});

test("domestic, intra-EU, special territories and non-B2C procedures stay outside numeric quoting", () => {
  const domestic = quoteWorldShipment(request("CA", "CA"), data, catalog, now);
  assert.equal(domestic.status, "out_of_scope");
  assert.equal(domestic.buyerTotal, null);
  const special = request("CA", "MX");
  special.plan.shipment.destinationZone = "special";
  const gift = request("CA", "MX");
  gift.plan.shipment.transaction = "private_gift";
  for (const draft of [request("FR", "DE"), special, gift]) {
    draft.reviewedShipmentDigest = pilotQuoteShipmentDigest(draft.plan, draft.orderId, draft.loadingCountry);
    const quote = quoteWorldShipment(draft, data, catalog, now);
    assert.equal(quote.status, "review_required");
    assert.equal(quote.estimate, null);
    assert.equal(quote.buyerTotal, null);
    assert.ok(quote.findings.some(({ code }) => code === "WORLDWIDE_PROCEDURE_REVIEW_REQUIRED"));
  }
});

test("valid per-charge reviews cannot create a quote without an exact dated tariff basis", () => {
  const future = request("CA", "MX", "MXN");
  future.plan.shipment.importDate = "2026-11-13";
  const unrelatedCompiledReference = request("AE", "KE", "KES");
  unrelatedCompiledReference.plan.lines![0]!.tariffCode = "6912001000";
  const sourceNotYetReviewed = request("CA", "MX", "MXN");
  for (const [draft, quoteTime] of [
    [future, now], [unrelatedCompiledReference, now],
    [sourceNotYetReviewed, new Date("2026-11-11T00:00:00.000Z")],
  ] as const) {
    draft.reviewedShipmentDigest = pilotQuoteShipmentDigest(draft.plan, draft.orderId, draft.loadingCountry);
    const quote = quoteWorldShipment(draft, data, catalog, quoteTime);
    assert.equal(quote.status, "review_required");
    assert.deepEqual(quote.findings, [{ code: "DATED_TARIFF_REFERENCE_REQUIRED" }]);
    assert.deepEqual(quote.goodsSubtotal, { currency: draft.plan.shipment.currency, value: "100.00" });
    assert.ok(quote.charges.every(({ amount, status }) => amount === null && status === "review_required"));
    assert.equal(quote.buyerAtCheckout, null);
    assert.equal(quote.buyerAtImport, null);
    assert.equal(quote.buyerTotal, null);
    assert.equal(quote.estimate, null);
  }
});
