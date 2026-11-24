import { appendFileSync } from "node:fs";
import { loadDataset } from "../src/dataset.ts";
import { loadClassificationCatalog } from "../src/classification-catalog.ts";
import { createDataReviewReport, reviewReportSummary } from "../src/data-review.ts";

const args = process.argv.slice(2);
const options: { date?: string; warningDays?: number; referenceCountry?: string } = {};
for (let index = 0; index < args.length; index += 2) {
  const flag = args[index];
  const value = args[index + 1];
  if (value === undefined || (flag !== "--date" && flag !== "--warn-days" && flag !== "--reference-country"))
    throw new Error("USAGE: data:review [--date YYYY-MM-DD] [--warn-days 0..90] [--reference-country JP]");
  if (flag === "--date") options.date = value;
  else if (flag === "--reference-country") options.referenceCountry = value;
  else options.warningDays = /^\d+$/.test(value) ? Number(value) : NaN;
}
const data = loadDataset();
const catalog = loadClassificationCatalog(process.env, data);
const report = createDataReviewReport(data, { ...options, classificationSources: catalog.sources });
console.log(JSON.stringify(report, null, 2));
if (process.env.GITHUB_STEP_SUMMARY)
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, reviewReportSummary(report));
if (report.status === "due") process.exitCode = 2;
