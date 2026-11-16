import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { delimiter, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";
import { Ajv } from "ajv";
import addFormats from "ajv-formats";
import { InputError, parseTariffLookup } from "./schema.ts";
import type { Dataset } from "./types.ts";
import { todayJst } from "./dataset.ts";
import { authenticateTariffReview, type SignedTariffReview } from "./tariff-review.ts";
import {
  loadWcoRegistry,
  requireCoverageDate,
  wcoCoverage,
  type OfficialCustomsSource,
  type WcoCoverage,
} from "./wco.ts";
import {
  coversPolicyDate,
  loadTerritoryRegistry,
  territoryCoverage,
  type GeneralDutyPolicy,
  type TerritoryCoverage,
} from "./territories.ts";

export interface TariffLookupRequest {
  destinationCountry: string;
  code: string;
  originCountry?: string;
  date?: string;
  zone?: "standard" | "special" | "unknown";
  customsTerritory?: string;
  snapshotId?: string;
  offset?: number;
  limit?: number;
  measureOffset?: number;
  measureLimit?: number;
}
export interface TariffRate {
  charge:
    | "customs_duty"
    | "import_vat"
    | "import_gst"
    | "additional_duty"
    | "excise"
    | "trade_remedy"
    | "levy"
    | "fee"
    | "other";
  treatment:
    | "mfn"
    | "general"
    | "preferential"
    | "temporary"
    | "quota"
    | "bound"
    | "other";
  label: string;
  expression: string;
  sourceCode?: string;
  from?: string;
  through?: string;
  origin?: string;
  originCountries?: string[];
  excludedOriginCountries?: string[];
  condition?: string;
}
export interface TariffLine {
  code: string;
  matchPrefix?: true;
  reference: string;
  rates: TariffRate[];
  rateCode?: string;
  units?: string[];
  notes?: string[];
  url?: string;
}
export interface TariffStatistics {
  lines: number;
  uniqueCodes: number;
  codesWithRates: number;
  rates: number;
  chapters: string[];
  charges?: TariffRate["charge"][];
}
export interface TariffSnapshotSource {
  id: string;
  jurisdiction: string;
  countries: string[];
  zone: "standard" | "special";
  edition: string;
  hsEdition: string;
  availableFrom: string;
  availableThrough: string;
  checkedOn: string;
  scope:
    | "national_schedule"
    | "published_baseline"
    | "compiled_reference"
    | "hs6_aggregate";
  role?: "measures";
  authority: string;
  sourceUrl: string;
  terms: string;
  termsUrl: string;
  inputFiles: { name?: string; file?: string; url: string; sha256: string }[];
  limitations: string[];
}
export interface TariffSnapshot extends TariffSnapshotSource {
  file: string;
  sha256: string;
  statistics: TariffStatistics;
}
export interface TariffMatch extends Omit<TariffLine, "rates"> {
  rates: (TariffRate & { adValoremPercent: string | null })[];
}
export interface TariffMeasureMatch extends TariffMatch {
  snapshotId: string;
  matchedBy: "exact" | "prefix" | "more_specific";
}
export interface TariffMeasureLookup {
  status:
    | "measure_references"
    | "no_matching_measures"
    | "date_not_covered"
    | "source_not_loaded"
    | "territory_unresolved";
  sources: { snapshot: TariffSnapshot; referenceDate: string | null }[];
  matches: TariffMeasureMatch[];
  totalMatches: number;
  nextOffset: number | null;
}
export interface DestinationCustomsProfile {
  destinationCountry: string;
  referenceDate: string;
  membershipStatus: "member" | "outside_wco_roster";
  officialSources: OfficialCustomsSource[];
  generalDutyPolicy: GeneralDutyPolicy | null;
}
export interface TariffLookupResult {
  status:
    | "schedule_reference"
    | "national_line_candidates"
    | "hs6_aggregate"
    | "rate_not_reported"
    | "code_not_found"
    | "date_not_covered"
    | "source_not_loaded"
    | "territory_unresolved";
  destinationCountry: string;
  originCountry: string | null;
  code: string;
  zone: TariffLookupRequest["zone"];
  referenceDate: string | null;
  totalMatches: number;
  nextOffset: number | null;
  matches: TariffMatch[];
  snapshot: TariffSnapshot | null;
  availableSnapshots: string[];
  applicableRate: null;
  sourceLinks: string[];
  generalDutyPolicy: GeneralDutyPolicy | null;
  measures: TariffMeasureLookup;
}

const bundledDirectory = new URL("../data/tariffs/", import.meta.url);
const text = (maxLength: number) => ({
  type: "string",
  minLength: 1,
  maxLength,
});
const stringList = (maxLength: number) => ({
  type: "array",
  items: text(maxLength),
  maxItems: 256,
});
const code = { type: "string", pattern: "^[0-9]{2,12}$" };
const sourceCode = { type: "string", pattern: "^[0-9]{4,12}$" };
const date = { type: "string", format: "date" };
const id = { type: "string", pattern: "^[a-z0-9][a-z0-9-]{0,79}$" };
const sha256 = { type: "string", pattern: "^[a-f0-9]{64}$" };
const httpsUrl = {
  type: "string",
  format: "uri",
  pattern: "^https://",
  maxLength: 2048,
};
const nonnegative = { type: "integer", minimum: 0 };
const charge = {
  enum: [
    "customs_duty",
    "import_vat",
    "import_gst",
    "additional_duty",
    "excise",
    "trade_remedy",
    "levy",
    "fee",
    "other",
  ],
};
const countryList = {
  type: "array",
  minItems: 1,
  maxItems: 250,
  uniqueItems: true,
  items: { type: "string", pattern: "^[A-Z]{2}$" },
};
const object = (
  properties: Record<string, unknown>,
  required = Object.keys(properties),
) => ({
  type: "object",
  additionalProperties: false,
  properties,
  required,
});
const rateProperties = {
  charge,
  treatment: {
    enum: [
      "mfn",
      "general",
      "preferential",
      "temporary",
      "quota",
      "bound",
      "other",
    ],
  },
  label: text(180),
  expression: text(3000),
  sourceCode,
  from: date,
  through: date,
  origin: text(3000),
  originCountries: countryList,
  excludedOriginCountries: countryList,
  condition: text(3000),
};
const lineSchema = object(
  {
    code,
    matchPrefix: { const: true },
    reference: text(400),
    rateCode: sourceCode,
    url: httpsUrl,
    units: stringList(100),
    notes: stringList(3000),
    rates: {
      type: "array",
      maxItems: 3000,
      items: object(rateProperties, [
        "charge",
        "treatment",
        "label",
        "expression",
      ]),
    },
  },
  ["code", "reference", "rates"],
);
const sourceProperties = {
  id,
  jurisdiction: { type: "string", pattern: "^[A-Z][A-Z0-9_-]{1,23}$" },
  countries: countryList,
  zone: { enum: ["standard", "special"] },
  edition: text(250),
  hsEdition: text(32),
  availableFrom: date,
  availableThrough: date,
  checkedOn: date,
  scope: {
    enum: [
      "national_schedule",
      "published_baseline",
      "compiled_reference",
      "hs6_aggregate",
    ],
  },
  role: { const: "measures" },
  authority: text(250),
  sourceUrl: httpsUrl,
  terms: text(1200),
  termsUrl: httpsUrl,
  inputFiles: {
    type: "array",
    minItems: 1,
    maxItems: 300,
    items: object({ name: text(255), file: text(255), url: httpsUrl, sha256 }, [
      "url",
      "sha256",
    ]),
  },
  limitations: stringList(1200),
};
const requiredSourceFields = Object.keys(sourceProperties).filter(
  (field) => field !== "role",
);
const snapshotSchema = object(
  {
    ...sourceProperties,
    file: { type: "string", pattern: "^[a-z0-9][a-z0-9-]{0,79}\\.json\\.gz$" },
    sha256,
    statistics: object(
      {
        lines: nonnegative,
        uniqueCodes: nonnegative,
        codesWithRates: nonnegative,
        rates: nonnegative,
        chapters: stringList(2),
        charges: { type: "array", uniqueItems: true, items: charge },
      },
      ["lines", "uniqueCodes", "codesWithRates", "rates", "chapters"],
    ),
  },
  [...requiredSourceFields, "file", "sha256", "statistics"],
);
const ajv = new Ajv({ strict: true });
(addFormats as unknown as (instance: Ajv) => void)(ajv);
const validateManifest = ajv.compile<{
  version: 1;
  snapshots: TariffSnapshot[];
}>(
  object({
    version: { const: 1 },
    snapshots: { type: "array", maxItems: 2000, items: snapshotSchema },
  }),
);
const validatePack = ajv.compile<{ id: string; lines: TariffLine[] }>(
  object({
    id,
    lines: { type: "array", minItems: 1, maxItems: 200000, items: lineSchema },
  }),
);
const validateSource = ajv.compile<TariffSnapshotSource>(
  object(sourceProperties, requiredSourceFields),
);

function checkSource(
  source: TariffSnapshotSource,
  countries: ReadonlySet<string>,
): void {
  if (
    source.availableFrom > source.availableThrough ||
    source.availableThrough > source.checkedOn
  )
    throw new Error(`INVALID_TARIFF_DATES: ${source.id}`);
  if (source.countries.some((country) => !countries.has(country)))
    throw new Error(`INVALID_TARIFF_COUNTRIES: ${source.id}`);
  for (const uri of [
    source.sourceUrl,
    source.termsUrl,
    ...source.inputFiles.map((f) => f.url),
  ]) {
    const parsed = new URL(uri);
    if (parsed.username || parsed.password)
      throw new Error("INVALID_TARIFF_SOURCE_URL");
  }
}

export function tariffStatistics(
  lines: readonly TariffLine[],
): TariffStatistics {
  const codes = new Set<string>();
  const codesWithRates = new Set<string>();
  const chapters = new Set<string>();
  const charges = new Set<TariffRate["charge"]>();
  let rates = 0;
  for (const row of lines) {
    codes.add(row.code);
    chapters.add(row.code.slice(0, 2));
    if (row.rates.length) codesWithRates.add(row.code);
    rates += row.rates.length;
    for (const rate of row.rates) charges.add(rate.charge);
  }
  return {
    lines: lines.length,
    uniqueCodes: codes.size,
    codesWithRates: codesWithRates.size,
    rates,
    chapters: [...chapters].sort(),
    charges: [...charges].sort(),
  };
}

/** Used by the local importer before writing a new snapshot directory. */
export function validateTariffImport(
  source: unknown,
  lines: unknown,
  dataset: Dataset,
) {
  if (!validateSource(source))
    throw new Error(
      "INVALID_TARIFF_SOURCE: " + ajv.errorsText(validateSource.errors),
    );
  const pack = { id: source.id, lines };
  if (!validatePack(pack))
    throw new Error(
      "INVALID_TARIFF_LINES: " + ajv.errorsText(validatePack.errors),
    );
  const countries = new Set(
    [...dataset.countries, ...dataset.supplementalRegions]
      .filter((c) => c.inScope)
      .map((c) => c.code),
  );
  checkSource(source, countries);
  checkLines(source, pack.lines);
  return { source, lines: pack.lines };
}

function checkLines(source: TariffSnapshotSource, lines: TariffLine[]): void {
  for (const row of lines) {
    if (
      (row.matchPrefix && source.role !== "measures") ||
      (row.code.length < 6 && !row.matchPrefix)
    )
      throw new Error(`INVALID_TARIFF_PREFIX: ${source.id}`);
    if (source.scope === "hs6_aggregate" && row.code.length !== 6)
      throw new Error(`INVALID_AGGREGATE_CODE: ${source.id}`);
    if (
      source.role === "measures" &&
      (!row.rates.length ||
        row.rates.some((rate) => rate.charge === "customs_duty"))
    )
      throw new Error(`INVALID_TARIFF_MEASURE: ${source.id}`);
    for (const rate of row.rates) {
      if (rate.from && rate.through && rate.from > rate.through)
        throw new Error(`INVALID_TARIFF_RATE_DATES: ${source.id}`);
    }
    if (row.url) {
      const parsed = new URL(row.url);
      if (parsed.username || parsed.password)
        throw new Error("INVALID_TARIFF_LINE_URL");
    }
  }
}

interface IndexedPack {
  exact: Map<string, TariffLine[]>;
  byHs6: Map<string, TariffLine[]>;
}
interface RegisteredSnapshot {
  metadata: TariffSnapshot;
  directory: URL;
}

export class TariffCatalog {
  #snapshots: RegisteredSnapshot[];
  #countries: Map<string, { code: string; nameJa: string; inScope: boolean }>;
  #cache = new Map<string, IndexedPack>();
  #dataset: Dataset;
  #wco: ReturnType<typeof loadWcoRegistry>;
  #territories: ReturnType<typeof loadTerritoryRegistry>;
  #wcoMemberIds: Set<string>;

  constructor(
    dataset: Dataset,
    directories: URL[] = [bundledDirectory],
    approval?: Pick<SignedTariffReview, "manifestSha256" | "reviewedOn">,
  ) {
    this.#dataset = dataset;
    this.#countries = new Map(
      [...dataset.countries, ...dataset.supplementalRegions].map((country) => [
        country.code,
        country,
      ]),
    );
    const inScope = new Set(
      [...this.#countries.values()].filter((c) => c.inScope).map((c) => c.code),
    );
    this.#wco = loadWcoRegistry();
    this.#territories = loadTerritoryRegistry();
    this.#wcoMemberIds = new Set(this.#wco.roster.members.map(({ memberId }) => memberId));
    const seen = new Set<string>();
    this.#snapshots = [];
    if (approval && approval.manifestSha256.length !== directories.length)
      throw new Error("UPDATE_REVIEW_MANIFEST_MISMATCH");
    for (const [index, directory] of directories.entries()) {
      const manifest = readFileSync(new URL("manifest.json", directory));
      if (approval && createHash("sha256").update(manifest).digest("hex") !== approval.manifestSha256[index])
        throw new Error("UPDATE_REVIEW_MANIFEST_MISMATCH");
      const document: unknown = JSON.parse(manifest.toString("utf8"));
      if (!validateManifest(document))
        throw new Error(
          "INVALID_TARIFF_MANIFEST: " + ajv.errorsText(validateManifest.errors),
        );
      for (const metadata of document.snapshots) {
        checkSource(metadata, inScope);
        if (approval && index > 0 && metadata.checkedOn > approval.reviewedOn)
          throw new Error(`UPDATE_REVIEW_PRECEDES_OBSERVATION: ${metadata.id}`);
        if (seen.has(metadata.id) || metadata.file !== `${metadata.id}.json.gz`)
          throw new Error(`INVALID_TARIFF_PACK_ID: ${metadata.id}`);
        seen.add(metadata.id);
        this.#snapshots.push({ metadata, directory });
      }
    }
    const specificity = {
      national_schedule: 0,
      published_baseline: 1,
      compiled_reference: 2,
      hs6_aggregate: 3,
    };
    this.#snapshots.sort(
      (a, b) =>
        specificity[a.metadata.scope] - specificity[b.metadata.scope] ||
        b.metadata.availableFrom.localeCompare(a.metadata.availableFrom) ||
        b.metadata.checkedOn.localeCompare(a.metadata.checkedOn) ||
        a.metadata.id.localeCompare(b.metadata.id),
    );
  }

  #read(snapshot: RegisteredSnapshot): IndexedPack {
    const { metadata, directory } = snapshot;
    const cached = this.#cache.get(metadata.id);
    if (cached) {
      this.#cache.delete(metadata.id);
      this.#cache.set(metadata.id, cached);
      return cached;
    }
    const uri = new URL(metadata.file, directory);
    if (statSync(uri).size > 64 * 1024 * 1024)
      throw new Error("TARIFF_PACK_TOO_LARGE");
    const bytes = readFileSync(uri);
    if (createHash("sha256").update(bytes).digest("hex") !== metadata.sha256)
      throw new Error(`TARIFF_PACK_INTEGRITY: ${metadata.id}`);
    const document: unknown = JSON.parse(
      gunzipSync(bytes, { maxOutputLength: 192 * 1024 * 1024 }).toString(
        "utf8",
      ),
    );
    if (!validatePack(document) || document.id !== metadata.id)
      throw new Error(
        `INVALID_TARIFF_PACK: ${metadata.id} ${ajv.errorsText(validatePack.errors)}`,
      );
    checkLines(metadata, document.lines);
    const actual = tariffStatistics(document.lines);
    for (const key of [
      "lines",
      "uniqueCodes",
      "codesWithRates",
      "rates",
    ] as const) {
      if (actual[key] !== metadata.statistics[key])
        throw new Error(`TARIFF_COUNTS_MISMATCH: ${metadata.id}`);
    }
    if (actual.chapters.join(",") !== metadata.statistics.chapters.join(","))
      throw new Error(`TARIFF_CHAPTERS_MISMATCH: ${metadata.id}`);
    if (
      metadata.statistics.charges &&
      actual.charges?.join(",") !== metadata.statistics.charges.join(",")
    )
      throw new Error(`TARIFF_CHARGES_MISMATCH: ${metadata.id}`);
    const exact = new Map<string, TariffLine[]>();
    const byHs6 = new Map<string, TariffLine[]>();
    for (const row of document.lines) {
      const matches = exact.get(row.code) ?? [];
      matches.push(row);
      exact.set(row.code, matches);
      const hs6 = row.code.slice(0, 6);
      const subheading = byHs6.get(hs6) ?? [];
      subheading.push(row);
      byHs6.set(hs6, subheading);
    }
    const pack = { exact, byHs6 };
    if (this.#cache.size >= 4)
      this.#cache.delete(this.#cache.keys().next().value!);
    this.#cache.set(metadata.id, pack);
    return pack;
  }

  verify(): void {
    for (const snapshot of this.#snapshots) this.#read(snapshot);
  }

  coverage() {
    const snapshots = this.#snapshots
      .filter(({ metadata }) => !metadata.role)
      .map(({ metadata }) => metadata);
    const measureSnapshots = this.#snapshots
      .filter(({ metadata }) => metadata.role === "measures")
      .map(({ metadata }) => metadata);
    const countries = [...this.#countries.values()].map((country) => {
      const sources = snapshots.filter((snapshot) =>
        snapshot.countries.includes(country.code),
      );
      const measures = measureSnapshots.filter((snapshot) =>
        snapshot.countries.includes(country.code),
      );
      return {
        country: country.code,
        nameJa: country.nameJa,
        status: !country.inScope
          ? "out_of_scope"
          : sources.length
            ? "source_loaded"
            : "source_not_loaded",
        snapshotIds: sources.map((snapshot) => snapshot.id),
        measureSnapshotIds: measures.map((snapshot) => snapshot.id),
        measureCharges: [
          ...new Set(
            measures.flatMap((snapshot) => snapshot.statistics.charges ?? []),
          ),
        ].sort(),
      };
    });
    const jurisdictions = new Set(
      snapshots.map((snapshot) => snapshot.jurisdiction),
    );
    return {
      recognisedCountriesAndTerritories: countries.length,
      inScopeCountriesAndTerritories: countries.filter(
        (country) => country.status !== "out_of_scope",
      ).length,
      loadedCountriesAndTerritories: countries.filter(
        (country) => country.status === "source_loaded",
      ).length,
      loadedCustomsTerritories: jurisdictions.size,
      snapshotRows: snapshots.reduce(
        (total, snapshot) => total + snapshot.statistics.lines,
        0,
      ),
      snapshotRateEntries: snapshots.reduce(
        (total, snapshot) => total + snapshot.statistics.rates,
        0,
      ),
      measureCountriesAndTerritories: countries.filter(
        (country) => country.measureSnapshotIds.length,
      ).length,
      measureSnapshotRows: measureSnapshots.reduce(
        (total, snapshot) => total + snapshot.statistics.lines,
        0,
      ),
      measureRateEntries: measureSnapshots.reduce(
        (total, snapshot) => total + snapshot.statistics.rates,
        0,
      ),
      allWorldTaxRatesComplete: false,
      snapshots,
      measureSnapshots,
      countries,
    };
  }

  wcoCoverage(date = todayJst(new Date())): WcoCoverage {
    return wcoCoverage(this.#wco, this.#snapshots.map(({ metadata }) => metadata), date);
  }

  territoryCoverage(date = todayJst(new Date())): TerritoryCoverage {
    return territoryCoverage(
      this.#dataset,
      this.#wcoMemberIds,
      this.#territories,
      this.#snapshots.map(({ metadata }) => metadata),
      date,
    );
  }

  destinationCustomsProfile(
    destinationCountry: string,
    date: string,
    zone: TariffLookupRequest["zone"] = "standard",
    customsTerritory?: string,
  ): DestinationCustomsProfile | null {
    requireCoverageDate(date);
    if (!this.#countries.get(destinationCountry)?.inScope) return null;
    const isMember = this.#wcoMemberIds.has(destinationCountry);
    const officialSources = (isMember ? this.#wco.links.sources : this.#territories.nonMemberSources)
      [destinationCountry] ?? [];
    const generalDutyPolicy = this.#territories.generalDutyPolicies.find((policy) =>
      policy.destinationCountry === destinationCountry &&
      coversPolicyDate(policy, date) &&
      (policy.customsTerritory
        ? zone !== "unknown" && customsTerritory === policy.customsTerritory
        : zone === "standard" && (!customsTerritory || customsTerritory === destinationCountry)),
    ) ?? null;
    return {
      destinationCountry,
      referenceDate: date,
      membershipStatus: isMember ? "member" : "outside_wco_roster",
      officialSources,
      generalDutyPolicy,
    };
  }

  destinationSnapshots(
    destinationCountry: string,
    zone: TariffLookupRequest["zone"] = "standard",
    customsTerritory?: string,
  ): TariffSnapshot[] {
    if (zone === "unknown" || (zone === "special" && !customsTerritory)) return [];
    return this.#snapshots.map(({ metadata }) => metadata).filter((snapshot) =>
      snapshot.zone === zone && snapshot.countries.includes(destinationCountry) &&
      (!customsTerritory || snapshot.jurisdiction === customsTerritory),
    );
  }

  lookup(input: unknown): TariffLookupResult {
    const request = parseTariffLookup(input);
    const code = request.code.replace(/[. -]/g, "");
    if (!/^[0-9]{6,12}$/.test(code))
      throw new InputError([{ path: "/code", code: "INVALID_TARIFF_CODE" }]);
    for (const field of ["destinationCountry", "originCountry"] as const) {
      if (request[field] && !this.#countries.has(request[field]))
        throw new InputError([{ path: "/" + field, code: "UNKNOWN_COUNTRY" }]);
    }
    const zone = request.zone ?? "standard";
    const destinationSources = this.#snapshots.filter(
      ({ metadata }) =>
        metadata.countries.includes(request.destinationCountry) &&
        metadata.zone === zone,
    );
    const candidateSources = destinationSources.filter(
      ({ metadata }) =>
        !metadata.role &&
        (!request.customsTerritory ||
          metadata.jurisdiction === request.customsTerritory) &&
        (!request.snapshotId || metadata.id === request.snapshotId),
    );
    const resolved =
      zone !== "unknown" && (zone !== "special" || !!request.customsTerritory);
    const measureSources = destinationSources.filter(
      ({ metadata }) =>
        metadata.role === "measures" &&
        (!request.customsTerritory ||
          metadata.jurisdiction === request.customsTerritory ||
          (zone === "standard" &&
            destinationSources.some(
              ({ metadata: source }) =>
                !source.role &&
                source.jurisdiction === request.customsTerritory,
            ))),
    );
    const snapshot = candidateSources.find(({ metadata }) =>
      coversDate(metadata, request.date),
    );
    const fallbackSourceIds = new Set(
      this.#dataset.cards
        .filter((card) => card.countries.includes(request.destinationCountry))
        .flatMap((card) => card.sourceIds),
    );
    const profile = this.destinationCustomsProfile(
      request.destinationCountry, request.date ?? todayJst(new Date()), zone, request.customsTerritory,
    );
    const generalDutyPolicy = profile?.generalDutyPolicy ?? null;
    const officialSources = profile?.officialSources ?? [];
    const sourceLinks = [
      ...new Set([
        ...candidateSources.map(({ metadata }) => metadata.sourceUrl),
        ...measureSources.map(({ metadata }) => metadata.sourceUrl),
        ...(generalDutyPolicy?.sources ?? []).map((source) => source.url),
        ...officialSources.map((source) => source.url),
        ...this.#dataset.sources
          .filter((source) => fallbackSourceIds.has(source.id))
          .map((source) => source.url),
        "https://ttd.wto.org/en/download",
      ]),
    ].slice(0, 10);
    const result: TariffLookupResult = {
      status: "source_not_loaded",
      destinationCountry: request.destinationCountry,
      originCountry: request.originCountry ?? null,
      code,
      zone,
      referenceDate: request.date ?? null,
      totalMatches: 0,
      nextOffset: null,
      matches: [],
      snapshot: null,
      applicableRate: null,
      availableSnapshots: candidateSources.map(({ metadata }) => metadata.id),
      sourceLinks,
      generalDutyPolicy,
      measures: resolved
        ? this.#lookupMeasures(request, code, measureSources)
        : {
            status: "territory_unresolved",
            sources: [],
            matches: [],
            totalMatches: 0,
            nextOffset: null,
          },
    };
    if (!resolved) return { ...result, status: "territory_unresolved" };
    if (!snapshot) {
      if (candidateSources.length)
        return {
          ...result,
          status: "date_not_covered",
          snapshot: candidateSources[0]!.metadata,
        };
      return result;
    }
    result.snapshot = snapshot.metadata;
    const date = request.date ?? snapshot.metadata.availableThrough;
    result.referenceDate = date;
    const pack = this.#read(snapshot);
    const rows =
      (code.length === 6 ? pack.byHs6.get(code) : pack.exact.get(code)) ?? [];
    if (!rows.length) return { ...result, status: "code_not_found" };
    const offset = request.offset ?? 0;
    const limit = request.limit ?? 20;
    const candidates = rows.slice(offset, offset + limit);
    const isDatedRate = (rate: TariffRate) =>
      matchesRate(rate, date, request.originCountry);
    result.status = !rows.some((row) => row.rates.some(isDatedRate))
      ? "rate_not_reported"
      : snapshot.metadata.scope === "hs6_aggregate"
        ? "hs6_aggregate"
        : code.length === 6
          ? "national_line_candidates"
          : "schedule_reference";
    result.totalMatches = rows.length;
    result.nextOffset = offset + limit < rows.length ? offset + limit : null;
    result.matches = candidates.map((row) => formatMatch(row, isDatedRate));
    return result;
  }

  #lookupMeasures(
    request: TariffLookupRequest,
    code: string,
    sources: RegisteredSnapshot[],
  ): TariffMeasureLookup {
    const result: TariffMeasureLookup = {
      status: sources.length ? "date_not_covered" : "source_not_loaded",
      sources: [],
      matches: [],
      totalMatches: 0,
      nextOffset: null,
    };
    const offset = request.measureOffset ?? 0;
    const limit = request.measureLimit ?? 20;
    for (const source of sources) {
      const { metadata } = source;
      const date = coversDate(metadata, request.date)
        ? (request.date ?? metadata.availableThrough)
        : null;
      result.sources.push({ snapshot: metadata, referenceDate: date });
      if (!date) continue;
      if (result.status === "date_not_covered")
        result.status = "no_matching_measures";
      if (!metadata.statistics.chapters.includes(code.slice(0, 2))) continue;
      const pack = this.#read(source);
      const append = (
        row: TariffLine,
        matchedBy: TariffMeasureMatch["matchedBy"],
      ) => {
        const eligible = (rate: TariffRate) =>
          matchesRate(rate, date, request.originCountry);
        if (!row.rates.some(eligible)) return;
        const position = result.totalMatches++;
        if (position >= offset && result.matches.length < limit)
          result.matches.push({
            ...formatMatch(row, eligible),
            snapshotId: metadata.id,
            matchedBy,
          });
      };
      for (const row of pack.exact.get(code) ?? []) append(row, "exact");
      for (let length = code.length - 1; length >= 2; length--) {
        for (const row of pack.exact.get(code.slice(0, length)) ?? [])
          if (row.matchPrefix) append(row, "prefix");
      }
      for (const row of pack.byHs6.get(code.slice(0, 6)) ?? [])
        if (row.code.length > code.length && row.code.startsWith(code))
          append(row, "more_specific");
    }
    if (result.totalMatches) result.status = "measure_references";
    if (offset + limit < result.totalMatches)
      result.nextOffset = offset + limit;
    return result;
  }
}

function coversDate(snapshot: TariffSnapshot, date?: string): boolean {
  return (
    !date ||
    (snapshot.availableFrom <= date && date <= snapshot.availableThrough)
  );
}

function matchesRate(rate: TariffRate, date: string, origin?: string): boolean {
  return (
    (!rate.from || rate.from <= date) &&
    (!rate.through || rate.through >= date) &&
    (!origin ||
      ((!rate.originCountries || rate.originCountries.includes(origin)) &&
        !rate.excludedOriginCountries?.includes(origin)))
  );
}

function formatMatch(
  row: TariffLine,
  eligible: (rate: TariffRate) => boolean,
): TariffMatch {
  return {
    ...row,
    rates: row.rates.filter(eligible).map((rate) => ({
      ...rate,
      adValoremPercent: percent(rate.expression),
    })),
  };
}

function percent(expression: string): string | null {
  if (/^(free|無税|免税)$/i.test(expression)) return "0";
  const match = /^([0-9]+(?:[.,][0-9]+)?)\s*%$/.exec(expression);
  return match?.[1]?.replace(",", ".") ?? null;
}

function tariffDirectories(additionalDirectory?: string | string[]): URL[] {
  const directories = [bundledDirectory];
  const paths =
    typeof additionalDirectory === "string"
      ? additionalDirectory.split(delimiter)
      : (additionalDirectory ?? []);
  for (const path of paths)
    if (path) directories.push(pathToFileURL(resolve(path) + "/"));
  return directories;
}

/** Add a manifest directory kept outside a public distribution when the data licence requires it. */
export function loadTariffCatalog(
  dataset: Dataset,
  additionalDirectory?: string | string[],
): TariffCatalog {
  return new TariffCatalog(dataset, tariffDirectories(additionalDirectory));
}

/** Load the deployment tariff stack using its independently pinned reviewer keys. */
export function loadOperationalTariffCatalog(
  dataset: Dataset,
  env: Readonly<NodeJS.ProcessEnv> = process.env,
  now = new Date(),
): TariffCatalog {
  const directories = tariffDirectories(env.VEYGRIT_TARIFF_DIR);
  if (directories.length === 1) return new TariffCatalog(dataset, directories);
  if (!env.VEYGRIT_TARIFF_APPROVAL) throw new Error("UPDATE_REVIEW_REQUIRED");
  if (!env.VEYGRIT_TARIFF_TRUSTED_KEYS) throw new Error("UPDATE_TRUSTED_REVIEW_KEYS_REQUIRED");
  const today = todayJst(now);
  const approval = authenticateTariffReview(
    JSON.parse(readFileSync(env.VEYGRIT_TARIFF_APPROVAL, "utf8")),
    JSON.parse(readFileSync(env.VEYGRIT_TARIFF_TRUSTED_KEYS, "utf8")),
    today,
  );
  if (approval.referenceDate > today) throw new Error("UPDATE_DATE_NOT_OBSERVED");
  return new TariffCatalog(dataset, directories, approval);
}
