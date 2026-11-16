import { loadDataset, todayJst } from "../src/dataset.ts";
const data = loadDataset(),
  date = todayJst(new Date());
const due = data.sources.filter(
  (s) => s.verification === "primary_rechecked" && s.reviewBy <= date,
);
console.log(
  JSON.stringify(
    {
      date,
      ruleSetVersion: data.version,
      primarySourcesDue: due.map((s) => ({
        id: s.id,
        url: s.url,
        reviewBy: s.reviewBy,
      })),
      inheritedSourcesPendingRevalidation: data.sources.filter(
        (s) => s.verification === "inherited_research",
      ).length,
      action:
        "Review current primary law; record the reviewer, evidence and changed scope in a pull request. No automatic approval.",
    },
    null,
    2,
  ),
);
if (due.length) process.exitCode = 2;
