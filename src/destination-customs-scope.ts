import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { antarcticEvidenceCountry, isSupportedDestination, officialTariffSources } from "./tariff-source-registry.ts";

export const customsScopeClassifications = [
  "restricted_access",
  "local_customs_ordinance",
  "no_standalone_customs_administration",
  "island_required",
  "scientific_logistics",
  "applied_tariff_confirmation_required",
] as const;

type CustomsScopeClassification = (typeof customsScopeClassifications)[number];

interface CustomsScopeRecord {
  country: string;
  classification: CustomsScopeClassification;
  noteJa: string;
  requiredChecks: string[];
  sourceIds: string[];
}

const scopeFile = "destination-customs-scope.json";
const dataUrl = new URL("../data/", import.meta.url);
const scopeBytes = readFileSync(new URL(scopeFile, dataUrl));
const integrity = JSON.parse(readFileSync(new URL("integrity-manifest.json", dataUrl), "utf8")) as
  { files: Record<string, string> };
if (integrity.files[scopeFile] !== createHash("sha256").update(scopeBytes).digest("hex"))
  throw new Error("CUSTOMS_SCOPE_INTEGRITY_MISMATCH");

const { checkedOn, destinations } = JSON.parse(scopeBytes.toString("utf8")) as
  { checkedOn: string; destinations: CustomsScopeRecord[] };
const checkedDate = new Date(checkedOn + "T00:00:00Z");
if (!/^\d{4}-\d{2}-\d{2}$/.test(checkedOn) || !Number.isFinite(checkedDate.valueOf()) ||
    checkedDate.toISOString().slice(0, 10) !== checkedOn || !Array.isArray(destinations))
  throw new Error("INVALID_CUSTOMS_SCOPE_REGISTRY");

const sourceById = new Map(officialTariffSources.map((source) => [source.id, source]));
const scopes = new Map<string, CustomsScopeRecord>();
const nonblank = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
for (const record of destinations) {
  if (!record || (!isSupportedDestination(record.country) && record.country !== antarcticEvidenceCountry) || record.country === "KP" || scopes.has(record.country) ||
      !customsScopeClassifications.includes(record.classification) || !nonblank(record.noteJa) ||
      !Array.isArray(record.requiredChecks) || !record.requiredChecks.length || !record.requiredChecks.every(nonblank) ||
      !Array.isArray(record.sourceIds) || !record.sourceIds.length || new Set(record.sourceIds).size !== record.sourceIds.length ||
      !record.sourceIds.every((id) => sourceById.get(id)?.countries.includes(record.country)))
    throw new Error("INVALID_DESTINATION_CUSTOMS_SCOPE");
  scopes.set(record.country, record);
}

export function destinationCustomsScope(country: string) {
  const record = scopes.get(country);
  if (!record) return null;
  const { classification, noteJa, requiredChecks, sourceIds } = record;
  return {
    classification, noteJa, requiredChecks: [...requiredChecks], checkedOn,
    sources: sourceIds.map((id) => {
      const { authority, url } = sourceById.get(id)!;
      return { id, authority, url };
    }),
  };
}
