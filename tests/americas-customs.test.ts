import assert from "node:assert/strict";
import test from "node:test";
import { planCustoms } from "../src/customs-plan.ts";
import { loadTariffCatalog } from "../src/tariffs.ts";
import type { Shipment } from "../src/types.ts";
import { worldDirection, worldDirectionCoverage } from "../src/world-directions.ts";
import { data, shipment } from "./helpers.ts";

const referenceDate = "2026-11-12";
const now = new Date(referenceDate + "T00:00:00Z");
const catalog = loadTariffCatalog(data);

function direction(originCountry: string, destinationCountry: string, date = referenceDate) {
  return worldDirection({ originCountry, destinationCountry, date }, data, catalog, now);
}

function plan(destinationCountry: string, transport: Shipment["transport"], importDate = referenceDate, originCountry = "JP") {
  return planCustoms({ shipment: shipment({
    originCountry, destinationCountry, transport, importDate, currency: "USD",
  }) }, data, catalog, now);
}

test("US formal entry, informal alternatives, dutiable mail and vessel references stay separate", () => {
  const refs = direction("JP", "US").destinationFeeReferences;
  assert.deepEqual(refs.find(({ id }) => id === "us_mpf_formal_fy2027")?.terms,
    { kind: "ad_valorem", ratePercent: "0.3464", minimum: "34.58", maximum: "670.86" });
  assert.equal(refs.length, 8);
  assert.deepEqual(refs.filter(({ id }) => id.startsWith("us_mpf_informal")).map(({ terms }) => terms),
    [{ kind: "flat", amount: "2.77" }, { kind: "flat", amount: "8.30" }, { kind: "flat", amount: "12.45" }]);
  assert.deepEqual(plan("US", "post").feeReferences.find(({ id }) => id === "us_dutiable_mail_fy2027")?.terms,
    { kind: "flat", amount: "7.61" });
  const air = plan("US", "air");
  assert.ok(!air.feeReferences.some(({ id }) => id === "us_harbor_maintenance" || id === "us_dutiable_mail_fy2027"));
  assert.equal(air.checkout.landedCostTotal, null);
  assert.ok(plan("US", "sea").feeReferences.some(({ id }) => id === "us_harbor_maintenance"));
});

test("Canadian postal handling, Mexico DTA and Bahamas entry caps keep their scope", () => {
  assert.deepEqual(plan("CA", "post").feeReferences.map(({ category, currency, terms }) => ({ category, currency, terms })), [
    { category: "postal_operator", currency: "CAD", terms: { kind: "flat", amount: "9.95" } },
  ]);
  assert.deepEqual(plan("CA", "air").feeReferences, []);
  assert.deepEqual(direction("JP", "MX").destinationFeeReferences[0]?.terms,
    { kind: "ad_valorem", ratePercent: "0.8", minimum: "461.61" });
  assert.deepEqual(direction("JP", "BS").destinationFeeReferences[0]?.terms,
    { kind: "ad_valorem", ratePercent: "1", minimum: "10.00", maximum: "1500.00" });
  assert.deepEqual(plan("JM", "air").feeReferences[0]?.terms, { kind: "authority_review" });
});

test("fee data is dated and suppressed for same territories and excluded routes", () => {
  assert.deepEqual(direction("JP", "US", "2026-09-30").destinationFeeReferences, []);
  assert.deepEqual(direction("JP", "US", "2026-11-13").destinationFeeReferences, []);
  assert.equal(direction("JP", "PR").destinationFeeReferences.length, 8);
  for (const [origin, destination] of [["US", "PR"], ["PR", "US"], ["FR", "GF"], ["MQ", "FR"]] as const) {
    assert.equal(direction(origin, destination).territoryReviewRequired, true);
    assert.deepEqual(direction(origin, destination).destinationFeeReferences, []);
    assert.deepEqual(plan(destination, "air", referenceDate, origin).feeReferences, []);
  }
  assert.deepEqual(direction("KP", "US").destinationFeeReferences, []);
  assert.deepEqual(direction("JP", "VI").destinationFeeReferences, []);
  assert.equal(worldDirectionCoverage(data, catalog, referenceDate, now).passes
    .find(({ pass }) => pass === 4)?.withFeeReferencesOnDate, 9);
});

test("new Americas additional measures preserve national codes, origin scope and conditional amounts", () => {
  const usa = { destinationCountry: "US", originCountry: "CA", code: "2203000030", date: referenceDate };
  const section338 = "us-section338-ca-note51-review-2026-11-12";
  const result = catalog.lookup(usa);
  assert.equal(result.applicableRate, null);
  assert.ok(result.measures.matches.some((match) => match.snapshotId === section338 &&
    match.rates.some((rate) => rate.expression.endsWith("+ 50%") && rate.condition)));
  assert.ok(!catalog.lookup({ ...usa, originCountry: "JP" }).measures.matches.some(({ snapshotId }) => snapshotId === section338));
  assert.ok(!catalog.lookup({ ...usa, date: "2026-11-13" }).measures.matches.some(({ snapshotId }) => snapshotId === section338));

  const mexico = catalog.lookup({ destinationCountry: "MX", originCountry: "US", code: "3904100300", date: referenceDate });
  assert.equal(mexico.applicableRate, null);
  assert.ok(mexico.measures.matches.some(({ snapshotId, rates }) =>
    snapshotId === "mx-dof-5802364-us-pvc-ad-review-2026-11-12" &&
    rates.some(({ expression, condition }) => expression.includes("0.3918") && condition)));

  const jamaica = catalog.lookup({ destinationCountry: "JM", originCountry: "JP", code: "8517130000", date: referenceDate });
  assert.equal(jamaica.applicableRate, null);
  assert.ok(jamaica.measures.matches.some(({ rates }) =>
    rates.some(({ expression, label }) => expression === "0.85%" && /Environmental Protection Levy/i.test(label))));
});
