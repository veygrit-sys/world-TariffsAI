import { Ajv } from "ajv";
import addFormatsModule from "ajv-formats";
import { coverageLedger, type LedgerDestination } from "./coverage-ledger.ts";
import { tradeBlocCheckSchema, tradeBlocChecks, type TradeBlocCheck } from "./trade-blocs.ts";
import { reviewTransitRoute, transitCountryQuerySchema, transitReviewSchema, type TransitReview } from "./transit-route.ts";
import { specialProcedureReferences, specialProcedureReferenceSchema, type SpecialProcedureReference } from "./special-procedures.ts";
import { reviewSpecialTerritories, specialTerritoryReviewSchema, type SpecialTerritoryReview } from "./special-territories.ts";
import { importControlReferences, importControlReferenceSchema, type ImportControlReference } from "./import-controls.ts";
import { customsFeeReferences, customsFeeReferenceSchema, type CustomsFeeReference } from "./customs-fees.ts";
import { todayJst } from "./dataset.ts";
import { EU_COUNTRIES, requiresCustomsTerritoryReview } from "./engine.ts";
import { rolloutMarket } from "./rollout-market.ts";
import { regionalCustomsProfile, regionalCustomsProfileSchema, type RegionalCustomsProfile } from "./regional-customs.ts";
import { customsTerritorySelectorSchema, InputError } from "./schema.ts";
import type { TariffCatalog } from "./tariffs.ts";
import { assessTradePolicy, northKoreaBlockReason, PILOT_ROUTES, type TradePolicyDecision } from "./trade-policy.ts";
import type { Country, Dataset, Shipment, SupplementalRegion } from "./types.ts";
import { describeTariffCoverage, type OfficialCustomsSource } from "./wco.ts";

export interface WorldDirectionInput {
  originCountry: string;
  destinationCountry: string;
  date?: string;
  loadingCountry?: string;
  transitCountries?: string;
  originZone?: Shipment["originZone"];
  destinationZone?: Shipment["destinationZone"];
  originCustomsTerritory?: string;
  customsTerritory?: string;
}

interface DirectionLocation {
  country: string;
  name: string;
  nameJa: string;
  inScope: boolean;
  officialSources: OfficialCustomsSource[];
}

type StandardTerritoryRoute = "domestic" | "eu_intra_union" | "cross_border" | "out_of_scope";
type RolloutMarket = NonNullable<ReturnType<typeof rolloutMarket>>;

export interface WorldDirectionResponse {
  referenceDate: string;
  direction: string;
  standardTerritoryRoute: StandardTerritoryRoute;
  territoryReviewRequired: boolean;
  origin: DirectionLocation;
  destination: DirectionLocation;
  destinationRollout: RolloutMarket | null;
  destinationProcedures: RegionalCustomsProfile | null;
  destinationFeeReferences: CustomsFeeReference[];
  destinationImportControls: ImportControlReference[];
  specialTerritories: SpecialTerritoryReview | null;
  destinationSpecialProcedures: SpecialProcedureReference[];
  tradeBlocs: TradeBlocCheck[];
  transitReview: TransitReview | null;
  destinationTariffStatus: LedgerDestination["standardTariffStatus"] | null;
  tradePolicy: TradePolicyDecision | null;
  productionAuthorized: false;
}

interface DirectionCounts {
  registryDestinations: number;
  distinctDirections: number;
  candidateDestinations: number;
  candidateDirections: number;
  withStandardTariffReferenceOnDate: number;
  withVerifiedImportProcedures: number;
  withRegionalOfficialReferences: number;
  withFeeReferencesOnDate: number;
  withImportControlsOnDate: number;
}

export interface WorldDirectionCoverage {
  referenceDate: string;
  checkedOn: string;
  ruleSetVersion: string;
  totals: DirectionCounts & {
    commercialExcludedDestinations: number;
    commercialExcludedDirections: number;
    standardTerritoryIntraUnionDirections: number;
    pilotDirections: number;
    productionVerifiedDirections: 0;
  };
  passes: (DirectionCounts & RolloutMarket)[];
  productionAuthorized: false;
}

const object = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});
const nullable = (schema: object) => ({ anyOf: [schema, { type: "null" }] });
const array = (items: object) => ({ type: "array", items });
const string = { type: "string" };
const country = { type: "string", pattern: "^[A-Z]{2}$" };
const date = { type: "string", format: "date" };
const uri = { type: "string", format: "uri" };
const count = { type: "integer", minimum: 0 };

const zone = { enum: ["standard", "special", "unknown"] };
export const worldDirectionInputSchema = object(
  { originCountry: country, destinationCountry: country, date, originZone: zone, destinationZone: zone,
    loadingCountry: country, transitCountries: transitCountryQuerySchema,
    originCustomsTerritory: customsTerritorySelectorSchema, customsTerritory: customsTerritorySelectorSchema },
  ["originCountry", "destinationCountry"],
);

const officialSource = object({
  url: uri, authority: string, title: string, kind: string, scope: string,
  sourceUrl: uri, checkedOn: date,
}, ["url", "authority", "title", "kind", "scope"]);
const location = object({ country, name: string, nameJa: string, inScope: { type: "boolean" }, officialSources: array(officialSource) });
const rollout = { pass: { type: "integer", enum: [2, 3, 4, 5, 6] }, group: string };
const policyEvidence = object({
  sourceId: string, jurisdiction: { enum: ["JP", "US"] }, authority: string, url: uri,
  effectiveFrom: date, effectiveThrough: date,
}, ["sourceId", "jurisdiction", "authority", "url"]);
const tradePolicy = object({
  status: { enum: ["blocked", "review_required", "pilot", "eligible_for_review", "out_of_scope"] },
  pilotRoute: nullable({ enum: [...PILOT_ROUTES] }),
  reasonCode: string,
  evidence: array(policyEvidence),
  shippingAuthorized: { const: false },
});

export const worldDirectionOutputSchema = object({
  referenceDate: date,
  direction: { type: "string", pattern: "^[A-Z]{2}-[A-Z]{2}$" },
  standardTerritoryRoute: { enum: ["domestic", "eu_intra_union", "cross_border", "out_of_scope"] },
  territoryReviewRequired: { type: "boolean" },
  origin: location,
  destination: location,
  destinationRollout: nullable(object(rollout)),
  destinationProcedures: nullable(regionalCustomsProfileSchema),
  destinationFeeReferences: array(customsFeeReferenceSchema),
  destinationImportControls: array(importControlReferenceSchema),
  specialTerritories: nullable(specialTerritoryReviewSchema),
  destinationSpecialProcedures: array(specialProcedureReferenceSchema),
  tradeBlocs: array(tradeBlocCheckSchema),
  transitReview: nullable(transitReviewSchema),
  destinationTariffStatus: nullable({
    enum: ["tariff_reference_on_date", "tariff_reference_other_date", "official_sources_only", "registry_only"],
  }),
  tradePolicy: nullable(tradePolicy),
  productionAuthorized: { const: false },
});

const countFields = {
  registryDestinations: count,
  distinctDirections: count,
  candidateDestinations: count,
  candidateDirections: count,
  withStandardTariffReferenceOnDate: count,
  withVerifiedImportProcedures: count,
  withRegionalOfficialReferences: count,
  withFeeReferencesOnDate: count,
  withImportControlsOnDate: count,
};

export const worldDirectionCoverageOutputSchema = object({
  referenceDate: date,
  checkedOn: date,
  ruleSetVersion: string,
  totals: object({
    ...countFields,
    commercialExcludedDestinations: count,
    commercialExcludedDirections: count,
    standardTerritoryIntraUnionDirections: count,
    pilotDirections: count,
    productionVerifiedDirections: { const: 0 },
  }),
  passes: array(object({ ...countFields, ...rollout })),
  productionAuthorized: { const: false },
});

const ajv = new Ajv({ allErrors: true, strict: true });
const addFormats = addFormatsModule as unknown as (instance: Ajv) => void;
addFormats(ajv);
const validateDirection = ajv.compile<WorldDirectionInput>(worldDirectionInputSchema);

function findLocation(
  code: string,
  field: "originCountry" | "destinationCountry" | "transitCountries" | "loadingCountry",
  data: Dataset,
): Country | SupplementalRegion {
  const result = data.countries.find((entry) => entry.code === code) ??
    data.supplementalRegions.find((entry) => entry.code === code);
  if (!result) throw new InputError([{ path: "/" + field, code: "UNKNOWN_COUNTRY" }]);
  return result;
}

function standardTerritoryRoute(
  origin: Country | SupplementalRegion,
  destination: Country | SupplementalRegion,
): StandardTerritoryRoute {
  if (!origin.inScope || !destination.inScope) return "out_of_scope";
  if (origin.code === destination.code) return "domestic";
  if (EU_COUNTRIES.has(origin.code) && EU_COUNTRIES.has(destination.code)) return "eu_intra_union";
  return "cross_border";
}

function directionLocation(
  entry: Country | SupplementalRegion,
  officialSources: OfficialCustomsSource[],
): DirectionLocation {
  return {
    country: entry.code,
    name: entry.name,
    nameJa: entry.nameJa,
    inScope: entry.inScope,
    officialSources: officialSources.map((source) => ({ ...source })),
  };
}

const ledgerTariffStatuses: Readonly<Record<string, LedgerDestination["standardTariffStatus"]>> = {
  tariff_reference_on_date: "tariff_reference_on_date",
  tariff_reference_other_date: "tariff_reference_other_date",
  official_sources_only: "official_sources_only",
  membership_only: "registry_only",
};

/** A country-pair reference. Confirm actual customs territories and shipment facts separately. */
export function worldDirection(
  input: unknown,
  data: Dataset,
  catalog: TariffCatalog,
  now = new Date(),
): WorldDirectionResponse {
  if (!validateDirection(input)) {
    throw new InputError((validateDirection.errors ?? []).slice(0, 20)
      .map(({ instancePath, keyword }) => ({ path: instancePath, code: keyword })));
  }
  const { originCountry, destinationCountry, originZone, destinationZone, originCustomsTerritory, customsTerritory } = input;
  if (originCustomsTerritory && originZone !== undefined && originZone !== "special")
    throw new InputError([{ path: "/originCustomsTerritory", code: "SPECIAL_ORIGIN_REQUIRED" }]);
  if (customsTerritory && destinationZone !== undefined && destinationZone !== "special")
    throw new InputError([{ path: "/customsTerritory", code: "SPECIAL_DESTINATION_REQUIRED" }]);
  const referenceDate = input.date ?? todayJst(now);
  const origin = findLocation(originCountry, "originCountry", data);
  const destination = findLocation(destinationCountry, "destinationCountry", data);
  const transitCountries = input.transitCountries?.split(",") ?? [];
  const transitLocations = transitCountries.map((code) => findLocation(code, "transitCountries", data));
  const loadingLocation = input.loadingCountry ? findLocation(input.loadingCountry, "loadingCountry", data) : null;
  const route = transitLocations.some(({ inScope }) => !inScope) || loadingLocation?.inScope === false
    ? "out_of_scope" : standardTerritoryRoute(origin, destination);
  const transitReview = route === "out_of_scope" ? null : reviewTransitRoute(transitCountries.length ? {
    completeness: "partial",
    stops: transitCountries.map((country) => ({ country, handling: "unknown", customsStatus: "unknown" })),
  } : undefined, originCountry, input.loadingCountry);
  const specialTerritories = route === "out_of_scope" ? null : reviewSpecialTerritories(data, input, referenceDate);
  const locationReview = requiresCustomsTerritoryReview(originCountry, destinationCountry) || specialTerritories?.requiresRouteReview === true;
  const tradeBlocs = route === "out_of_scope" ? [] :
    tradeBlocChecks(data, originCountry, destinationCountry, referenceDate, locationReview || transitReview?.requiresReview === true);
  const territoryReviewRequired = route !== "out_of_scope" &&
    (locationReview || tradeBlocs.some(({ requiresRouteReview }) => requiresRouteReview) || transitReview?.requiresReview === true);
  const originSources = catalog.destinationCustomsProfile(originCountry, referenceDate)?.officialSources ?? [];
  const destinationSources = catalog.destinationCustomsProfile(destinationCountry, referenceDate)?.officialSources ?? [];
  const tariffStatus = destination.inScope && !customsTerritory && (destinationZone === undefined || destinationZone === "standard")
    ? describeTariffCoverage(
      catalog.destinationSnapshots(destinationCountry), destinationCountry, referenceDate, destinationSources,
    ).status
    : null;
  const tradeInput = {
    dispatchCountry: originCountry,
    destinationCountry,
    productOriginCountries: [], transitCountries,
    ...(input.loadingCountry ? { loadingCountry: input.loadingCountry } : {}),
  };
  const blocked = northKoreaBlockReason(tradeInput);
  return {
    referenceDate,
    direction: originCountry + "-" + destinationCountry,
    standardTerritoryRoute: route,
    territoryReviewRequired,
    specialTerritories: blocked ? null : specialTerritories,
    tradeBlocs: blocked ? [] : tradeBlocs, transitReview: blocked ? null : transitReview,
    destinationSpecialProcedures: !blocked && route === "cross_border" && !locationReview
      ? specialProcedureReferences(data, destinationCountry, referenceDate).filter(({ appliesWhen }) =>
        !appliesWhen.origins || appliesWhen.origins.includes(originCountry)) : [],
    origin: directionLocation(origin, originSources),
    destination: directionLocation(destination, destinationSources),
    destinationRollout: destination.inScope ? rolloutMarket(destinationCountry) : null,
    destinationProcedures: regionalCustomsProfile(data, destinationCountry),
    destinationFeeReferences: route === "cross_border" && !territoryReviewRequired && !northKoreaBlockReason(tradeInput)
      ? customsFeeReferences(data, destinationCountry, referenceDate) : [],
    destinationImportControls: (route !== "domestic" || territoryReviewRequired) && route !== "out_of_scope" && !blocked
      ? importControlReferences(data, destinationCountry, referenceDate) : [],
    destinationTariffStatus: tariffStatus === null ? null : ledgerTariffStatuses[tariffStatus] ?? "registry_only",
    tradePolicy: route === "out_of_scope" && !northKoreaBlockReason(tradeInput)
      ? null : assessTradePolicy(tradeInput, "worldwide"),
    productionAuthorized: false,
  };
}

function distinctPairs(destinations: number, originCountries: number): number {
  return destinations * Math.max(0, originCountries - 1);
}

/** Counts country-code directions. Trade decisions depend on the shipment and its actual route. */
export function worldDirectionCoverage(
  data: Dataset,
  catalog: TariffCatalog,
  referenceDate?: string,
  now = new Date(),
): WorldDirectionCoverage {
  const ledger = coverageLedger(data, catalog, referenceDate ?? todayJst(now), now);
  const candidates = new Set(ledger.destinations
    .map(({ destinationCountry }) => destinationCountry)
    .filter((country) => !northKoreaBlockReason({
      dispatchCountry: country, destinationCountry: country, productOriginCountries: [],
    })));
  const registryDestinations = ledger.destinations.length;
  const candidateDestinations = candidates.size;
  const distinctDirections = distinctPairs(registryDestinations, registryDestinations);
  const candidateDirections = distinctPairs(candidateDestinations, candidateDestinations);
  const intraUnionDestinations = [...candidates].filter((country) => EU_COUNTRIES.has(country)).length;
  const passes = new Map<RolloutMarket["pass"], DirectionCounts & RolloutMarket>();
  for (const destination of ledger.destinations) {
    const market = rolloutMarket(destination.destinationCountry);
    if (!market) throw new Error("MISSING_ROLLOUT_MARKET: " + destination.destinationCountry);
    const row = passes.get(market.pass) ?? {
      ...market,
      registryDestinations: 0,
      distinctDirections: 0,
      candidateDestinations: 0,
      candidateDirections: 0,
      withStandardTariffReferenceOnDate: 0,
      withVerifiedImportProcedures: 0,
      withRegionalOfficialReferences: 0,
      withFeeReferencesOnDate: 0,
      withImportControlsOnDate: 0,
    };
    row.registryDestinations++;
    if (candidates.has(destination.destinationCountry)) row.candidateDestinations++;
    if (destination.standardTariffStatus === "tariff_reference_on_date") row.withStandardTariffReferenceOnDate++;
    if (candidates.has(destination.destinationCountry)) {
      if (customsFeeReferences(data, destination.destinationCountry, ledger.referenceDate).length)
        row.withFeeReferencesOnDate++;
      if (importControlReferences(data, destination.destinationCountry, ledger.referenceDate).length)
        row.withImportControlsOnDate++;
      const status = data.regionalCustoms?.[destination.destinationCountry]?.status;
      if (status === "official_procedure") row.withVerifiedImportProcedures++;
      if (status === "official_procedure" || status === "official_reference") row.withRegionalOfficialReferences++;
    }
    passes.set(market.pass, row);
  }
  return {
    referenceDate: ledger.referenceDate,
    checkedOn: ledger.checkedOn,
    ruleSetVersion: ledger.ruleSetVersion,
    totals: {
      registryDestinations,
      distinctDirections,
      candidateDestinations,
      candidateDirections,
      commercialExcludedDestinations: registryDestinations - candidateDestinations,
      commercialExcludedDirections: distinctDirections - candidateDirections,
      standardTerritoryIntraUnionDirections: distinctPairs(intraUnionDestinations, intraUnionDestinations),
      pilotDirections: PILOT_ROUTES.filter((route) =>
        route.split("-").every((country) => candidates.has(country))).length,
      productionVerifiedDirections: 0,
      withStandardTariffReferenceOnDate: ledger.totals.withStandardTariffReferenceOnDate,
      withVerifiedImportProcedures: [...passes.values()].reduce((total, row) => total + row.withVerifiedImportProcedures, 0),
      withRegionalOfficialReferences: [...passes.values()].reduce((total, row) => total + row.withRegionalOfficialReferences, 0),
      withFeeReferencesOnDate: [...passes.values()].reduce((total, row) => total + row.withFeeReferencesOnDate, 0),
      withImportControlsOnDate: [...passes.values()].reduce((total, row) => total + row.withImportControlsOnDate, 0),
    },
    passes: [...passes.values()].sort((left, right) => left.pass - right.pass).map((row) => ({
      ...row,
      distinctDirections: distinctPairs(row.registryDestinations, registryDestinations),
      candidateDirections: distinctPairs(row.candidateDestinations, candidateDestinations),
    })),
    productionAuthorized: false,
  };
}
