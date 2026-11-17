import { createHash } from "node:crypto";
import { appendFileSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import type { DataReviewReport } from "../src/data-review.ts";

export const reviewIssueMarker = "<!-- veygrit:data-review-monitor:v1 -->";
const legacyArrayFields = [
  "primarySourcesDue", "primarySourcesDueToday", "primarySourcesExpired", "primarySourcesUpcoming",
  "activeRulesDue", "activeRulesDueToday", "activeRulesExpired", "activeRulesUpcoming",
  "unobservedSources", "unobservedActiveRules",
] as const;
const classificationArrayFields = [
  "classificationSourcesDue", "classificationSourcesDueToday", "classificationSourcesExpired",
  "classificationSourcesUpcoming", "unobservedClassificationSources",
] as const;
const arrayFields = [...legacyArrayFields, ...classificationArrayFields];

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;
type Issue = { number: number; body: string | null; state: string; pull_request?: unknown; user?: { login: string } };
const validDate = (date: unknown): date is string => typeof date === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) &&
  new Date(date).toISOString().slice(0, 10) === date;

/** Reject missing, truncated, and contradictory reports before touching any issue. */
export function parseNotificationReport(value: unknown): DataReviewReport {
  if (value === null || typeof value !== "object") throw new Error("INVALID_DATA_REVIEW_REPORT");
  const supplied = value as Record<string, unknown>;
  let report = value as DataReviewReport;
  if (report.reportVersion === 1) {
    // A legacy producer cannot silently drop or downgrade classification warnings.
    if (classificationArrayFields.some(key => key in supplied) || "classificationScope" in supplied)
      throw new Error("INVALID_DATA_REVIEW_REPORT");
    report = { ...report, reportVersion: 2, classificationScope: "not_supplied",
      classificationSourcesDue: [], classificationSourcesDueToday: [], classificationSourcesExpired: [],
      classificationSourcesUpcoming: [], unobservedClassificationSources: [] };
  }
  if (report.reportVersion !== 2 || report.scope !== "bundled_primary_sources_and_current_rules" ||
      !["loaded_classification_catalog_sources", "not_supplied"].includes(report.classificationScope) ||
      !validDate(report.date) || !validDate(report.warnThrough) ||
      typeof report.ruleSetVersion !== "string" || !/^[A-Za-z0-9_.:-]{1,100}$/.test(report.ruleSetVersion) ||
      !Number.isInteger(report.warningDays) || report.warningDays < 0 || report.warningDays > 90 ||
      arrayFields.some((key) => !Array.isArray(report[key]) || report[key].length > 10_000 ||
        report[key].some((entry) => entry === null || typeof entry !== "object" ||
          typeof entry.id !== "string" || !/^[A-Za-z0-9_.:-]{1,150}$/.test(entry.id))))
    throw new Error("INVALID_DATA_REVIEW_REPORT");
  const expectedWarnThrough = new Date(Date.parse(report.date + "T00:00:00Z") + report.warningDays * 86_400_000)
    .toISOString().slice(0, 10);
  if (report.warnThrough !== expectedWarnThrough ||
      (report.classificationScope === "not_supplied" && classificationArrayFields.some(key => report[key].length)))
    throw new Error("INCONSISTENT_DATA_REVIEW_REPORT");
  for (const key of arrayFields) {
    const ids = new Set<string>();
    const dateKey = key.startsWith("unobserved") ? "checkedOn" : "reviewBy";
    for (const entry of report[key]) {
      const row = entry as unknown as Record<string, unknown>;
      if (ids.has(entry.id) || !validDate(row[dateKey])) throw new Error("INVALID_DATA_REVIEW_REPORT");
      ids.add(entry.id);
      if (key.startsWith("classificationSources") && (!validDate(row.effectiveThrough) || !validDate(row.dueOn) ||
          row.dueOn !== (String(row.reviewBy) < row.effectiveThrough ? row.reviewBy : row.effectiveThrough)))
        throw new Error("INVALID_DATA_REVIEW_REPORT");
      if (key.startsWith("unobserved") && String(row.checkedOn) <= report.date)
        throw new Error("INCONSISTENT_DATA_REVIEW_REPORT");
    }
  }
  const checkPartitions = (due: { id: string }[], today: { id: string }[], expired: { id: string }[], upcoming: { id: string }[], deadline: (row: { id: string }) => string) => {
    if (due.some(row => deadline(row) > report.date) || today.some(row => deadline(row) !== report.date) ||
        expired.some(row => deadline(row) >= report.date) || upcoming.some(row => deadline(row) <= report.date || deadline(row) > report.warnThrough))
      throw new Error("INCONSISTENT_DATA_REVIEW_REPORT");
    const signature = (rows: { id: string }[]) => rows.map(row => row.id + ":" + deadline(row)).sort().join("|");
    if (signature(due) !== signature([...today, ...expired])) throw new Error("INCONSISTENT_DATA_REVIEW_REPORT");
  };
  const reviewDate = (row: { id: string }) => (row as { id: string; reviewBy: string }).reviewBy;
  checkPartitions(report.primarySourcesDue, report.primarySourcesDueToday, report.primarySourcesExpired, report.primarySourcesUpcoming, reviewDate);
  checkPartitions(report.activeRulesDue, report.activeRulesDueToday, report.activeRulesExpired, report.activeRulesUpcoming, reviewDate);
  checkPartitions(report.classificationSourcesDue, report.classificationSourcesDueToday, report.classificationSourcesExpired, report.classificationSourcesUpcoming,
    row => (row as { id: string; dueOn: string }).dueOn);
  const due = report.primarySourcesDue.length + report.activeRulesDue.length + report.classificationSourcesDue.length +
    report.unobservedSources.length + report.unobservedActiveRules.length + report.unobservedClassificationSources.length;
  const upcoming = report.primarySourcesUpcoming.length + report.activeRulesUpcoming.length + report.classificationSourcesUpcoming.length;
  const expected = due ? "due" : upcoming ? "upcoming" : "clear";
  if (report.status !== expected) throw new Error("INCONSISTENT_DATA_REVIEW_REPORT");
  return report;
}

function fingerprint(report: DataReviewReport): string {
  // Exclude the report date so an unchanged daily reminder does not post another comment.
  return createHash("sha256").update(JSON.stringify({ status: report.status,
    sources: [...report.primarySourcesDue, ...report.primarySourcesUpcoming],
    rules: [...report.activeRulesDue, ...report.activeRulesUpcoming],
    classificationSources: [...report.classificationSourcesDue, ...report.classificationSourcesUpcoming],
    classificationScope: report.classificationScope,
    unobservedClassificationSources: report.unobservedClassificationSources,
    unobservedSources: report.unobservedSources, unobservedRules: report.unobservedActiveRules,
  })).digest("hex");
}

function issueBody(report: DataReviewReport, runUrl: string): string {
  const lines = [reviewIssueMarker, `<!-- review-fingerprint:${fingerprint(report)} -->`,
    "# Customs data review", "", `Checked: ${report.date} (JST). Status: **${report.status}**.`, "",
    `Warning window: ${report.warningDays} days. Dataset: \`${report.ruleSetVersion.replaceAll("`", "")}\`.`, ""];
  const group = (title: string, entries: { id: string; reviewBy?: string; checkedOn?: string; dueOn?: string; effectiveThrough?: string }[]) => {
    if (!entries.length) return;
    lines.push(`## ${title}`, "");
    for (const entry of entries.slice(0, 20))
      lines.push(`- \`${entry.id}\`: ${entry.dueOn ? "due " + entry.dueOn + " (review " + entry.reviewBy + "; catalog end " + entry.effectiveThrough + ")" : entry.reviewBy ? "review by " + entry.reviewBy : "future confirmation " + entry.checkedOn}`);
    if (entries.length > 20) lines.push(`- ${entries.length - 20} more; see the workflow report artifact.`);
    lines.push("");
  };
  group("Expired primary sources", report.primarySourcesExpired);
  group("Primary sources due today", report.primarySourcesDueToday);
  group("Upcoming primary sources", report.primarySourcesUpcoming);
  group("Expired current rules", report.activeRulesExpired);
  group("Current rules due today", report.activeRulesDueToday);
  group("Upcoming current rules", report.activeRulesUpcoming);
  group("Future source confirmations", report.unobservedSources);
  group("Future rule confirmations", report.unobservedActiveRules);
  group("Expired classification sources", report.classificationSourcesExpired);
  group("Classification sources due today", report.classificationSourcesDueToday);
  group("Upcoming classification sources", report.classificationSourcesUpcoming);
  group("Future classification confirmations", report.unobservedClassificationSources);
  lines.push("Review the primary evidence and submit a reviewed data update. This check never extends deadlines or approves data.", "",
    `Scope: repository primary sources and currently effective rules; classification sources: ${report.classificationScope}. Private approval events, tariff packs and newly published legal changes are not monitored by this workflow.`, "",
    `[Workflow run and JSON report](${runUrl})`, "");
  return lines.join("\n");
}

/** REST-only notifier. Call after report generation succeeds; API failures never clear a warning. */
export async function updateReviewIssue(
  value: unknown,
  options: { repository: string; token: string; runUrl: string; fetch?: Fetch },
): Promise<{ action: "created" | "updated" | "reopened" | "closed" | "clear"; issueNumber?: number }> {
  const report = parseNotificationReport(value);
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(options.repository) || !options.token ||
      !/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/actions\/runs\/\d+$/.test(options.runUrl))
    throw new Error("INVALID_REVIEW_NOTIFICATION_CONTEXT");
  const request = async (path: string, method = "GET", body?: unknown) => {
    const response = await (options.fetch ?? fetch)(`https://api.github.com/repos/${options.repository}${path}`, {
      method, headers: { accept: "application/vnd.github+json", authorization: `Bearer ${options.token}`,
        "X-GitHub-Api-Version": "2022-11-28", "content-type": "application/json" },
      signal: AbortSignal.timeout(20_000),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) throw new Error(`DATA_REVIEW_GITHUB_API_FAILED_${response.status}`);
    return await response.json() as unknown;
  };
  const existing: Issue[] = [];
  for (let page = 1; ; page++) {
    if (page > 100) throw new Error("DATA_REVIEW_ISSUE_SEARCH_LIMIT");
    const list = await request(`/issues?state=all&per_page=100&page=${page}`) as Issue[];
    if (!Array.isArray(list)) throw new Error("INVALID_GITHUB_ISSUE_LIST");
    existing.push(...list.filter((issue) => !issue.pull_request && issue.user?.login === "github-actions[bot]" &&
      issue.body?.startsWith(reviewIssueMarker)));
    if (list.length < 100) break;
  }
  if (existing.length > 1) throw new Error("MULTIPLE_DATA_REVIEW_TRACKING_ISSUES");
  const issue = existing[0];
  if (!issue && report.status === "clear") return { action: "clear" };
  const body = issueBody(report, options.runUrl);
  const title = report.status === "clear" ? "Customs data review: resolved" :
    `Customs data review: ${report.status === "due" ? "review required" : "upcoming deadlines"}`;
  if (!issue) {
    const created = await request("/issues", "POST", { title, body }) as Issue;
    if (!Number.isInteger(created.number)) throw new Error("INVALID_CREATED_REVIEW_ISSUE");
    return { action: "created", issueNumber: created.number };
  }
  if (report.status === "clear") {
    if (issue.state === "closed") return { action: "clear", issueNumber: issue.number };
    await request(`/issues/${issue.number}`, "PATCH", { title, body, state: "closed", state_reason: "completed" });
    return { action: "closed", issueNumber: issue.number };
  }
  // Notify before recording the new fingerprint, so a failed comment is retried next run.
  if (issue.state !== "closed" && !issue.body?.includes(`<!-- review-fingerprint:${fingerprint(report)} -->`))
    await request(`/issues/${issue.number}/comments`, "POST", {
      body: `Data review changed to **${report.status}** on ${report.date} (JST). [Updated report](${options.runUrl}).`,
    });
  await request(`/issues/${issue.number}`, "PATCH", { title, body, state: "open" });
  return { action: issue.state === "closed" ? "reopened" : "updated", issueNumber: issue.number };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await updateReviewIssue(JSON.parse(readFileSync(process.argv[2] ?? 0, "utf8")), {
    repository: process.env.GITHUB_REPOSITORY ?? "", token: process.env.GITHUB_TOKEN ?? "",
    runUrl: `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`,
  });
  console.log(JSON.stringify(result));
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `Data review issue: ${result.action}${result.issueNumber ? " #" + result.issueNumber : ""}.\n`);
}
