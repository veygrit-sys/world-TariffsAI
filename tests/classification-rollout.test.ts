import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Ajv } from "ajv";
import addFormatsModule from "ajv-formats";
import { ClassificationCatalog } from "../src/classification-catalog.ts";
import { classificationRollout, classificationRolloutOutputSchema } from "../src/classification-rollout.ts";
import type { ClassificationRollout } from "../src/classification-rollout.ts";
import { proposeClassification } from "../src/classification.ts";
import { createHandler } from "../src/http.ts";
import { InputError } from "../src/schema.ts";
import { data } from "./helpers.ts";
import { classificationFixtureDocument, classificationFixtureRequest, classificationFixtureNow as now } from "./fixtures/classification.ts";

const catalog = new ClassificationCatalog(classificationFixtureDocument(), data);
const ajv = new Ajv({ strict: true, allowUnionTypes: true });
(addFormatsModule as unknown as (instance: Ajv) => void)(ajv);
const validate = ajv.compile<ClassificationRollout>(classificationRolloutOutputSchema);

test("rollout lists every destination once and never treats discovery links or national references as approval", () => {
  const result = classificationRollout({ limit: 250 }, catalog, data, now);
  assert.ok(validate(result), JSON.stringify(validate.errors));
  assert.equal(result.destinations.length, 250);
  assert.equal(new Set(result.destinations.map(row => row.country)).size, 250);
  assert.equal(result.totals.eligibleDestinations, 248);
  assert.deepEqual(result.totals.byStatus, { candidate_references: 1, source_review_required: 0, official_evidence_pending: 247, excluded: 2 });
  assert.ok(result.destinations.some(row => row.country === "XK"));
  const jp = result.destinations.find(row => row.country === "JP")!;
  assert.equal(jp.nationalCodeReferenceCount, 1);
  assert.equal(jp.productCoverage, "selected_examples");
  const pending = result.destinations.find(row => row.country === "DE")!;
  assert.ok(pending.discoveryReferences.length);
  assert.equal(pending.activeRuleCount, 0);
  assert.equal(pending.status, "official_evidence_pending");
  for (const code of ["KP", "AQ"]) {
    const row = result.destinations.find(row => row.country === code)!;
    assert.equal(row.status, "excluded");
    assert.deepEqual(row.discoveryReferences, []);
  }
  assert.equal(result.discoveryReferencesVerifyClassification, false);
  assert.equal(result.allProductsCovered, false);
  assert.equal(result.assignmentRequiresRecordedReview, true);
  assert.equal(result.shippingAuthorized, false);
});

test("all rollout pages form the full registry and filtered pages retain global totals", () => {
  const countries: string[] = [];
  let offset: number | null = 0;
  while (offset !== null) {
    const page = classificationRollout({ limit: 37, offset }, catalog, data, now);
    countries.push(...page.destinations.map(row => row.country));
    offset = page.nextOffset;
  }
  const all = classificationRollout({ limit: 250 }, catalog, data, now);
  assert.deepEqual(countries, all.destinations.map(row => row.country));
  const pending = classificationRollout({ market: "europe", status: "official_evidence_pending", limit: 250 }, catalog, data, now);
  assert.ok(pending.total > 0);
  assert.deepEqual(pending.totals, all.totals);
  assert.ok(pending.destinations.every(row => row.market === "europe" && row.status === "official_evidence_pending"));
  assert.deepEqual(classificationRollout({ offset: 999999 }, catalog, data, now).destinations, []);
});

test("source hold reasons agree with proposals for date, observation, direction, edition and country mismatches", () => {
  const scenarios = [
    { patch: { checkedOn: "2026-11-19" }, reason: "CLASSIFICATION_SOURCE_NOT_OBSERVED" },
    { patch: { checkedOn: "2026-11-16", reviewBy: "2026-11-17" }, reason: "CLASSIFICATION_SOURCE_REVIEW_EXPIRED" },
    { patch: { effectiveFrom: "2026-11-19" }, reason: "CLASSIFICATION_SOURCE_DATE_NOT_COVERED" },
    { patch: { direction: "export" }, reason: "CLASSIFICATION_SOURCE_SCOPE_MISMATCH" },
    { patch: { hsEdition: "HS2017" }, reason: "CLASSIFICATION_SOURCE_SCOPE_MISMATCH" },
    { patch: { countries: ["US"] }, reason: "CLASSIFICATION_SOURCE_SCOPE_MISMATCH" },
  ];
  for (const scenario of scenarios) {
    const doc = classificationFixtureDocument();
    Object.assign(doc.sources[0]!, scenario.patch);
    const heldCatalog = new ClassificationCatalog(doc, data);
    const row = classificationRollout({ country: "JP" }, heldCatalog, data, now).destinations[0]!;
    assert.equal(row.status, "source_review_required");
    assert.ok(row.holdReasons.includes(scenario.reason));
    assert.equal(row.activeRuleCount, 0);
    const proposal = proposeClassification(classificationFixtureRequest(), heldCatalog, data, now);
    assert.equal(proposal.candidates.length, 0);
    assert.ok(proposal.findings.some(finding => finding.code === scenario.reason));
  }
});

test("edition normalization and wildcard references preserve exact source scope and exclusions", () => {
  const doc = classificationFixtureDocument();
  delete doc.rules[0]!.nationalCode; delete doc.rules[0]!.tariffEdition;
  doc.rules[0]!.country = "*";
  doc.rules[0]!.hsEdition = " ＨＳ２０２２ ";
  const wild = new ClassificationCatalog(doc, data);
  const result = classificationRollout({ hsEdition: " ＨＳ２０２２ ", limit: 250 }, wild, data, now);
  assert.equal(result.hsEdition, "HS2022");
  assert.equal(result.totals.byStatus.candidate_references, 1);
  assert.equal(result.destinations.find(row => row.country === "US")!.status, "source_review_required");
  assert.equal(result.destinations.find(row => row.country === "KP")!.activeRuleCount, 0);
});

test("an expired catalog is rechecked rather than counted as covered and export scope stays independent", () => {
  const expired = classificationRollout({ date: "2026-12-19", country: "JP" }, catalog, data, new Date("2026-12-19T03:00:00Z"));
  assert.equal(expired.destinations[0]!.status, "source_review_required");
  assert.equal(expired.destinations[0]!.productCoverage, "none");
  const exports = classificationRollout({ direction: "export", country: "JP" }, catalog, data, now);
  assert.equal(exports.destinations[0]!.status, "official_evidence_pending");
});

test("rollout rejects unknown fields and countries, invalid dates, statuses and unbounded pages", () => {
  for (const input of [{ country: "ZZ" }, { date: "2026-02-29" }, { date: "2026-13-01" },
    { limit: 251 }, { limit: 0 }, { offset: -1 }, { offset: 1.5 }, { offset: 1000000 },
    { status: "approved" }, { market: "world" }, { hsEdition: "  " }, { approvals: [] }])
    assert.throws(() => classificationRollout(input, catalog, data, now), InputError);
});

test("authenticated rollout HTTP validates strict queries and its published OpenAPI response", async () => {
  const key = "synthetic-rollout-service-key-123456789";
  const handle = createHandler({ dataset: data, apiKey: key, classificationCatalog: catalog, now: () => now });
  const call = (query: string, credential = key, method = "GET") => handle(new Request("http://localhost/v1/classification/rollout" + query, {
    method, headers: { authorization: "Bearer " + credential },
  }), { peer: "127.0.0.1" });
  assert.equal((await call("", "wrong-key")).status, 401);
  assert.equal((await call("", key, "POST")).status, 405);
  for (const query of ["?limit=251", "?limit=01", "?offset=0&offset=1", "?date=bad", "?extra=1", "?status=approved"])
    assert.equal((await call(query)).status, 400, query);
  const response = await call("?country=JP&limit=1&offset=0");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const result = await response.json();
  assert.ok(validate(result), JSON.stringify(validate.errors));
  const spec = JSON.parse(readFileSync(new URL("../docs/openapi.json", import.meta.url), "utf8"));
  const check = ajv.compile<ClassificationRollout>(spec.components.schemas.ClassificationRollout);
  assert.ok(check(result), JSON.stringify(check.errors));
  assert.equal(result.destinations[0]!.country, "JP");
});

test("rollout CLI emits all destinations from the configured catalog for a reproducible reference time", () => {
  const folder = mkdtempSync(join(tmpdir(), "classification-rollout-"));
  const path = join(folder, "catalog.json");
  try {
    writeFileSync(path, JSON.stringify(classificationFixtureDocument()));
    const result = JSON.parse(execFileSync(process.execPath,
      ["src/cli.ts", "classification-rollout", "2026-11-18", "2026-11-18T03:00:00Z"],
      { cwd: new URL("../", import.meta.url), env: { ...process.env, VEYGRIT_CLASSIFICATION_CATALOG: path }, encoding: "utf8" }));
    assert.equal(result.destinations.length, 250);
    assert.equal(result.catalogVersion, "synthetic-classification-v1");
    assert.equal(result.referenceDate, "2026-11-18");
  } finally { rmSync(folder, { recursive: true, force: true }); }
});
