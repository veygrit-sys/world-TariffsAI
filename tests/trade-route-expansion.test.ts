import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { assess } from "../src/engine.ts";
import { planCustoms } from "../src/customs-plan.ts";
import { pilotQuoteShipmentDigest, quoteWorldShipment, type WorldQuoteRequest } from "../src/pilot-quote.ts";
import { loadTariffCatalog } from "../src/tariffs.ts";
import { loadTradeBlocs } from "../src/trade-blocs.ts";
import { assessTradePolicy } from "../src/trade-policy.ts";
import { worldDirection } from "../src/world-directions.ts";
import type { TransitRoute } from "../src/transit-route.ts";
import { data, shipment } from "./helpers.ts";

const day = "2026-11-12";
const now = new Date(day + "T00:00:00Z");
const catalog = loadTariffCatalog(data);
const brDe: WorldQuoteRequest = JSON.parse(readFileSync(new URL("../examples/worldwide-quote-br-de.json", import.meta.url), "utf8"));

function controlled(...countries: string[]): TransitRoute {
  return {
    completeness: "confirmed",
    stops: countries.map((country, index) => ({
      country, handling: "transshipment", customsStatus: "under_customs_control", evidenceRef: "route-doc-" + index,
    })),
  };
}

test("intra-bloc routes distinguish a review hold, preferential guidance and direction-specific transitions", () => {
  const route = (originCountry: string, destinationCountry: string, date = day) =>
    worldDirection({ originCountry, destinationCountry, date }, data, catalog, now);
  const eac = route("KE", "UG");
  assert.equal(eac.standardTerritoryRoute, "cross_border");
  assert.equal(eac.territoryReviewRequired, true);
  assert.ok(eac.tradeBlocs.some(({ reference, status }) => reference.id === "eac_customs_union" && status === "territory_review"));
  assert.ok(route("KE", "UG", "2026-11-13").tradeBlocs.some(({ status }) => status === "reference_date_unverified"));
  assert.equal(route("DE", "FR").standardTerritoryRoute, "eu_intra_union");
  const atiga = route("VN", "TH");
  assert.equal(atiga.territoryReviewRequired, false);
  assert.ok(atiga.tradeBlocs.some(({ reference, status }) => reference.id === "asean_atiga" && status === "preference_review"));
  assert.ok(route("BF", "SN").tradeBlocs.some(({ reference }) => reference.id === "ecowas_withdrawal_etls"));
  assert.ok(!route("SN", "BF").tradeBlocs.some(({ reference }) => reference.id === "ecowas_withdrawal_etls"));
  const plan = planCustoms({ shipment: shipment({ originCountry: "KE", destinationCountry: "UG", importDate: day }) }, data, catalog, now);
  assert.equal(plan.handoff.status, "route_review");
  assert.ok(plan.handoff.missingInputs.includes("REVIEW_TRADE_BLOC"));
  assert.equal(plan.baseDutyScenario.knownSubtotal, null);
});

test("new agreements preserve origin separately from dispatch and leave preference unconfirmed", () => {
  const selected = structuredClone(brDe.plan);
  selected.shipment.originCountry = "SG";
  selected.shipment.loadingCountry = "SG";
  selected.shipment.transitRoute = { completeness: "partial", stops: [{ country: "AE", handling: "transshipment", customsStatus: "unknown" }] };
  selected.lines![0]!.preferenceAgreement = "eu_mercosur_ita";
  const plan = planCustoms(selected, data, catalog, now);
  const agreement = plan.specialProcedures.find(({ reference }) => reference.agreement === "eu_mercosur_ita");
  assert.equal(agreement?.reference.id, "eu_mercosur_ita_eu_from_br");
  assert.equal(agreement?.eligibilityConfirmed, false);
  assert.deepEqual(agreement?.rateReferences, []);
  assert.ok(agreement?.selectedItemIds.length);
  assert.ok(plan.handoff.missingInputs.includes("CONFIRM_TRANSIT_ROUTE"));
  assert.equal(plan.transitReview?.status, "evidence_required");
});

test("released goods, incomplete routes and extra-union transit keep duty or intra-union route unresolved", () => {
  const s = shipment({ originCountry: "JP", destinationCountry: "GB", currency: "GBP", importDate: day });
  const route = controlled("SG");
  route.stops[0]!.customsStatus = "released";
  const result = planCustoms({ shipment: { ...s, transitRoute: route } }, data, catalog, now);
  assert.equal(result.transitReview?.status, "customs_release_review");
  assert.equal(result.checkout.route, "unresolved");
  assert.equal(result.checkout.importTaxAndDuty.knownSubtotal, null);
  assert.ok(result.handoff.missingInputs.includes("CONFIRM_TRANSIT_ROUTE"));
  const eu = planCustoms({ shipment: { ...s, originCountry: "FR", destinationCountry: "DE", transitRoute: controlled("CH") } }, data, catalog, now);
  assert.equal(eu.checkout.route, "unresolved");
  assert.equal(eu.transitReview?.status, "route_review");
  assert.equal(eu.tradeBlocs[0]?.status, "territory_review");
  assert.ok(!("evidenceRef" in eu.transitReview!.stops[0]!));
  assert.equal(assess({ ...s, transitRoute: controlled("SG"), loadingCountry: "AE" }, data, now).route, "unresolved");
  assert.equal(assess({ ...s, transitRoute: controlled("AQ") }, data, now).status, "out_of_scope");
  assert.throws(() => assess({ ...s, transitRoute: controlled("ZZ") }, data, now), { message: "INVALID_INPUT" });
});

test("ordered stops are screened in both direction and trade policy without rewriting loading country", () => {
  const direction = worldDirection({ originCountry: "CN", destinationCountry: "JP", transitCountries: "SG,KP,SG",
    loadingCountry: "CN", date: day }, data, catalog, now);
  assert.deepEqual(direction.transitReview?.stops.map(({ sequence, country }) => [sequence, country]), [[1, "SG"], [2, "KP"], [3, "SG"]]);
  assert.equal(direction.tradePolicy?.reasonCode, "KP_NEXUS_REVIEW");
  assert.equal(direction.tradePolicy?.status, "review_required");
  assert.equal(assessTradePolicy({
    dispatchCountry: "AE", destinationCountry: "IR", transitCountries: ["US"], productOriginCountries: ["AE"],
    usJurisdictionApplies: false,
  }, "worldwide").reasonCode, "US_IR_CU_TRADE_REVIEW");
  assert.throws(() => worldDirection({ originCountry: "CN", destinationCountry: "JP", transitCountries: "SG,ZZ" }, data, catalog, now),
    { message: "INVALID_INPUT" });
});

test("a foreign loading country needs itinerary evidence before customs amounts are calculated", () => {
  const s = shipment({ originCountry: "JP", destinationCountry: "GB", loadingCountry: "SG", importDate: day });
  const direction = worldDirection({ originCountry: s.originCountry, destinationCountry: s.destinationCountry,
    loadingCountry: s.loadingCountry, date: day }, data, catalog, now);
  assert.equal(direction.transitReview?.status, "evidence_required");
  assert.equal(direction.territoryReviewRequired, true);
  const plan = planCustoms({ shipment: s }, data, catalog, now);
  assert.equal(plan.checkout.route, "unresolved");
  assert.equal(plan.checkout.importTaxAndDuty.knownSubtotal, null);
  assert.equal(plan.transitReview?.loadingCountryConsistent, false);
  assert.ok(plan.handoff.missingInputs.includes("CONFIRM_TRANSIT_ROUTE"));

  const reviewed = planCustoms({ shipment: { ...s, transitRoute: controlled("SG") } }, data, catalog, now);
  assert.equal(reviewed.transitReview?.status, "control_reported");
  assert.equal(reviewed.checkout.route, "cross_border");
  const domesticLoading = planCustoms({ shipment: { ...s, loadingCountry: "JP" } }, data, catalog, now);
  assert.equal(domesticLoading.transitReview?.status, "not_provided");
  assert.equal(domesticLoading.checkout.route, "cross_border");
});

test("transit quote requires distinct broker review bound to the exact ordered itinerary", () => {
  const quote = structuredClone(brDe);
  assert.equal(quoteWorldShipment(quote, data, catalog, now).status, "estimated");
  quote.plan.shipment.transitRoute = controlled("PT", "NL");
  const digest = () => pilotQuoteShipmentDigest(quote.plan, quote.orderId, quote.loadingCountry, quote.usJurisdictionApplies);
  quote.reviewedShipmentDigest = digest();
  const missing = quoteWorldShipment(quote, data, catalog, now);
  assert.equal(missing.status, "review_required");
  assert.ok(missing.findings.some(({ code }) => code === "TRANSIT_EVIDENCE_SHIPMENT_MISMATCH"));
  assert.ok(quote.tradeReview?.status === "confirmed");
  quote.tradeReview.evidence.transitReviewShipmentDigest = digest();
  const reviewed = quoteWorldShipment(quote, data, catalog, now);
  assert.equal(reviewed.status, "estimated");
  assert.equal(reviewed.productionAuthorized, false);
  quote.plan.shipment.transitRoute.stops.reverse();
  quote.reviewedShipmentDigest = digest();
  const reordered = quoteWorldShipment(quote, data, catalog, now);
  assert.equal(reordered.status, "review_required");
  assert.ok(reordered.findings.some(({ code }) => code === "TRANSIT_EVIDENCE_SHIPMENT_MISMATCH"));
});

test("bloc data rejects same-country pair scopes and non-HTTPS evidence", () => {
  const base = data.tradeBlocs?.find(({ id }) => id === "eac_customs_union");
  assert.ok(base);
  for (const change of [
    { pairs: [{ originCountry: "KE", destinationCountry: "KE" }] },
    { sources: [{ authority: "Test", title: "Test", url: "http://example.test" }] },
  ]) assert.throws(() => loadTradeBlocs(data, [{ ...base, ...change }]), /INVALID_TRADE_BLOC/);
});
