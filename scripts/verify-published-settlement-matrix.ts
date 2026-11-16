import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import {
  historicalPublishedSettlementSamples,
  publishedSettlementDates,
  publishedSettlementOrigins,
  publishedSettlementTerms,
  verifyPublishedSettlement,
} from "./published-settlement-fixtures.ts";
import { additionalPublishedSettlementSamples } from "./published-settlement-extra-lines.ts";

interface Rc19Matrix {
  destinations: {
    destinationCountry: string;
    settlement: { status: string; origins: string[] }[];
  }[];
}

type Attempt = ReturnType<typeof verifyPublishedSettlement>;
type Group = {
  status: "reconciled" | "held";
  snapshotId?: string | null;
  tariffExpression?: string;
  baseDuty?: string;
  basis?: string;
  sourceUrls?: string[];
  reasons?: readonly string[];
  origins: string[];
};

const baseline = JSON.parse(readFileSync(new URL("../qa/import-settlement-coverage-rc19.json", import.meta.url), "utf8")) as Rc19Matrix;
const historical = JSON.parse(readFileSync(new URL("../qa/import-settlement-historical-rc19.json", import.meta.url), "utf8")) as {
  directions: { direction: string; cases: { status: string }[] }[];
};
const priorReconciled = new Set([
  ...baseline.destinations.flatMap(({ destinationCountry, settlement }) => settlement
    .filter(({ status }) => status === "reconciled")
    .flatMap(({ origins }) => origins.map((origin) => origin + "-" + destinationCountry))),
  ...historical.directions.filter(({ cases }) => cases.every(({ status }) => status === "reconciled"))
    .map(({ direction }) => direction),
]);
assert.equal(priorReconciled.size, 17427);

const samples = [...historicalPublishedSettlementSamples, ...additionalPublishedSettlementSamples]
  .sort((a, b) => a.country.localeCompare(b.country));
const sampleCountries = [...new Set(samples.map(({ country }) => country))];
assert.equal(sampleCountries.length, samples.length, "Duplicate published settlement fixture destination");

function parseCountries(value: string | undefined, allowed: readonly string[]) {
  if (value === undefined) return allowed;
  const requested = [...new Set(value.split(","))].sort();
  for (const code of requested) assert.ok(allowed.includes(code), "Unknown matrix country: " + code);
  return requested;
}

function describe(result: Attempt): Omit<Group, "origins"> {
  if (result.status === "held") {
    return { status: result.status, reasons: "reason" in result ? [result.reason] : result.findings };
  }
  return { status: result.status, snapshotId: result.snapshotId,
    tariffExpression: result.tariffExpression, baseDuty: result.baseDuty,
    ...(result.basis !== undefined ? { basis: result.basis } : {}),
    ...(result.sourceUrls !== undefined ? { sourceUrls: [...result.sourceUrls].sort() } : {}),
  };
}

const { values } = parseArgs({ options: { report: { type: "string" }, origins: { type: "string" }, destinations: { type: "string" } } });
const origins = parseCountries(values.origins, publishedSettlementOrigins);
const destinations = parseCountries(values.destinations, sampleCountries);
const reconciled = new Set<string>();
let attempted = 0;
const destinationResults = samples.filter(({ country }) => destinations.includes(country)).map((sample) => {
  const date = sample.date ?? publishedSettlementDates[1];
  const groups = new Map<string, Group>();
  for (const origin of origins) {
    if (origin === sample.country) continue;
    const route = origin + "-" + sample.country;
    const results = publishedSettlementTerms.map((term) =>
      describe(verifyPublishedSettlement(origin, sample, date, term, { recordHolds: true })));
    assert.deepEqual(results[0], results[1], route + " settlement mismatch across terms");
    const outcome = results[0]!;
    const key = JSON.stringify(outcome);
    const group = groups.get(key) ?? { ...outcome, origins: [] };
    group.origins.push(origin);
    groups.set(key, group);
    if (outcome.status === "reconciled") reconciled.add(route);
    attempted++;
  }
  return {
    destinationCountry: sample.country,
    date,
    tariffCode: sample.code,
    tariffTreatment: sample.treatment ?? "general",
    currency: sample.currency,
    groups: [...groups.values()],
  };
});
const combined = new Set([...priorReconciled, ...reconciled]);
const successfulDestinations = destinationResults.filter(({ groups }) => groups.some(({ status }) => status === "reconciled"));
const directionDestinations = (routes: ReadonlySet<string>) => new Set([...routes].map((route) => route.slice(3)));
const bidirectionalPairs = [...combined].filter((route) => {
  const [origin, destination] = route.split("-");
  return route < (destination + "-" + origin) && combined.has(destination + "-" + origin);
}).length;
const totals = {
  originCodesTested: origins.length,
  destinationCodesTested: destinations.length,
  directionsTested: attempted,
  directionsReconciled: reconciled.size,
  directionsHeld: attempted - reconciled.size,
  termCasesReconciled: reconciled.size * publishedSettlementTerms.length,
  termCasesHeld: (attempted - reconciled.size) * publishedSettlementTerms.length,
  destinationCodesReconciled: successfulDestinations.length,
  exactTariffDestinationCodesReconciled: successfulDestinations.filter(({ tariffTreatment }) => tariffTreatment !== "zero_duty_policy").length,
  zeroPolicyDestinationCodesReconciled: successfulDestinations.filter(({ tariffTreatment }) => tariffTreatment === "zero_duty_policy").length,
  directionsAddedOverRc19: combined.size - priorReconciled.size,
  destinationCodesAddedOverRc19: directionDestinations(combined).size - directionDestinations(priorReconciled).size,
  combinedReconciledDirections: combined.size,
  combinedReconciledDestinationCodes: directionDestinations(combined).size,
  combinedReconciledBidirectionalPairs: bidirectionalPairs,
};
const report = {
  schemaVersion: 1,
  status: "passed",
  tariffEvidence: "bundled_historical_published_tariffs_and_general_duty_policies",
  syntheticOrdersAndSettlementEvidence: true,
  shippingAuthorized: false,
  productionAuthorized: false,
  deliveryTerms: publishedSettlementTerms,
  referenceDates: [...new Set(destinationResults.map(({ date }) => date))].sort(),
  priorReconciledDirections: priorReconciled.size,
  totals,
  origins,
  destinations: destinationResults,
};
const json = JSON.stringify(report) + "\n";
if (values.report) {
  writeFileSync(values.report, json);
  process.stdout.write(JSON.stringify(totals) + "\n");
} else {
  process.stdout.write(json);
}
