import { Ajv } from "ajv";
import addFormatsModule from "ajv-formats";
import { minor } from "./money.ts";
import type { Dataset, Shipment } from "./types.ts";

type FeeTerms =
  | { kind: "flat"; amount: string }
  | { kind: "ad_valorem"; ratePercent: string; minimum?: string; maximum?: string }
  | { kind: "authority_review" };

/** Published terms to verify against the actual filing, separate from a shipment charge. */
export interface CustomsFeeReference {
  id: string;
  countries: string[];
  labelJa: string;
  category: "customs_authority" | "port_usage" | "postal_operator";
  currency: string;
  basisJa: string;
  terms: FeeTerms;
  referenceFrom: string;
  referenceThrough: string;
  transports: Shipment["transport"][] | null;
  conditionsJa: string[];
  sources: { authority: string; title: string; url: string }[];
}

const object = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({
  type: "object", properties, required, additionalProperties: false,
});
const string = { type: "string", minLength: 1 };
const decimal = { type: "string", pattern: "^\\d{1,12}(?:\\.\\d{1,6})?$" };
const date = { type: "string", format: "date" };
const list = (items: object) => ({ type: "array", minItems: 1, uniqueItems: true, items });
export const customsFeeReferenceSchema = object({
  id: { type: "string", pattern: "^[a-z][a-z0-9_]{2,63}$" },
  countries: list({ type: "string", pattern: "^[A-Z]{2}$" }),
  labelJa: string,
  category: { enum: ["customs_authority", "port_usage", "postal_operator"] },
  currency: { type: "string", pattern: "^[A-Z]{3}$" },
  basisJa: string,
  terms: { oneOf: [
    object({ kind: { const: "flat" }, amount: decimal }),
    object({ kind: { const: "ad_valorem" }, ratePercent: decimal, minimum: decimal, maximum: decimal },
      ["kind", "ratePercent"]),
    object({ kind: { const: "authority_review" } }),
  ] },
  referenceFrom: date,
  referenceThrough: date,
  transports: { anyOf: [
    list({ enum: ["air", "post", "sea", "land", "courier_unspecified"] }),
    { type: "null" },
  ] },
  conditionsJa: list(string),
  sources: list(object({ authority: string, title: string, url: { type: "string", format: "uri", pattern: "^https://" } })),
});

const ajv = new Ajv({ strict: true });
(addFormatsModule as unknown as (instance: Ajv) => void)(ajv);
const validate = ajv.compile<CustomsFeeReference[]>({ type: "array", items: customsFeeReferenceSchema });

export function loadCustomsFeeReferences(data: Dataset, document: unknown): CustomsFeeReference[] {
  if (!validate(document)) throw new Error("INVALID_CUSTOMS_FEE_REFERENCES");
  const registry = new Set([...data.countries, ...data.supplementalRegions]
    .filter(({ inScope }) => inScope).map(({ code }) => code));
  const ids = new Set<string>();
  for (const fee of document) {
    if (ids.has(fee.id) || fee.referenceFrom > fee.referenceThrough ||
        fee.countries.some((country) => !registry.has(country)) ||
        fee.sources.some(({ url }) => {
          const address = new URL(url);
          return address.username || address.password;
        }))
      throw new Error("INVALID_CUSTOMS_FEE_REFERENCE: " + fee.id);
    const { terms, currency } = fee;
    minor("0", currency);
    if (terms.kind === "flat") minor(terms.amount, currency);
    if (terms.kind === "ad_valorem") {
      const minimum = terms.minimum === undefined ? null : minor(terms.minimum, currency);
      const maximum = terms.maximum === undefined ? null : minor(terms.maximum, currency);
      if (minimum !== null && maximum !== null && minimum > maximum)
        throw new Error("INVALID_CUSTOMS_FEE_LIMITS: " + fee.id);
    }
    ids.add(fee.id);
  }
  return document;
}

export function customsFeeReferences(
  data: Dataset,
  destinationCountry: string,
  referenceDate: string,
  transport?: Shipment["transport"],
): CustomsFeeReference[] {
  return (data.customsFeeReferences ?? []).filter((fee) =>
    fee.countries.includes(destinationCountry) &&
    fee.referenceFrom <= referenceDate && referenceDate <= fee.referenceThrough &&
    (!transport || !fee.transports || fee.transports.includes(transport)),
  ).map((fee) => structuredClone(fee));
}
