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
  return { ...data, sources, rules };
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
