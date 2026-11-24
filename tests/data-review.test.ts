import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { createDataReviewReport, reviewReportSummary } from "../src/data-review.ts";
import { data } from "./helpers.ts";
import type { Dataset, Rule, Source } from "../src/types.ts";

const source = (id: string, reviewBy: string, checkedOn = "2026-11-10"): Source => ({
  id, title: id, url: "https://example.test/" + id, verification: "primary_rechecked", reviewBy, checkedOn,
});
const rule = (id: string, reviewBy: string, patch: Partial<Rule> = {}): Rule => ({
  id, currency: "USD", threshold: "100", validFrom: "2026-11-01", validTo: null,
  checkedOn: "2026-11-10", reviewBy, sourceIds: ["source"], ...patch,
});
function fixture(sources: Source[] = [], rules: Rule[] = []): Dataset {
  return { ...data, sources, rules, customsFeeReferences: [], importControlReferences: [] };
}

test("review partitions source deadlines, preserves compatibility, and excludes inherited approvals", () => {
  const report = createDataReviewReport(fixture([
    source("upcoming-edge", "2026-11-25"), source("too-far", "2026-11-26"),
    source("today", "2026-11-18"), source("expired", "2026-11-17"),
    { ...source("research", "2020-01-01"), verification: "inherited_research" },
  ]), { date: "2026-11-18" });
  assert.equal(report.status, "due");
  assert.equal(report.warnThrough, "2026-11-25");
  assert.deepEqual(report.primarySourcesDue.map(({ id }) => id), ["expired", "today"]);
  assert.deepEqual(report.primarySourcesDueToday.map(({ id }) => id), ["today"]);
  assert.deepEqual(report.primarySourcesExpired.map(({ id }) => id), ["expired"]);
  assert.deepEqual(report.primarySourcesUpcoming.map(({ id }) => id), ["upcoming-edge"]);
  assert.equal(report.inheritedSourcesPendingRevalidation, 1);
});

test("review monitors currently effective rules with exclusive validTo and flags future confirmations", () => {
  const report = createDataReviewReport(fixture([source("future-source", "2026-12-01", "2026-11-19")], [
    rule("active-due", "2026-11-18"), rule("active-upcoming", "2026-11-25"),
    rule("future-rule", "2026-12-01", { checkedOn: "2026-11-19" }),
    rule("not-effective", "2026-11-01", { validFrom: "2026-11-19" }),
    rule("ended", "2026-11-01", { validTo: "2026-11-18" }),
  ]), { date: "2026-11-18" });
  assert.deepEqual(report.activeRulesDue.map(({ id }) => id), ["active-due"]);
  assert.deepEqual(report.activeRulesUpcoming.map(({ id }) => id), ["active-upcoming"]);
  assert.deepEqual(report.unobservedSources.map(({ id }) => id), ["future-source"]);
  assert.deepEqual(report.unobservedActiveRules.map(({ id }) => id), ["future-rule"]);
  assert.equal(report.status, "due");
});

test("JST day boundary, zero-day warning and clear status are deterministic", () => {
  const fixtureData = fixture([source("edge", "2026-11-18")]);
  const before = createDataReviewReport(fixtureData, { now: new Date("2026-11-17T14:59:59Z") });
  const at = createDataReviewReport(fixtureData, { now: new Date("2026-11-17T15:00:00Z") });
  assert.equal(before.date, "2026-11-17");
  assert.equal(before.status, "upcoming");
  assert.equal(at.date, "2026-11-18");
  assert.equal(at.status, "due");
  assert.equal(createDataReviewReport(fixtureData, { date: "2026-11-17", warningDays: 0 }).status, "clear");
  assert.match(reviewReportSummary(at), /Primary sources \| 0 \| 1/);
});

test("invalid review date and warning intervals fail without a report", () => {
  for (const date of ["2026-02-30", "2026-1-01", "bad"])
    assert.throws(() => createDataReviewReport(fixture(), { date }), /INVALID_REVIEW_DATE/);
  for (const warningDays of [-1, 91, 0.5, NaN])
    assert.throws(() => createDataReviewReport(fixture(), { warningDays }), /INVALID_REVIEW_WARNING_DAYS/);
});

test("review CLI keeps JSON and due exit 2, rejects misspelled arguments", () => {
  const cwd = new URL("../", import.meta.url);
  const result = spawnSync(process.execPath, ["scripts/review.ts", "--date", "2099-01-01"], { cwd, encoding: "utf8" });
  assert.equal(result.status, 2, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.date, "2099-01-01");
  assert.ok(report.primarySourcesDue.length > 0);
  const invalid = spawnSync(process.execPath, ["scripts/review.ts", "--dates", "2026-11-18"], { cwd, encoding: "utf8" });
  assert.notEqual(invalid.status, 0);
  assert.equal(invalid.stdout, "");
});

const classificationSource = (id: string, reviewBy: string, effectiveThrough = reviewBy, checkedOn = "2026-11-10") => ({
  id, title: id, url: "https://example.test/" + id, kind: "classification_ruling" as const,
  countries: ["JP"], direction: "import" as const, hsEdition: "HS2022", checkedOn, reviewBy,
  effectiveFrom: "2026-11-01", effectiveThrough, terms: "Synthetic classification evidence",
});

test("classification sources monitor the earlier review or catalog end, including future confirmation", () => {
  const report = createDataReviewReport(fixture(), { date: "2026-11-18", classificationSources: [
    classificationSource("review-due", "2026-11-18", "2026-12-01"),
    classificationSource("catalog-ended", "2026-12-01", "2026-11-17"),
    classificationSource("upcoming-edge", "2026-12-01", "2026-11-25"),
    classificationSource("too-far", "2026-12-01", "2026-11-26"),
    classificationSource("future", "2026-12-01", "2026-12-01", "2026-11-19"),
  ] });
  assert.equal(report.reportVersion, 3);
  assert.equal(report.classificationScope, "loaded_classification_catalog_sources");
  assert.equal(report.status, "due");
  assert.deepEqual(report.classificationSourcesDue.map(row => row.id), ["catalog-ended", "review-due"]);
  assert.deepEqual(report.classificationSourcesDueToday.map(row => row.id), ["review-due"]);
  assert.deepEqual(report.classificationSourcesExpired.map(row => row.id), ["catalog-ended"]);
  assert.deepEqual(report.classificationSourcesUpcoming.map(row => row.id), ["upcoming-edge"]);
  assert.equal(report.classificationSourcesExpired[0]?.dueOn, "2026-11-17");
  assert.deepEqual(report.unobservedClassificationSources.map(row => row.id), ["future"]);
  assert.match(reviewReportSummary(report), /Classification sources \| 1 \| 1 \| 1 \| 1/);
});

test("classification monitoring is optional and uses the same JST and warning boundaries", () => {
  const sources = [classificationSource("classification", "2026-11-18")];
  const previousDay = createDataReviewReport(fixture(), { classificationSources: sources, now: new Date("2026-11-17T14:59:59Z") });
  const deadlineDay = createDataReviewReport(fixture(), { classificationSources: sources, now: new Date("2026-11-17T15:00:00Z") });
  assert.equal(previousDay.status, "upcoming");
  assert.equal(deadlineDay.status, "due");
  assert.equal(createDataReviewReport(fixture(), { classificationSources: sources, date: "2026-11-17", warningDays: 0 }).status, "clear");
  const absent = createDataReviewReport(fixture(), { date: "2026-11-18" });
  assert.equal(absent.status, "clear");
  assert.equal(absent.classificationScope, "not_supplied");
  assert.deepEqual(absent.classificationSourcesDue, []);
});

test("review CLI cannot emit a clear report when a configured classification catalog is unavailable", () => {
  const missing = new URL("./fixtures/not-present-classification-catalog.json", import.meta.url);
  const result = spawnSync(process.execPath, ["scripts/review.ts", "--date", "2026-11-18"], {
    cwd: new URL("../", import.meta.url), encoding: "utf8",
    env: { ...process.env, VEYGRIT_CLASSIFICATION_CATALOG: missing.pathname },
  });
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, "");
});

test("reference windows distinguish the inclusive last day, expiry and warning horizon for each destination", () => {
  const fee = { ...data.customsFeeReferences![0]!, id: "fee_jp", countries: ["JP", "CN"], referenceThrough: "2026-11-18" };
  const control = { ...data.importControlReferences![0]!, id: "control_us", countries: ["US"], referenceThrough: "2026-11-24" };
  const dataset = { ...fixture(), customsFeeReferences: [fee], importControlReferences: [control] };
  const before = createDataReviewReport(dataset, { now: new Date("2026-11-17T14:59:59Z") });
  const today = createDataReviewReport(dataset, { now: new Date("2026-11-17T15:00:00Z") });
  const after = createDataReviewReport(dataset, { date: "2026-11-19", referenceCountry: "JP" });
  assert.deepEqual(before.referenceCoverage?.warnings.map(row => row.status), ["upcoming", "upcoming"]);
  assert.equal(before.status, "upcoming");
  assert.equal(createDataReviewReport(dataset, { date: "2026-11-17", warningDays: 0 }).status, "clear");
  assert.equal(today.status, "due");
  assert.deepEqual(today.referenceCoverage?.warnings.map(row => row.status), ["ends_today", "upcoming"]);
  assert.deepEqual(after.referenceCoverage, { country: "JP", tracked: { customs_fee: 1, import_control: 0 }, warnings: [{
    kind: "customs_fee", id: "fee_jp", countries: ["CN", "JP"], referenceThrough: "2026-11-18", status: "expired",
  }] });
  assert.match(reviewReportSummary(after), /Customs fees \| 1 \| 1 \| 0 \| 0/);
  assert.deepEqual(fee.countries, ["JP", "CN"]);
  assert.throws(() => createDataReviewReport(dataset, { referenceCountry: "ZZ" }), /INVALID_REVIEW_REFERENCE_COUNTRY/);
});

test("country-scoped CLI keeps global source checks and limits bundled reference rows", () => {
  const result = spawnSync(process.execPath, ["scripts/review.ts", "--reference-country", "JP", "--date", "2099-01-01"], {
    cwd: new URL("../", import.meta.url), encoding: "utf8",
  });
  assert.equal(result.status, 2, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.referenceCoverage.country, "JP");
  assert.ok(report.primarySourcesExpired.length);
  const expected = [...data.customsFeeReferences!, ...data.importControlReferences!].filter(row => row.countries.includes("JP"));
  assert.equal(report.referenceCoverage.tracked.customs_fee + report.referenceCoverage.tracked.import_control, expected.length);
  assert.deepEqual(report.referenceCoverage.warnings.map((row: { id: string }) => row.id).sort(), expected.map(row => row.id).sort());
});
