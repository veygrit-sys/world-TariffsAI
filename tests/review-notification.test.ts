import assert from "node:assert/strict";
import test from "node:test";
import { createDataReviewReport } from "../src/data-review.ts";
import { parseNotificationReport, reviewIssueMarker, updateReviewIssue } from "../scripts/update-review-issue.ts";
import { data } from "./helpers.ts";

function report(date = "2026-11-18") {
  return createDataReviewReport({ ...data, rules: [], sources: [{ id: "source", title: "source",
    url: "https://example.test/source", checkedOn: "2026-11-01", reviewBy: "2026-11-20", verification: "primary_rechecked" }] }, { date });
}
function github() {
  const issues: { number: number; body: string; state: string; user: { login: string } }[] = [];
  const calls: { method: string; path: string; body?: any }[] = [];
  const comments: string[] = [];
  const fetch = async (url: string, init?: RequestInit) => {
    const path = new URL(url).pathname;
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, path, body });
    if (method === "GET") return Response.json(issues);
    if (path.endsWith("/comments")) { comments.push(body.body); return Response.json({ id: comments.length }); }
    if (method === "POST") {
      const issue = { number: 41, body: body.body, state: "open", user: { login: "github-actions[bot]" } };
      issues.push(issue); return Response.json(issue);
    }
    Object.assign(issues[0]!, body);
    return Response.json(issues[0]);
  };
  return { issues, calls, comments, options: { repository: "owner/repo", token: "test-token", runUrl: "https://github.com/owner/repo/actions/runs/123", fetch } };
}

test("notifier creates one issue, updates unchanged runs without comments, alerts on changed review state", async () => {
  const api = github();
  assert.deepEqual(await updateReviewIssue(report(), api.options), { action: "created", issueNumber: 41 });
  assert.ok(api.issues[0]?.body.startsWith(reviewIssueMarker));
  assert.deepEqual(await updateReviewIssue(report("2026-11-19"), api.options), { action: "updated", issueNumber: 41 });
  assert.equal(api.issues.length, 1);
  assert.equal(api.comments.length, 0);
  await updateReviewIssue(report("2026-11-20"), api.options);
  assert.equal(api.comments.length, 1);
  assert.match(api.comments[0]!, /\*\*due\*\*/);
  await updateReviewIssue(report("2026-11-21"), api.options);
  assert.equal(api.comments.length, 1);
});

test("review resolution closes the issue; repeated clear is inert; recurrence reopens the same issue", async () => {
  const api = github();
  const clear = createDataReviewReport({ ...data, sources: [], rules: [] }, { date: "2026-11-18" });
  assert.deepEqual(await updateReviewIssue(clear, api.options), { action: "clear" });
  assert.equal(api.calls.length, 1);
  await updateReviewIssue(report(), api.options);
  assert.deepEqual(await updateReviewIssue(clear, api.options), { action: "closed", issueNumber: 41 });
  assert.equal(api.issues[0]?.state, "closed");
  const mutations = api.calls.filter(({ method }) => method !== "GET").length;
  await updateReviewIssue(clear, api.options);
  assert.equal(api.calls.filter(({ method }) => method !== "GET").length, mutations);
  assert.deepEqual(await updateReviewIssue(report(), api.options), { action: "reopened", issueNumber: 41 });
  assert.equal(api.issues.length, 1);
  assert.equal(api.issues[0]?.state, "open");
});

test("malformed or contradictory reports cannot clear or modify an issue", async () => {
  const api = github();
  for (const invalid of [null, {}, { ...report(), primarySourcesDue: undefined }, { ...report(), status: "clear" },
    { ...report(), primarySourcesUpcoming: [{ id: "@someone", reviewBy: "2026-11-20" }] },
    { ...report(), primarySourcesUpcoming: [{ id: "source", reviewBy: "bad" }] }]) {
    assert.throws(() => parseNotificationReport(invalid), /DATA_REVIEW_REPORT/);
    await assert.rejects(updateReviewIssue(invalid, api.options), /DATA_REVIEW_REPORT/);
  }
  assert.equal(api.calls.length, 0);
});

test("GitHub API failures are explicit and do not close the existing alert", async () => {
  const api = github();
  await updateReviewIssue(report(), api.options);
  await assert.rejects(updateReviewIssue(report(), { ...api.options, fetch: async () => new Response("denied", { status: 403 }) }),
    /DATA_REVIEW_GITHUB_API_FAILED_403/);
  assert.equal(api.issues[0]?.state, "open");
});

test("ambiguous duplicate tracking issues fail rather than updating unrelated records", async () => {
  const api = github();
  await updateReviewIssue(report(), api.options);
  api.issues.push({ ...api.issues[0]!, number: 42 });
  await assert.rejects(updateReviewIssue(report(), api.options), /MULTIPLE_DATA_REVIEW_TRACKING_ISSUES/);
});

function classificationReport(date = "2026-11-18") {
  return createDataReviewReport({ ...data, sources: [], rules: [] }, { date, classificationSources: [{
    id: "classification-source", title: "Classification source", url: "https://example.test/classification",
    kind: "classification_ruling", countries: ["JP"], direction: "import", hsEdition: "HS2022",
    checkedOn: "2026-11-01", reviewBy: "2026-12-01", effectiveFrom: "2026-11-01",
    effectiveThrough: "2026-11-20", terms: "Synthetic source",
  }] });
}

test("classification warnings create and retain an alert until catalog problems are resolved", async () => {
  const api = github();
  const upcoming = classificationReport();
  assert.equal(upcoming.status, "upcoming");
  await updateReviewIssue(upcoming, api.options);
  assert.match(api.issues[0]!.body, /Upcoming classification sources/);
  assert.match(api.issues[0]!.body, /catalog end 2026-11-20/);
  await updateReviewIssue(classificationReport("2026-11-20"), api.options);
  assert.match(api.issues[0]!.body, /Classification sources due today/);
  assert.equal(api.comments.length, 1);
  const invalid = { ...classificationReport("2026-11-20"), classificationSourcesDue: [] };
  await assert.rejects(updateReviewIssue(invalid, api.options), /DATA_REVIEW_REPORT/);
  assert.equal(api.issues[0]!.state, "open");
  const resolved = createDataReviewReport({ ...data, sources: [], rules: [] }, { date: "2026-11-20", classificationSources: [] });
  assert.equal((await updateReviewIssue(resolved, api.options)).action, "closed");
});

test("v2 classification fields cannot be omitted or downgraded; unextended v1 reports remain accepted", () => {
  const current = classificationReport();
  const missing: Record<string, unknown> = { ...current };
  delete missing.classificationSourcesUpcoming;
  assert.throws(() => parseNotificationReport(missing), /DATA_REVIEW_REPORT/);
  assert.throws(() => parseNotificationReport({ ...current, reportVersion: 1 }), /DATA_REVIEW_REPORT/);
  const legacy: Record<string, unknown> = { ...report(), reportVersion: 1 };
  for (const key of ["classificationSourcesDue", "classificationSourcesDueToday", "classificationSourcesExpired", "classificationSourcesUpcoming", "unobservedClassificationSources", "classificationScope"])
    delete legacy[key];
  const parsed = parseNotificationReport(legacy);
  assert.equal(parsed.reportVersion, 2);
  assert.equal(parsed.classificationScope, "not_supplied");
  assert.deepEqual(parsed.classificationSourcesDue, []);
  assert.equal(parseNotificationReport(parsed).status, parsed.status);
  assert.equal(legacy.reportVersion, 1, "legacy input is not mutated");
});

test("classification deadline metadata and partition membership must agree", () => {
  const current = classificationReport();
  for (const patch of [
    { dueOn: "2026-11-21" }, { effectiveThrough: "bad" }, { dueOn: "2026-11-20", reviewBy: "2026-11-19" },
  ]) {
    const invalid = { ...current, classificationSourcesUpcoming: [{ ...current.classificationSourcesUpcoming[0]!, ...patch }] };
    assert.throws(() => parseNotificationReport(invalid), /DATA_REVIEW_REPORT/);
  }
  const wrongPartition = { ...current, classificationSourcesDueToday: current.classificationSourcesUpcoming };
  assert.throws(() => parseNotificationReport(wrongPartition), /DATA_REVIEW_REPORT/);
});
