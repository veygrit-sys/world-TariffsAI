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
import { routeClassificationBatch } from "../src/classification-routing.ts";
import { loadClassificationCatalog } from "../src/classification-catalog.ts";
import { createClassificationApproval, type ClassificationEvent } from "../src/classification-approvals.ts";
import { data } from "./helpers.ts";
import { classificationFixtureCatalog, classificationFixtureRequest, classificationFixtureApprovalInput,
  classificationFixtureNow as now } from "./fixtures/classification.ts";

const apiKey = "synthetic-routing-api-service-key-123456789";
const catalog = classificationFixtureCatalog();
const request = classificationFixtureRequest();
const approval = createClassificationApproval(classificationFixtureApprovalInput(catalog, request), catalog, data, now);
const batch = { context: request.context, products: [request.product] };
function handler(events: readonly ClassificationEvent[] = []) {
  return createHandler({ dataset: data, apiKey, classificationCatalog: catalog, classificationEvents: events, now: () => now });
}
function call(handle: ReturnType<typeof createHandler>, input: unknown = batch, headers: Record<string, string> = {}, method = "POST") {
  return handle(new Request("http://localhost/v1/classification/route", {
    method, headers: { authorization: "Bearer " + apiKey, "content-type": "application/json", ...headers },
    ...(method === "GET" ? {} : { body: typeof input === "string" ? input : JSON.stringify(input) }),
  }), { peer: "127.0.0.1" });
}

test("routing HTTP matches the SDK, keeps selected candidates separate and publishes its batch schema", async () => {
  const candidate = { ...request.product, sku: "candidate" };
  const missing = structuredClone(request.product);
  missing.sku = "missing"; delete missing.attributes.material;
  const unsupported = { ...request.product, sku: "unsupported", description: "Unrecorded product", attributes: {} };
  const input = { context: request.context, products: [request.product, candidate, missing, unsupported] };
  const response = await call(handler([approval]), input);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const result = await response.json();
  assert.deepEqual(result, routeClassificationBatch(input, catalog, [approval], data, now));
  assert.deepEqual(result.results.map((row: { status: string }) => row.status),
    ["assigned", "candidate_selected", "needs_attributes", "unsupported"]);
  assert.equal(result.results[1]!.assignment.hs6, null);
  assert.equal(result.results[1]!.classificationConfirmed, false);
  assert.equal(result.results[1]!.selectedCandidate!.hs6, "691200");
  assert.equal(result.shippingAuthorized, false);
  const spec = JSON.parse(readFileSync(new URL("../docs/openapi.json", import.meta.url), "utf8"));
  assert.equal(spec.paths["/v1/classification/route"].post.requestBody.content["application/json"].schema.$ref,
    "#/components/schemas/ClassificationBatchInput");
  const ajv = new Ajv({ strict: true, allowUnionTypes: true });
  (addFormatsModule as unknown as (instance: Ajv) => void)(ajv);
  const validate = ajv.compile(spec.components.schemas.ClassificationRoutingBatch);
  assert.ok(validate(result), JSON.stringify(validate.errors));
  const checkItem = ajv.compile(spec.components.schemas.ClassificationRoutingResult);
  for (const row of result.results) assert.ok(checkItem(row), JSON.stringify(checkItem.errors));
});

test("routing HTTP enforces service authentication, method, browser, body and strict batch boundaries", async () => {
  const handle = handler([approval]);
  assert.equal((await call(handle, batch, { authorization: "Bearer wrong-key" })).status, 401);
  assert.equal((await call(handle, batch, {}, "GET")).status, 405);
  assert.equal((await call(handle, batch, { origin: "https://shop.example" })).status, 403);
  assert.equal((await call(handle, batch, { "content-type": "text/plain" })).status, 415);
  for (const input of [request, { ...batch, approvals: [approval] },
    { ...batch, products: [request.product, request.product] },
    { ...batch, products: [request.product, { ...request.product, sku: "other", merchantId: "other-merchant" }] },
    { ...batch, products: Array.from({ length: 101 }, (_, index) => ({ ...request.product, sku: "sku-" + index })) }])
    assert.equal((await call(handle, input)).status, 400);
  assert.equal((await call(handle, " ".repeat(65_537))).status, 413);
  const other = { context: request.context, products: [{ ...request.product, merchantId: "other-merchant" }] };
  const result = await (await call(handle, other)).json();
  assert.equal(result.counts.assigned, 0);
  assert.equal(result.results[0].assignment.approval, null);
});

test("routing reloads protected approvals and revocations without exposing broken configuration", async () => {
  const directory = mkdtempSync(join(tmpdir(), "classification-routing-api-"));
  const path = join(directory, "reviews.json");
  const original = process.env.VEYGRIT_CLASSIFICATION_APPROVALS;
  try {
    writeFileSync(path, JSON.stringify([approval]));
    process.env.VEYGRIT_CLASSIFICATION_APPROVALS = path;
    const handle = createHandler({ dataset: data, apiKey, classificationCatalog: catalog, now: () => now });
    assert.equal((await (await call(handle)).json()).counts.assigned, 1);
    const revocation = { type: "revoked", id: "routing-revocation", approvalId: approval.id, revokedOn: "2026-11-18",
      reviewerRef: "synthetic-reviewer", evidenceIds: ["synthetic-revocation-evidence"], reason: "Product changed" };
    writeFileSync(path, JSON.stringify([approval, revocation]));
    const revoked = await (await call(handle)).json();
    assert.equal(revoked.counts.review_required, 1);
    assert.equal(revoked.results[0].selectedCandidate, null);
    assert.equal(revoked.groups.length, 0);
    writeFileSync(path, JSON.stringify([{ privateReviewerDetail: "never-expose-this-value" }]));
    const broken = await call(handle);
    assert.equal(broken.status, 500);
    assert.ok(!(await broken.text()).includes("never-expose-this-value"));
    writeFileSync(path, "[]");
    assert.equal((await (await call(handle)).json()).counts.candidate_selected, 1);
  } finally {
    if (original === undefined) delete process.env.VEYGRIT_CLASSIFICATION_APPROVALS;
    else process.env.VEYGRIT_CLASSIFICATION_APPROVALS = original;
    rmSync(directory, { recursive: true, force: true });
  }
});

test("built routing CLI and the documented example match SDK results without changing approvals", () => {
  const inputPath = fileURLToPath(new URL("../examples/classification-routing.json", import.meta.url));
  const input = JSON.parse(readFileSync(inputPath, "utf8"));
  const clock = new Date("2026-11-19T03:00:00Z");
  const expected = routeClassificationBatch(input, loadClassificationCatalog({}, data), [], data, clock);
  const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
  const env = { ...process.env, VEYGRIT_CLASSIFICATION_CATALOG: "", VEYGRIT_CLASSIFICATION_APPROVALS: "" };
  const output = execFileSync(process.execPath, [cli, "classification-route", inputPath, clock.toISOString()], { encoding: "utf8", env });
  assert.deepEqual(JSON.parse(output), expected);
  assert.equal(expected.counts.candidate_selected, 1);
  assert.equal(expected.counts.needs_attributes, 1);
  assert.equal(expected.counts.unsupported, 1);
  assert.throws(() => execFileSync(process.execPath, [cli, "classification-route", inputPath, "invalid-time"], { env, stdio: "pipe" }));
});
