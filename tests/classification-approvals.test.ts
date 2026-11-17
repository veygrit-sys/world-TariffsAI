import assert from "node:assert/strict";
import test from "node:test";
import { Ajv } from "ajv";
import addFormatsModule from "ajv-formats";
import {
  assignClassification, classificationAssignmentSchema, createClassificationApproval,
  parseClassificationEvents, type ClassificationApprovalEvent, type ClassificationRevocationEvent,
} from "../src/classification-approvals.ts";
import { ClassificationCatalog } from "../src/classification-catalog.ts";
import { InputError } from "../src/schema.ts";
import { data } from "./helpers.ts";
import { classificationFixtureApprovalInput, classificationFixtureCatalog, classificationFixtureDocument,
  classificationFixtureNow as now, classificationFixtureRequest } from "./fixtures/classification.ts";

function approval(): ClassificationApprovalEvent {
  return createClassificationApproval(classificationFixtureApprovalInput(), classificationFixtureCatalog(), data, now);
}
function revoke(): ClassificationRevocationEvent {
  return { type: "revoked", id: "synthetic-revocation", approvalId: "synthetic-approval-1", revokedOn: "2026-11-18",
    reviewerRef: "synthetic-reviewer", evidenceIds: ["synthetic-revocation-proof"], reason: "Synthetic withdrawal" };
}
function code(expected: string) {
  return (error: unknown) => error instanceof InputError && error.issues.some(issue => issue.code === expected);
}

test("new products remain proposals; a reviewed national classification can be reapplied on later dates", () => {
  const catalog = classificationFixtureCatalog(), request = classificationFixtureRequest();
  const proposed = assignClassification(request, catalog, [], data, now);
  assert.equal(proposed.status, "candidates");
  assert.equal(proposed.classificationConfirmed, false);
  assert.equal(proposed.nationalCode, null);
  const event = approval();
  const inputBefore = structuredClone(request);
  const result = assignClassification(request, catalog, [event], data, now);
  assert.equal(result.status, "approved");
  assert.equal(result.classificationConfirmed, true);
  assert.equal(result.nationalCode, "691200100");
  assert.equal(result.approval?.id, event.id);
  assert.deepEqual(request, inputBefore);
  request.context.date = "2026-11-19";
  const later = assignClassification(request, catalog, [event], data, new Date("2026-11-19T00:00:00Z"));
  assert.equal(later.status, "approved");
  assert.notEqual(later.contextDigest, result.contextDigest);
});

test("a proposal alone or client-supplied approval field cannot confirm a classification", () => {
  assert.throws(() => assignClassification({ ...classificationFixtureRequest(), approval: approval() },
    classificationFixtureCatalog(), [], data, now), InputError);
  const request = classificationFixtureApprovalInput();
  request.requestDigest = "0".repeat(64);
  assert.throws(() => createClassificationApproval(request, classificationFixtureCatalog(), data, now), code("CLASSIFICATION_REVIEW_SCOPE_MISMATCH"));
});

test("approval requires an eligible scoped national code and all confirmed product attributes", () => {
  const missing = classificationFixtureRequest(); delete missing.product.attributes.material;
  assert.throws(() => createClassificationApproval(classificationFixtureApprovalInput(classificationFixtureCatalog(), missing),
    classificationFixtureCatalog(), data, now), code("CLASSIFICATION_REVIEWABLE_CODE_REQUIRED"));
  const document = classificationFixtureDocument(); delete document.rules[0]!.nationalCode; delete document.rules[0]!.tariffEdition;
  document.sources[0]!.kind = "classification_ruling";
  const catalog = new ClassificationCatalog(document, data);
  assert.throws(() => createClassificationApproval(classificationFixtureApprovalInput(catalog), catalog, data, now), code("CLASSIFICATION_REVIEWABLE_CODE_REQUIRED"));
});

test("review windows cannot precede source observation or extend source applicability and review deadlines", () => {
  for (const [field, value, expected] of [
    ["reviewedOn", "2026-11-17", "CLASSIFICATION_REVIEW_NOT_OBSERVED"],
    ["reviewedOn", "2026-11-19", "CLASSIFICATION_REVIEW_NOT_OBSERVED"],
    ["reviewBy", "2027-01-01", "CLASSIFICATION_APPROVAL_SOURCE_RANGE_MISMATCH"],
    ["validThrough", "2027-01-01", "CLASSIFICATION_APPROVAL_SOURCE_RANGE_MISMATCH"],
    ["validFrom", "2026-10-01", "CLASSIFICATION_APPROVAL_SOURCE_RANGE_MISMATCH"],
  ] as const) {
    const input = classificationFixtureApprovalInput(); input[field] = value;
    assert.throws(() => createClassificationApproval(input, classificationFixtureCatalog(), data, now), code(expected));
  }
});

test("product revision, description, attributes and destination scope changes invalidate reuse", () => {
  const event = approval(), catalog = classificationFixtureCatalog();
  for (const mutate of [
    (r: ReturnType<typeof classificationFixtureRequest>) => { r.product.revision = "revision-2"; },
    (r: ReturnType<typeof classificationFixtureRequest>) => { r.product.description += " changed"; },
    (r: ReturnType<typeof classificationFixtureRequest>) => { r.product.attributes.material = "plastic"; },
    (r: ReturnType<typeof classificationFixtureRequest>) => { r.context.country = "US"; },
    (r: ReturnType<typeof classificationFixtureRequest>) => { r.context.direction = "export"; },
    (r: ReturnType<typeof classificationFixtureRequest>) => { r.context.hsEdition = "HS2017"; },
  ]) {
    const request = classificationFixtureRequest(); mutate(request);
    const result = assignClassification(request, catalog, [event], data, now);
    assert.equal(result.status, "review_required"); assert.equal(result.classificationConfirmed, false);
    assert.equal(result.nationalCode, null); assert.ok(result.assignmentIssues.length);
  }
});

test("merchant and SKU isolation never reuses or exposes another product's approval", () => {
  const event = approval();
  for (const field of ["merchantId", "sku"] as const) {
    const request = classificationFixtureRequest(); request.product[field] = "other";
    const result = assignClassification(request, classificationFixtureCatalog(), [event], data, now);
    assert.equal(result.classificationConfirmed, false); assert.equal(result.approval, null);
    assert.deepEqual(result.assignmentIssues, []);
  }
});

test("Unicode and punctuation in a merchant SKU survive approval and exact reapplication", () => {
  const request = classificationFixtureRequest(); request.product.sku = "品番/A 1";
  const catalog = classificationFixtureCatalog();
  const event = createClassificationApproval(classificationFixtureApprovalInput(catalog, request), catalog, data, now);
  assert.equal(event.sku, request.product.sku);
  assert.equal(assignClassification(request, catalog, [event], data, now).classificationConfirmed, true);
  const changed = structuredClone(request); changed.product.sku += " ";
  assert.equal(assignClassification(changed, catalog, [event], data, now).classificationConfirmed, false);
});

test("catalog revisions, review expiry and shipment dates outside approval range stop reuse", () => {
  const event = approval();
  const document = classificationFixtureDocument(); document.version = "synthetic-revised";
  assert.ok(assignClassification(classificationFixtureRequest(), new ClassificationCatalog(document, data), [event], data, now)
    .assignmentIssues.includes("CLASSIFICATION_CATALOG_CHANGED"));
  assert.equal(assignClassification(classificationFixtureRequest(), classificationFixtureCatalog(), [event], data,
    new Date("2026-11-25T15:00:00Z")).classificationConfirmed, false);
  const request = classificationFixtureRequest(); request.context.date = "2026-11-17";
  assert.ok(assignClassification(request, classificationFixtureCatalog(), [event], data, now).assignmentIssues
    .includes("CLASSIFICATION_APPROVAL_DATE_OUT_OF_RANGE"));
});

test("immutable revocation stays effective when the same original approval is retried", () => {
  const approved = approval();
  const events = parseClassificationEvents([approved, revoke(), structuredClone(approved)], now);
  assert.equal(events.length, 2);
  const result = assignClassification(classificationFixtureRequest(), classificationFixtureCatalog(), events, data, now);
  assert.equal(result.classificationConfirmed, false);
  assert.ok(result.assignmentIssues.includes("CLASSIFICATION_APPROVAL_REVOKED"));
});

test("conflicting active classifications need review until the superseded approval is revoked", () => {
  const document = classificationFixtureDocument();
  document.rules.push({ ...structuredClone(document.rules[0]!), id: "alternative-rule", nationalCode: "691200200" });
  const catalog = new ClassificationCatalog(document, data);
  const firstInput = classificationFixtureApprovalInput(catalog);
  const secondInput = { ...firstInput, id: "synthetic-approval-2", ruleId: "alternative-rule" };
  const first = createClassificationApproval(firstInput, catalog, data, now);
  const second = createClassificationApproval(secondInput, catalog, data, now);
  const request = classificationFixtureRequest();
  const conflict = assignClassification(request, catalog, [first, second], data, now);
  assert.equal(conflict.classificationConfirmed, false);
  assert.ok(conflict.assignmentIssues.includes("CONFLICTING_CLASSIFICATION_APPROVALS"));
  const withdrawal = { ...revoke(), approvalId: first.id };
  const resolved = assignClassification(request, catalog, [first, second, withdrawal], data, now);
  assert.equal(resolved.status, "approved");
  assert.equal(resolved.nationalCode, second.nationalCode);
});

test("approval uses the normalized edition scope without weakening product identity", () => {
  const request = classificationFixtureRequest(); request.context.hsEdition = " ＨＳ2022 ";
  const catalog = classificationFixtureCatalog();
  const event = createClassificationApproval(classificationFixtureApprovalInput(catalog, request), catalog, data, now);
  assert.equal(event.hsEdition, "HS2022");
  assert.equal(assignClassification(request, catalog, [event], data, now).classificationConfirmed, true);
  const changed = { ...event, validThrough: "2026-12-31", reviewBy: "2026-12-31" };
  assert.equal(assignClassification(request, catalog, [changed], data, now).classificationConfirmed, false);
});

test("conflicting IDs, orphan revocations and future or backdated revocations fail closed", () => {
  const approved = approval();
  assert.throws(() => parseClassificationEvents([approved, { ...approved, nationalCode: "691200200" }], now), code("CONFLICTING_CLASSIFICATION_EVENT"));
  assert.throws(() => parseClassificationEvents([revoke(), approved], now), code("CLASSIFICATION_REVOCATION_REFERENCE_INVALID"));
  assert.throws(() => parseClassificationEvents([approved, { ...revoke(), revokedOn: "2026-11-19" }], now), code("CLASSIFICATION_REVOCATION_NOT_OBSERVED"));
  assert.throws(() => parseClassificationEvents([approved, { ...revoke(), revokedOn: "2026-11-17" }], now), code("CLASSIFICATION_REVOCATION_DATE_INVALID"));
});

test("all assignment result states follow the published strict schema", () => {
  const ajv = new Ajv({ strict: true }); (addFormatsModule as unknown as (a: Ajv) => void)(ajv);
  const validate = ajv.compile(classificationAssignmentSchema);
  for (const events of [[], [approval()], [approval(), revoke()]]) {
    const result = assignClassification(classificationFixtureRequest(), classificationFixtureCatalog(), events, data, now);
    assert.ok(validate(result), JSON.stringify(validate.errors));
  }
});
