import { readFileSync } from "node:fs";
import type { OfficialCustomsSource } from "./wco.ts";
import { antarcticEvidenceCountry, discoveryCountries, inScopeCountries, officialTariffSources } from "./tariff-source-registry.ts";
import type { DownloadSource } from "./tariff-source-registry.ts";
import { destinationCustomsScope } from "./destination-customs-scope.ts";

type ReferenceClassification = "official_schedule_lookup" | "other_official_reference";
export const tariffSourceStatuses = [
  "automatic_discovery", "direct_download", "official_schedule_lookup",
  "other_official_reference", "no_specific_reference", "excluded",
] as const;
type CoverageStatus = (typeof tariffSourceStatuses)[number];
type OfficialTariffReference = OfficialCustomsSource & { classification: ReferenceClassification };

function readData<T>(filename: string): T {
  return JSON.parse(readFileSync(new URL(`../data/${filename}`, import.meta.url), "utf8")) as T;
}

export const geographicCountries = new Set<string>(inScopeCountries);
export const acquisitionScopeCountries = new Set<string>([...geographicCountries].filter((country) => country !== "KP"));
const automatedDiscoveryCountries = new Set<string>(discoveryCountries);
const scheduleKinds = new Set(["official_schedule", "tariff_search", "customs_union_reference"]);
const curatedSourcesByCountry = new Map<string, (typeof officialTariffSources)[number][]>();
for (const source of officialTariffSources) {
  for (const country of source.countries) {
    const countrySources = curatedSourcesByCountry.get(country) ?? [];
    countrySources.push(source);
    curatedSourcesByCountry.set(country, countrySources);
  }
}

const sourceRegistry = {
  ...readData<{ sources: Record<string, OfficialCustomsSource[]> }>("wco-tariff-sources.json").sources,
  ...readData<{ nonMemberSources: Record<string, OfficialCustomsSource[]> }>("territory-customs.json").nonMemberSources,
};

const publishedTariffUrlsByCountry = new Map<string, Set<string>>();
for (const snapshot of readData<{ snapshots: {
  role?: string; zone: string; scope: string; countries: string[]; sourceUrl: string;
}[] }>("tariffs/manifest.json").snapshots) {
  if (snapshot.role || snapshot.zone !== "standard" || !["national_schedule", "published_baseline"].includes(snapshot.scope)) continue;
  for (const country of snapshot.countries) {
    const urls = publishedTariffUrlsByCountry.get(country) ?? new Set();
    urls.add(snapshot.sourceUrl);
    publishedTariffUrlsByCountry.set(country, urls);
  }
}

export function listOfficialTariffReferences(country: string): OfficialTariffReference[] {
  if (!acquisitionScopeCountries.has(country) && country !== antarcticEvidenceCountry) return [];
  const references = new Map<string, OfficialTariffReference>();
  for (const source of curatedSourcesByCountry.get(country) ?? []) {
    if (source.access !== "reference") continue;
    const isSchedule = source.scope !== "official_reference";
    references.set(new URL(source.url).href, {
      url: source.url,
      authority: source.authority,
      title: source.authority,
      kind: isSchedule ? "official_schedule" : "customs_guidance",
      scope: source.note,
      classification: isSchedule ? "official_schedule_lookup" : "other_official_reference",
    });
  }
  for (const source of sourceRegistry[country] ?? []) {
    const isSchedule = scheduleKinds.has(source.kind) || publishedTariffUrlsByCountry.get(country)?.has(source.url);
    const url = new URL(source.url).href;
    const previous = references.get(url);
    if (!previous || (isSchedule && previous.classification !== "official_schedule_lookup")) {
      references.set(url, {
        ...source,
        classification: isSchedule ? "official_schedule_lookup" : "other_official_reference",
      });
    }
  }
  return [...references.values()];
}

interface DestinationSourceCoverage {
  country: string;
  status: CoverageStatus;
  hasDiscoveryAdapter: boolean;
  directDownloads: DownloadSource[];
  references: OfficialTariffReference[];
  customsScope?: NonNullable<ReturnType<typeof destinationCustomsScope>>;
}

export function sourceCoverageForCountry(country: string): DestinationSourceCoverage {
  if (!acquisitionScopeCountries.has(country) && country !== antarcticEvidenceCountry) {
    return { country, status: "excluded" as const, hasDiscoveryAdapter: false, directDownloads: [], references: [] };
  }
  const hasDiscoveryAdapter = automatedDiscoveryCountries.has(country);
  const directDownloads = (curatedSourcesByCountry.get(country) ?? [])
    .filter((source) => source.access === "download")
    .map((source) => ({ ...source, countries: [...source.countries] }));
  const references = listOfficialTariffReferences(country);
  let status: CoverageStatus = "no_specific_reference";
  if (hasDiscoveryAdapter) status = "automatic_discovery";
  else if (directDownloads.length) status = "direct_download";
  else if (references.some(({ classification }) => classification === "official_schedule_lookup")) status = "official_schedule_lookup";
  else if (references.length) status = "other_official_reference";
  const scope = destinationCustomsScope(country);
  return { country, status, hasDiscoveryAdapter, directDownloads, references,
    ...(scope ? { customsScope: scope } : {}) };
}

