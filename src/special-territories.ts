import { Ajv } from "ajv";
import addFormatsModule from "ajv-formats";
import type { Dataset, Shipment } from "./types.ts";

const categories = ["fiscal_boundary", "separate_customs_area", "special_goods_regime", "shared_customs_area"] as const;
const sides = ["origin", "destination"] as const;
type TerritoryCategory = (typeof categories)[number];
type EndpointSide = (typeof sides)[number];
type Zone = Shipment["originZone"];
type TerritorySource = { authority: string; title: string; url: string };

export interface SpecialTerritoryReference {
  id: string;
  nameJa: string;
  category: TerritoryCategory;
  registryCountry: string | null;
  selectors: { country: string; selectors: string[] }[];
  customsAreaJa: string;
  fiscalAreaJa: string;
  reviewWhen: "any_crossing" | "linked_crossing";
  reviewCounterpartCountries: string[];
  inboundJa: string;
  outboundJa: string;
  routeGuidance: { side: EndpointSide; counterpartCountries: string[]; guidanceJa: string }[];
  referenceFrom: string;
  referenceThrough: string;
  sources: TerritorySource[];
}

export interface SpecialTerritoryRoute {
  originCountry: string;
  destinationCountry: string;
  originZone?: Zone;
  destinationZone?: Zone;
  originCustomsTerritory?: string;
  customsTerritory?: string;
}

interface EndpointResolution {
  country: string;
  selector: string | null;
  status: "standard" | "identified" | "unresolved";
  territoryId: string | null;
}

interface TerritoryNotice {
  side: EndpointSide;
  territoryId: string;
  nameJa: string;
  category: TerritoryCategory;
  customsAreaJa: string;
  fiscalAreaJa: string;
  guidanceJa: string;
  referenceFrom: string;
  referenceThrough: string;
  sources: TerritorySource[];
}

export interface SpecialTerritoryReview {
  requiresRouteReview: boolean;
  origin: EndpointResolution;
  destination: EndpointResolution;
  notices: TerritoryNotice[];
}

const text = { type: "string", minLength: 1 };
const countryCode = { type: "string", pattern: "^[A-Z]{2}$" };
export const specialTerritorySelectorSchema = { type: "string", pattern: "^[A-Z][A-Z0-9_-]{1,23}$" };
const id = { type: "string", pattern: "^[a-z][a-z0-9_]{2,79}$" };
const date = { type: "string", format: "date" };
const category = { enum: [...categories] };
const side = { enum: [...sides] };
const nullable = (schema: object) => ({ anyOf: [schema, { type: "null" }] });
const object = (properties: Record<string, unknown>) => ({
  type: "object", properties, required: Object.keys(properties), additionalProperties: false,
});
const array = (items: object, minItems = 0) => ({ type: "array", minItems, uniqueItems: true, items });
const source = object({
  authority: text, title: text,
  url: { type: "string", format: "uri", pattern: "^https://" },
});
const datedNotice = {
  nameJa: text, category, customsAreaJa: text, fiscalAreaJa: text, referenceFrom: date,
  referenceThrough: date, sources: array(source, 1),
};
export const specialTerritoryReferenceSchema = object({
  id, ...datedNotice, registryCountry: nullable(countryCode),
  selectors: array(object({ country: countryCode, selectors: array(specialTerritorySelectorSchema, 1) })),
  reviewWhen: { enum: ["any_crossing", "linked_crossing"] },
  reviewCounterpartCountries: array(countryCode),
  inboundJa: text, outboundJa: text,
  routeGuidance: array(object({ side, counterpartCountries: array(countryCode, 1), guidanceJa: text })),
});
const resolutionSchema = object({
  country: countryCode, selector: nullable(specialTerritorySelectorSchema),
  status: { enum: ["standard", "identified", "unresolved"] }, territoryId: nullable(id),
});
export const specialTerritoryReviewSchema = object({
  requiresRouteReview: { type: "boolean" },
  origin: resolutionSchema,
  destination: resolutionSchema,
  notices: array(object({ side, territoryId: id, ...datedNotice, guidanceJa: text })),
});

const ajv = new Ajv({ strict: true });
(addFormatsModule as unknown as (instance: Ajv) => void)(ajv);
const validate = ajv.compile<SpecialTerritoryReference[]>(array(specialTerritoryReferenceSchema));

export function loadSpecialTerritoryReferences(data: Dataset, document: unknown): SpecialTerritoryReference[] {
  if (!validate(document))
    throw new Error("INVALID_SPECIAL_TERRITORY_REFERENCES: " + ajv.errorsText(validate.errors));
  const known = new Set([...data.countries, ...data.supplementalRegions]
    .filter(({ inScope }) => inScope).map(({ code }) => code));
  const ids = new Set<string>();
  const endpoints = new Set<string>();
  for (const reference of document) {
    const { id, registryCountry, selectors, reviewCounterpartCountries, routeGuidance, sources } = reference;
    const matchKeys = selectors.flatMap(({ country, selectors }) =>
      selectors.map((selector) => country + ":" + selector));
    if (registryCountry) matchKeys.push(registryCountry, registryCountry + ":" + registryCountry);
    const countries = [
      ...(registryCountry ? [registryCountry] : []), ...selectors.map(({ country }) => country),
      ...reviewCounterpartCountries, ...routeGuidance.flatMap(({ counterpartCountries }) => counterpartCountries),
    ];
    const guidanceKeys = routeGuidance.flatMap(({ side, counterpartCountries }) =>
      counterpartCountries.map((country) => side + ":" + country));
    if (ids.has(id) || !matchKeys.length || matchKeys.some((key) => endpoints.has(key)) ||
        matchKeys.length !== new Set(matchKeys).size || guidanceKeys.length !== new Set(guidanceKeys).size ||
        countries.some((country) => !known.has(country)) || reference.referenceFrom > reference.referenceThrough ||
        (reference.reviewWhen === "linked_crossing") !== (reviewCounterpartCountries.length > 0) ||
        sources.some(({ url }) => {
          const address = new URL(url);
          return address.username || address.password;
        }))
      throw new Error("INVALID_SPECIAL_TERRITORY_REFERENCE: " + id);
    ids.add(id);
    for (const key of matchKeys) endpoints.add(key);
  }
  return document;
}

interface Endpoint {
  resolution: EndpointResolution;
  reference?: SpecialTerritoryReference;
}

function resolve(
  references: readonly SpecialTerritoryReference[], country: string,
  zone: Zone | undefined, selector: string | undefined,
): Endpoint {
  const resolution: EndpointResolution = { country, selector: selector ?? null, status: "unresolved", territoryId: null };
  if (zone === "unknown") return { resolution };
  const reference = references.find((profile) =>
    (profile.registryCountry === country && (!selector || selector === country)) ||
    (!!selector && profile.selectors.some((entry) => entry.country === country && entry.selectors.includes(selector))));
  if (reference)
    return { resolution: { ...resolution, status: "identified", territoryId: reference.id }, reference };
  if (!selector && zone !== "special") return { resolution: { ...resolution, status: "standard" } };
  return { resolution };
}

function counterpartCountry(endpoint: Endpoint): string | null {
  if (endpoint.resolution.status === "unresolved") return null;
  return endpoint.reference ? endpoint.reference.registryCountry : endpoint.resolution.country;
}

export function reviewSpecialTerritories(
  data: Pick<Dataset, "specialTerritoryReferences">, route: SpecialTerritoryRoute, referenceDate: string,
): SpecialTerritoryReview {
  const references = data.specialTerritoryReferences ?? [];
  const origin = resolve(references, route.originCountry, route.originZone, route.originCustomsTerritory);
  const destination = resolve(references, route.destinationCountry, route.destinationZone, route.customsTerritory);
  let requiresRouteReview = [origin, destination].some(({ resolution }) => resolution.status === "unresolved" || !!resolution.selector) ||
    route.originZone === "special" || route.destinationZone === "special";
  const notices: TerritoryNotice[] = [];
  const sameEndpoint = origin.reference || destination.reference
    ? origin.reference?.id === destination.reference?.id : route.originCountry === route.destinationCountry;
  const movements = [["origin", origin, destination], ["destination", destination, origin]] as const;
  if (!sameEndpoint) for (const [side, endpoint, other] of movements) {
    const reference = endpoint.reference;
    if (!reference) continue;
    const partner = counterpartCountry(other);
    if (reference.reviewWhen === "any_crossing" ||
        (partner && reference.reviewCounterpartCountries.includes(partner)))
      requiresRouteReview = true;
    if (referenceDate < reference.referenceFrom || referenceDate > reference.referenceThrough) continue;
    const routeGuidance = reference.routeGuidance.find((entry) =>
      entry.side === side && partner && entry.counterpartCountries.includes(partner));
    notices.push({
      side, territoryId: reference.id, nameJa: reference.nameJa, category: reference.category,
      customsAreaJa: reference.customsAreaJa, fiscalAreaJa: reference.fiscalAreaJa,
      guidanceJa: routeGuidance?.guidanceJa ?? (side === "origin" ? reference.outboundJa : reference.inboundJa),
      referenceFrom: reference.referenceFrom, referenceThrough: reference.referenceThrough,
      sources: structuredClone(reference.sources),
    });
  }
  return { requiresRouteReview, origin: origin.resolution, destination: destination.resolution, notices };
}
