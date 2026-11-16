import test from "node:test";
import assert from "node:assert/strict";
import { validateDataset } from "../src/data-schema.ts";
import { currentRule } from "../src/dataset.ts";
import { data, now } from "./helpers.ts";
test("invalid source dates and rates are rejected", () => {
  const a = structuredClone(data);
  a.rules[0]!.vatBps = 10001;
  assert.throws(() => validateDataset(a));
  const b = structuredClone(data);
  b.sources[0]!.reviewBy = "2000-01-01";
  assert.throws(() => validateDataset(b));
});
test("overlapping rule records do not silently choose a tax rate", () => {
  const d = structuredClone(data);
  d.rules.push({ ...d.rules[0]! });
  assert.equal(currentRule(d, "GB_LOW_VALUE", "2026-11-11", now), null);
});
test("inherited evidence cannot enable a numeric calculation", () => {
  const d = structuredClone(data);
  d.rules[0]!.sourceIds = ["prior-J01"];
  assert.equal(currentRule(d, "GB_LOW_VALUE", "2026-11-11", now), null);
});

test("a rule and all its sources must be verified by the current date in Japan", () => {
  const importDate = "2026-11-11";
  const ruleId = "GB_LOW_VALUE";
  const beforeVerification = new Date("2026-11-10T14:59:59.999Z");
  const startOfVerification = new Date("2026-11-10T15:00:00Z");
  assert.equal(currentRule(data, ruleId, importDate, beforeVerification), null);
  assert.equal(currentRule(data, ruleId, importDate, startOfVerification)?.id, ruleId);

  const updated = structuredClone(data);
  const rule = updated.rules.find(({ id }) => id === ruleId)!;
  const source = updated.sources.find(({ id }) => id === rule.sourceIds[0])!;
  source.checkedOn = "2026-11-12";
  assert.equal(currentRule(updated, ruleId, importDate, startOfVerification), null);
  assert.equal(currentRule(updated, ruleId, importDate, new Date("2026-11-11T15:00:00Z"))?.id, ruleId);

  source.checkedOn = importDate;
  rule.checkedOn = "2026-11-12";
  assert.equal(currentRule(updated, ruleId, importDate, startOfVerification), null);
});
