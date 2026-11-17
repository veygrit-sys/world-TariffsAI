import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Ajv } from "ajv";
import addFormatsModule from "ajv-formats";
import { createHandler } from "../src/http.ts";
import { proposeClassification } from "../src/classification.ts";
import { loadClassificationCatalog } from "../src/classification-catalog.ts";
import { createClassificationApproval, type ClassificationEvent } from "../src/classification-approvals.ts";
import { data } from "./helpers.ts";
import { classificationFixtureCatalog, classificationFixtureRequest, classificationFixtureApprovalInput,
  classificationFixtureNow as now } from "./fixtures/classification.ts";

const apiKey = "synthetic-classification-api-service-key-123456";
const catalog = classificationFixtureCatalog();
const request = classificationFixtureRequest();
const approval = createClassificationApproval(classificationFixtureApprovalInput(catalog, request), catalog, data, now);
function handler(events: readonly ClassificationEvent[] = [approval]) {
  return createHandler({ dataset: data, apiKey, classificationCatalog: catalog, classificationEvents: events, now: () => now });
}
async function call(handle: ReturnType<typeof createHandler>, path: string, input?: unknown, key = apiKey) {
  return handle(new Request("http://localhost/v1/classification/" + path, {
    method: input === undefined ? "GET" : "POST",
    headers: { authorization: "Bearer " + key, "content-type": "application/json" },
    ...(input === undefined ? {} : { body: JSON.stringify(input) }),
  }), { peer: "127.0.0.1" });
}
function validates(schemaName: string, value: unknown) {
  const spec = JSON.parse(readFileSync(new URL("../docs/openapi.json", import.meta.url), "utf8"));
  const ajv = new Ajv({ strict: true, allowUnionTypes: true });
  (addFormatsModule as unknown as (instance: Ajv) => void)(ajv);
  const validate = ajv.compile(spec.components.schemas[schemaName]);
  assert.ok(validate(value), JSON.stringify(validate.errors));
}

test("classification HTTP keeps proposals unconfirmed and applies protected approvals through the published schemas", async () => {
  const handle = handler();
  const proposed = await call(handle, "propose", request);
  assert.equal(proposed.status, 200);
  assert.equal(proposed.headers.get("cache-control"), "no-store");
  const proposal = await proposed.json();
  assert.equal(proposal.classificationConfirmed, false);
  assert.deepEqual(proposal, proposeClassification(request, catalog, data, now));
  validates("ClassificationProposal", proposal);
  const response = await call(handle, "assign", request);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.status, "approved");
  assert.equal(result.classificationConfirmed, true);
  assert.equal(result.nationalCode, "691200100");
  validates("ClassificationAssignment", result);
  const batch = await call(handle, "batch", { context: request.context, products: [request.product] });
  const batched = await batch.json();
  assert.equal(batch.status, 200);
  assert.equal(batched.counts.approved, 1);
  validates("ClassificationBatch", batched);
});

test("classification HTTP rejects injected approvals, cross-merchant reuse and missing authentication", async () => {
  assert.equal((await call(handler(), "assign", request, "wrong-key")).status, 401);
  assert.equal((await call(handler(), "assign", { ...request, approvals: [approval] })).status, 400);
  assert.equal((await call(handler(), "assign")).status, 405);
  const other = structuredClone(request); other.product.merchantId = "another-merchant";
  const result = await (await call(handler(), "assign", other)).json();
  assert.equal(result.classificationConfirmed, false);
  assert.notEqual(result.status, "approved");
  assert.equal((await call(handler(), "batch", { context: request.context, products: [request.product, request.product] })).status, 400);
});

test("protected history is reloaded and malformed configuration is an internal failure without private details", async () => {
  const root = mkdtempSync(join(tmpdir(), "classification-http-"));
  const path = join(root, "reviews.json");
  const original = process.env.VEYGRIT_CLASSIFICATION_APPROVALS;
  try {
    writeFileSync(path, JSON.stringify([approval]));
    process.env.VEYGRIT_CLASSIFICATION_APPROVALS = path;
    const handle = createHandler({ dataset: data, apiKey, classificationCatalog: catalog, now: () => now });
    assert.equal((await (await call(handle, "assign", request)).json()).status, "approved");
    writeFileSync(path, "[]");
    assert.equal((await (await call(handle, "assign", request)).json()).classificationConfirmed, false);
    writeFileSync(path, JSON.stringify([{ privateOperatorReference: "must-not-be-exposed" }]));
    const failure = await call(handle, "assign", request);
    assert.equal(failure.status, 500);
    assert.ok(!(await failure.text()).includes("must-not-be-exposed"));
    assert.equal((await call(handle, "propose", request)).status, 200);
  } finally {
    if (original === undefined) delete process.env.VEYGRIT_CLASSIFICATION_APPROVALS;
    else process.env.VEYGRIT_CLASSIFICATION_APPROVALS = original;
    rmSync(root, { recursive: true, force: true });
  }
});

test("classification references resolve to source URLs with bounded strict pagination", async () => {
  const handle = handler();
  const response = await call(handle, "sources?limit=1&offset=0");
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.sources[0].id, catalog.sources[0]!.id);
  assert.equal(result.sources[0].url, catalog.sources[0]!.url);
  assert.equal((await call(handle, "sources?limit=101")).status, 400);
  assert.equal((await call(handle, "sources?limit=1&limit=2")).status, 400);
  const scope = await (await call(handle, "coverage")).json();
  assert.equal(scope.nationalCodeRuleCount, 1);
  assert.equal(scope.assignmentRequiresRecordedReview, true);
});

test("bundled references ask material questions and built CLI remains compatible with the SDK", () => {
  const inputPath = new URL("../examples/classification-propose.json", import.meta.url);
  const input = JSON.parse(readFileSync(inputPath, "utf8"));
  const expected = proposeClassification(input, loadClassificationCatalog({}), data, now);
  assert.equal(expected.status, "needs_attributes");
  assert.equal(expected.candidates.length, 2);
  assert.ok(expected.candidates.every(candidate => !candidate.eligibleForApproval && candidate.nationalCode === null));
  assert.ok(expected.questions.some(question => question.attribute === "essential_material"));
  const output = execFileSync(process.execPath, [fileURLToPath(new URL("../dist/cli.js", import.meta.url)),
    "classification-propose", fileURLToPath(inputPath), now.toISOString()], {
    encoding: "utf8", env: { ...process.env, VEYGRIT_CLASSIFICATION_CATALOG: "", VEYGRIT_CLASSIFICATION_APPROVALS: "" },
  });
  assert.deepEqual(JSON.parse(output), expected);
});
