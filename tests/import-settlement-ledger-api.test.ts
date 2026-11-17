import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Ajv } from "ajv";
import addFormatsModule from "ajv-formats";
import { createHandler } from "../src/http.ts";
import { reconcileImportSettlementLedger } from "../src/import-settlement-ledger.ts";
import { ledgerFixture } from "./fixtures/import-settlement-ledger.ts";
import { data } from "./helpers.ts";

const now = new Date("2026-11-18T00:00:00Z");
const apiKey = "synthetic-ledger-api-key-123456789012345";
const url = "http://localhost/v1/import-settlement/ledger";
const handle = createHandler({ dataset: data, apiKey, now: () => now });
async function request(input: unknown, key = apiKey, method = "POST") {
  return handle(new Request(url, {
    method,
    headers: { authorization: "Bearer " + key, "content-type": "application/json" },
    ...(method === "POST" ? { body: JSON.stringify(input) } : {}),
  }), { peer: "127.0.0.1" });
}

test("ledger HTTP preserves SDK results and the published OpenAPI contract", async () => {
  const input = ledgerFixture();
  const first = reconcileImportSettlementLedger(input, now, data);
  assert.equal(first.status, "needs_review");
  input.varianceReview = { ledgerDigest: first.ledgerDigest, evidenceId: "synthetic-variance-evidence",
    reviewerRef: "synthetic-reviewer", reviewedOn: "2026-11-18" };
  const response = await request(input);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const result = await response.json();
  assert.deepEqual(result, reconcileImportSettlementLedger(input, now, data));
  assert.equal(result.status, "reconciled");
  assert.equal(result.totals.adjustedInvoiced, "280");
  assert.equal(result.totals.customsTax, "260");
  assert.equal(result.totals.balance, "0");
  assert.equal(result.shippingAuthorized, false);
  assert.equal(result.productionAuthorized, false);

  const spec = JSON.parse(readFileSync(new URL("../docs/openapi.json", import.meta.url), "utf8"));
  assert.equal(spec.paths["/v1/import-settlement/ledger"].post.requestBody.content["application/json"].schema.$ref,
    "#/components/schemas/ImportSettlementLedgerInput");
  const ajv = new Ajv({ strict: true, allowUnionTypes: true });
  (addFormatsModule as unknown as (instance: Ajv) => void)(ajv);
  for (const [schema, value] of [["ImportSettlementLedgerInput", input], ["ImportSettlementLedger", result]] as const) {
    const validate = ajv.compile(spec.components.schemas[schema]);
    assert.ok(validate(value), JSON.stringify(validate.errors));
  }
});

test("ledger HTTP enforces authentication, method, size and strict fields", async () => {
  const input = ledgerFixture();
  assert.equal((await request(input, "invalid-service-key")).status, 401);
  assert.equal((await request(input, apiKey, "GET")).status, 405);
  const invalid = await request({ ...input, unauthorizedField: true });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.headers.get("cache-control"), "no-store");
  assert.equal((await request({ padding: "x".repeat(65536) })).status, 413);
});

test("the built CLI reconciles the documented multi-parcel FX/refund example", () => {
  const exampleUrl = new URL("../examples/import-settlement-ledger.json", import.meta.url);
  const input = JSON.parse(readFileSync(exampleUrl, "utf8"));
  const output = execFileSync(process.execPath, [
    fileURLToPath(new URL("../dist/cli.js", import.meta.url)), "import-settlement-ledger",
    fileURLToPath(exampleUrl), now.toISOString(),
  ], { encoding: "utf8" });
  assert.deepEqual(JSON.parse(output), reconcileImportSettlementLedger(input, now, data));
});
