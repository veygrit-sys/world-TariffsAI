import { todayJst } from "./dataset.ts";
import type { Dataset, Rule, Source } from "./types.ts";
import type { ClassificationSource } from "./classification-types.ts";

export interface SourceReviewDeadline {
  id: string;
  url: string;
  reviewBy: string;
}
export interface RuleReviewDeadline {
  id: string;
  reviewBy: string;
  validFrom: string;
  validTo: string | null;
}
export interface ClassificationReviewDeadline extends SourceReviewDeadline {
  effectiveThrough: string;
  /** The earlier of reviewBy and the inclusive catalog applicability boundary. */
  dueOn: string;
}
export interface DataReviewReport {
  reportVersion: 1 | 2;
  date: string;
  warnThrough: string;
  warningDays: number;
  ruleSetVersion: string;
  status: "clear" | "upcoming" | "due";
  /** Compatibility field: includes deadlines today and earlier. */
  primarySourcesDue: SourceReviewDeadline[];
  primarySourcesDueToday: SourceReviewDeadline[];
  primarySourcesExpired: SourceReviewDeadline[];
  primarySourcesUpcoming: SourceReviewDeadline[];
  activeRulesDue: RuleReviewDeadline[];
  activeRulesDueToday: RuleReviewDeadline[];
  activeRulesExpired: RuleReviewDeadline[];
  activeRulesUpcoming: RuleReviewDeadline[];
  unobservedSources: { id: string; url: string; checkedOn: string }[];
  unobservedActiveRules: { id: string; checkedOn: string }[];
  classificationSourcesDue: ClassificationReviewDeadline[];
  classificationSourcesDueToday: ClassificationReviewDeadline[];
  classificationSourcesExpired: ClassificationReviewDeadline[];
  classificationSourcesUpcoming: ClassificationReviewDeadline[];
  unobservedClassificationSources: { id: string; url: string; checkedOn: string }[];
  classificationScope: "loaded_classification_catalog_sources" | "not_supplied";
  inheritedSourcesPendingRevalidation: number;
  scope: "bundled_primary_sources_and_current_rules";
  action: string;
}

export function validReviewDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value;
}

/** Report deadlines without changing source approval, tax rules, or the data files. */
export function createDataReviewReport(
  data: Dataset,
  options: { now?: Date; date?: string; warningDays?: number; classificationSources?: readonly ClassificationSource[] } = {},
): DataReviewReport {
  const date = options.date ?? todayJst(options.now ?? new Date());
  const warningDays = options.warningDays ?? 7;
  if (!validReviewDate(date)) throw new Error("INVALID_REVIEW_DATE");
  if (!Number.isInteger(warningDays) || warningDays < 0 || warningDays > 90)
    throw new Error("INVALID_REVIEW_WARNING_DAYS");
  const warnThrough = new Date(Date.parse(date + "T00:00:00Z") + warningDays * 86_400_000)
    .toISOString().slice(0, 10);
  const sources = data.sources.filter(({ verification }) => verification === "primary_rechecked");
  const rules = data.rules.filter(({ validFrom, validTo }) => validFrom <= date && (validTo === null || date < validTo));
  const classificationSources = options.classificationSources ?? [];
  const sourceDeadline = ({ id, url, reviewBy }: Source): SourceReviewDeadline => ({ id, url, reviewBy });
  const classificationDeadline = ({ id, url, reviewBy, effectiveThrough }: ClassificationSource): ClassificationReviewDeadline => ({
    id, url, reviewBy, effectiveThrough, dueOn: reviewBy < effectiveThrough ? reviewBy : effectiveThrough,
  });
  const classificationDeadlines = classificationSources.map(classificationDeadline);
  const ruleDeadline = ({ id, reviewBy, validFrom, validTo }: Rule): RuleReviewDeadline => ({ id, reviewBy, validFrom, validTo });
  const ordered = <T extends { id: string }>(values: T[]) => values.sort((a, b) => a.id.localeCompare(b.id));
  const report: DataReviewReport = {
    reportVersion: 2, date, warnThrough, warningDays, ruleSetVersion: data.version, status: "clear",
    primarySourcesDue: ordered(sources.filter(({ reviewBy }) => reviewBy <= date).map(sourceDeadline)),
    primarySourcesDueToday: ordered(sources.filter(({ reviewBy }) => reviewBy === date).map(sourceDeadline)),
    primarySourcesExpired: ordered(sources.filter(({ reviewBy }) => reviewBy < date).map(sourceDeadline)),
    primarySourcesUpcoming: ordered(sources.filter(({ reviewBy }) => date < reviewBy && reviewBy <= warnThrough).map(sourceDeadline)),
    activeRulesDue: ordered(rules.filter(({ reviewBy }) => reviewBy <= date).map(ruleDeadline)),
    activeRulesDueToday: ordered(rules.filter(({ reviewBy }) => reviewBy === date).map(ruleDeadline)),
    activeRulesExpired: ordered(rules.filter(({ reviewBy }) => reviewBy < date).map(ruleDeadline)),
    activeRulesUpcoming: ordered(rules.filter(({ reviewBy }) => date < reviewBy && reviewBy <= warnThrough).map(ruleDeadline)),
    unobservedSources: ordered(sources.filter(({ checkedOn }) => date < checkedOn)
      .map(({ id, url, checkedOn }) => ({ id, url, checkedOn }))),
    unobservedActiveRules: ordered(rules.filter(({ checkedOn }) => date < checkedOn)
      .map(({ id, checkedOn }) => ({ id, checkedOn }))),
    classificationSourcesDue: ordered(classificationDeadlines.filter(({ dueOn }) => dueOn <= date)),
    classificationSourcesDueToday: ordered(classificationDeadlines.filter(({ dueOn }) => dueOn === date)),
    classificationSourcesExpired: ordered(classificationDeadlines.filter(({ dueOn }) => dueOn < date)),
    classificationSourcesUpcoming: ordered(classificationDeadlines.filter(({ dueOn }) => date < dueOn && dueOn <= warnThrough)),
    unobservedClassificationSources: ordered(classificationSources.filter(({ checkedOn }) => date < checkedOn)
      .map(({ id, url, checkedOn }) => ({ id, url, checkedOn }))),
    classificationScope: options.classificationSources ? "loaded_classification_catalog_sources" : "not_supplied",
    inheritedSourcesPendingRevalidation: data.sources.filter(({ verification }) => verification === "inherited_research").length,
    scope: "bundled_primary_sources_and_current_rules",
    action: "Review current primary law; record the reviewer, evidence and changed scope in a pull request. No automatic approval.",
  };
  if (report.primarySourcesDue.length || report.activeRulesDue.length ||
      report.unobservedSources.length || report.unobservedActiveRules.length || report.classificationSourcesDue.length ||
      report.unobservedClassificationSources.length) report.status = "due";
  else if (report.primarySourcesUpcoming.length || report.activeRulesUpcoming.length || report.classificationSourcesUpcoming.length) report.status = "upcoming";
  return report;
}

export function reviewReportSummary(report: DataReviewReport): string {
  return [
    `## Data review (${report.date}, JST)`, "",
    `Status: **${report.status}**; warning window: ${report.warningDays} days.`, "",
    "| Record | Expired | Due today | Upcoming | Future confirmation |",
    "| --- | ---: | ---: | ---: | ---: |",
    `| Primary sources | ${report.primarySourcesExpired.length} | ${report.primarySourcesDueToday.length} | ${report.primarySourcesUpcoming.length} | ${report.unobservedSources.length} |`,
    `| Current rules | ${report.activeRulesExpired.length} | ${report.activeRulesDueToday.length} | ${report.activeRulesUpcoming.length} | ${report.unobservedActiveRules.length} |`,
    `| Classification sources | ${report.classificationSourcesExpired.length} | ${report.classificationSourcesDueToday.length} | ${report.classificationSourcesUpcoming.length} | ${report.unobservedClassificationSources.length} |`, "",
    `Scope: bundled primary sources and currently effective rules; classification sources: ${report.classificationScope}. Classification deadlines use the earlier of review and catalog applicability end. Private approval events, tariff packs and legal changes are not fetched or approved by this check.`, "",
  ].join("\n");
}
