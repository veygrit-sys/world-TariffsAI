import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Ajv } from "ajv";
import addFormatsModule from "ajv-formats";
import { createHandler } from "../src/http.ts";
import { releaseReadiness } from "../src/release-readiness.ts";
import { loadTariffCatalog } from "../src/tariffs.ts";
import { data } from "./helpers.ts";

const now = new Date("2026-11-18T00:00:00Z");
const apiKey = "synthetic-readiness-api-key-1234567890";
const record = {
  route: "JP-US",
  orderId: "synthetic-order-reference-0001",
  datasetVersion: data.version,
  tariffManifestSha256: loadTariffCatalog(data).manifestSha256(),
  checkout: {
    status: "validated", evidenceId: "synthetic-checkout-reference-0001",
    reviewerRef: "synthetic-reviewer-reference-0001", reviewedOn: "2026-11-17",
  },
  customsHandoff: {
    status: "validated", evidenceId: "synthetic-declaration-reference-0001",
    reviewerRef: "synthetic-reviewer-reference-0001", reviewedOn: "2026-11-17",
  },
  invoiceReconciliation: {
    status: "validated", evidenceId: "synthetic-invoice-reference-0001",
    reviewerRef: "synthetic-reviewer-reference-0001", reviewedOn: "2026-11-17",
  },
};

test("the authenticated readiness API reports reviewed stages without publishing private references", async () => {
  const handle = createHandler({ dataset: data, apiKey, now: () => now, liveValidationRecords: [record] });
  const url = "http://localhost/v1/release-readiness";
  const context = { peer: "127.0.0.1" };
  assert.equal((await handle(new Request(url), context)).status, 401);
  const response = await handle(new Request(url, { headers: { authorization: "Bearer " + apiKey } }), context);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const result = await response.json() as ReturnType<typeof releaseReadiness>;
  assert.equal(result.productionVerifiedRouteCount, 1);
  assert.equal(result.routes.find(({ route }) => route === "JP-US")?.invoiceReconciliation, "validated");
  assert.ok(result.routes.every(({ productionAuthorized }) => productionAuthorized === false));
  const output = JSON.stringify(result);
  for (const reference of [record.orderId, record.checkout.evidenceId, record.checkout.reviewerRef])
    assert.ok(!output.includes(reference));

  const spec = JSON.parse(readFileSync(new URL("../docs/openapi.json", import.meta.url), "utf8"));
  const schema = spec.paths["/v1/release-readiness"].get.responses["200"].content["application/json"].schema;
  const ajv = new Ajv({ strict: true, allowUnionTypes: true });
  (addFormatsModule as unknown as (instance: Ajv) => void)(ajv);
  const validate = ajv.compile(schema);
  assert.ok(validate(result), JSON.stringify(validate.errors));
});

test("a configured future review record cannot be reported as completed through HTTP", async () => {
  const future = structuredClone(record);
  future.checkout.reviewedOn = "2026-11-19";
  const handle = createHandler({ dataset: data, apiKey, now: () => now, liveValidationRecords: [future] });
  const response = await handle(new Request("http://localhost/v1/release-readiness", {
    headers: { authorization: "Bearer " + apiKey },
  }), { peer: "127.0.0.1" });
  assert.equal(response.status, 500);
  assert.ok(!JSON.stringify(await response.json()).includes(record.orderId));
});
