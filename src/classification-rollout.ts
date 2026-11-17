import { Ajv } from "ajv";
import addFormatsModule from "ajv-formats";
import { todayJst } from "./dataset.ts";
import { classificationScopeMatches, classificationSourceIssue } from "./classification.ts";
import type { ClassificationCatalog } from "./classification-catalog.ts";
import { classificationDateSchema, classificationObject } from "./classification-types.ts";
import { InputError } from "./schema.ts";
import { rolloutMarket } from "./rollout-market.ts";
import { listOfficialTariffReferences } from "./tariff-source-directory.ts";
import type { Dataset } from "./types.ts";

export const classificationRolloutStatuses = [
  "candidate_references", "source_review_required", "official_evidence_pending", "excluded",
] as const;
const markets = ["asia", "europe", "americas", "western_asia_africa", "oceania_remote"] as const;
type Status = typeof classificationRolloutStatuses[number];
export interface ClassificationRolloutInput {
  date?: string;
  direction?: "import" | "export";
  hsEdition?: string;
  country?: string;
  market?: typeof markets[number];
  status?: Status;
  offset?: number;
  limit?: number;
}
const count = { type: "integer", minimum: 0 };
const text = { type: "string" };
const strings = { type: "array", items: text, uniqueItems: true };
const countrySchema = { type: "string", pattern: "^[A-Z]{2}$" };
export const classificationRolloutInputSchema = classificationObject({
  date: classificationDateSchema, direction: { enum: ["import", "export"] },
  hsEdition: { type: "string", minLength: 1, maxLength: 40, pattern: "\\S" }, country: countrySchema,
  market: { enum: markets }, status: { enum: classificationRolloutStatuses },
  offset: { type: "integer", minimum: 0, maximum: 999999 },
  limit: { type: "integer", minimum: 1, maximum: 250 },
}, []);
const totals = classificationObject({
  destinations: count, eligibleDestinations: count,
  byStatus: classificationObject(Object.fromEntries(classificationRolloutStatuses.map(status => [status, count]))),
});
export const classificationRolloutOutputSchema = classificationObject({
  catalogVersion: text, catalogDigest: text, referenceDate: classificationDateSchema, reviewedOn: classificationDateSchema,
  direction: { enum: ["import", "export"] }, hsEdition: text,
  totals, total: count, nextOffset: { type: ["integer", "null"], minimum: 0 },
  destinations: { type: "array", maxItems: 250, items: classificationObject({
    country: countrySchema, name: text, nameJa: text,
    market: { enum: [...markets, null] }, status: { enum: classificationRolloutStatuses },
    referenceRuleCount: count, activeRuleCount: count, hs6Count: count, nationalCodeReferenceCount: count,
    sourceIds: strings, holdReasons: strings,
    productCoverage: { enum: ["selected_examples", "none"] },
    nextAction: { enum: ["expand_product_examples_and_review_national_codes", "recheck_scoped_sources",
      "verify_official_edition_and_product_conditions", "excluded_from_commercial_classification"] },
    discoveryReferences: { type: "array", maxItems: 5, items: classificationObject({ title: text, url: { ...text, format: "uri" } }) },
  }) },
  discoveryReferencesVerifyClassification: { const: false }, allProductsCovered: { const: false },
  assignmentRequiresRecordedReview: { const: true }, shippingAuthorized: { const: false }, productionAuthorized: { const: false },
});
const ajv = new Ajv({ allErrors: true, strict: true });
(addFormatsModule as unknown as (instance: Ajv) => void)(ajv);
const validate = ajv.compile<ClassificationRolloutInput>(classificationRolloutInputSchema);

/** A resumable directory of missing classification evidence, never a claim of complete product coverage. */
export function classificationRollout(input: unknown, catalog: ClassificationCatalog, data: Dataset, now = new Date()) {
  if (!validate(input)) throw new InputError((validate.errors ?? []).slice(0, 20)
    .map(({ instancePath, keyword }) => ({ path: instancePath, code: keyword })));
  const registry = [...data.countries, ...data.supplementalRegions].sort((a, b) => a.code.localeCompare(b.code));
  if (input.country && !registry.some(({ code }) => code === input.country))
    throw new InputError([{ path: "/country", code: "UNKNOWN_COUNTRY" }]);
  const reviewedOn = todayJst(now), referenceDate = input.date ?? reviewedOn;
  const direction = input.direction ?? "import", hsEdition = input.hsEdition?.normalize("NFKC").trim().replace(/\s+/gu, " ") ?? "HS2022";
  const byStatus = { candidate_references: 0, source_review_required: 0, official_evidence_pending: 0, excluded: 0 };
  const destinations = registry.map(country => {
    const excluded = !country.inScope || country.code === "KP" || country.code === "AQ";
    const rules = excluded ? [] : catalog.rules.filter(rule => classificationScopeMatches(
      rule.country, rule.direction, rule.hsEdition, { country: country.code, direction, date: referenceDate, hsEdition },
    ));
    const holdReasons = new Set<string>();
    const active = rules.filter(rule => {
      const issues = rule.sourceIds.map(id => classificationSourceIssue(catalog.source(id)!, {
        country: country.code, direction, date: referenceDate, hsEdition,
      }, reviewedOn)).filter((issue): issue is string => issue !== null);
      issues.forEach(issue => holdReasons.add(issue));
      return issues.length === 0;
    });
    const status: Status = excluded ? "excluded" : active.length ? "candidate_references"
      : rules.length ? "source_review_required" : "official_evidence_pending";
    byStatus[status]++;
    return {
      country: country.code, name: country.name, nameJa: country.nameJa, market: rolloutMarket(country.code)?.group ?? null, status,
      referenceRuleCount: rules.length, activeRuleCount: active.length, hs6Count: new Set(active.map(rule => rule.hs6)).size,
      nationalCodeReferenceCount: active.filter(rule => rule.nationalCode !== undefined).length,
      sourceIds: [...new Set(active.flatMap(rule => rule.sourceIds))].sort(), holdReasons: [...holdReasons].sort(),
      productCoverage: active.length ? "selected_examples" as const : "none" as const,
      nextAction: excluded ? "excluded_from_commercial_classification" as const
        : active.length ? "expand_product_examples_and_review_national_codes" as const
        : rules.length ? "recheck_scoped_sources" as const : "verify_official_edition_and_product_conditions" as const,
      discoveryReferences: excluded ? [] : listOfficialTariffReferences(country.code).slice(0, 5)
        .map(({ title, url }) => ({ title, url })),
    };
  });
  const filtered = destinations.filter(row => (!input.country || row.country === input.country) &&
    (!input.market || row.market === input.market) && (!input.status || row.status === input.status));
  const offset = input.offset ?? 0, limit = input.limit ?? 50;
  const page = filtered.slice(offset, offset + limit);
  return {
    catalogVersion: catalog.version, catalogDigest: catalog.digest, referenceDate, reviewedOn, direction, hsEdition,
    totals: { destinations: registry.length, eligibleDestinations: registry.length - byStatus.excluded, byStatus },
    total: filtered.length, nextOffset: offset + page.length < filtered.length ? offset + page.length : null, destinations: page,
    discoveryReferencesVerifyClassification: false as const, allProductsCovered: false as const,
    assignmentRequiresRecordedReview: true as const, shippingAuthorized: false as const, productionAuthorized: false as const,
  };
}
export type ClassificationRollout = ReturnType<typeof classificationRollout>;
