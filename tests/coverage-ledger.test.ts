import test from "node:test";
import assert from "node:assert/strict";
import { coverageLedger } from "../src/coverage-ledger.ts";
import { assess } from "../src/engine.ts";
import { loadTariffCatalog } from "../src/tariffs.ts";
import { data, now, shipment } from "./helpers.ts";

const catalog = loadTariffCatalog(data);
const date = "2026-11-11";
const ledger = coverageLedger(data, catalog, date, now);
const byCode = new Map(ledger.destinations.map((row) => [row.destinationCountry, row]));

test("coverage ledger joins each in-scope destination with its official evidence", () => {
  assert.equal(byCode.size, 249);
  assert.equal(ledger.totals.wcoMembers, 187);
  assert.equal(ledger.totals.outsideWcoRoster, 62);
  assert.equal(ledger.totals.withOfficialSources, ledger.totals.destinations);
  assert.equal(byCode.get("XK")?.membershipStatus, "member");
  assert.equal(byCode.get("TW")?.membershipStatus, "outside_wco_roster");
  assert.ok(!byCode.has("AQ") && !byCode.has("EU"));
});

test("dated tariff, historical tariff, and separate tax references retain their scope", () => {
  assert.equal(ledger.totals.withStandardTariffReferenceOnDate, 86);
  assert.equal(ledger.totals.withStandardTariffReferenceOtherDateOnly, 39);
  assert.equal(byCode.get("AE")?.standardTariffStatus, "tariff_reference_other_date");
  assert.ok(byCode.get("AE")?.pastReferences.length);
  assert.ok(byCode.get("US")?.chargeReferencesOnDate.additionalDutyOrTradeRemedy.length);
  assert.ok(byCode.get("FO")?.chargeReferencesOnDate.importVatOrGst.length);
  assert.ok(byCode.get("FO")?.chargeReferencesOnDate.excise.length);
  assert.equal(byCode.get("HK")?.generalDutyPolicies[0]?.treatment, "general_zero");
  assert.equal(byCode.get("SJ")?.generalDutyPolicies[0]?.customsTerritory, "SVALBARD");
  assert.equal(byCode.get("SJ")?.standardTariffStatus, "official_sources_only");
  assert.equal(byCode.get("HK")?.conditionalCalculationRules.length, 0);
});

test("ledger keeps future, past and in-window references distinct", () => {
  const before = coverageLedger(data, catalog, "1900-01-01", now);
  const after = coverageLedger(data, catalog, "2100-01-01", now);
  assert.ok(before.destinations.some((row) => row.futureReferences.length));
  assert.ok(after.destinations.some((row) => row.pastReferences.length));
  for (const report of [before, after]) {
    assert.equal(report.totals.withStandardTariffReferenceOnDate, 0);
    assert.equal(report.totals.withGeneralDutyPolicyOnDate, 0);
    assert.equal(report.totals.withConditionalCalculationRules, 0);
    assert.ok(report.destinations.every((row) => row.referencesOnDate.length === 0));
  }
  assert.throws(() => coverageLedger(data, catalog, "2026-02-30", now), {
    message: "INVALID_INPUT",
  });
});

test("each listed current rule can produce its described partial calculation", () => {
  assert.equal(byCode.get("DE")?.conditionalCalculationRules.length, 0);
  const reviewedAt = new Date("2026-11-12T00:00:00Z");
  const reviewed = coverageLedger(data, catalog, date, reviewedAt);
  const active = reviewed.destinations.filter((row) => row.conditionalCalculationRules.length);
  assert.equal(active.length, 32);
  assert.equal(ledger.totals.commerciallyAuthorisedDestinations, 0);
  assert.equal(byCode.get("CN")?.conditionalCalculationRules.length, 0);
  assert.equal(byCode.get("US")?.conditionalCalculationRules.length, 0);
  for (const row of active) {
    const rule = row.conditionalCalculationRules[0]!;
    const input = shipment({
      destinationCountry: row.destinationCountry,
      originCountry: "CA",
      importDate: date,
      currency: rule.currency,
      freight: "0",
      insurance: "0",
      customsValue: "10",
      customsValueConfirmed: true,
      regime: rule.ruleId === "EU_TEMP_LOW_VALUE" ? "ioss" : "standard",
      ...(rule.ruleId === "EU_TEMP_LOW_VALUE" ? { euDeclaration: { itemCount: 1, countConfirmed: true as const } } : {}),
      transport: rule.ruleId === "AU_LOW_VALUE_POST" ? "post" : "air",
    });
    input.items = input.items.map((item) => ({ ...item, unitValue: "10", originCountry: "CA" }));
    const result = assess(input, data, reviewedAt);
    assert.equal(result.status, "partial_estimate", row.destinationCountry);
    assert.deepEqual(new Set(result.charges.map((charge) => charge.kind)), new Set(rule.chargeKinds));
    assert.ok(result.charges.every((charge) => charge.ruleId === rule.ruleId));
    assert.equal(row.commerciallyAuthorised, false);
    assert.equal(result.checkoutReady, false);
  }
});

test("expired rules are unavailable even when tariff reference date is backdated", () => {
  const expired = coverageLedger(data, catalog, date, new Date("2026-11-26T00:00:00Z"));
  const germany = expired.destinations.find((row) => row.destinationCountry === "DE");
  assert.equal(germany?.standardTariffStatus, "tariff_reference_on_date");
  assert.deepEqual(germany?.conditionalCalculationRules, []);
  assert.equal(expired.totals.withConditionalCalculationRules, 5);
});
