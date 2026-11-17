import { readFileSync, statSync } from "node:fs";
import { Ajv } from "ajv";
import addFormatsModule from "ajv-formats";
import { loadDataset } from "./dataset.ts";
import { requestDigest } from "./engine.ts";
import { InputError } from "./schema.ts";
import type { Dataset } from "./types.ts";
import {
  classificationAttributeKeySchema, classificationDateSchema, classificationIdSchema,
  classificationObject, type ClassificationCatalogDocument, type ClassificationRule,
  type ClassificationSource,
} from "./classification-types.ts";

const text = (maxLength: number) => ({ type: "string", minLength: 1, maxLength });
const direction = { enum: ["import", "export", "both"] };
const country = { type: "string", pattern: "^(\\*|[A-Z]{2})$" };
const strings = (items: object, maxItems: number, minItems = 0) => ({
  type: "array", items, minItems, maxItems, uniqueItems: true,
});
const source = classificationObject({
  id: classificationIdSchema, title: text(1000), url: { ...text(2000), format: "uri" },
  kind: { enum: ["classification_ruling", "tariff_schedule", "hs_nomenclature"] },
  countries: strings(country, 250, 1), direction, hsEdition: text(40),
  checkedOn: classificationDateSchema, reviewBy: classificationDateSchema,
  effectiveFrom: classificationDateSchema, effectiveThrough: classificationDateSchema,
  terms: text(2000),
});
const attributeKeys = strings(classificationAttributeKeySchema, 50);
export const classificationSourceSchema = source;
const rule = classificationObject({
  id: classificationIdSchema, title: text(1000), country, direction, hsEdition: text(40),
  hs6: { type: "string", pattern: "^[0-9]{6}$" },
  nationalCode: { type: "string", pattern: "^[0-9]{7,12}$" }, tariffEdition: text(100),
  keywords: strings(text(200), 100, 1), requiredAttributes: attributeKeys,
  attributeConditions: { type: "object", maxProperties: 50,
    propertyNames: classificationAttributeKeySchema, additionalProperties: strings(text(500), 30, 1) },
  questions: { type: "object", maxProperties: 50,
    propertyNames: classificationAttributeKeySchema, additionalProperties: text(1000) },
  sourceIds: strings(classificationIdSchema, 20, 1), rationale: text(1000),
}, ["id", "title", "country", "direction", "hsEdition", "hs6", "keywords", "requiredAttributes",
  "attributeConditions", "questions", "sourceIds", "rationale"]);

export const classificationCatalogSchema = classificationObject({
  version: classificationIdSchema,
  sources: { type: "array", minItems: 0, maxItems: 1000, items: source },
  rules: { type: "array", minItems: 0, maxItems: 5000, items: rule },
});
const ajv = new Ajv({ allErrors: true, strict: true });
(addFormatsModule as unknown as (instance: Ajv) => void)(ajv);
const validate = ajv.compile<ClassificationCatalogDocument>(classificationCatalogSchema);

function fail(path: string, code: string): never {
  throw new InputError([{ path, code }]);
}

function validateSources(sources: readonly ClassificationSource[], data: Dataset): void {
  const countries = new Set([...data.countries, ...data.supplementalRegions].map(({ code }) => code));
  const ids = new Set<string>();
  for (const [index, item] of sources.entries()) {
    const path = "/sources/" + index;
    if (ids.has(item.id)) fail(path + "/id", "DUPLICATE_CLASSIFICATION_SOURCE");
    ids.add(item.id);
    if (item.countries.some((code) => code !== "*" && !countries.has(code)))
      fail(path + "/countries", "UNKNOWN_COUNTRY");
    if (!/^https?:\/\//i.test(item.url)) fail(path + "/url", "CLASSIFICATION_SOURCE_URL_INVALID");
    if (item.checkedOn > item.reviewBy || item.effectiveFrom > item.effectiveThrough)
      fail(path, "CLASSIFICATION_SOURCE_DATE_RANGE_INVALID");
    if (!item.hsEdition.trim()) fail(path + "/hsEdition", "CLASSIFICATION_EDITION_REQUIRED");
  }
}

function validateRules(document: ClassificationCatalogDocument, data: Dataset): void {
  const countries = new Set([...data.countries, ...data.supplementalRegions].map(({ code }) => code));
  const sources = new Set(document.sources.map(({ id }) => id));
  const ids = new Set<string>();
  for (const [index, item] of document.rules.entries()) {
    const path = "/rules/" + index;
    if (ids.has(item.id)) fail(path + "/id", "DUPLICATE_CLASSIFICATION_RULE");
    ids.add(item.id);
    if (item.country !== "*" && !countries.has(item.country)) fail(path + "/country", "UNKNOWN_COUNTRY");
    if (item.sourceIds.some((id) => !sources.has(id))) fail(path + "/sourceIds", "UNKNOWN_CLASSIFICATION_SOURCE");
    if (Object.keys(item.attributeConditions).some((key) => !item.requiredAttributes.includes(key)) ||
        Object.keys(item.questions).some((key) => !item.requiredAttributes.includes(key)))
      fail(path, "CLASSIFICATION_ATTRIBUTE_SCOPE_INVALID");
    if (item.keywords.some((word) => !word.trim()) || !item.hsEdition.trim())
      fail(path, "CLASSIFICATION_SEARCH_TERM_INVALID");
    if (item.nationalCode && (item.country === "*" || item.direction === "both" ||
        !item.tariffEdition?.trim() || !item.nationalCode.startsWith(item.hs6)))
      fail(path, "CLASSIFICATION_NATIONAL_SCOPE_INVALID");
    if (!item.nationalCode && item.tariffEdition) fail(path, "CLASSIFICATION_NATIONAL_CODE_REQUIRED");
    for (const alternatives of Object.values(item.attributeConditions))
      if (alternatives.some((value) => !value.trim())) fail(path, "CLASSIFICATION_ATTRIBUTE_VALUE_INVALID");
  }
}

function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) freeze(item);
    Object.freeze(value);
  }
  return value;
}

/** Validated operator-managed classification references. Rules never constitute an approval. */
export class ClassificationCatalog {
  readonly version: string;
  readonly digest: string;
  readonly sources: readonly ClassificationSource[];
  readonly rules: readonly ClassificationRule[];
  readonly #sources: ReadonlyMap<string, ClassificationSource>;

  constructor(input: unknown, data: Dataset = loadDataset()) {
    if (!validate(input)) throw new InputError((validate.errors ?? []).slice(0, 20)
      .map(({ instancePath, keyword }) => ({ path: instancePath, code: keyword })));
    validateSources(input.sources, data);
    validateRules(input, data);
    const document = freeze(structuredClone(input));
    this.version = document.version;
    this.digest = requestDigest(document);
    this.sources = document.sources;
    this.rules = document.rules;
    this.#sources = new Map(this.sources.map((item) => [item.id, item]));
    Object.freeze(this);
  }

  source(id: string): ClassificationSource | undefined {
    return this.#sources.get(id);
  }
}

/** Catalog changes require review and invalidate approvals bound to its canonical digest. */
export function loadClassificationCatalog(
  env: Readonly<NodeJS.ProcessEnv> = process.env, data: Dataset = loadDataset(),
): ClassificationCatalog {
  const configured = env.VEYGRIT_CLASSIFICATION_CATALOG?.trim();
  const path = configured || new URL("../data/classification-catalog.json", import.meta.url);
  if (statSync(path).size > 8 * 1024 * 1024) throw new Error("CLASSIFICATION_CATALOG_TOO_LARGE");
  return new ClassificationCatalog(JSON.parse(readFileSync(path, "utf8")), data);
}
