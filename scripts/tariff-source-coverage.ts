import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { antarcticEvidenceCountry } from "../src/tariff-source-registry.ts";

export { listOfficialTariffReferences } from "../src/tariff-source-directory.ts";
import {
  geographicCountries, acquisitionScopeCountries, sourceCoverageForCountry,
} from "../src/tariff-source-directory.ts";

const wcoMembers = new Set((JSON.parse(readFileSync(new URL("../data/wco-members.json", import.meta.url), "utf8")) as
  { members: { memberId: string }[] })
  .members.map(({ memberId }) => memberId));
async function datedCoverage(date: string) {
  const [{ loadDataset }, { loadTariffCatalog }, { coverageLedger }, { requireCoverageDate }] = await Promise.all([
    import("../src/dataset.ts"),
    import("../src/tariffs.ts"),
    import("../src/coverage-ledger.ts"),
    import("../src/wco.ts"),
  ]);
  requireCoverageDate(date);
  const dataset = loadDataset();
  const destinations = coverageLedger(dataset, loadTariffCatalog(dataset), date).destinations
    .filter(({ destinationCountry }) => acquisitionScopeCountries.has(destinationCountry))
    .map((destination) => {
      const standard = destination.referencesOnDate.filter(({ role, zone }) => role === "tariff" && zone === "standard");
      return [destination.destinationCountry, {
        status: destination.standardTariffStatus,
        generalDutyPolicies: destination.generalDutyPolicies,
        nationalScheduleIds: standard.filter(({ scope }) => scope === "national_schedule").map(({ snapshotId }) => snapshotId),
        publishedBaselineIds: standard.filter(({ scope }) => scope === "published_baseline").map(({ snapshotId }) => snapshotId),
        compiledReferenceIds: standard.filter(({ scope }) => scope === "compiled_reference").map(({ snapshotId }) => snapshotId),
      }] as const;
    });
  const counts = destinations.map(([, result]) => result);
  return {
    byCountry: new Map(destinations),
    totals: {
      standardTariffReferenceDestinations: counts.filter(({ status }) => status === "tariff_reference_on_date").length,
      publishedTariffDestinations: counts.filter(({ nationalScheduleIds, publishedBaselineIds }) => nationalScheduleIds.length || publishedBaselineIds.length).length,
      generalZeroDutyPolicyDestinations: counts.filter(({ generalDutyPolicies }) =>
        generalDutyPolicies.some(({ treatment }) => treatment === "general_zero")).length,
      nationalScheduleDestinations: counts.filter(({ nationalScheduleIds }) => nationalScheduleIds.length).length,
      publishedBaselineDestinations: counts.filter(({ publishedBaselineIds }) => publishedBaselineIds.length).length,
      compiledReferenceOnlyDestinations: counts.filter(({ nationalScheduleIds, publishedBaselineIds, compiledReferenceIds }) =>
        !nationalScheduleIds.length && !publishedBaselineIds.length && compiledReferenceIds.length).length,
    },
  };
}

export async function tariffSourceCoverage(options: { country?: string; date?: string } = {}) {
  if (options.country !== undefined && options.country !== antarcticEvidenceCountry && !geographicCountries.has(options.country)) throw new Error("UNSUPPORTED_ACQUISITION_COUNTRY");
  const destinations = [...geographicCountries].sort().map(sourceCoverageForCountry);
  const selected = options.country === antarcticEvidenceCountry ? [sourceCoverageForCountry(antarcticEvidenceCountry)]
    : destinations.filter(({ country }) => !options.country || country === options.country);
  const dated = options.date === undefined ? null : await datedCoverage(options.date);
  const automatic = destinations.filter(({ hasDiscoveryAdapter, directDownloads }) => hasDiscoveryAdapter || directDownloads.length);
  const baseSchedules = automatic.filter(({ hasDiscoveryAdapter, directDownloads }) =>
    hasDiscoveryAdapter || directDownloads.some(({ role }) => role === undefined || role === "base_schedule"));
  const wcoDestinations = destinations.filter(({ country }) => wcoMembers.has(country));
  return {
    schemaVersion: 1,
    selectedCountry: options.country ?? null,
    referenceDate: options.date ?? null,
    tariffEffectiveDateVerifiedByAcquisition: false,
    totals: {
      destinations: destinations.length,
      acquisitionScopeDestinations: acquisitionScopeCountries.size,
      excludedDestinations: destinations.length - acquisitionScopeCountries.size,
      automaticAcquisitionDestinations: automatic.length,
      baseScheduleAcquisitionDestinations: baseSchedules.length,
      policyDocumentOnlyAcquisitionDestinations: automatic.length - baseSchedules.length,
      discoveryDestinations: destinations.filter(({ hasDiscoveryAdapter }) => hasDiscoveryAdapter).length,
      directDownloadDestinations: destinations.filter(({ directDownloads }) => directDownloads.length).length,
      officialScheduleLookupOnlyDestinations: destinations.filter(({ status }) => status === "official_schedule_lookup").length,
      otherOfficialReferenceOnlyDestinations: destinations.filter(({ status }) => status === "other_official_reference").length,
      destinationsWithDocumentedCustomsScope: destinations.filter(({ customsScope }) => customsScope !== undefined).length,
      destinationsWithTariffSourceOrCustomsScope: destinations.filter(({ status, customsScope }) =>
        status !== "excluded" && (status === "automatic_discovery" || status === "direct_download" ||
          status === "official_schedule_lookup" || customsScope !== undefined)).length,
      withoutSpecificReferenceDestinations: destinations.filter(({ status }) => status === "no_specific_reference").length,
    },
    wcoMemberTotals: {
      members: wcoMembers.size,
      membersWithAutomaticAcquisition: automatic.filter(({ country }) => wcoMembers.has(country)).length,
      membersWithOfficialScheduleLookupOnly: wcoDestinations.filter(({ status }) => status === "official_schedule_lookup").length,
      membersWithOtherOfficialReferenceOnly: wcoDestinations.filter(({ status }) => status === "other_official_reference").length,
    },
    bundledTariffTotalsOnDate: dated?.totals ?? null,
    destinations: selected.map((destination) => ({
      ...destination,
      bundledTariffsOnDate: dated?.byCountry.get(destination.country) ?? null,
    })),
  };
}

async function main() {
  const { values } = parseArgs({ options: { country: { type: "string" }, date: { type: "string" } }, strict: true });
  if (values.date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(values.date)) throw new Error("INVALID_DATE");
  const report = await tariffSourceCoverage({
    ...(values.country !== undefined ? { country: values.country.trim().toUpperCase() } : {}),
    ...(values.date !== undefined ? { date: values.date } : {}),
  });
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "TARIFF_SOURCE_COVERAGE_FAILED");
    process.exitCode = 1;
  });
