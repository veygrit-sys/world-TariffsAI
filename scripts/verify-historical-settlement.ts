import assert from "node:assert/strict";
import {
  historicalJapanSettlementSample as japan,
  historicalPublishedSettlementSamples as samples,
  publishedSettlementDates as dates,
  publishedSettlementTerms as termsToTest,
  verifyPublishedSettlement as verify,
} from "./published-settlement-fixtures.ts";

const currentControlDate = "2026-11-14";

const directions = samples.flatMap((sample) => {
  const date = sample.date ?? dates[1];
  const outboundHold = sample.holdReason ?? (sample.country === "IL" ? "DATED_TARIFF_REFERENCE_REQUIRED" : undefined);
  return [
    { direction: "JP-" + sample.country, referenceDate: date, cases: termsToTest.map((term) =>
      verify("JP", sample, date, term, { holdReason: outboundHold })) },
    { direction: sample.country + "-JP", referenceDate: date, cases: termsToTest.map((term) =>
      verify(sample.country, japan, date, term, { holdReason: sample.holdReason })) },
  ];
});
const reconciled = directions.filter(({ cases }) => cases.every(({ status }) => status === "reconciled"));
const held = directions.filter(({ cases }) => cases.every(({ status }) => status === "held"));
assert.equal(directions.length, reconciled.length + held.length);
assert.equal(reconciled.length, 47);
assert.equal(held.length, 5);

const currentDateControl = ["GE", "MY", "PW"].flatMap((country) => {
  const sample = samples.find((value) => value.country === country)!;
  const reason = "DATED_TARIFF_REFERENCE_REQUIRED";
  return [
    { direction: "JP-" + country, ...verify("JP", sample, currentControlDate, "DAP", { holdReason: reason }) },
    { direction: country + "-JP", ...verify(country, japan, currentControlDate, "DDP", { holdReason: reason }) },
  ];
});
const report = {
  status: "passed",
  synthetic: true,
  tariffCatalog: "bundled_published_references",
  referenceDates: dates,
  productionAuthorized: false,
  totalDirections: directions.length,
  reconciledDirections: reconciled.length,
  reconciledCases: reconciled.reduce((count, { cases }) => count + cases.length, 0),
  heldDirections: held.length,
  heldCases: held.reduce((count, { cases }) => count + cases.length, 0),
  reconciledCountryOrRegionCodes: [...new Set(reconciled.flatMap(({ direction }) => direction.split("-")))].sort(),
  currentDateControl: { referenceDate: currentControlDate, cases: currentDateControl },
  directions,
};
process.stdout.write(JSON.stringify(report, null, 2) + "\n");
