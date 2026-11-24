import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { previewChinaUS } from "../src/china-us-import-pilot.ts";
import { loadDataset } from "../src/dataset.ts";
import { InputError, parseShipment } from "../src/schema.ts";
import type { Shipment } from "../src/types.ts";

const now = new Date("2026-11-25T00:00:00Z");
const data = loadDataset();
function fixture(country: "cn" | "us") {
  const { shipment, evidence } = JSON.parse(readFileSync(new URL(
    `../examples/country-pilot/${country}.json`, import.meta.url), "utf8"));
  return { shipment: parseShipment(shipment), evidence: evidence as Record<string, unknown> };
}
function preview({ shipment, evidence }: ReturnType<typeof fixture>) {
  return previewChinaUS(shipment, evidence, data, now);
}

test("China direct and bonded CBEC tie the actual retail, freight and insurance to the declaration", () => {
  for (const regime of ["cn_9610", "cn_1210"] as const) {
    const f = fixture("cn");
    f.shipment.regime = regime;
    if (regime === "cn_1210") f.shipment.inventoryStatus = "bonded";
    const result = preview(f);
    assert.equal(result.procedure, regime === "cn_9610" ? "CN_DIRECT_RETAIL_WITHIN_LIMIT" : "CN_BONDED_RETAIL_WITHIN_LIMIT");
    assert.deepEqual(result.charges.map(c => [c.category, c.value, c.currency, c.collection]), [
      ["customs_duty", "0.00", "CNY", "not_applicable"], ["excise", "0.00", "CNY", "not_applicable"],
      ["import_vat_gst", "9.10", "CNY", "checkout"]]);
    for (const c of result.charges) assert(c.sourceIds.every(id => result.sources.some(s => s.id === id)));
    f.shipment.insurance = "1.00";
    assert.deepEqual(preview(f).reasons, ["CN_ACTUAL_PRICE_FREIGHT_INSURANCE_REVIEW"]);
  }
});

test("China allowance boundaries distinguish one physical item, the annual balance, and general trade", () => {
  const samples = [
    ["5000.00", 1, "5000.00", "CN_DIRECT_RETAIL_WITHIN_LIMIT"],
    ["5000.01", 1, "5000.01", "CN_SINGLE_ITEM_FULL_GOODS_TAX_REVIEW"],
    ["25999.99", 1, "26000.00", "CN_SINGLE_ITEM_FULL_GOODS_TAX_REVIEW"],
    ["26000.00", 1, "26000.00", "CN_GENERAL_IMPORT_REVIEW"],
    ["2500.01", 2, "26000.00", "CN_GENERAL_IMPORT_REVIEW"],
    ["4999.99", 1, "4999.98", "CN_GENERAL_IMPORT_REVIEW"],
  ] as const;
  for (const [unitValue, quantity, remaining, expected] of samples) {
    const f = fixture("cn");
    Object.assign(f.shipment.items[0]!, { unitValue, quantity });
    f.shipment.freight = "0.00";
    f.shipment.customsValue = quantity === 1 ? unitValue : "5000.02";
    f.shipment.china!.annualRemaining = remaining;
    const out = preview(f);
    assert.equal(out.procedure, expected);
    if (expected !== "CN_DIRECT_RETAIL_WITHIN_LIMIT") assert.deepEqual(out.charges, []);
  }
  const f = fixture("cn");
  f.shipment.china!.annualRemaining = "26000.01";
  assert.deepEqual(preview(f).reasons, ["CN_QUOTA_BEFORE_ORDER_INVALID"]);
});

test("China checks identity authentication routes, signed records, quota and dated product-specific tax evidence", () => {
  const f = fixture("cn");
  for (const key of ["recordRef", "personalUseConfirmed", "channelFilingConfirmed", "quotaBeforeOrderConfirmed",
    "transactionAndBuyerAuthenticityReviewed", "buyerIdentityBasis", "cnCommodityCode"]) {
    const { [key]: omitted, ...remaining } = f.evidence;
    assert.deepEqual(preview({ ...f, evidence: remaining }).charges, [], key);
  }
  f.evidence.buyerIdentityBasis = "purchaser_is_payer";
  assert.equal(preview(f).charges.length, 3);
  f.shipment.china!.identityEvidenceConfirmed = false;
  assert.deepEqual(preview(f).reasons, ["CN_PURCHASER_VERIFICATION_OR_PAYER_MATCH_REQUIRED"]);
  f.shipment.china!.identityEvidenceConfirmed = true;
  f.evidence.cnCommodityCode = "69120090";
  assert.deepEqual(preview(f).charges, []);
  f.evidence.cnCommodityCode = "69120010";
  f.evidence.nonExciseStandardVatConfirmed = false;
  assert.deepEqual(preview(f).charges.map(c => c.category), ["customs_duty"]);
  f.evidence.nonExciseStandardVatConfirmed = true;
  f.shipment.items[0]!.unitValue = "90.01";
  f.shipment.customsValue = "100.01";
  assert.deepEqual(preview(f).charges.map(c => c.category), ["customs_duty", "excise"]);
  assert.deepEqual(preview(f).reasons, ["CN_VAT_FEN_ROUNDING_REVIEW"]);
});

test("US postal value and formal-entry exclusions take precedence over temporary procedure flexibility", () => {
  for (const [value, permanent, temporary, proc, low] of [
    ["800.00", "absent", "present", "US_POSTAL_DELAYED_COMPLIANCE_REVIEW", true],
    ["800.01", "absent", "absent", "US_POSTAL_INFORMAL_CANDIDATE", false],
    ["2500.00", "absent", "absent", "US_POSTAL_INFORMAL_CANDIDATE", false],
    ["2500.01", "absent", "present", "US_POSTAL_FORMAL_ENTRY_REVIEW", false],
    ["25.00", "present", "present", "US_POSTAL_FORMAL_ENTRY_REVIEW", true],
  ] as const) {
    const f = fixture("us");
    f.shipment.customsValue = value;
    Object.assign(f.evidence, { permanentFormalEntryTrigger: permanent, pgaChapterOrPreferenceTrigger: temporary });
    const out = preview(f);
    assert.equal(out.procedure, proc);
    assert.equal(out.reasons.includes("US_LOW_VALUE_NO_AUTOMATIC_EXEMPTION"), low);
    assert.deepEqual(out.charges, []);
  }
  const f = fixture("us");
  delete f.evidence.permanentFormalEntryTrigger;
  assert(preview(f).reasons.includes("US_POSTAL_QUOTA_AD_CVD_PGA_AND_CLAIM_SCREEN_REQUIRED"));
  f.shipment.transport = "air";
  assert.deepEqual(preview(f).reasons, ["US_IMPORT_NETWORK_CONFIRMATION_REQUIRED"]);
  f.evidence.network = "nonpostal";
  assert.equal(preview(f).procedure, "US_NONPOSTAL_FILER_REVIEW");
  assert(preview(f).reasons.includes("US_LOW_VALUE_NO_AUTOMATIC_EXEMPTION"));
  f.shipment.customsValueConfirmed = false;
  assert.deepEqual(preview(f).reasons, ["US_CONFIRMED_USD_CUSTOMS_VALUE_REQUIRED"]);
});

test("source-checked windows apply to both the wall clock and the date of import", () => {
  for (const country of ["cn", "us"] as const) {
    const f = fixture(country);
    for (const day of ["2026-11-24", "2026-12-03"]) {
      for (const [importDate, clock] of [[day, now], ["2026-11-25", new Date(day + "T00:00:00Z")]] as const) {
        const out = previewChinaUS({ ...f.shipment, importDate }, f.evidence, data, clock);
        assert.deepEqual(out.reasons, [country.toUpperCase() + "_PILOT_SOURCE_REVIEW"]);
        assert.deepEqual(out.charges, []);
      }
    }
    const id = country === "cn" ? "primary-cn-limit" : "primary-us-postal-suspension";
    for (const change of ["missing", "future", "expired"]) {
      const modified = data.sources.filter(s => s.id !== id);
      const source = data.sources.find(s => s.id === id)!;
      if (change !== "missing") modified.push({ ...source, ...(change === "future" ? { checkedOn: "2026-11-26" } : { reviewBy: "2026-11-24" }) });
      const out = previewChinaUS(f.shipment, f.evidence, { ...data, sources: modified }, new Date("2026-11-26T00:00:00Z"));
      assert.deepEqual(out.reasons, [country.toUpperCase() + "_PILOT_SOURCE_REVIEW"]);
    }
  }
});

test("unknown data and out-of-scope routes cannot produce charge lines", () => {
  for (const country of ["cn", "us"] as const) {
    const f = fixture(country);
    for (const evidence of ["", { buyerName: "synthetic" }, { recordRef: 42 }, { ...f.evidence, recordRef: "contains spaces" }])
      assert.throws(() => previewChinaUS(f.shipment, evidence, data, now), InputError);
    for (const patch of [{ transaction: "return" }, { destinationZone: "special" }, { loadingCountry: "GB" }] as Partial<Shipment>[])
      assert.deepEqual(preview({ ...f, shipment: { ...f.shipment, ...patch } }).charges, []);
    f.shipment.items[0]!.originCountry = "KP";
    assert.deepEqual(preview(f).reasons, ["DIRECT_ORDINARY_B2C_SCOPE_REQUIRED"]);
  }
});
