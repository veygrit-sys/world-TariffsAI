import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { readFileSync } from "node:fs";

export const discoveryCountries = ["JP", "CN", "US"] as const;
export type DiscoveryCountry = (typeof discoveryCountries)[number];

export const documentFormats = ["html", "pdf", "json", "csv", "zip", "xlsx", "xml", "gzip"] as const;
export type DocumentFormat = (typeof documentFormats)[number];
const roles = ["base_schedule", "policy_notice", "policy_attachment"] as const;
const scopes = ["national", "customs_union", "official_reference"] as const;

interface Source {
  id: string;
  countries: string[];
  url: string;
  authority: string;
  scope: (typeof scopes)[number];
  note: string;
}
export interface DownloadSource extends Source {
  access: "download";
  format: DocumentFormat;
  role?: (typeof roles)[number];
  group?: string;
  expected?: string;
  rangeRecovery?: true;
}
export interface ReferenceSource extends Source {
  access: "reference";
}
export type OfficialTariffSource = DownloadSource | ReferenceSource;

function readData<T>(file: string): T {
  return JSON.parse(readFileSync(new URL("../data/" + file, import.meta.url), "utf8")) as T;
}

type Destination = { code: string; inScope: boolean };
export const inScopeCountries = [
  ...readData<Destination[]>("countries.json"),
  ...readData<Destination[]>("supplemental-regions.json"),
].filter(({ inScope }) => inScope).map(({ code }) => code).sort();
const inScope = new Set(inScopeCountries);
// Antarctic logistics has an evidence entry without joining the commerce or acquisition registry.
export const antarcticEvidenceCountry = "AQ";
const idPattern = /^[a-z][a-z0-9_]{1,95}$/;

function hasEnumValue<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && values.some((entry) => entry === value);
}

function isText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

function sourceUrl(value: unknown, access: unknown) {
  if (!isText(value, 2048) || /[\s\\]/.test(value)) throw new Error("INVALID_OFFICIAL_SOURCE_URL");
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.port ||
      isIP(url.hostname) || url.hostname.includes("[") || !url.hostname.includes(".") || url.hostname.endsWith(".") ||
      /\.(?:local|localhost|internal|test|invalid|example)$/i.test(url.hostname) ||
      (access === "download" && url.hash))
    throw new Error("INVALID_OFFICIAL_SOURCE_URL");
  return url;
}

export function validateOfficialTariffSources(value: unknown): OfficialTariffSource[] {
  if (!Array.isArray(value)) throw new Error("INVALID_OFFICIAL_SOURCE_REGISTRY");
  const ids = new Set<string>();
  const requests = new Map<string, string>();
  const groups = new Map<string, string>();
  for (const row of value) {
    if (row === null || typeof row !== "object") throw new Error("INVALID_OFFICIAL_SOURCE_ENTRY");
    const { id, countries, url, authority, scope, note, access, format, group, expected, role, rangeRecovery } = row;
    if (typeof id !== "string" || !idPattern.test(id) || ids.has(id) ||
        !Array.isArray(countries) || !countries.length || new Set(countries).size !== countries.length ||
        countries.some((country) => (!inScope.has(country) && country !== antarcticEvidenceCountry) || country === "KP") || !isText(authority, 200) ||
        !isText(note, 1000) || !hasEnumValue(scopes, scope))
      throw new Error("INVALID_OFFICIAL_SOURCE_ENTRY");
    const href = sourceUrl(url, access).href;
    if (access === "download") {
      if (!hasEnumValue(documentFormats, format) || scope === "official_reference" || countries.some(isDiscoveryCountry) || countries.includes(antarcticEvidenceCountry) ||
          (role !== undefined && !hasEnumValue(roles, role)) ||
          (rangeRecovery !== undefined && (rangeRecovery !== true || format !== "pdf")) ||
          (group !== undefined && (typeof group !== "string" || !idPattern.test(group))) ||
          (expected !== undefined && (format !== "html" || !isText(expected, 180))))
        throw new Error("INVALID_OFFICIAL_DOWNLOAD_ENTRY");
      const signature = JSON.stringify([format, expected ?? null, rangeRecovery ?? false]);
      if (requests.has(href) && requests.get(href) !== signature)
        throw new Error("CONFLICTING_OFFICIAL_DOWNLOAD_FORMAT");
      requests.set(href, signature);
      if (group !== undefined) {
        const members = JSON.stringify([scope, [...countries].sort()]);
        if (groups.has(group) && groups.get(group) !== members) throw new Error("INCONSISTENT_OFFICIAL_SOURCE_GROUP");
        groups.set(group, members);
      }
    } else if (access !== "reference" || format !== undefined || group !== undefined || expected !== undefined || role !== undefined || rangeRecovery !== undefined) {
      throw new Error("INVALID_OFFICIAL_REFERENCE_ENTRY");
    }
    ids.add(id);
  }
  return value as OfficialTariffSource[];
}

const sourceFile = "official-tariff-sources.json";
const sourceBytes = readFileSync(new URL("../data/" + sourceFile, import.meta.url));
const manifest = readData<{ files: Record<string, string> }>("integrity-manifest.json");
if (manifest.files[sourceFile] !== createHash("sha256").update(sourceBytes).digest("hex"))
  throw new Error("OFFICIAL_SOURCE_REGISTRY_HASH_MISMATCH");
export const officialTariffSources = validateOfficialTariffSources(JSON.parse(sourceBytes.toString("utf8")));
export const acquisitionCountries = [...new Set<string>([
  ...discoveryCountries,
  ...officialTariffSources.filter(({ access }) => access === "download").flatMap(({ countries }) => countries),
])].sort();

function isDiscoveryCountry(value: string): value is DiscoveryCountry {
  return discoveryCountries.some((country) => country === value);
}
export { isDiscoveryCountry };
export const isSupportedDestination = (value: string) => inScope.has(value);
