import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { classificationBatchFromCsv } from "../src/classification-batch.ts";
import { ClassificationCatalog, loadClassificationCatalog } from "../src/classification-catalog.ts";
import { loadDataset } from "../src/dataset.ts";
import { validateTariffImport } from "../src/tariffs.ts";
import { intakeReport, mergedCatalog, prepareReference } from "../scripts/jp-stationery-intake.ts";

const base = loadClassificationCatalog({});
const catalog = new ClassificationCatalog(mergedCatalog(base));
const files = new URL("../examples/jp-stationery/", import.meta.url);
const read = (name: string) => readFileSync(new URL(name, files), "utf8");
const context = JSON.parse(read("context.json"));
const batch = () => classificationBatchFromCsv(read("skus.csv"), context);
const asOf = new Date("2026-11-25T03:00:00+09:00");

test("ten synthetic SKUs select five dated national references; approvals remain independent", () => {
  const run = intakeReport(batch(), catalog, [], asOf);
  assert.deepEqual(run.items.map(item => item.candidate?.nationalCode), [
    "960820000", "960820000", "960820000", "960910010", "960910010",
    "960910090", "960910090", "960920000", "960920000", "961100000",
  ]);
  assert.equal(run.counts.candidate_selected, 10);
  assert.equal(run.items.every(item => !item.classificationConfirmed && item.approvedCode === null), true);
  assert.equal(catalog.rules.length, base.rules.length + 5);
  const pack = validateTariffImport(JSON.parse(read("tariff-source.json")), JSON.parse(read("tariff-lines.json")), loadDataset());
  assert.deepEqual([...new Set(run.items.map(item => item.candidate?.nationalCode))].sort(), pack.lines.map(line => line.code).sort());
  assert.equal(pack.source.availableFrom, pack.source.availableThrough);
  const black = pack.lines.find(line => line.code === "960910010")!;
  assert.equal(black.rateCode, "960910");
  assert.deepEqual(black.rates.map(rate => rate.expression), ["無税", "(無税)"]);
});

test("missing or conflicting facts require questions even if the product text contains an answer", () => {
  const data = batch();
  const black = data.products[3]!;
  // A text-source conflict remains visible and cannot fill the structured field.
  delete black.attributes.core_color;
  black.description += "芯色：青色。";
  const item = intakeReport(data, catalog, [], asOf).items[3]!;
  assert.equal(item.status, "needs_attributes");
  assert.equal(item.candidate, null);
  const hints = item.questions.find(q => q.attribute === "core_color")!.specificationExcerpts;
  assert.deepEqual(hints, ["芯色:黒色", "芯色：青色"]);
  assert.equal(black.attributes.core_color, undefined);
});

test("kits, unsupported materials and stale catalog sources cannot select a domestic code", () => {
  const data = batch();
  data.products[0]!.attributes.presentation = "他の商品とのセット";
  data.products[3]!.attributes.construction = "芯を繰り出す機構";
  const report = intakeReport(data, catalog, [], asOf);
  assert.equal(report.items[0]!.status, "unsupported");
  assert.equal(report.items[3]!.status, "unsupported");
  const expired = intakeReport(batch(), catalog, [], new Date("2026-12-03T00:05:00+09:00"));
  assert.equal(expired.items.every(item => item.status === "review_required" && item.candidate === null), true);
  assert.throws(() => prepareReference(Buffer.from("wrong chapter bytes"), base), /JP_SOURCE_DIGEST_MISMATCH/);
});
