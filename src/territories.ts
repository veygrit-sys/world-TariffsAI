import { readFileSync } from "node:fs";
import { dataDirectory } from "./dataset.ts";
import type { Dataset } from "./types.ts";
import type { TariffSnapshot } from "./tariffs.ts";
import {
  describeTariffCoverage,
  isDate,
  requireCoverageDate,
  validLink,
  type OfficialCustomsSource,
} from "./wco.ts";

export interface GeneralDutyPolicy {
  destinationCountry: string;
  treatment: "general_zero" | "most_goods_zero";
  customsTerritory?: string;
  availableFrom: string;
  availableThrough: string;
  scope: string;
  otherChargesAndControls: string;
  sources: OfficialCustomsSource[];
}

interface TerritoryRegistry {
  schemaVersion: number;
  checkedOn: string;
  nonMemberSources: Record<string, OfficialCustomsSource[]>;
  generalDutyPolicies: GeneralDutyPolicy[];
}

export function loadTerritoryRegistry(): TerritoryRegistry {
  const data = JSON.parse(readFileSync(
    new URL("territory-customs.json", dataDirectory), "utf8",
  )) as TerritoryRegistry;
  const validSource = (source: OfficialCustomsSource) =>
    validLink(source.url) && !!source.authority && !!source.title && !!source.kind &&
    !!source.scope && (source.sourceUrl === undefined || validLink(source.sourceUrl));
  if (
    data.schemaVersion !== 1 ||
    !isDate(data.checkedOn) ||
    Object.entries(data.nonMemberSources).some(([code, sources]) =>
      !/^[A-Z]{2}$/.test(code) || !sources.length || !sources.every(validSource),
    ) ||
    new Set(data.generalDutyPolicies.map(({ destinationCountry }) => destinationCountry))
      .size !== data.generalDutyPolicies.length ||
    data.generalDutyPolicies.some((policy) =>
      !/^[A-Z]{2}$/.test(policy.destinationCountry) ||
      !["general_zero", "most_goods_zero"].includes(policy.treatment) ||
      (policy.customsTerritory !== undefined && !/^[A-Z][A-Z0-9_-]{1,23}$/.test(policy.customsTerritory)) ||
      !isDate(policy.availableFrom) || !isDate(policy.availableThrough) ||
      policy.availableFrom > policy.availableThrough ||
      !policy.scope || !policy.otherChargesAndControls ||
      !policy.sources.length || !policy.sources.every(validSource),
    )
  )
    throw new Error("INVALID_TERRITORY_CUSTOMS_REGISTRY");
  return data;
}

export function coversPolicyDate(policy: GeneralDutyPolicy, date: string): boolean {
  return policy.availableFrom <= date && date <= policy.availableThrough;
}

export function territoryCoverage(
  dataset: Dataset,
  wcoMemberIds: ReadonlySet<string>,
  registry: TerritoryRegistry,
  snapshots: readonly TariffSnapshot[],
  date: string,
) {
  requireCoverageDate(date);
  const destinations = [...dataset.countries, ...dataset.supplementalRegions]
    .filter(({ code, inScope }) => inScope && !wcoMemberIds.has(code))
    .map(({ code, name, nameJa }) => ({
      destinationCountry: code,
      name,
      nameJa,
      ...describeTariffCoverage(snapshots, code, date, registry.nonMemberSources[code] ?? []),
    }));
  return {
    referenceDate: date,
    sourcesCheckedOn: registry.checkedOn,
    nonMemberDestinationCount: destinations.length,
    nonMemberDestinationsWithTariffReferencesOnDate: destinations.filter(
      (item) => item.status === "tariff_reference_on_date",
    ).length,
    nonMemberDestinationsWithOfficialSources: destinations.filter(
      (item) => item.officialSources.length,
    ).length,
    allNonMemberTaxRatesComplete: false,
    nonMemberDestinations: destinations,
    generalDutyPolicies: registry.generalDutyPolicies.filter(
      (policy) => coversPolicyDate(policy, date),
    ),
  };
}

export type TerritoryCoverage = ReturnType<typeof territoryCoverage>;
