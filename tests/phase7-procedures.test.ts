import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { planCustoms } from "../src/customs-plan.ts";
import { loadTariffCatalog } from "../src/tariffs.ts";
import { assessTradePolicy } from "../src/trade-policy.ts";
import { worldDirection } from "../src/world-directions.ts";
import { data, shipment } from "./helpers.ts";

const catalog = loadTariffCatalog(data);
const day = "2026-11-12";
const now = new Date(day + "T00:00:00Z");
const ukPreference = JSON.parse(readFileSync(new URL("../examples/customs-plan-jp-preference.json", import.meta.url), "utf8"));

test("exact tariff references follow product origin and claim scope without authorising preference", () => {
  const draft = structuredClone(ukPreference);
  draft.shipment.originCountry = "TH";
  draft.shipment.items.push({ ...draft.shipment.items[0], id: "outside", originCountry: "CN" });
  draft.lines.push({ ...draft.lines[0], itemId: "outside" });
  const result = planCustoms(draft, data, catalog, now);
  const uk = result.specialProcedures.find(({ reference }) => reference.agreement === "uk_japan_cepa");
  assert.deepEqual(uk?.selectedItemIds, ["shoe"]);
  assert.deepEqual(uk?.rateReferences.map(({ label, expression }) => [label, expression]), [["英国UK", "11.8%"]]);
  assert.equal(uk?.eligibilityConfirmed, false);
  assert.equal(result.baseDutyScenario.knownSubtotal, null);
  assert.ok(result.handoff.missingInputs.includes("REVIEW_PREFERENCE_EVIDENCE"));
  assert.ok(result.handoff.missingInputs.includes("CONFIRM_PREFERENCE_AGREEMENT_SCOPE"));
  assert.ok(result.specialProcedures.some(({ reference, rateReferences }) =>
    reference.agreement === "rcep" && rateReferences.length === 0));
  draft.lines[0].rateTreatment = "mfn";
  assert.throws(() => planCustoms(draft, data, catalog, now), { message: "INVALID_INPUT" });
});

test("gift, return and B2B use the transaction supplied by the order", () => {
  for (const [transaction, expected] of [
    ["private_gift", "gift"], ["return", "return"], ["b2b_sale", "business_import"],
  ] as const) {
    const result = planCustoms({ shipment: shipment({ transaction, importDate: day }) }, data, catalog, now);
    const categories = new Set(result.specialProcedures.map(({ reference }) => reference.category));
    assert.ok(categories.has(expected), transaction);
    for (const other of ["gift", "return", "business_import"] as const) {
      if (other !== expected) assert.ok(!categories.has(other), transaction);
    }
    assert.ok(result.specialProcedures.every(({ eligibilityConfirmed }) => !eligibilityConfirmed));
  }
});

test("China bonded CBEC reaches its evidence checks without granting relief", () => {
  const result = planCustoms({ shipment: shipment({
    destinationCountry: "CN", currency: "CNY", regime: "cn_1210", inventoryStatus: "bonded", importDate: day,
  }) }, data, catalog, now);
  assert.ok(result.specialProcedures.some(({ reference }) => reference.appliesWhen.regimes?.includes("cn_1210")));
  assert.ok(result.checkout.findings.some(({ code }) => code === "CN_EVIDENCE_REQUIRED"));
  assert.ok(!result.handoff.missingInputs.includes("CONFIRM_INVENTORY_STATUS"));
  assert.equal(result.checkout.importTaxAndDuty.knownSubtotal, null);
});

test("the named territory overrides nominal domestic guidance and its reference is date-scoped", () => {
  const route = { originCountry: "ES", destinationCountry: "ES", customsTerritory: "CANARY_ISLANDS" };
  const current = worldDirection({ ...route, date: day }, data, catalog, now);
  assert.equal(current.territoryReviewRequired, true);
  assert.equal(current.specialTerritories?.destination.territoryId, "canary_islands");
  assert.equal(current.destinationTariffStatus, null);
  assert.deepEqual(current.destinationSpecialProcedures, []);
  const later = worldDirection({ ...route, date: "2026-11-13" }, data, catalog, now);
  assert.equal(later.territoryReviewRequired, true);
  assert.deepEqual(later.specialTerritories?.notices, []);
  const result = planCustoms({ shipment: shipment({
    originCountry: "GB", destinationCountry: "GB", originZone: "special", importDate: day,
  }), originCustomsTerritory: "XI" }, data, catalog, now);
  assert.equal(result.specialTerritories?.origin.territoryId, "northern_ireland");
  assert.equal(result.handoff.status, "route_review");
  assert.deepEqual(result.specialProcedures, []);
});

test("a U.S. territory triggers trade review independently of the federal customs boundary", () => {
  const trade = assessTradePolicy({
    dispatchCountry: "GU", destinationCountry: "IR", productOriginCountries: ["JP"], usJurisdictionApplies: false,
  }, "worldwide");
  assert.equal(trade.reasonCode, "US_IR_CU_TRADE_REVIEW");
  assert.equal(trade.status, "review_required");
});
