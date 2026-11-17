import { appendFileSync } from "node:fs";
import { loadDataset } from "../src/dataset.ts";
import { createDataReviewReport, reviewReportSummary } from "../src/data-review.ts";

const args = process.argv.slice(2);
const options: { date?: string; warningDays?: number } = {};
for (let index = 0; index < args.length; index += 2) {
  const flag = args[index];
  const value = args[index + 1];
  if (value === undefined || (flag !== "--date" && flag !== "--warn-days"))
    throw new Error("USAGE: data:review [--date YYYY-MM-DD] [--warn-days 0..90]");
  if (flag === "--date") options.date = value;
  else options.warningDays = /^\d+$/.test(value) ? Number(value) : NaN;
}
const report = createDataReviewReport(loadDataset(), options);
console.log(JSON.stringify(report, null, 2));
if (process.env.GITHUB_STEP_SUMMARY)
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, reviewReportSummary(report));
if (report.status === "due") process.exitCode = 2;
