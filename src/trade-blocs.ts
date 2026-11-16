import { Ajv } from "ajv";
import addFormatsModule from "ajv-formats";
import type { Dataset } from "./types.ts";

export interface TradeBlocReference {
  id: string;
  titleJa: string;
  kind: "customs_union" | "free_trade_area" | "transition";
  countries: string[];
  pairs?: { originCountry: string; destinationCountry: string }[];
  mode: "eu_standard_route" | "hold_for_review" | "preference_review";
  conditionJa: string;
  referenceFrom: string;
  referenceThrough: string;
  sources: { authority: string; title: string; url: string }[];
}
export interface TradeBlocCheck {
  reference: TradeBlocReference;
  status: "intra_union_reference" | "territory_review" | "preference_review" | "reference_date_unverified";
  requiresRouteReview: boolean;
  eligibilityConfirmed: false;
}

const object = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({
  type: "object", properties, required, additionalProperties: false,
});
const array = (items: object, minItems = 1) => ({ type: "array", minItems, uniqueItems: true, items });
const country = { type: "string", pattern: "^[A-Z]{2}$" };
const text = { type: "string", minLength: 1 };
const date = { type: "string", format: "date" };
export const tradeBlocReferenceSchema = object({
  id: { type: "string", pattern: "^[a-z][a-z0-9_]{2,79}$" },
  titleJa: text,
  kind: { enum: ["customs_union", "free_trade_area", "transition"] },
  countries: array(country, 2),
  pairs: array(object({ originCountry: country, destinationCountry: country })),
  mode: { enum: ["eu_standard_route", "hold_for_review", "preference_review"] },
  conditionJa: text, referenceFrom: date, referenceThrough: date,
  sources: array(object({ authority: text, title: text, url: { type: "string", pattern: "^https://", format: "uri" } })),
}, ["id", "titleJa", "kind", "countries", "mode", "conditionJa", "referenceFrom", "referenceThrough", "sources"]);

export const tradeBlocCheckSchema = object({
  reference: tradeBlocReferenceSchema,
  status: { enum: ["intra_union_reference", "territory_review", "preference_review", "reference_date_unverified"] },
  requiresRouteReview: { type: "boolean" },
  eligibilityConfirmed: { const: false },
});

const ajv = new Ajv({ strict: true });
(addFormatsModule as unknown as (a: Ajv) => void)(ajv);
const validate = ajv.compile<TradeBlocReference[]>(array(tradeBlocReferenceSchema, 0));

export function loadTradeBlocs(data: Dataset, input: unknown): TradeBlocReference[] {
  if (!validate(input)) throw new Error("INVALID_TRADE_BLOC_DATA: " + ajv.errorsText(validate.errors));
  const countries = new Set([...data.countries, ...data.supplementalRegions]
    .filter(({ inScope, code }) => inScope && code !== "KP").map(({ code }) => code));
  const ids = new Set<string>();
  for (const entry of input) {
    if (ids.has(entry.id) || entry.referenceFrom > entry.referenceThrough ||
        entry.countries.some((code) => !countries.has(code)) ||
        entry.pairs?.some(({ originCountry, destinationCountry }) =>
          originCountry === destinationCountry || !entry.countries.includes(originCountry) ||
          !entry.countries.includes(destinationCountry)) ||
        (entry.mode === "eu_standard_route" && (entry.id !== "eu_customs_union" || entry.kind !== "customs_union" || entry.pairs)) ||
        (entry.kind === "free_trade_area" && entry.mode !== "preference_review") ||
        entry.sources.some(({ url }) => {
          const parsed = new URL(url);
          return parsed.username || parsed.password;
        })) throw new Error("INVALID_TRADE_BLOC: " + entry.id);
    ids.add(entry.id);
  }
  return input;
}

function matches(entry: TradeBlocReference, origin: string, destination: string): boolean {
  return origin !== destination && (entry.pairs
    ? entry.pairs.some(({ originCountry, destinationCountry }) => originCountry === origin && destinationCountry === destination)
    : entry.countries.includes(origin) && entry.countries.includes(destination));
}

export function requiresTradeBlocReview(data: Pick<Dataset, "tradeBlocs">, origin: string, destination: string): boolean {
  return (data.tradeBlocs ?? []).some((entry) => entry.mode === "hold_for_review" && matches(entry, origin, destination));
}

export function tradeBlocChecks(
  data: Pick<Dataset, "tradeBlocs">, origin: string, destination: string, date: string, euRouteRequiresReview = false,
): TradeBlocCheck[] {
  return (data.tradeBlocs ?? []).filter((entry) => matches(entry, origin, destination)).map((entry) => {
    const requiresRouteReview = entry.mode === "hold_for_review" ||
      (entry.mode === "eu_standard_route" && euRouteRequiresReview);
    const status = date < entry.referenceFrom || date > entry.referenceThrough ? "reference_date_unverified"
      : requiresRouteReview ? "territory_review"
      : entry.mode === "eu_standard_route" ? "intra_union_reference" : "preference_review";
    return { reference: structuredClone(entry), status, requiresRouteReview, eligibilityConfirmed: false };
  });
}
