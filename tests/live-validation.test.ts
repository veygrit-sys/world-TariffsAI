import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadLiveValidationRecords, parseLiveValidationRecords, type LiveValidationRecord } from "../src/live-validation.ts";
import { releaseReadiness } from "../src/release-readiness.ts";
import { data } from "./helpers.ts";

const now = new Date("2026-11-18T00:00:00Z");
const manifestSha256 = ["a".repeat(64)];
const review = { status: "validated" as const, evidenceId: "evidence-d61ba9e0-aa8b", reviewerRef: "reviewer-d37675b0-aa8b", reviewedOn: "2026-11-18" };
const complete: LiveValidationRecord = {
  route: "JP-US", orderId: "order-6ec50dcc-aa8b", datasetVersion: data.version,
  tariffManifestSha256: manifestSha256,
  checkout: review,
  customsHandoff: { ...review, evidenceId: "evidence-4ba2d400-aa8b" },
  invoiceReconciliation: { ...review, evidenceId: "evidence-dda41cf0-aa8b" },
};

test("absent records preserve pending readiness and do not read a default file", () => {
  assert.deepEqual(loadLiveValidationRecords({}, now), []);
  assert.deepEqual(releaseReadiness(data, now), releaseReadiness(data, now, []));
  assert.equal(releaseReadiness(data, now).productionVerifiedRouteCount, 0);
});

test("a complete sample order changes its route while partial and other directions remain pending", () => {
  const partial: LiveValidationRecord = { route: "CN-JP", orderId: "order-cc7d57e2-aa8b", datasetVersion: data.version,
    tariffManifestSha256: manifestSha256, checkout: review };
  const result = releaseReadiness(data, now, [complete, partial], manifestSha256);
  assert.equal(result.productionVerifiedRouteCount, 1);
  const ready = result.routes.find(({ route }) => route === "JP-US")!;
  assert.equal(ready.checkout, "validated");
  assert.equal(ready.customsHandoff, "validated");
  assert.equal(ready.invoiceReconciliation, "validated");
  const pending = result.routes.find(({ route }) => route === "CN-JP")!;
  assert.equal(pending.checkout, "validated");
  assert.equal(pending.customsHandoff, "pending_live_validation");
  assert.equal(pending.invoiceReconciliation, "pending_live_validation");
  assert.ok(result.routes.every(({ productionAuthorized }) => productionAuthorized === false));
  assert.ok(!JSON.stringify(result).includes(complete.orderId));
  assert.ok(!JSON.stringify(result).includes(review.evidenceId));
});

test("stages from separate orders cannot be combined into a verified route", () => {
  const first = { route: "JP-US", orderId: complete.orderId, datasetVersion: data.version,
    tariffManifestSha256: manifestSha256, checkout: review };
  const second = { route: "JP-US", orderId: "order-different-aa8b", datasetVersion: data.version,
    tariffManifestSha256: manifestSha256, customsHandoff: review, invoiceReconciliation: review };
  assert.throws(() => releaseReadiness(data, now, [first, second]), /DUPLICATE_LIVE_VALIDATION_ROUTE/);
});

test("a review for another data version stays pending until its evidence is rechecked", () => {
  const stale = { ...complete, datasetVersion: "earlier-reviewed-data-version" };
  const result = releaseReadiness(data, now, [stale], manifestSha256);
  assert.equal(result.productionVerifiedRouteCount, 0);
  assert.ok(result.routes.every(({ checkout }) => checkout === "pending_live_validation"));
});

test("changing or reordering the loaded tariff stack invalidates a recorded review", () => {
  assert.equal(releaseReadiness(data, now, [complete]).productionVerifiedRouteCount, 0);
  assert.equal(releaseReadiness(data, now, [complete], ["b".repeat(64)]).productionVerifiedRouteCount, 0);
  const multiple = { ...complete, tariffManifestSha256: [...manifestSha256, "b".repeat(64)] };
  assert.equal(releaseReadiness(data, now, [multiple], [...multiple.tariffManifestSha256].reverse()).productionVerifiedRouteCount, 0);
  assert.equal(releaseReadiness(data, now, [multiple], multiple.tariffManifestSha256).productionVerifiedRouteCount, 1);
});

test("review dates use the JST boundary and future reviews fail closed", () => {
  assert.throws(() => parseLiveValidationRecords([complete], new Date("2026-11-17T14:59:59Z")),
    /LIVE_VALIDATION_REVIEW_NOT_OBSERVED/);
  assert.equal(parseLiveValidationRecords([complete], new Date("2026-11-17T15:00:00Z")).length, 1);
  assert.equal(parseLiveValidationRecords([complete], new Date("2027-01-01T00:00:00Z")).length, 1);
});

test("strict records reject unsupported routes, personal-data fields, bad dates and incomplete evidence", () => {
  for (const changed of [
    { ...complete, route: "US-GB" },
    { ...complete, recipientAddress: "private address" },
    { ...complete, checkout: { ...review, name: "private name" } },
    { ...complete, checkout: { ...review, status: "failed" } },
    { ...complete, checkout: { ...review, reviewedOn: "2026-02-30" } },
    { ...complete, checkout: { evidenceId: review.evidenceId, reviewedOn: review.reviewedOn } },
    { route: "JP-US", orderId: complete.orderId },
  ]) assert.throws(() => parseLiveValidationRecords([changed], now), /INVALID_LIVE_VALIDATION_RECORDS/);
});

test("operator files are optional but configured malformed or missing files fail closed", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "customs-live-validation-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const file = join(directory, "reviews.json");
  writeFileSync(file, JSON.stringify([complete]));
  assert.deepEqual(loadLiveValidationRecords({ VEYGRIT_LIVE_VALIDATION_FILE: file }, now), [complete]);
  writeFileSync(file, "{}");
  assert.throws(() => loadLiveValidationRecords({ VEYGRIT_LIVE_VALIDATION_FILE: file }, now), /INVALID_LIVE_VALIDATION_RECORDS/);
  assert.throws(() => loadLiveValidationRecords({ VEYGRIT_LIVE_VALIDATION_FILE: join(directory, "missing.json") }, now));
});
