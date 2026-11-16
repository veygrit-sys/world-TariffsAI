import assert from "node:assert/strict";
import test from "node:test";
import { Ajv } from "ajv";
import addFormatsModule from "ajv-formats";
import { createHandler } from "../src/http.ts";
import { InputError } from "../src/schema.ts";
import { loadTariffCatalog } from "../src/tariffs.ts";
import {
  worldDirection,
  worldDirectionCoverage,
  worldDirectionCoverageOutputSchema,
  worldDirectionOutputSchema,
} from "../src/world-directions.ts";
import { data } from "./helpers.ts";

const catalog = loadTariffCatalog(data);
const date = "2026-11-11";
const now = new Date("2026-11-11T02:00:00Z");
const lookup = (originCountry: string, destinationCountry: string, referenceDate = date) =>
  worldDirection({ originCountry, destinationCountry, date: referenceDate }, data, catalog, now);

test("world coverage partitions all nominal directions by destination rollout pass", () => {
  const coverage = worldDirectionCoverage(data, catalog, date, now);
  assert.deepEqual(coverage.totals, {
    registryDestinations: 249,
    distinctDirections: 61_752,
    candidateDestinations: 248,
    candidateDirections: 61_256,
    commercialExcludedDestinations: 1,
    commercialExcludedDirections: 496,
    standardTerritoryIntraUnionDirections: 702,
    pilotDirections: 6,
    productionVerifiedDirections: 0,
    withStandardTariffReferenceOnDate: 86,
    withVerifiedImportProcedures: Object.values(data.regionalCustoms ?? {}).filter(({ status }) => status === "official_procedure").length,
    withRegionalOfficialReferences: Object.values(data.regionalCustoms ?? {}).filter(({ status }) => status === "official_procedure" || status === "official_reference").length,
    withFeeReferencesOnDate: new Set(data.customsFeeReferences
      ?.filter((fee) => fee.referenceFrom <= date && date <= fee.referenceThrough)
      .flatMap(({ countries }) => countries)).size,
    withImportControlsOnDate: new Set(data.importControlReferences
      ?.filter((rule) => rule.referenceFrom <= date && date <= rule.referenceThrough)
      .flatMap(({ countries }) => countries)).size,
  });
  assert.deepEqual(coverage.passes.map(({ pass }) => pass), [2, 3, 4, 5, 6]);
  for (const key of [
    "registryDestinations", "distinctDirections", "candidateDestinations",
    "candidateDirections", "withStandardTariffReferenceOnDate",
    "withVerifiedImportProcedures", "withRegionalOfficialReferences", "withFeeReferencesOnDate", "withImportControlsOnDate",
  ] as const) {
    assert.equal(coverage.passes.reduce((sum, pass) => sum + pass[key], 0), coverage.totals[key], key);
  }
  assert.equal(coverage.productionAuthorized, false);
});

test("every registered territory retains official destination information and a rollout pass", () => {
  const registry = [...data.countries, ...data.supplementalRegions].filter(({ inScope }) => inScope);
  assert.equal(registry.length, 249);
  for (const territory of registry) {
    const result = lookup(territory.code === "JP" ? "US" : "JP", territory.code);
    assert.equal(result.destination.country, territory.code);
    assert.ok(result.destination.officialSources.length > 0, territory.code);
    assert.ok(result.destinationRollout, territory.code);
    assert.equal(result.productionAuthorized, false, territory.code);
    assert.equal(result.tradePolicy?.shippingAuthorized, false, territory.code);
  }
});

test("the direction preserves source date, origin, destination and route-specific policy", () => {
  const japan = lookup("DE", "JP");
  assert.equal(japan.direction, "DE-JP");
  assert.equal(japan.standardTerritoryRoute, "cross_border");
  assert.equal(japan.destinationRollout?.pass, 2);
  assert.equal(japan.tradePolicy?.reasonCode, "JP_LOADING_COUNTRY_REQUIRED");
  assert.equal(japan.destinationTariffStatus, "tariff_reference_on_date");
  assert.ok(japan.origin.officialSources.length && japan.destination.officialSources.length);

  const germany = lookup("JP", "DE");
  assert.equal(germany.direction, "JP-DE");
  assert.equal(germany.destinationRollout?.pass, 3);
  assert.equal(germany.tradePolicy?.status, "eligible_for_review");
  assert.equal(lookup("JP", "DE", "2999-11-11").destinationTariffStatus, "tariff_reference_other_date");
  assert.equal(lookup("JP", "US").tradePolicy?.status, "pilot");
  assert.equal(lookup("JP", "KP").destinationTariffStatus, "official_sources_only");
});

test("KP commercial exclusions retain directory information and AQ stays out of scope", () => {
  const inbound = lookup("US", "KP");
  const outbound = lookup("KP", "US");
  for (const result of [inbound, outbound, lookup("KP", "AQ")]) {
    assert.equal(result.tradePolicy?.status, "blocked");
    assert.equal(result.tradePolicy.reasonCode, "KP_COMMERCIAL_EXCLUDED");
    assert.equal(result.tradePolicy.shippingAuthorized, false);
  }
  assert.ok(inbound.destination.officialSources.length);
  assert.ok(outbound.origin.officialSources.length);
  const antarctica = lookup("JP", "AQ");
  assert.equal(antarctica.standardTerritoryRoute, "out_of_scope");
  assert.equal(antarctica.destination.inScope, false);
  assert.equal(antarctica.destinationRollout, null);
  assert.equal(antarctica.tradePolicy, null);
  assert.equal(antarctica.destinationTariffStatus, null);
});

test("same-country and intra-EU directions are labelled for standard territories", () => {
  assert.equal(lookup("JP", "JP").standardTerritoryRoute, "domestic");
  assert.equal(lookup("FR", "DE").standardTerritoryRoute, "eu_intra_union");
  assert.equal(lookup("FR", "GB").standardTerritoryRoute, "cross_border");
  assert.equal(lookup("XK", "TW").standardTerritoryRoute, "cross_border");
  assert.equal(lookup("TW", "XK").destinationRollout?.pass, 3);
});

test("invalid dates, unknown codes and extra inputs cannot create directions", () => {
  for (const input of [
    { originCountry: "JP", destinationCountry: "ZZ" },
    { originCountry: "jp", destinationCountry: "US" },
    { originCountry: "JP", destinationCountry: "US", date: "2026-02-30" },
    { originCountry: "JP", destinationCountry: "US", date: "2026-11-11T00:00:00Z" },
    { originCountry: "JP", destinationCountry: "US", loadingCountry: "ZZ" },
    { originCountry: "JP", destinationCountry: "US", transitCountries: "SG," },
    { originCountry: "JP", destinationCountry: "US", portCode: "JPTYO" },
  ]) {
    assert.throws(() => worldDirection(input, data, catalog, now), InputError);
  }
  assert.throws(() => worldDirectionCoverage(data, catalog, "2026-02-30", now), InputError);
  assert.equal(worldDirection({ originCountry: "JP", destinationCountry: "US" }, data, catalog, now).referenceDate, date);
});

test("the directory and coverage conform to their exported response schemas", () => {
  const ajv = new Ajv({ strict: true, allErrors: true });
  (addFormatsModule as unknown as (instance: Ajv) => void)(ajv);
  const directionSchema = ajv.compile(worldDirectionOutputSchema);
  for (const direction of [lookup("US", "KP"), lookup("JP", "US"), lookup("JP", "AQ"), lookup("FR", "DE")]) {
    assert.ok(directionSchema(direction), JSON.stringify(directionSchema.errors));
  }
  const coverageSchema = ajv.compile(worldDirectionCoverageOutputSchema);
  assert.ok(coverageSchema(worldDirectionCoverage(data, catalog, date, now)), JSON.stringify(coverageSchema.errors));
});

test("authenticated direction and coverage APIs preserve reverse, excluded and domestic lookups", async () => {
  const apiKey = "synthetic-world-directory-key-1234567890";
  const handler = createHandler({ dataset: data, tariffs: catalog, apiKey, now: () => now });
  const peer = { peer: "127.0.0.1" };
  const query = (from: string, to: string) =>
    "/v1/worldwide/direction?originCountry=" + from + "&destinationCountry=" + to;
  const get = (path: string, authenticate = true) => handler(new Request("http://localhost" + path, {
    headers: authenticate ? { authorization: "Bearer " + apiKey } : {},
  }), peer);

  assert.equal((await get(query("JP", "DE"), false)).status, 401);
  assert.equal((await get(query("JP", "DE") + "&originCountry=US")).status, 400);
  assert.equal((await get("/v1/worldwide/coverage?country=JP")).status, 400);
  for (const [from, to] of [["JP", "DE"], ["DE", "JP"], ["KP", "DE"], ["JP", "AQ"], ["JP", "JP"]] as const) {
    const response = await get(query(from, to));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), lookup(from, to));
  }
  const coverage = await get("/v1/worldwide/coverage?date=" + date);
  assert.equal(coverage.status, 200);
  assert.deepEqual(await coverage.json(), worldDirectionCoverage(data, catalog, date, now));
});
