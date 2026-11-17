import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Ajv } from "ajv";
import addFormatsModule from "ajv-formats";
import { ClassificationCatalog, loadClassificationCatalog } from "../src/classification-catalog.ts";
import {
  classificationContextDigest, parseClassificationRequest, productFingerprint, proposeClassification,
} from "../src/classification.ts";
import { classificationProposalSchema } from "../src/classification-types.ts";
import { InputError } from "../src/schema.ts";
import {
  classificationFixtureCatalog, classificationFixtureDocument, classificationFixtureNow as now,
  classificationFixtureRequest,
} from "./fixtures/classification.ts";
import { data } from "./helpers.ts";

const propose = (request = classificationFixtureRequest(), catalog = classificationFixtureCatalog(), clock = now) =>
  proposeClassification(request, catalog, data, clock);

test("complete grounded references produce an eligible candidate without confirming a classification", () => {
  const request = classificationFixtureRequest();
  const before = structuredClone(request);
  const result = propose(request);
  assert.equal(result.status, "candidates");
  assert.equal(result.classificationConfirmed, false);
  assert.equal(result.candidates[0]?.hs6, "691200");
  assert.equal(result.candidates[0]?.nationalCode, "691200100");
  assert.equal(result.candidates[0]?.eligibleForApproval, true);
  assert.equal(result.candidates[0]?.classificationConfirmed, false);
  assert.deepEqual(result.candidates[0]?.matchedAttributes, ["construction", "intended_use", "material"]);
  assert.equal(result.questions.length, 0);
  assert.deepEqual(request, before);
});

test("missing attributes produce distinguishing questions and conflicting attributes exclude a rule", () => {
  const request = classificationFixtureRequest();
  request.product.attributes = { material: "ceramic" };
  const result = propose(request);
  assert.equal(result.status, "needs_attributes");
  assert.equal(result.candidates[0]?.eligibleForApproval, false);
  assert.deepEqual(result.questions.map(({ attribute }) => attribute), ["construction", "intended_use"]);
  request.product.attributes.material = "steel";
  assert.equal(propose(request).status, "unsupported");
});

test("candidates need a relevant search term; unknown product facts are never guessed", () => {
  const request = classificationFixtureRequest();
  request.product.description = "Ceramic plate";
  assert.equal(propose(request).status, "unsupported");
  request.product.description = "Scupper detail";
  request.product.attributes = {};
  assert.equal(propose(request).candidates.length, 0, "English keyword boundaries must not match cup inside scupper");
});

test("exact attribute conditions preserve case-sensitive units and chemical formulas", () => {
  for (const [expected, actual] of [["1mW", "1MW"], ["CO", "Co"]]) {
    const document = classificationFixtureDocument();
    document.rules[0]!.requiredAttributes.push("specification");
    document.rules[0]!.attributeConditions.specification = [expected!];
    const request = classificationFixtureRequest(); request.product.attributes.specification = expected!;
    const catalog = new ClassificationCatalog(document);
    assert.equal(propose(request, catalog).candidates[0]?.eligibleForApproval, true);
    request.product.attributes.specification = actual!;
    assert.equal(propose(request, catalog).candidates.length, 0);
  }
});

test("ranking is deterministic, limited to three distinct mappings, and independent of source order", () => {
  const document = classificationFixtureDocument();
  const first = document.rules[0]!;
  document.rules = ["d", "b", "c", "a"].map((suffix, index) => ({
    ...structuredClone(first), id: "synthetic-" + suffix, nationalCode: "69120010" + index,
  }));
  const result = propose(classificationFixtureRequest(), new ClassificationCatalog(document));
  assert.equal(result.candidates.length, 3);
  assert.deepEqual(result.candidates.map(({ ruleId }) => ruleId), ["synthetic-a", "synthetic-b", "synthetic-c"]);
});

test("multiple alternative rules cannot exceed the public question response bound", () => {
  const document = classificationFixtureDocument();
  const base = document.rules[0]!;
  document.rules = [0, 1, 2].map((index) => ({
    ...structuredClone(base), id: "question-rule-" + index, nationalCode: "69120010" + index,
    requiredAttributes: Array.from({ length: 50 }, (_, attr) => `attribute_${index}_${attr}`),
    attributeConditions: {}, questions: {},
  }));
  const request = classificationFixtureRequest(); request.product.attributes = {};
  const result = propose(request, new ClassificationCatalog(document));
  assert.equal(result.candidates.length, 3);
  assert.equal(result.questions.length, 50);
  assert.equal(result.candidates.reduce((count, candidate) => count + candidate.missingAttributes.length, 0), 150);
  const ajv = new Ajv({ strict: true });
  (addFormatsModule as unknown as (instance: Ajv) => void)(ajv);
  const validate = ajv.compile(classificationProposalSchema);
  assert.ok(validate(result), JSON.stringify(validate.errors));
});

test("HS6-only rulings remain reference candidates even when all attributes are present", () => {
  const document = classificationFixtureDocument();
  document.sources[0]!.kind = "classification_ruling";
  delete document.rules[0]!.nationalCode;
  delete document.rules[0]!.tariffEdition;
  const result = propose(classificationFixtureRequest(), new ClassificationCatalog(document));
  assert.equal(result.status, "candidates");
  assert.equal(result.candidates[0]?.nationalCode, null);
  assert.equal(result.candidates[0]?.eligibleForApproval, false);
});

test("a national code with only ruling evidence is not eligible for approval", () => {
  const document = classificationFixtureDocument();
  document.sources[0]!.kind = "classification_ruling";
  assert.equal(propose(classificationFixtureRequest(), new ClassificationCatalog(document)).candidates[0]?.eligibleForApproval, false);
});

test("country, trade direction and HS edition isolate classifications", () => {
  for (const context of [{ country: "US" }, { direction: "export" as const }, { hsEdition: "HS2017" }]) {
    const request = classificationFixtureRequest();
    Object.assign(request.context, context);
    assert.equal(propose(request).status, "unsupported");
  }
  for (const country of ["KP", "AQ"]) {
    const request = classificationFixtureRequest(); request.context.country = country;
    assert.equal(propose(request).findings[0]?.code, "CLASSIFICATION_COUNTRY_EXCLUDED");
  }
});

test("source mismatch, expired review, unobserved confirmations and uncovered dates fail closed", () => {
  const cases = [
    { patch: { countries: ["US"] }, code: "CLASSIFICATION_SOURCE_SCOPE_MISMATCH" },
    { patch: { direction: "export" as const }, code: "CLASSIFICATION_SOURCE_SCOPE_MISMATCH" },
    { patch: { hsEdition: "HS2017" }, code: "CLASSIFICATION_SOURCE_SCOPE_MISMATCH" },
    { patch: { checkedOn: "2026-11-17", reviewBy: "2026-11-17" }, code: "CLASSIFICATION_SOURCE_REVIEW_EXPIRED" },
    { patch: { checkedOn: "2026-11-19" }, code: "CLASSIFICATION_SOURCE_NOT_OBSERVED" },
    { patch: { effectiveFrom: "2026-11-19" }, code: "CLASSIFICATION_SOURCE_DATE_NOT_COVERED" },
  ];
  for (const { patch, code } of cases) {
    const document = classificationFixtureDocument(); Object.assign(document.sources[0]!, patch);
    const result = propose(classificationFixtureRequest(), new ClassificationCatalog(document));
    assert.equal(result.status, "review_required");
    assert.ok(result.findings.some((finding) => finding.code === code), JSON.stringify(result));
    assert.equal(result.candidates.length, 0);
  }
});

test("source review boundaries use JST and reject an import after the review window", () => {
  const document = classificationFixtureDocument();
  document.sources[0]!.reviewBy = "2026-11-18";
  const catalog = new ClassificationCatalog(document);
  assert.equal(propose(classificationFixtureRequest(), catalog, new Date("2026-11-18T14:59:59Z")).status, "candidates");
  assert.equal(propose(classificationFixtureRequest(), catalog, new Date("2026-11-18T15:00:00Z")).status, "review_required");
  const request = classificationFixtureRequest(); request.context.date = "2026-11-19";
  assert.equal(propose(request, catalog).status, "review_required");
});

test("fingerprints normalize equivalent text and preserve identities, revisions and changed facts", () => {
  const request = classificationFixtureRequest();
  const equivalent = structuredClone(request);
  equivalent.product.description = "  Ｃｅｒａｍｉｃ　ｃｕｐ ";
  equivalent.product.attributes = { construction: " finished ", intended_use: "tableware", material: " ceramic " };
  assert.equal(productFingerprint(request.product), productFingerprint(equivalent.product));
  for (const patch of [{ merchantId: "another" }, { sku: "another" }, { revision: "v2" }]) {
    const changed = structuredClone(request.product); Object.assign(changed, patch);
    assert.notEqual(productFingerprint(request.product), productFingerprint(changed));
  }
  equivalent.product.attributes.material = "glass";
  assert.notEqual(productFingerprint(request.product), productFingerprint(equivalent.product));
  const unit = structuredClone(request.product); unit.attributes.power = "1mW";
  const changedUnit = structuredClone(unit); changedUnit.attributes.power = "1MW";
  assert.notEqual(productFingerprint(unit), productFingerprint(changedUnit));
  unit.attributes.formula = "CO"; changedUnit.attributes.power = "1mW"; changedUnit.attributes.formula = "Co";
  assert.notEqual(productFingerprint(unit), productFingerprint(changedUnit));
  assert.notEqual(classificationContextDigest(request.context), classificationContextDigest({ ...request.context, direction: "export" }));
});

test("reserved and inherited dictionary properties never fulfill product requirements", () => {
  const request = classificationFixtureRequest();
  request.product.attributes = Object.assign(Object.create({ material: "ceramic" }) as Record<string, string>, {
    intended_use: "tableware", construction: "finished",
  });
  const result = propose(request);
  assert.equal(result.status, "needs_attributes");
  assert.deepEqual(result.candidates[0]?.missingAttributes, ["material"]);
  assert.equal(result.candidates[0]?.eligibleForApproval, false);
  for (const attribute of ["constructor", "prototype", "__proto__"]) {
    const invalid = classificationFixtureRequest();
    invalid.product.attributes = JSON.parse(JSON.stringify({ [attribute]: "ceramic" }));
    assert.throws(() => propose(invalid), InputError);
    const document = classificationFixtureDocument();
    document.rules[0]!.requiredAttributes.push(attribute);
    assert.throws(() => new ClassificationCatalog(document), InputError);
  }
});

test("invalid product shapes, unsupported countries and unprovided empty facts are rejected", () => {
  const request = classificationFixtureRequest();
  for (const input of [{ ...request, extra: true }, { ...request, product: { ...request.product, attributes: { material: " " } } },
    { ...request, context: { ...request.context, country: "ZZ" } }])
    assert.throws(() => parseClassificationRequest(input, data), InputError);
});

test("Unicode merchant SKUs preserve exact identity while control-only or blank values are rejected", () => {
  const request = classificationFixtureRequest(); request.product.sku = "陶器 カップ/001";
  assert.equal(parseClassificationRequest(request, data).product.sku, "陶器 カップ/001");
  assert.equal(propose(request).sku, "陶器 カップ/001");
  assert.notEqual(productFingerprint(request.product), productFingerprint({ ...request.product, sku: "陶器 カップ/001 " }));
  for (const sku of [" ", "\n", "cup\u0000sku", "cup\u0085sku"]) {
    request.product.sku = sku;
    assert.throws(() => parseClassificationRequest(request, data), InputError);
  }
});

test("catalog rejects broken references, duplicate identities and ambiguous national mappings", () => {
  const cases = [
    (document: ReturnType<typeof classificationFixtureDocument>) => { document.rules[0]!.sourceIds = ["missing"]; },
    (document: ReturnType<typeof classificationFixtureDocument>) => { document.rules.push(structuredClone(document.rules[0]!)); },
    (document: ReturnType<typeof classificationFixtureDocument>) => { document.sources.push(structuredClone(document.sources[0]!)); },
    (document: ReturnType<typeof classificationFixtureDocument>) => { document.rules[0]!.nationalCode = "701337000"; },
    (document: ReturnType<typeof classificationFixtureDocument>) => { document.rules[0]!.country = "*"; },
    (document: ReturnType<typeof classificationFixtureDocument>) => { document.rules[0]!.direction = "both"; },
    (document: ReturnType<typeof classificationFixtureDocument>) => { delete document.rules[0]!.tariffEdition; },
  ];
  for (const mutate of cases) {
    const document = classificationFixtureDocument(); mutate(document);
    assert.throws(() => new ClassificationCatalog(document), InputError);
  }
});

test("catalog snapshots are immutable and their digest changes when reviewed data changes", () => {
  const document = classificationFixtureDocument();
  const catalog = new ClassificationCatalog(document);
  document.rules[0]!.rationale = "changed";
  assert.notEqual(catalog.rules[0]?.rationale, "changed");
  assert.notEqual(catalog.digest, new ClassificationCatalog(document).digest);
  assert.throws(() => { catalog.rules[0]!.rationale = "mutated"; }, TypeError);
});

test("operator catalog loading validates configured files and preserves the public response schema", () => {
  const directory = mkdtempSync(join(tmpdir(), "classification-catalog-"));
  try {
    const file = join(directory, "catalog.json");
    writeFileSync(file, JSON.stringify(classificationFixtureDocument()));
    const catalog = loadClassificationCatalog({ VEYGRIT_CLASSIFICATION_CATALOG: file }, data);
    const ajv = new Ajv({ strict: true });
    (addFormatsModule as unknown as (instance: Ajv) => void)(ajv);
    const validate = ajv.compile(classificationProposalSchema);
    assert.ok(validate(propose(classificationFixtureRequest(), catalog)), JSON.stringify(validate.errors));
    writeFileSync(file, "{}");
    assert.throws(() => loadClassificationCatalog({ VEYGRIT_CLASSIFICATION_CATALOG: file }, data), InputError);
    assert.throws(() => loadClassificationCatalog({ VEYGRIT_CLASSIFICATION_CATALOG: join(directory, "missing.json") }, data));
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("blank optional catalog settings use the bundled reference catalog", () => {
  const bundled = loadClassificationCatalog({}, data);
  assert.equal(loadClassificationCatalog({ VEYGRIT_CLASSIFICATION_CATALOG: "" }, data).digest, bundled.digest);
  assert.equal(loadClassificationCatalog({ VEYGRIT_CLASSIFICATION_CATALOG: "  " }, data).digest, bundled.digest);
});
