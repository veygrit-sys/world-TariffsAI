import { coverageLedger } from "./coverage-ledger.ts";
import { todayJst } from "./dataset.ts";
import { InputError } from "./schema.ts";
import { geographicCountries, sourceCoverageForCountry } from "./tariff-source-directory.ts";
import { antarcticEvidenceCountry } from "./tariff-source-registry.ts";
import { requireCoverageDate } from "./wco.ts";
import type { TariffCatalog } from "./tariffs.ts";
import type { Dataset } from "./types.ts";

export const tariffEvidenceBases = [
  "excluded",
  "customs_scope_confirmation_required",
  "published_tariff_on_date",
  "general_zero_duty_on_date",
  "official_tariff_source_review",
  "applied_tariff_confirmation_required",
] as const;

type EvidenceBasis = (typeof tariffEvidenceBases)[number];

export function tariffEvidence(country: string, date: string | undefined, dataset: Dataset, catalog: TariffCatalog, now = new Date()) {
  if (!geographicCountries.has(country) && country !== antarcticEvidenceCountry)
    throw new InputError([{ path: "/country", code: "UNKNOWN_DESTINATION" }]);
  const referenceDate = date ?? todayJst(now);
  requireCoverageDate(referenceDate);
  const sourceCoverage = sourceCoverageForCountry(country);
  const ledger = sourceCoverage.status === "excluded" || country === antarcticEvidenceCountry ? undefined
    : coverageLedger(dataset, catalog, referenceDate, now).destinations.find(({ destinationCountry }) => destinationCountry === country);
  const publishedTariffSnapshotIds = ledger?.publishedStandardTariffSnapshotIdsOnDate ?? [];
  const generalDutyPolicies = ledger?.generalDutyPolicies ?? [];
  const customsScope = sourceCoverage.customsScope ?? null;
  let evidenceBasis: EvidenceBasis = "applied_tariff_confirmation_required";
  if (sourceCoverage.status === "excluded") evidenceBasis = "excluded";
  else if (customsScope && customsScope.classification !== "applied_tariff_confirmation_required")
    evidenceBasis = "customs_scope_confirmation_required";
  else if (publishedTariffSnapshotIds.length) evidenceBasis = "published_tariff_on_date";
  else if (generalDutyPolicies.some(({ treatment }) => treatment === "general_zero")) evidenceBasis = "general_zero_duty_on_date";
  else if (!customsScope && (sourceCoverage.hasDiscoveryAdapter ||
      sourceCoverage.directDownloads.some(({ role }) => role === undefined || role === "base_schedule") ||
      sourceCoverage.references.some(({ classification }) => classification === "official_schedule_lookup")))
    evidenceBasis = "official_tariff_source_review";

  return {
    country, referenceDate, evidenceBasis, customsScope,
    sourceStatus: sourceCoverage.status,
    directDownloads: sourceCoverage.directDownloads,
    references: sourceCoverage.references,
    publishedTariffSnapshotIds,
    generalDutyPolicies,
    tariffEffectiveDateVerifiedByAcquisition: false as const,
    shippingAuthorized: false as const,
  };
}

export type TariffEvidence = ReturnType<typeof tariffEvidence>;
