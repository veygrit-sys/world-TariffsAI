import assert from "node:assert/strict";
import test from "node:test";
import { Ajv } from "ajv";
import addFormatsModule from "ajv-formats";
import { createHandler } from "../src/http.ts";
import { importSettlementCoverage } from "../src/import-settlement-coverage.ts";
import { importSettlementDestinations, importSettlementDestinationsOutputSchema } from "../src/import-settlement-destinations.ts";
import type { ImportSettlementDestinations } from "../src/import-settlement-destinations.ts";
import { loadTariffCatalog } from "../src/tariffs.ts";
import { data } from "./helpers.ts";

const catalog = loadTariffCatalog(data);
const date = "2026-11-14";
const now = new Date("2026-11-13T15:05:00Z");

test("settlement destination lists keep both directions aligned with pair screening", () => {
  const outbound = importSettlementDestinations({ originCountry: "JP" }, data, catalog, now);
  const inbound = importSettlementDestinations({ destinationCountry: "JP" }, data, catalog, now);
  for (const [result, direction] of [[outbound, "outbound"], [inbound, "inbound"]] as const) {
    assert.equal(result.country, "JP");
    assert.equal(result.direction, direction);
    assert.equal(result.referenceDate, date);
    assert.equal(result.reviewedOn, date);
    assert.equal(result.ruleSetVersion, data.version);
    assert.deepEqual([result.checkoutReady, result.shippingAuthorized, result.productionAuthorized], [false, false, false]);
    const partners = result.routes.map(({ partnerCountry }) => partnerCountry);
    assert.equal(result.totals.directions, 247);
    assert.equal(partners.length, 247);
    assert.equal(new Set(partners).size, 247);
    assert.deepEqual(partners, [...partners].sort());
    assert.ok(partners.includes("XK"));
    assert.ok(["JP", "KP", "AQ"].every((code) => !partners.includes(code)));
    for (const [status, count] of Object.entries(result.totals.byStatus))
      assert.equal(count, result.routes.filter((route) => route.status === status).length, status);

    for (const partnerCountry of ["CN", "DE", "RU", "XK"]) {
      const query = direction === "outbound" ? { originCountry: "JP", destinationCountry: partnerCountry }
        : { originCountry: partnerCountry, destinationCountry: "JP" };
      const row = result.routes.find((entry) => entry.partnerCountry === partnerCountry)!;
      const pair = importSettlementCoverage({ ...query, date }, data, catalog, now);
      assert.deepEqual(row, { partnerCountry, ...Object.fromEntries(
        Object.entries(pair).filter(([key]) => key in row),
      ) });
    }
  }
  assert.equal(outbound.routes.find(({ partnerCountry }) => partnerCountry === "CN")?.status, "tariff_evidence_required");
  assert.equal(inbound.routes.find(({ partnerCountry }) => partnerCountry === "CN")?.status, "shipment_review_required");
});

test("settlement destination lists show dated evidence without turning it into approval", () => {
  const result = importSettlementDestinations({ originCountry: "DE", date: "2026-11-11" }, data, catalog, now);
  const france = result.routes.find(({ partnerCountry }) => partnerCountry === "FR")!;
  const unitedStates = result.routes.find(({ partnerCountry }) => partnerCountry === "US")!;
  assert.equal(france.status, "out_of_scope");
  assert.deepEqual(france.reasons, ["EU_INTRA_UNION_ROUTE"]);
  assert.equal(unitedStates.status, "date_review_required");
  assert.deepEqual(unitedStates.publishedTariffSnapshotIdsOnDate, ["us-hts-2026-r23"]);
  assert.equal(result.referenceDate, "2026-11-11");
  assert.equal(result.reviewedOn, date);
  assert.equal(result.productionAuthorized, false);
});

test("settlement destination HTTP accepts exactly one scoped anchor and requires auth", async () => {
  const apiKey = "test-settlement-destinations-key-012345678901";
  const handler = createHandler({ dataset: data, tariffs: catalog, apiKey, now: () => now });
  const peer = { peer: "127.0.0.1" };
  const url = "http://localhost/v1/import-settlement/destinations";
  const headers = { authorization: "Bearer " + apiKey };
  const get = (query: string) => handler(new Request(url + query, { headers }), peer);
  assert.equal((await handler(new Request(url + "?originCountry=JP"), peer)).status, 401);
  assert.equal((await handler(new Request(url + "?originCountry=JP", { method: "POST", headers }), peer)).status, 405);
  const response = await get("?destinationCountry=JP");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const result = await response.json() as ImportSettlementDestinations;
  const ajv = new Ajv({ allErrors: true, strict: true });
  (addFormatsModule as unknown as (instance: Ajv) => void)(ajv);
  const validate = ajv.compile(importSettlementDestinationsOutputSchema);
  assert.ok(validate(result), JSON.stringify(validate.errors));
  assert.equal(result.direction, "inbound");
  for (const query of ["", "?date=2026-11-14", "?originCountry=JP&destinationCountry=CN", "?originCountry=jp",
    "?originCountry=JP&originCountry=CN", "?destinationCountry=JP&date=2026-11-14&date=2026-11-15",
    "?originCountry=JP&date=2026-02-30", "?originCountry=JP&loadingCountry=CN"])
    assert.equal((await get(query)).status, 400, query);
  for (const [code, reason] of [["ZZ", "UNKNOWN_COUNTRY"], ["KP", "IMPORT_SETTLEMENT_COUNTRY_OUT_OF_SCOPE"],
    ["AQ", "IMPORT_SETTLEMENT_COUNTRY_OUT_OF_SCOPE"]]) {
    const invalid = await get("?originCountry=" + code);
    assert.equal(invalid.status, 400, code);
    assert.deepEqual((await invalid.json()).issues, [{ path: "/originCountry", code: reason }]);
  }
  const discover = await handler(new Request("http://localhost/v1/coverage", { headers }), peer);
  assert.equal((await discover.json()).importSettlementDestinationsPath, "/v1/import-settlement/destinations");
});
