import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadDataset } from "../src/dataset.ts";
import { minor } from "../src/money.ts";
import { loadTariffCatalog } from "../src/tariffs.ts";
import { officialTariffSources } from "./tariff-source-registry.ts";
import { tariffSourceCoverage } from "./tariff-source-coverage.ts";
const d = loadDataset();
assert.ok(officialTariffSources.length > 0, "Official tariff source registry is empty");
const acquisitionCoverage = (await tariffSourceCoverage()).totals;
assert.equal(acquisitionCoverage.destinationsWithTariffSourceOrCustomsScope, acquisitionCoverage.acquisitionScopeDestinations,
  "All non-excluded destinations need a tariff source or a documented customs review procedure");
const tariffs = loadTariffCatalog(d);
tariffs.verify();
const tariffCoverage = tariffs.coverage();
const wco = tariffs.wcoCoverage("2026-11-11");
assert.equal(wco.members.length, 187);
assert.equal(wco.membersWithOfficialSources, 187);
const destinations = new Set(
  [...d.countries, ...d.supplementalRegions]
    .filter(({ inScope }) => inScope)
    .map(({ code }) => code),
);
assert.ok(wco.members.every(({ memberId }) => destinations.has(memberId)));
const territories = tariffs.territoryCoverage("2026-11-11");
assert.equal(territories.nonMemberDestinationCount, 62);
assert.equal(territories.nonMemberDestinationsWithOfficialSources, 62);
assert.equal(wco.memberCount + territories.nonMemberDestinationCount, destinations.size);
assert.ok(territories.generalDutyPolicies.every(
  ({ destinationCountry }) => destinations.has(destinationCountry),
));
assert.equal(d.countries.filter((c) => c.inScope).length, 248);
assert.equal(d.countries.find((c) => c.code === "AQ")?.inScope, false);
for (const r of d.rules) {
  minor(r.threshold, r.currency);
  if (r.flatDuty !== undefined) minor(r.flatDuty, r.currency);
}
for (const card of d.cards) {
  for (const id of card.sourceIds) {
    const source = d.sources.find((s) => s.id === id);
    assert.ok(source);
    if (card.verification === "primary_rechecked")
      assert.equal(source.verification, "primary_rechecked");
  }
}
const lock = JSON.parse(
  readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"),
);
for (const [path, pkg] of Object.entries(lock.packages) as [
  string,
  { version?: string; resolved?: string; integrity?: string },
][]) {
  if (path && !path.includes("node_modules/")) continue;
  if (path) {
    assert.ok(pkg.version);
    assert.ok(pkg.integrity);
    assert.ok(pkg.resolved?.startsWith("https://registry.npmjs.org/"));
  }
}
console.log(
  JSON.stringify(
    {
      passed: true,
      destinationsWithTariffSourceOrCustomsScope: acquisitionCoverage.destinationsWithTariffSourceOrCustomsScope,
      countries: d.countries.length,
      inScope: d.countries.filter((c) => c.inScope).length,
      sources: d.sources.length,
      primarySources: d.sources.filter(
        (s) => s.verification === "primary_rechecked",
      ).length,
      tradeBlocRecords: d.tradeBlocs?.length ?? 0,
      specialProcedureRecords: d.specialProcedureReferences?.length ?? 0,
      inheritedCards: d.cards.filter(
        (c) => c.verification === "inherited_research",
      ).length,
      rules: d.rules.length,
      wcoMembers: wco.memberCount,
      wcoMembersWithTariffReferencesOnDate: wco.membersWithTariffReferencesOnDate,
      wcoMembersWithOfficialSources: wco.membersWithOfficialSources,
      nonWcoDestinations: territories.nonMemberDestinationCount,
      generalDutyPolicies: territories.generalDutyPolicies.length,
      tariffSchedules: tariffCoverage.snapshots.length,
      tariffDestinations: tariffCoverage.loadedCountriesAndTerritories,
      tariffLines: tariffCoverage.snapshotRows,
      tariffRates: tariffCoverage.snapshotRateEntries,
      measurePacks: tariffCoverage.measureSnapshots.length,
      measureDestinations: tariffCoverage.measureCountriesAndTerritories,
      measureLines: tariffCoverage.measureSnapshotRows,
      measureRates: tariffCoverage.measureRateEntries,
      limitations: [
        "Structural/source checks do not approve live tax rates, routes, identity evidence or shipping.",
      ],
    },
    null,
    2,
  ),
);
