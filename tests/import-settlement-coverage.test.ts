import assert from "node:assert/strict";
import test from "node:test";
import { Ajv } from "ajv";
import addFormatsModule from "ajv-formats";
import { createHandler } from "../src/http.ts";
import { importSettlementCoverage, importSettlementCoverageOutputSchema } from "../src/import-settlement-coverage.ts";
import { loadTariffCatalog } from "../src/tariffs.ts";
import { data } from "./helpers.ts";

const catalog = loadTariffCatalog(data);
const date = "2026-11-14";
const now = new Date("2026-11-13T15:05:00Z");
const screen = (originCountry: string, destinationCountry: string, reference = date, current = now) =>
  importSettlementCoverage({ originCountry, destinationCountry, date: reference }, data, catalog, current);

test("settlement screening uses direction, import date and dated source quality", () => {
  const toChina = screen("JP", "CN");
  const toJapan = screen("CN", "JP");
  assert.equal(toChina.direction, "JP-CN");
  assert.equal(toChina.status, "tariff_evidence_required");
  assert.equal(toChina.destinationTariffStatus, "tariff_reference_other_date");
  assert.deepEqual(toChina.publishedTariffSnapshotIdsOnDate, []);
  assert.deepEqual(toChina.reasons, ["DATED_TARIFF_REFERENCE_REQUIRED"]);
  assert.equal(toJapan.direction, "CN-JP");
  assert.equal(toJapan.status, "shipment_review_required");
  assert.equal(toJapan.conditionalDutyRuleId, "JP_LOW_VALUE");
  assert.deepEqual(toJapan.publishedTariffSnapshotIdsOnDate, []);
  assert.ok(toJapan.requiredEvidence.includes("CARRIER_ACCEPTED_BILL_TO"));
  assert.ok(toJapan.requiredEvidence.includes("APPLICABLE_DUTY_BASIS_ON_IMPORT_DATE"));
  assert.equal(screen("JP", "AU").conditionalDutyRuleId, null, "postal-only rule is outside the courier shape");

  const dated = screen("JP", "US", "2026-11-11", new Date("2026-11-11T02:00:00Z"));
  assert.equal(dated.status, "shipment_review_required");
  assert.deepEqual(dated.publishedTariffSnapshotIdsOnDate, ["us-hts-2026-r23"]);
  const historical = screen("JP", "US", "2026-11-11");
  assert.equal(historical.status, "date_review_required");
  assert.deepEqual(historical.publishedTariffSnapshotIdsOnDate, dated.publishedTariffSnapshotIdsOnDate);

  const referenceOnly = screen("JP", "SB", "2026-11-12", new Date("2026-11-12T02:00:00Z"));
  assert.equal(referenceOnly.status, "tariff_evidence_required");
  assert.equal(referenceOnly.destinationTariffStatus, "tariff_reference_on_date");
  assert.deepEqual(referenceOnly.referenceOnlyTariffSnapshotIdsOnDate, ["sb-petroleum-import-duty-ln218-2026"]);
  const futureReview = screen("JP", "SB", "2026-11-11", new Date("2026-11-11T02:00:00Z"));
  assert.equal(futureReview.status, "tariff_evidence_required");
  assert.deepEqual(futureReview.referenceOnlyTariffSnapshotIdsOnDate, []);
  assert.deepEqual(futureReview.futureReviewedTariffSnapshotIdsOnDate, referenceOnly.referenceOnlyTariffSnapshotIdsOnDate);

  for (const result of [toChina, toJapan, dated, historical, referenceOnly, futureReview])
    assert.deepEqual([result.checkoutReady, result.shippingAuthorized, result.productionAuthorized], [false, false, false]);
});

test("settlement screening prioritizes structural and trade holds even for old dates", () => {
  const historical = "2026-11-11";
  const cases = [
    ["KP", "JP", "blocked", "KP_COMMERCIAL_EXCLUDED"],
    ["JP", "KP", "blocked", "KP_COMMERCIAL_EXCLUDED"],
    ["JP", "AQ", "out_of_scope", "SETTLEMENT_ROUTE_OUT_OF_SCOPE"],
    ["JP", "JP", "out_of_scope", "DOMESTIC_ROUTE"],
    ["DE", "FR", "out_of_scope", "EU_INTRA_UNION_ROUTE"],
    ["US", "PR", "route_review_required", "CUSTOMS_TERRITORY_OR_TRADE_BLOC_REVIEW_REQUIRED"],
    ["ZA", "NA", "route_review_required", "CUSTOMS_TERRITORY_OR_TRADE_BLOC_REVIEW_REQUIRED"],
    ["JP", "RU", "route_review_required", "RU_BY_TRADE_REVIEW"],
    ["US", "CU", "route_review_required", "US_IR_CU_TRADE_REVIEW"],
  ] as const;
  for (const [origin, destination, status, reason] of cases) {
    const result = screen(origin, destination, historical);
    assert.equal(result.status, status, result.direction);
    assert.ok(result.reasons.includes(reason), result.direction);
    assert.equal(result.productionAuthorized, false);
    if (status === "blocked" || status === "out_of_scope") assert.deepEqual(result.requiredEvidence, []);
  }
});

test("the settlement directory is authenticated, validates its query and uses JST by default", async () => {
  const apiKey = "test-import-settlement-coverage-key-0123456789";
  const handler = createHandler({ dataset: data, tariffs: catalog, apiKey, now: () => now });
  const peer = { peer: "127.0.0.1" };
  const path = "http://localhost/v1/import-settlement/coverage";
  const query = "?originCountry=JP&destinationCountry=CN";
  const headers = { authorization: "Bearer " + apiKey };
  assert.equal((await handler(new Request(path + query), peer)).status, 401);
  assert.equal((await handler(new Request(path + query, { headers, method: "POST" }), peer)).status, 405);
  const response = await handler(new Request(path + query, { headers }), peer);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const result = await response.json();
  assert.equal(result.referenceDate, date);
  assert.equal(result.reviewedOn, date);
  const ajv = new Ajv({ allErrors: true, strict: true });
  (addFormatsModule as unknown as (instance: Ajv) => void)(ajv);
  const validate = ajv.compile(importSettlementCoverageOutputSchema);
  assert.ok(validate(result), JSON.stringify(validate.errors));

  for (const invalid of [
    query + "&date=2026-11-14&date=2026-11-15", query + "&date=2026-02-30", query + "&loadingCountry=CN",
    "?originCountry=ZZ&destinationCountry=JP", "?destinationCountry=JP", "?originCountry=jp&destinationCountry=CN",
  ]) assert.equal((await handler(new Request(path + invalid, { headers }), peer)).status, 400, invalid);
  const discover = await handler(new Request("http://localhost/v1/coverage", { headers }), peer);
  assert.equal((await discover.json()).importSettlementCoveragePath, "/v1/import-settlement/coverage");
});
