import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Ajv } from "ajv";
import addFormatsModule from "ajv-formats";
import {
  assignClassificationBatch, classificationBatchFromCsv, classificationBatchOutputSchema,
  parseClassificationBatch,
} from "../src/classification-batch.ts";
import { createClassificationApproval } from "../src/classification-approvals.ts";
import { proposeClassification } from "../src/classification.ts";
import { InputError } from "../src/schema.ts";
import { classificationFixtureCatalog, classificationFixtureRequest } from "./fixtures/classification.ts";
import { data } from "./helpers.ts";

const now = new Date("2026-11-18T00:00:00Z");
const csvCell = (value: string) => '"' + value.replaceAll('"', '""') + '"';

test("batch assignment keeps per-SKU results, counts and caller data separate", () => {
  const request = classificationFixtureRequest(), catalog = classificationFixtureCatalog();
  const proposal = proposeClassification(request, catalog, data, now);
  const approval = createClassificationApproval({ id: "batch-approval", request,
    requestDigest: proposal.requestDigest, ruleId: proposal.candidates[0]!.ruleId,
    validFrom: "2026-11-18", validThrough: "2026-11-25", reviewedOn: "2026-11-18", reviewBy: "2026-11-25",
    reviewerRef: "synthetic-reviewer", evidenceIds: ["synthetic-review-evidence"] }, catalog, data, now);
  const missing = structuredClone(request.product);
  missing.sku = "missing-attribute-sku"; delete missing.attributes.material;
  const input = { context: request.context, products: [request.product, missing] };
  const original = structuredClone(input);
  const result = assignClassificationBatch(input, catalog, [approval], data, now);
  assert.deepEqual(input, original);
  assert.equal(result.status, "review_required");
  assert.equal(result.counts.approved, 1);
  assert.equal(result.counts.needs_attributes, 1);
  assert.equal(result.results[0]!.classificationConfirmed, true);
  assert.equal(result.results[1]!.classificationConfirmed, false);
  assert.equal(result.results[1]!.approval, null);
  assert.deepEqual(result.results.map(item => item.sku), [request.product.sku, missing.sku]);
  const ajv = new Ajv({ strict: true });
  (addFormatsModule as unknown as (instance: Ajv) => void)(ajv);
  const validate = ajv.compile(classificationBatchOutputSchema);
  assert.ok(validate(result), JSON.stringify(validate.errors));
});

test("a batch rejects mixed merchants, duplicate SKU identities and client approvals", () => {
  const { product, context } = classificationFixtureRequest();
  for (const products of [[product, { ...product }], [product, { ...product, merchantId: "another-merchant", sku: "another-sku" }]])
    assert.throws(() => parseClassificationBatch({ context, products }, data), InputError);
  assert.throws(() => parseClassificationBatch({ context, products: [product], approvals: [] }, data), InputError);
  assert.throws(() => parseClassificationBatch({ context, products: Array.from({ length: 101 }, (_, index) => ({ ...product, sku: "sku-" + index })) }, data), InputError);
});

test("CSV imports quoted descriptions, JSON attributes, BOM, CRLF and attribute columns", () => {
  const { product, context } = classificationFixtureRequest();
  const description = 'Ceramic, "tableware"\r\nfinished item';
  const input = '\uFEFFmerchantId,sku,revision,description,attributes,attribute.intended_use\r\n' +
    [product.merchantId, product.sku, product.revision, description,
      JSON.stringify({ material: "CERAMIC", construction: "finished" }), "tableware"].map(csvCell).join(",") + '\r\n';
  const batch = classificationBatchFromCsv(input, context, data);
  assert.equal(batch.products[0]!.description, 'Ceramic, "tableware" finished item');
  assert.deepEqual(batch.products[0]!.attributes, { construction: "finished", intended_use: "tableware", material: "CERAMIC" });
  assert.ok(!("approvals" in batch));
});

test("CSV rejects malformed records and never silently drops conflicting attributes", () => {
  const { product, context } = classificationFixtureRequest();
  const prefix = [product.merchantId, product.sku, product.revision].join(",");
  const bad = [
    'merchantId,sku,revision,description\n' + prefix + ',"unfinished',
    'merchantId,sku,revision,description\n' + prefix + ',"quoted"tail',
    'merchantId,sku,revision,description\n' + prefix + ',unquoted"quote',
    'merchantId,sku,revision,description\n' + prefix,
    'merchantId,sku,revision,description,sku\n' + prefix + ',x,x',
    'merchantId,sku,revision,description,address\n' + prefix + ',x,private',
    'merchantId,sku,revision,description,attributes\n' + prefix + ',x,[]',
    'merchantId,sku,revision,description,attributes\n' + prefix + ',x,invalid-json',
    'merchantId,sku,revision,description,attributes,attribute.material\n' +
      prefix + ',x,' + csvCell('{"material":"ceramic"}') + ',plastic',
  ];
  for (const csv of bad) assert.throws(() => classificationBatchFromCsv(csv, context, data), InputError);
  assert.throws(() => classificationBatchFromCsv("x".repeat(1_048_577), context, data), InputError);
});

test("CSV formulas remain inert text and batches still require source-backed approval", () => {
  const { product, context } = classificationFixtureRequest();
  const description = '=HYPERLINK("https://example.invalid","ceramic")';
  const csv = 'merchantId,sku,revision,description,attributes\n' +
    [product.merchantId, product.sku, product.revision, description, JSON.stringify(product.attributes)].map(csvCell).join(",");
  const input = classificationBatchFromCsv(csv, context, data);
  assert.ok(input.products[0]!.description.startsWith("=HYPERLINK"));
  const result = assignClassificationBatch(input, classificationFixtureCatalog(), [], data, now);
  assert.equal(result.counts.approved, 0);
  assert.ok(result.results.every(value => !value.classificationConfirmed));
});

test("CSV and batch identities preserve Unicode SKU text including spaces and slashes", () => {
  const { product, context } = classificationFixtureRequest();
  product.sku = "品番/A 1";
  const csv = 'merchantId,sku,revision,description,attributes\n' +
    [product.merchantId, product.sku, product.revision, product.description, JSON.stringify(product.attributes)].map(csvCell).join(",");
  const batch = classificationBatchFromCsv(csv, context, data);
  assert.equal(batch.products[0]!.sku, product.sku);
  assert.throws(() => parseClassificationBatch({ ...batch, products: [product, { ...product }] }, data), InputError);
});

test("operator CSV import writes a new validated JSON file without overwriting existing data", () => {
  const directory = mkdtempSync(join(tmpdir(), "hs-classification-csv-"));
  try {
    const { product, context } = classificationFixtureRequest();
    const csv = 'merchantId,sku,revision,description,attributes\n' +
      [product.merchantId, product.sku, product.revision, product.description, JSON.stringify(product.attributes)].map(csvCell).join(",");
    const csvFile = join(directory, "input.csv"), contextFile = join(directory, "context.json"), outputFile = join(directory, "batch.json");
    writeFileSync(csvFile, csv); writeFileSync(contextFile, JSON.stringify(context));
    const script = fileURLToPath(new URL("../scripts/classification-import.ts", import.meta.url));
    execFileSync(process.execPath, [script, csvFile, contextFile, outputFile]);
    const expected = readFileSync(outputFile, "utf8");
    assert.deepEqual(JSON.parse(expected), classificationBatchFromCsv(csv, context, data));
    assert.throws(() => execFileSync(process.execPath, [script, csvFile, contextFile, outputFile], { stdio: "pipe" }));
    assert.equal(readFileSync(outputFile, "utf8"), expected);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
