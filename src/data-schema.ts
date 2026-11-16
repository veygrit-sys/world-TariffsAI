import { Ajv } from "ajv";
import addFormatsModule from "ajv-formats";
import { importControlReferenceSchema } from "./import-controls.ts";
import { customsFeeReferenceSchema } from "./customs-fees.ts";
import { regionalCustomsProfileSchema } from "./regional-customs.ts";
import type { Dataset } from "./types.ts";
const text = { type: "string", minLength: 1 };
const date = { type: "string", format: "date" };
const ids = { type: "array", minItems: 1, uniqueItems: true, items: text };
const amount = {
  type: "string",
  pattern: "^(0|[1-9]\\d{0,11})(\\.\\d{1,4})?$",
};
const nullableDate = { anyOf: [date, { type: "null" }] };
const obj = (properties: Record<string, unknown>, required: string[]) => ({
  type: "object",
  additionalProperties: false,
  properties,
  required,
});
const source = obj(
  {
    id: text,
    title: text,
    url: { type: "string", format: "uri", pattern: "^https://" },
    verification: { enum: ["primary_rechecked", "inherited_research"] },
    checkedOn: date,
    reviewBy: date,
  },
  ["id", "title", "url", "verification", "checkedOn", "reviewBy"],
);
const card = obj(
  {
    id: text,
    countries: {
      type: "array",
      uniqueItems: true,
      items: { type: "string", pattern: "^[A-Z]{2}$" },
    },
    topics: { type: "array", minItems: 1, uniqueItems: true, items: text },
    title: text,
    text: obj({ ja: text, en: text, zh: text }, ["ja", "en", "zh"]),
    sourceIds: ids,
    verification: { enum: ["primary_rechecked", "inherited_research"] },
    validFrom: nullableDate,
    validTo: nullableDate,
  },
  [
    "id",
    "countries",
    "topics",
    "title",
    "text",
    "sourceIds",
    "verification",
    "validFrom",
    "validTo",
  ],
);
const rule = obj(
  {
    id: text,
    currency: { type: "string", pattern: "^[A-Z]{3}$" },
    threshold: amount,
    vatBps: { type: "integer", minimum: 0, maximum: 10000 },
    flatDuty: amount,
    validFrom: date,
    validTo: nullableDate,
    checkedOn: date,
    reviewBy: date,
    sourceIds: ids,
  },
  [
    "id",
    "currency",
    "threshold",
    "validFrom",
    "validTo",
    "checkedOn",
    "reviewBy",
    "sourceIds",
  ],
);
const country = obj(
  {
    code: { type: "string", pattern: "^[A-Z]{2}$" },
    alpha3: { type: "string", pattern: "^[A-Z]{3}$" },
    name: text,
    nameJa: text,
    inScope: { type: "boolean" },
    researchProfile: { anyOf: [text, { type: "null" }] },
  },
  ["code", "alpha3", "name", "nameJa", "inScope", "researchProfile"],
);
const supplemental = obj(
  {
    code: { type: "string", pattern: "^[A-Z]{2}$" },
    name: text,
    nameJa: text,
    inScope: { type: "boolean" },
    codeScheme: { const: "user_assigned" },
    note: text,
  },
  ["code", "name", "nameJa", "inScope", "codeScheme", "note"],
);
export const datasetSchema = {
  ...obj(
    {
      version: text,
      countries: {
        type: "array",
        minItems: 249,
        maxItems: 249,
        items: country,
      },
      sources: { type: "array", items: source },
      supplementalRegions: { type: "array", items: supplemental },
      cards: { type: "array", items: card },
      rules: { type: "array", items: rule },
      regionalCustoms: { type: "object", propertyNames: { pattern: "^[A-Z]{2}$" }, additionalProperties: regionalCustomsProfileSchema },
      customsFeeReferences: { type: "array", items: customsFeeReferenceSchema },
      importControlReferences: { type: "array", items: importControlReferenceSchema },
    },
    [
      "version",
      "countries",
      "supplementalRegions",
      "sources",
      "cards",
      "rules",
    ],
  ),
};
const ajv = new Ajv({ strict: true, allErrors: true });
(addFormatsModule as unknown as (a: Ajv) => void)(ajv);
const validate = ajv.compile<Dataset>(datasetSchema);
export function validateDataset(data: unknown): asserts data is Dataset {
  if (!validate(data)) throw new Error("INVALID_DATASET_SCHEMA");
  const d = data;
  for (const values of [
    d.sources.map((s) => s.id),
    d.cards.map((c) => c.id),
    d.rules.map((r) => r.id),
    [...d.countries, ...d.supplementalRegions].map((c) => c.code),
  ])
    if (new Set(values).size !== values.length)
      throw new Error("DUPLICATE_DATASET_ID");
  for (const s of d.sources)
    if (s.reviewBy < s.checkedOn) throw new Error("SOURCE_REVIEW_DATE_INVALID");
  for (const r of d.rules)
    if (r.reviewBy < r.checkedOn || (r.validTo && r.validTo <= r.validFrom))
      throw new Error("RULE_DATE_INVALID");
  for (const c of d.cards)
    if (
      c.countries.some(
        (code) =>
          ![...d.countries, ...d.supplementalRegions].some(
            (x) => x.code === code,
          ),
      )
    )
      throw new Error("CARD_COUNTRY_INVALID");
}
