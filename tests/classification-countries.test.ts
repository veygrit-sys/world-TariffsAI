import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { loadClassificationCatalog } from "../src/classification-catalog.ts";
import { proposeClassification } from "../src/classification.ts";
import { createClassificationApproval } from "../src/classification-approvals.ts";
import { createHandler } from "../src/http.ts";
import { EU_COUNTRIES } from "../src/engine.ts";
import { InputError } from "../src/schema.ts";
import type { ClassificationRequest } from "../src/classification-types.ts";
import { data } from "./helpers.ts";

interface CountryCase {
  ruleId: string;
  country: string;
  hsEdition?: string;
  description: string;
  attributes: Record<string, string>;
  wrongAttributes: Record<string, string>;
  expectedHs6: string;
}
const cases = JSON.parse(readFileSync(new URL("./fixtures/classification-countries.json", import.meta.url), "utf8")) as CountryCase[];
const catalog = loadClassificationCatalog({}, data);
const now = new Date("2026-11-18T03:00:00Z");
function request(row: CountryCase): ClassificationRequest {
  return { product: { merchantId: "country-test-merchant", sku: row.ruleId, revision: "1",
    description: row.description, attributes: { ...row.attributes } },
  context: { country: row.country, direction: "import", date: "2026-11-18", hsEdition: row.hsEdition ?? "HS2022" } };
}

test("every bundled country-specific candidate has a positive, incomplete and conflicting product case", async t => {
  const ids = new Set(cases.map(row => row.ruleId));
  assert.equal(ids.size, cases.length, "one independent product case per rule");
  assert.deepEqual([...ids].sort(), catalog.rules.map(rule => rule.id).sort());
  for (const row of cases) await t.test(row.country + ": " + row.ruleId, () => {
    const input = request(row);
    const original = structuredClone(input);
    const result = proposeClassification(input, catalog, data, now);
    assert.deepEqual(input, original);
    const candidate = result.candidates.find(value => value.ruleId === row.ruleId);
    assert.ok(candidate, JSON.stringify(result));
    assert.equal(result.status, "candidates");
    assert.equal(candidate.hs6, row.expectedHs6);
    assert.equal(candidate.nationalCode, null);
    assert.equal(candidate.eligibleForApproval, false);
    assert.equal(candidate.classificationConfirmed, false);
    assert.equal(result.classificationConfirmed, false);
    for (const id of candidate.sourceIds) assert.ok(catalog.source(id)?.countries.includes(row.country));

    const conflict = request(row);
    Object.assign(conflict.product.attributes, row.wrongAttributes);
    assert.ok(!proposeClassification(conflict, catalog, data, now).candidates.some(value => value.ruleId === row.ruleId));
    const rule = catalog.rules.find(rule => rule.id === row.ruleId)!;
    for (const missing of rule.requiredAttributes) {
      const incomplete = request(row);
      delete incomplete.product.attributes[missing];
      const held = proposeClassification(incomplete, catalog, data, now);
      const partial = held.candidates.find(value => value.ruleId === row.ruleId);
      assert.ok(partial?.missingAttributes.includes(missing), row.ruleId + ": " + missing);
      assert.ok(held.questions.some(value => value.attribute === missing), row.ruleId + ": " + missing);
      assert.equal(held.classificationConfirmed, false);
    }
    for (const attribute of Object.keys(rule.attributeConditions)) {
      const conflict = request(row);
      conflict.product.attributes[attribute] = "intentionally_conflicting_attribute_value";
      assert.ok(!proposeClassification(conflict, catalog, data, now).candidates
        .some(value => value.ruleId === row.ruleId), row.ruleId + ": " + attribute);
    }
  });
});

test("country coverage distinguishes shared EU references from unrelated country classifications", () => {
  const countries = [...new Set(catalog.rules.map(rule => rule.country))].sort();
  assert.deepEqual(countries, [...EU_COUNTRIES, "AD", "AE", "AF", "AG", "AI", "AL", "AM", "AO", "AR", "AU", "AW", "AX", "AZ", "BA", "BB", "BD", "BF", "BH", "BI", "BJ", "BM", "BN", "BO", "BQ", "BR", "BS", "BT", "BW", "BY", "BZ", "CA", "CC", "CD", "CF", "CG", "CH", "CI", "CK", "CL", "CM", "CN", "CO", "CR", "CU", "CV", "CW", "CX", "DJ", "DM", "DO", "DZ", "EC", "EG", "ER", "ET", "FJ", "FM", "FO", "GA", "GB", "GD", "GE", "GF", "GG", "GH", "GI", "GL", "GM", "GN", "GP", "GQ", "GT", "GW", "GY", "HK", "HN", "HT", "ID", "IL", "IM", "IN", "IQ", "IR", "IS", "JE", "JM", "JO", "JP", "KE", "KG", "KH", "KI", "KM", "KN", "KR", "KW", "KY", "KZ", "LA", "LB", "LC", "LI", "LK", "LR", "LS", "LY", "MA", "MC", "MD", "ME", "MF", "MG", "MH", "MK", "ML", "MM", "MN", "MO", "MP", "MQ", "MR", "MS", "MU", "MV", "MW", "MX", "MY", "MZ", "NA", "NC", "NE", "NF", "NG", "NI", "NO", "NP", "NR", "NU", "NZ", "OM", "PA", "PE", "PF", "PG", "PH", "PK", "PM", "PR", "PS", "PW", "PY", "QA", "RE", "RS", "RU", "RW", "SA", "SB", "SC", "SD", "SG", "SH", "SL", "SM", "SN", "SO", "SR", "SS", "ST", "SV", "SX", "SY", "SZ", "TC", "TD", "TG", "TH", "TJ", "TK", "TL", "TM", "TN", "TO", "TR", "TT", "TV", "TW", "TZ", "UA", "UG", "US", "UY", "UZ", "VC", "VE", "VG", "VI", "VN", "VU", "WF", "WS", "XK", "YE", "YT", "ZA", "ZM", "ZW"].sort());
  const authorities = catalog.sources.filter(source => source.id.startsWith("eu-reg-"));
  assert.equal(authorities.length, 2);
  for (const source of authorities) assert.deepEqual([...source.countries].sort(), [...EU_COUNTRIES, "AD", "AX", "GF", "GP", "MC", "MF", "MQ", "RE", "SM", "YT"].sort());
  for (const row of cases.filter(row => row.country !== "JP")) {
    const input = request(row); input.context.country = "JP";
    assert.ok(!proposeClassification(input, catalog, data, now).candidates.some(value => value.ruleId === row.ruleId));
  }
});

test("every country rejects reference-only approval and mismatched direction, edition or dates", () => {
  for (const country of new Set(cases.map(row => row.country))) {
    const row = cases.find(value => value.country === country)!;
    const input = request(row);
    const proposed = proposeClassification(input, catalog, data, now);
    assert.throws(() => createClassificationApproval({ id: "reference-only-approval", request: input,
      requestDigest: proposed.requestDigest, ruleId: row.ruleId, validFrom: "2026-11-18", validThrough: "2026-11-25",
      reviewedOn: "2026-11-18", reviewBy: "2026-11-25", reviewerRef: "country-test-reviewer", evidenceIds: ["reference-case"] },
    catalog, data, now), error => error instanceof InputError &&
      error.issues.some(issue => issue.code === "CLASSIFICATION_REVIEWABLE_CODE_REQUIRED"));
    input.context.direction = "export";
    assert.equal(proposeClassification(input, catalog, data, now).candidates.length, 0);
    input.context.direction = "import"; input.context.hsEdition = "UNRECORDED-CLASSIFICATION-EDITION";
    assert.equal(proposeClassification(input, catalog, data, now).candidates.length, 0);
    input.context.hsEdition = row.hsEdition ?? "HS2022"; input.context.date = "2026-12-19";
    assert.equal(proposeClassification(input, catalog, data, new Date("2026-12-19T03:00:00Z")).candidates.length, 0);
  }
});

test("loaded-country API exposes expanded reference scope and keeps domestic auto-approval separate", async () => {
  const apiKey = "synthetic-country-coverage-key-123456789";
  const handle = createHandler({ dataset: data, apiKey, classificationCatalog: catalog, now: () => now });
  const response = await handle(new Request("http://localhost/v1/classification/coverage", {
    headers: { authorization: "Bearer " + apiKey },
  }), { peer: "127.0.0.1" });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.countries.length, 234);
  assert.equal(result.ruleCount, cases.length);
  assert.equal(result.nationalCodeRuleCount, 0);
  assert.equal(result.assignmentRequiresRecordedReview, true);
  assert.equal(result.shippingAuthorized, false);
});
