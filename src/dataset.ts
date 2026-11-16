import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import type {
  Dataset,
  Card,
  Country,
  Source,
  Rule,
  SupplementalRegion,
} from "./types.ts";
import { validateDataset } from "./data-schema.ts";
import { loadTradeBlocs } from "./trade-blocs.ts";
import { loadSpecialProcedureReferences } from "./special-procedures.ts";
import { loadSpecialTerritoryReferences } from "./special-territories.ts";
import { loadImportControls } from "./import-controls.ts";
import { loadCustomsFeeReferences } from "./customs-fees.ts";
import { loadRegionalCustoms } from "./regional-customs.ts";

export const dataDirectory = new URL("../data/", import.meta.url);
function read<T>(name: string): T {
  return JSON.parse(readFileSync(new URL(name, dataDirectory), "utf8")) as T;
}
export function loadDataset(): Dataset {
  const manifest = read<{ version: string; files: Record<string, string> }>(
    "integrity-manifest.json",
  );
  const required = [
    "countries.json",
    "wco-members.json",
    "wco-tariff-sources.json",
    "territory-customs.json",
    "supplemental-regions.json",
    "sources.json",
    "research-cards.json",
    "knowledge.json",
    "rules.json",
    "customs-asia.json",
    "customs-europe.json",
    "customs-americas.json",
    "customs-fees.json",
    "customs-western-asia-africa.json",
    "customs-oceania.json",
    "import-controls.json",
    "special-procedures.json",
    "trade-blocs.json",
    "special-territory-references.json",
  ];
  for (const name of required) {
    const actual = createHash("sha256")
      .update(readFileSync(new URL(name, dataDirectory)))
      .digest("hex");
    if (!manifest.files[name] || actual !== manifest.files[name])
      throw new Error("DATA_INTEGRITY_MISMATCH");
  }
  const data: Dataset = {
    version: manifest.version,
    countries: read<Country[]>("countries.json"),
    supplementalRegions: read<SupplementalRegion[]>(
      "supplemental-regions.json",
    ),
    sources: read<Source[]>("sources.json"),
    cards: [
      ...read<Card[]>("knowledge.json"),
      ...read<Card[]>("research-cards.json"),
    ],
    rules: read<Rule[]>("rules.json"),
  };
  validateDataset(data);
  const ids = new Set(data.sources.map((s) => s.id));
  if (
    ids.size !== data.sources.length ||
    new Set(data.countries.map((c) => c.code)).size !== 249 ||
    data.countries.length !== 249
  )
    throw new Error("DATA_REGISTRY_INVALID");
  for (const s of data.sources) {
    const url = new URL(s.url);
    if (url.protocol !== "https:" || url.username || url.password)
      throw new Error("SOURCE_URL_INVALID");
  }
  for (const r of data.rules) {
    if (
      r.sourceIds.length === 0 ||
      r.sourceIds.some(
        (id) =>
          !ids.has(id) ||
          data.sources.find((s) => s.id === id)?.verification !==
            "primary_rechecked",
      )
    )
      throw new Error("RULE_REQUIRES_RECHECKED_PRIMARY_SOURCE");
  }
  for (const c of data.cards)
    if (c.sourceIds.some((id) => !ids.has(id)))
      throw new Error("CARD_SOURCE_MISSING");
  data.regionalCustoms = loadRegionalCustoms(data, [
    { pass: 2, contents: read<unknown>("customs-asia.json") },
    { pass: 3, contents: read<unknown>("customs-europe.json") },
    { pass: 4, contents: read<unknown>("customs-americas.json") },
    { pass: 5, contents: read<unknown>("customs-western-asia-africa.json") },
    { pass: 6, contents: read<unknown>("customs-oceania.json") },
  ]);
  data.customsFeeReferences = loadCustomsFeeReferences(data, read<unknown>("customs-fees.json"));
  data.importControlReferences = loadImportControls(data, read<unknown>("import-controls.json"));
  data.tradeBlocs = loadTradeBlocs(data, read<unknown>("trade-blocs.json"));
  data.specialProcedureReferences = loadSpecialProcedureReferences(data, read<unknown>("special-procedures.json"));
  data.specialTerritoryReferences = loadSpecialTerritoryReferences(data, read<unknown>("special-territory-references.json"));
  return data;
}
const jstDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
export function todayJst(now: Date): string {
  return jstDateFormatter.format(now);
}
export function sourcesCurrent(
  data: Dataset,
  ids: string[],
  importDate: string,
  now: Date,
): boolean {
  const reviewedOn = todayJst(now);
  return (
    ids.length > 0 &&
    ids.every((id) => {
      const s = data.sources.find((x) => x.id === id);
      return (
        !!s &&
        s.verification === "primary_rechecked" &&
        s.checkedOn <= reviewedOn &&
        reviewedOn <= s.reviewBy &&
        importDate <= s.reviewBy
      );
    })
  );
}
export function currentRule(
  data: Dataset,
  id: string,
  importDate: string,
  now: Date,
): Rule | null {
  const candidates = data.rules.filter(
    (r) =>
      r.id === id &&
      r.validFrom <= importDate &&
      (!r.validTo || importDate < r.validTo),
  );
  if (candidates.length !== 1) return null;
  const r = candidates[0]!;
  const reviewedOn = todayJst(now);
  if (reviewedOn < r.checkedOn || reviewedOn > r.reviewBy || importDate > r.reviewBy) return null;
  if (!sourcesCurrent(data, r.sourceIds, importDate, now)) return null;
  return r;
}
