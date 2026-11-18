import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Ajv } from "ajv";
import addFormatsModule from "ajv-formats";
import { ClassificationCatalog, loadClassificationCatalog } from "../src/classification-catalog.ts";
import { createClassificationApproval } from "../src/classification-approvals.ts";
import type { ClassificationEvent } from "../src/classification-approvals.ts";
import { proposeClassification } from "../src/classification.ts";
import {
  classificationRoutingBatchOutputSchema, classificationRoutingResultSchema, classificationRoutingStatuses,
  routeClassification, routeClassificationBatch,
} from "../src/classification-routing.ts";
import type { ClassificationCatalogDocument, ClassificationRequest, ClassificationRule } from "../src/classification-types.ts";
import { InputError } from "../src/schema.ts";
import {
  classificationFixtureApprovalInput, classificationFixtureCatalog, classificationFixtureDocument,
  classificationFixtureNow as now, classificationFixtureRequest,
} from "./fixtures/classification.ts";
import { data } from "./helpers.ts";

const ajv = new Ajv({ strict: true, allowUnionTypes: true });
(addFormatsModule as unknown as (instance: Ajv) => void)(ajv);
const validateResult = ajv.compile(classificationRoutingResultSchema);
const validateBatch = ajv.compile(classificationRoutingBatchOutputSchema);
const route = (request = classificationFixtureRequest(), catalog = classificationFixtureCatalog(), events: readonly ClassificationEvent[] = [], clock = now) =>
  routeClassification(request, catalog, events, data, clock);
function approval(catalog = classificationFixtureCatalog(), request = classificationFixtureRequest()) {
  return createClassificationApproval(classificationFixtureApprovalInput(catalog, request), catalog, data, now);
}
function extraRule(document: ClassificationCatalogDocument, patch: Partial<ClassificationRule>) {
  const result = { ...structuredClone(document.rules[0]!), ...patch };
  document.rules.push(result);
  return result;
}

test("a unique complete mapping is selected separately from an approved assignment", () => {
  const request = classificationFixtureRequest(), catalog = classificationFixtureCatalog();
  const before = structuredClone(request);
  const selected = route(request, catalog);
  assert.ok(validateResult(selected), JSON.stringify(validateResult.errors));
  assert.equal(selected.status, "candidate_selected");
  assert.equal(selected.selectedCandidate?.ruleId, catalog.rules[0]!.id);
  assert.equal(selected.selectedCandidate?.hs6, "691200");
  assert.equal(selected.selectedCandidate?.classificationConfirmed, false);
  assert.equal(selected.classificationConfirmed, false);
  assert.equal(selected.assignment.hs6, null);
  assert.equal(selected.assignment.nationalCode, null);
  assert.equal(selected.assignment.approval, null);
  assert.equal(selected.matchingIdentityCount, 1);
  assert.equal(selected.completeIdentityCount, 1);
  assert.deepEqual(request, before);
  assert.deepEqual(route(request, catalog), selected, "routing the same snapshot is deterministic");

  const event = approval(catalog, request), original = structuredClone(event);
  const assigned = route(request, catalog, [event]);
  assert.ok(validateResult(assigned), JSON.stringify(validateResult.errors));
  assert.equal(assigned.status, "assigned");
  assert.equal(assigned.classificationConfirmed, true);
  assert.equal(assigned.selectedCandidate, null);
  assert.equal(assigned.assignment.hs6, "691200");
  assert.equal(assigned.assignment.nationalCode, "691200100");
  assert.equal(assigned.assignment.approval?.id, event.id);
  assert.deepEqual(event, original);
});

test("bundled reference-only coffee can be selected but cannot be promoted to a national-code approval", () => {
  const input = JSON.parse(readFileSync(new URL("../examples/classification-au.json", import.meta.url), "utf8")) as ClassificationRequest;
  const catalog = loadClassificationCatalog({}, data);
  const result = route(input, catalog);
  assert.equal(result.status, "candidate_selected");
  assert.equal(result.selectedCandidate?.hs6, "090121");
  assert.equal(result.selectedCandidate?.eligibleForApproval, false);
  assert.equal(result.selectedCandidate?.nationalCode, null);
  assert.equal(result.classificationConfirmed, false);
  assert.equal(result.assignment.hs6, null);
  assert.throws(() => createClassificationApproval({
    ...classificationFixtureApprovalInput(), request: input, requestDigest: result.assignment.requestDigest,
    ruleId: result.selectedCandidate!.ruleId,
  }, catalog, data, now), InputError);
});

test("missing attributes are asked for and unsupported product facts are never filled in", () => {
  const input = classificationFixtureRequest();
  delete input.product.attributes.material;
  const before = structuredClone(input);
  const result = route(input);
  assert.equal(result.status, "needs_attributes");
  assert.equal(result.selectedCandidate, null);
  assert.equal(result.completeIdentityCount, 0);
  assert.ok(result.questions.some(question => question.attribute === "material"));
  assert.equal(result.questionsTruncated, false);
  assert.deepEqual(input, before);
  input.product.attributes.material = "steel";
  assert.equal(route(input).status, "unsupported");
});

test("different national suffixes or tariff editions remain ambiguous even with the same HS6", () => {
  for (const patch of [{ nationalCode: "691200200" }, { tariffEdition: "synthetic-jp-another-edition" }]) {
    const document = classificationFixtureDocument();
    extraRule(document, { id: "synthetic-second-mapping", ...patch });
    const result = route(classificationFixtureRequest(), new ClassificationCatalog(document, data));
    assert.equal(result.status, "ambiguous");
    assert.equal(result.matchingIdentityCount, 2);
    assert.equal(result.completeIdentityCount, 2);
    assert.equal(result.selectedCandidate, null);
    assert.equal(result.assignment.hs6, null);
  }
  const document = classificationFixtureDocument();
  const reference = extraRule(document, { id: "synthetic-reference-only" });
  delete reference.nationalCode; delete reference.tariffEdition;
  const result = route(classificationFixtureRequest(), new ClassificationCatalog(document, data));
  assert.equal(result.status, "ambiguous", "an unconfirmed HS6 reference is not interchangeable with a national mapping");
  assert.equal(result.matchingIdentityCount, 2);
});

test("all matching identities are evaluated even when the proposal preview only shows three", () => {
  const document = classificationFixtureDocument();
  for (let index = 1; index <= 3; index++)
    extraRule(document, { id: "synthetic-complete-" + index, nationalCode: "69120020" + index });
  const catalog = new ClassificationCatalog(document, data), request = classificationFixtureRequest();
  assert.equal(proposeClassification(request, catalog, data, now).candidates.length, 3);
  const result = route(request, catalog);
  assert.equal(result.status, "ambiguous");
  assert.equal(result.matchingIdentityCount, 4);
  assert.equal(result.completeIdentityCount, 4);
});

test("a complete fourth mapping cannot bypass distinct incomplete alternatives hidden by ranking", () => {
  const document = classificationFixtureDocument(), request = classificationFixtureRequest();
  request.product.attributes.glaze = "plain";
  for (let index = 1; index <= 3; index++) {
    const missing = "missing_fact_" + index;
    extraRule(document, {
      id: "synthetic-partial-" + index, nationalCode: "69120020" + index,
      requiredAttributes: ["material", "intended_use", "construction", "glaze", missing],
      attributeConditions: { ...document.rules[0]!.attributeConditions, glaze: ["plain"], [missing]: ["confirmed"] },
      questions: { [missing]: "Confirm this distinguishing product fact." },
    });
  }
  const catalog = new ClassificationCatalog(document, data), preview = proposeClassification(request, catalog, data, now);
  assert.ok(preview.candidates.every(candidate => candidate.missingAttributes.length > 0));
  const result = route(request, catalog);
  assert.equal(result.status, "needs_attributes");
  assert.equal(result.matchingIdentityCount, 4);
  assert.equal(result.completeIdentityCount, 1);
  assert.equal(result.selectedCandidate, null);
  assert.deepEqual(result.questions.map(question => question.attribute).sort(), ["missing_fact_1", "missing_fact_2", "missing_fact_3"]);
});

test("a complete witness for one mapping survives a higher-ranked incomplete duplicate rule", () => {
  const document = classificationFixtureDocument(), request = classificationFixtureRequest();
  request.product.attributes.glaze = "plain";
  extraRule(document, {
    id: "synthetic-duplicate-partial", requiredAttributes: ["material", "intended_use", "construction", "glaze", "verification"],
    attributeConditions: { ...document.rules[0]!.attributeConditions, glaze: ["plain"], verification: ["yes"] },
    questions: { verification: "Was the duplicate rule's additional fact verified?" },
  });
  const catalog = new ClassificationCatalog(document, data);
  assert.equal(proposeClassification(request, catalog, data, now).candidates[0]!.ruleId, "synthetic-duplicate-partial");
  const result = route(request, catalog);
  assert.equal(result.status, "candidate_selected");
  assert.equal(result.matchingIdentityCount, 1);
  assert.equal(result.completeIdentityCount, 1);
  assert.equal(result.selectedCandidate?.ruleId, "synthetic-ceramic-cup");
  assert.deepEqual(result.selectedCandidate?.missingAttributes, []);
});

test("questions include distinguishing facts outside the three-candidate preview and remain bounded", () => {
  const document = classificationFixtureDocument(), request = classificationFixtureRequest();
  const base = document.rules[0]!;
  document.rules = Array.from({ length: 4 }, (_, index) => ({
    ...structuredClone(base), id: "synthetic-question-rule-" + index, nationalCode: "69120010" + index,
    requiredAttributes: Array.from({ length: 20 }, (_, attribute) => "fact_" + index + "_" + attribute),
    attributeConditions: {}, questions: {},
  }));
  request.product.attributes = {};
  const result = route(request, new ClassificationCatalog(document, data));
  assert.equal(result.status, "needs_attributes");
  assert.equal(result.questions.length, 50);
  assert.equal(result.questionsTruncated, true);
  assert.equal(result.matchingIdentityCount, 4);
  assert.ok(result.questions.every(question => question.candidateRuleIds.length <= 3));
  assert.ok(validateResult(result), JSON.stringify(validateResult.errors));

  document.rules = [0, 1, 2, 3].map(index => ({
    ...structuredClone(base), id: "synthetic-hidden-question-" + index, nationalCode: "69120010" + index,
    requiredAttributes: ["hidden_fact_" + index], attributeConditions: {}, questions: {},
  }));
  const untruncated = route(request, new ClassificationCatalog(document, data));
  assert.deepEqual(untruncated.questions.map(question => question.attribute).sort(), ["hidden_fact_0", "hidden_fact_1", "hidden_fact_2", "hidden_fact_3"]);
  assert.equal(untruncated.questionsTruncated, false);
});

test("a matching invalid source blocks unique selection while a conflicting product rule does not", () => {
  const document = classificationFixtureDocument();
  document.sources.push({ ...structuredClone(document.sources[0]!), id: "synthetic-stale-source", checkedOn: "2026-11-16", reviewBy: "2026-11-17" });
  extraRule(document, { id: "synthetic-stale-rule", nationalCode: "691200200", sourceIds: ["synthetic-stale-source"] });
  const request = classificationFixtureRequest();
  const result = route(request, new ClassificationCatalog(document, data));
  assert.equal(result.status, "review_required");
  assert.equal(result.selectedCandidate, null);
  assert.ok(result.assignment.findings.some(finding => finding.code === "CLASSIFICATION_SOURCE_REVIEW_EXPIRED"));
  const catalog = new ClassificationCatalog(document, data);
  assert.equal(route(request, catalog, [approval(catalog, request)]).status, "assigned",
    "a current protected approval for the valid rule takes priority over unconfirmed alternatives");
  document.rules[1]!.attributeConditions.material = ["steel"];
  assert.equal(route(request, new ClassificationCatalog(document, data)).status, "candidate_selected");
});

test("source observation, expiry, effective dates and exact scope are enforced during automatic routing", () => {
  for (const patch of [
    { checkedOn: "2026-11-19" }, { checkedOn: "2026-11-16", reviewBy: "2026-11-17" },
    { effectiveFrom: "2026-11-19" }, { effectiveThrough: "2026-11-17" },
    { countries: ["US"] }, { hsEdition: "HS2017" }, { direction: "export" as const },
  ]) {
    const document = classificationFixtureDocument();
    Object.assign(document.sources[0]!, patch);
    assert.equal(route(classificationFixtureRequest(), new ClassificationCatalog(document, data)).status, "review_required");
  }
  for (const patch of [{ country: "US" }, { hsEdition: "HS2017" }, { direction: "export" as const }, { country: "KP" }, { country: "AQ" }]) {
    const request = classificationFixtureRequest(); Object.assign(request.context, patch);
    assert.equal(route(request).status, "unsupported");
  }
});

test("historical or territorial purpose conditions cannot silently become current import classifications", () => {
  const request = JSON.parse(readFileSync(new URL("../examples/classification-gl.json", import.meta.url), "utf8")) as ClassificationRequest;
  const catalog = loadClassificationCatalog({}, data);
  assert.equal(route(request, catalog).status, "candidate_selected");
  delete request.product.attributes.classification_context;
  const missing = route(request, catalog);
  assert.equal(missing.status, "needs_attributes");
  assert.equal(missing.selectedCandidate, null);
  assert.ok(missing.questions.some(question => question.attribute === "classification_context"));
  request.product.attributes.classification_context = "current_import_declaration";
  assert.equal(route(request, catalog).status, "unsupported");
});

test("revoked, expired, changed-product and changed-catalog approvals stay in review rather than falling back to candidate selection", () => {
  const catalog = classificationFixtureCatalog(), request = classificationFixtureRequest(), event = approval(catalog, request);
  const revoked: ClassificationEvent = { type: "revoked", id: "synthetic-revocation", approvalId: event.id,
    revokedOn: "2026-11-18", reviewerRef: "synthetic-reviewer", evidenceIds: ["withdrawal-evidence"], reason: "Product review withdrawn." };
  assert.equal(route(request, catalog, [event, revoked]).status, "review_required");
  const changed = structuredClone(request); changed.product.revision = "v2";
  assert.equal(route(changed, catalog, [event]).status, "review_required");
  const changedDescription = structuredClone(request); changedDescription.product.description = "New ceramic cup";
  assert.equal(route(changedDescription, catalog, [event]).status, "review_required");
  assert.equal(route(request, catalog, [event], new Date("2026-11-26T03:00:00Z")).status, "review_required");
  const document = classificationFixtureDocument(); document.version = "synthetic-new-catalog";
  assert.equal(route(request, new ClassificationCatalog(document, data), [event]).status, "review_required");
});

test("conflicting protected approvals are held instead of resolved by source or rule order", () => {
  const document = classificationFixtureDocument();
  extraRule(document, { id: "synthetic-second-approved-rule", nationalCode: "691200200" });
  const catalog = new ClassificationCatalog(document, data), request = classificationFixtureRequest();
  const first = approval(catalog, request);
  const second = createClassificationApproval({ ...classificationFixtureApprovalInput(catalog, request),
    id: "synthetic-second-approval", ruleId: "synthetic-second-approved-rule" }, catalog, data, now);
  const result = route(request, catalog, [first, second]);
  assert.equal(result.status, "review_required");
  assert.equal(result.selectedCandidate, null);
  assert.equal(result.assignment.hs6, null);
  assert.equal(result.classificationConfirmed, false);
  assert.ok(result.assignment.assignmentIssues.includes("CONFLICTING_CLASSIFICATION_APPROVALS"));
});

test("six routing queues partition input SKUs once and groups keep assigned and unconfirmed selections separate", () => {
  const document = classificationFixtureDocument();
  const second = { keywords: ["ornament"], requiredAttributes: [], attributeConditions: {}, questions: {}, hs6: "392490" };
  extraRule(document, { id: "synthetic-ornament-a", ...second, nationalCode: "392490100" });
  extraRule(document, { id: "synthetic-ornament-b", ...second, nationalCode: "392490200" });
  document.sources.push({ ...structuredClone(document.sources[0]!), id: "synthetic-old-source", checkedOn: "2026-11-16", reviewBy: "2026-11-17" });
  extraRule(document, { id: "synthetic-old-textile", keywords: ["textile"], requiredAttributes: [], attributeConditions: {}, questions: {},
    hs6: "630130", nationalCode: "630130100", sourceIds: ["synthetic-old-source"] });
  const catalog = new ClassificationCatalog(document, data), request = classificationFixtureRequest();
  const event = approval(catalog, request);
  const chosen = { ...structuredClone(request.product), sku: "候補/A 1" };
  const chosenAgain = { ...structuredClone(request.product), sku: "候補/B 2" };
  const missing = { ...structuredClone(request.product), sku: "needs-attributes" }; delete missing.attributes.material;
  const ambiguous = { ...structuredClone(request.product), sku: "ambiguous", description: "Ornament", attributes: {} };
  const stale = { ...structuredClone(request.product), sku: "stale-source", description: "Textile", attributes: {} };
  const unsupported = { ...structuredClone(request.product), sku: "unrecorded", description: "Quantum widget", attributes: {} };
  const input = { context: request.context, products: [chosen, request.product, missing, ambiguous, stale, unsupported, chosenAgain] };
  const original = structuredClone(input);
  const result = routeClassificationBatch(input, catalog, [event], data, now);
  assert.ok(validateBatch(result), JSON.stringify(validateBatch.errors));
  assert.deepEqual(result.counts, { assigned: 1, candidate_selected: 2, needs_attributes: 1, ambiguous: 1, review_required: 1, unsupported: 1 });
  assert.deepEqual(result.queues.candidate_selected, [chosen.sku, chosenAgain.sku]);
  assert.deepEqual(result.results.map(row => row.sku), input.products.map(product => product.sku));
  const queued = classificationRoutingStatuses.flatMap(status => result.queues[status]);
  assert.equal(queued.length, input.products.length);
  assert.equal(new Set(queued).size, input.products.length);
  assert.deepEqual([...queued].sort(), input.products.map(product => product.sku).sort());
  assert.equal(result.groups.length, 2);
  assert.deepEqual(result.groups.map(group => group.status), ["candidate_selected", "assigned"]);
  assert.deepEqual(result.groups[0]!.skus, [chosen.sku, chosenAgain.sku]);
  assert.equal(result.groups[0]!.classificationConfirmed, false);
  assert.equal(result.groups[1]!.classificationConfirmed, true);
  assert.deepEqual(result.groups[1]!.skus, [request.product.sku]);
  assert.equal(result.classificationConfirmed, false);
  assert.equal(result.shippingAuthorized, false);
  assert.equal(result.productionAuthorized, false);
  assert.deepEqual(input, original);
});

test("a batch is confirmed only when every SKU reuses a current protected approval", () => {
  const catalog = classificationFixtureCatalog(), request = classificationFixtureRequest();
  const result = routeClassificationBatch({ context: request.context, products: [request.product] }, catalog, [approval(catalog, request)], data, now);
  assert.equal(result.classificationConfirmed, true);
  assert.equal(result.counts.assigned, 1);
  assert.equal(result.shippingAuthorized, false);
  assert.ok(validateBatch(result), JSON.stringify(validateBatch.errors));
});

test("routing rejects client approvals, malformed event history, duplicate or mixed-merchant identities and oversized batches", () => {
  const request = classificationFixtureRequest(), catalog = classificationFixtureCatalog();
  assert.throws(() => routeClassification({ ...request, approval: {} }, catalog, [], data, now), InputError);
  assert.throws(() => route(request, catalog, [{ type: "approved" } as ClassificationEvent]), InputError);
  const input = { context: request.context, products: [request.product] };
  for (const invalid of [
    { ...input, approvals: [] }, { ...input, products: [] },
    { ...input, products: [request.product, request.product] },
    { ...input, products: [request.product, { ...request.product, sku: "other", merchantId: "other-merchant" }] },
    { ...input, products: Array.from({ length: 101 }, (_, index) => ({ ...request.product, sku: "sku-" + index })) },
  ]) assert.throws(() => routeClassificationBatch(invalid, catalog, [], data, now), InputError);
  const limit = routeClassificationBatch({ ...input,
    products: Array.from({ length: 100 }, (_, index) => ({ ...request.product, sku: "sku-" + index })) }, catalog, [], data, now);
  assert.equal(limit.results.length, 100);
  assert.equal(limit.counts.candidate_selected, 100);
  assert.ok(validateBatch(limit), JSON.stringify(validateBatch.errors));
});
