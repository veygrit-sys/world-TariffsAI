import assert from "node:assert/strict";
import test from "node:test";
import { listOfficialTariffReferences, tariffSourceCoverage } from "../scripts/tariff-source-coverage.ts";

test("tariff source coverage counts shared sources per destination and separates reference-only destinations", async () => {
  const { totals, destinations, wcoMemberTotals } = await tariffSourceCoverage();
  assert.equal(wcoMemberTotals.members, wcoMemberTotals.membersWithAutomaticAcquisition +
    wcoMemberTotals.membersWithOfficialScheduleLookupOnly + wcoMemberTotals.membersWithOtherOfficialReferenceOnly);
  assert.equal(totals.destinations, destinations.length);
  assert.equal(totals.destinationsWithTariffSourceOrCustomsScope, totals.acquisitionScopeDestinations);
  assert.equal(totals.destinationsWithDocumentedCustomsScope, 12);
  assert.equal(totals.destinations, totals.acquisitionScopeDestinations + totals.excludedDestinations);
  assert.equal(totals.automaticAcquisitionDestinations,
    totals.baseScheduleAcquisitionDestinations + totals.policyDocumentOnlyAcquisitionDestinations);
  assert.equal(totals.acquisitionScopeDestinations,
    totals.automaticAcquisitionDestinations + totals.officialScheduleLookupOnlyDestinations +
    totals.otherOfficialReferenceOnlyDestinations + totals.withoutSpecificReferenceDestinations);
  assert.deepEqual(destinations.filter(({ hasDiscoveryAdapter }) => hasDiscoveryAdapter).map(({ country }) => country), ["CN", "JP", "US"]);
  for (const { country, references, directDownloads } of destinations) {
    assert.equal(new Set(references.map(({ url }) => new URL(url).href)).size, references.length);
    assert.ok(directDownloads.every(({ access, countries }) => access === "download" && countries.includes(country)));
  }
});

test("the excluded North Korea entry remains visible in coverage but offers no acquisition or reference option", async () => {
  const { selectedCountry, destinations } = await tariffSourceCoverage({ country: "KP" });
  assert.equal(selectedCountry, "KP");
  assert.deepEqual(destinations, [{
    country: "KP", status: "excluded", hasDiscoveryAdapter: false,
    directDownloads: [], references: [], bundledTariffsOnDate: null,
  }]);
  assert.deepEqual(listOfficialTariffReferences("KP"), []);
  await assert.rejects(tariffSourceCoverage({ country: "ZZ" }), /UNSUPPORTED_ACQUISITION_COUNTRY/);
});

test("bundled date-specific rates are reported separately from acquisition coverage", async () => {
  const report = await tariffSourceCoverage({ country: "GB", date: "2026-11-12" });
  const totals = report.bundledTariffTotalsOnDate;
  assert.ok(totals);
  assert.equal(totals.standardTariffReferenceDestinations, totals.publishedTariffDestinations + totals.compiledReferenceOnlyDestinations);
  assert.ok(totals.compiledReferenceOnlyDestinations > 0);
  assert.equal(report.tariffEffectiveDateVerifiedByAcquisition, false);
  assert.equal(report.destinations[0]?.bundledTariffsOnDate?.status, "tariff_reference_on_date");
  assert.ok(report.destinations[0]?.bundledTariffsOnDate?.publishedBaselineIds.length);
  await assert.rejects(tariffSourceCoverage({ date: "2026-02-30" }));
});

test("territorial no-duty evidence is counted without a tariff schedule", async () => {
  const report = await tariffSourceCoverage({ country: "NF", date: "2026-11-13" });
  assert.equal(report.bundledTariffTotalsOnDate?.generalZeroDutyPolicyDestinations, 3);
  assert.equal(report.destinations[0]?.bundledTariffsOnDate?.generalDutyPolicies[0]?.treatment, "general_zero");
  assert.deepEqual(report.destinations[0]?.bundledTariffsOnDate?.publishedBaselineIds, []);
});
