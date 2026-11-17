import assert from "node:assert/strict";
import test from "node:test";
import { createClassificationApproval, type ClassificationEvent } from "../src/classification-approvals.ts";
import { applyClassificationAssignments, type ClassificationPlanInput } from "../src/classification-plan.ts";
import { proposeClassification } from "../src/classification.ts";
import { planCustoms } from "../src/customs-plan.ts";
import { InputError } from "../src/schema.ts";
import { loadTariffCatalog } from "../src/tariffs.ts";
import type { CustomsPlanRequest } from "../src/types.ts";
import { classificationFixtureCatalog, classificationFixtureRequest } from "./fixtures/classification.ts";
import { data, shipment } from "./helpers.ts";

const now = new Date("2026-11-18T00:00:00Z");
function fixture() {
  const request = classificationFixtureRequest(), catalog = classificationFixtureCatalog();
  const proposal = proposeClassification(request, catalog, data, now);
  const approval = createClassificationApproval({ id: "plan-approval", request,
    requestDigest: proposal.requestDigest, ruleId: proposal.candidates[0]!.ruleId,
    validFrom: "2026-11-18", validThrough: "2026-11-25", reviewedOn: "2026-11-18", reviewBy: "2026-11-25",
    reviewerRef: "synthetic-reviewer", evidenceIds: ["synthetic-review-evidence"] }, catalog, data, now);
  const item = { ...shipment().items[0]!, description: request.product.description, unitValue: "100",
    productIdentifier: request.product.sku, classificationConfirmed: false };
  delete item.hs6;
  const plan: CustomsPlanRequest = { shipment: shipment({
    originCountry: "CN", destinationCountry: request.context.country, importDate: request.context.date,
    currency: "JPY", freight: "10", insurance: "0", items: [item],
    veygrit: { merchantId: request.product.merchantId, orderId: "synthetic-order", cartVersion: "cart-1",
      addressTokenRef: "synthetic-address-ref", addressVersion: "address-1", grantRef: "synthetic-grant-ref" },
  }) };
  const input: ClassificationPlanInput = { authenticatedMerchantId: request.product.merchantId, context: request.context,
    bindings: [{ itemId: item.id, product: request.product }] };
  return { request, catalog, approval, plan, input };
}

test("approved catalogue classification populates the existing customs-plan contract without authorising shipment", () => {
  const f = fixture(), original = structuredClone(f.plan);
  const result = applyClassificationAssignments(f.plan, f.input, f.catalog, [f.approval], data, now);
  assert.deepEqual(f.plan, original);
  assert.equal(result.status, "classified");
  assert.equal(result.plan.shipment.items[0]!.hs6, f.approval.hs6);
  assert.equal(result.plan.shipment.items[0]!.classificationConfirmed, true);
  assert.equal(result.plan.lines?.[0]?.tariffCode, f.approval.nationalCode);
  assert.equal(result.plan.shipment.items[0]!.originCountry, original.shipment.items[0]!.originCountry);
  const customs = planCustoms(result.plan, data, loadTariffCatalog(data), now);
  assert.equal(customs.lines[0]!.classification, "confirmed");
  assert.equal(customs.checkout.shippingAuthorized, false);
  assert.equal(result.productionAuthorized, false);
});

test("revoked and absent bindings clear stale confirmation flags without changing original inputs", () => {
  const f = fixture();
  f.plan.shipment.items[0]!.classificationConfirmed = true;
  f.plan.shipment.items[0]!.hs6 = f.approval.hs6;
  const revoked: ClassificationEvent = { type: "revoked", id: "revoke-plan-approval", approvalId: f.approval.id,
    revokedOn: "2026-11-18", reviewerRef: "synthetic-reviewer", evidenceIds: ["synthetic-revocation-evidence"], reason: "Synthetic review withdrawn" };
  for (const [input, events] of [[f.input, [f.approval, revoked]], [{ ...f.input, bindings: [] }, [f.approval]]] as const) {
    const result = applyClassificationAssignments(f.plan, input, f.catalog, events, data, now);
    assert.equal(result.status, "review_required");
    assert.equal(result.plan.shipment.items[0]!.classificationConfirmed, false);
    assert.equal(result.plan.shipment.items[0]!.hs6, f.approval.hs6);
  }
  assert.equal(f.plan.shipment.items[0]!.classificationConfirmed, true);
});

test("import direction, destination, date and verified merchant must match the trusted order", () => {
  for (const patch of [{ direction: "export" }, { country: "US" }, { date: "2026-11-19" }] as const) {
    const f = fixture(); f.plan.shipment.items[0]!.classificationConfirmed = true;
    const result = applyClassificationAssignments(f.plan, { ...f.input, context: { ...f.input.context, ...patch } }, f.catalog, [f.approval], data, now);
    assert.equal(result.status, "review_required");
    assert.equal(result.plan.shipment.items[0]!.classificationConfirmed, false);
    assert.equal(result.items[0]!.assignment, null);
  }
  const f = fixture(); delete f.plan.shipment.veygrit;
  assert.equal(applyClassificationAssignments(f.plan, f.input, f.catalog, [f.approval], data, now).status, "review_required");
});

test("SKU, description and merchant mismatches cannot borrow another product's approval", () => {
  for (const field of ["sku", "description", "merchantId"] as const) {
    const f = fixture(); f.input.bindings[0]!.product[field] = "different-value";
    const result = applyClassificationAssignments(f.plan, f.input, f.catalog, [f.approval], data, now);
    assert.equal(result.items[0]!.status, "held");
    assert.equal(result.items[0]!.assignment, null);
    assert.equal(result.plan.shipment.items[0]!.classificationConfirmed, false);
  }
});

test("case-sensitive specification differences cannot reuse a trusted product approval", () => {
  const f = fixture();
  const description = f.request.product.description;
  f.request.product.description = description + " 1 mW";
  const proposal = proposeClassification(f.request, f.catalog, data, now);
  const approval = createClassificationApproval({ id: "case-sensitive-plan-approval", request: f.request,
    requestDigest: proposal.requestDigest, ruleId: proposal.candidates[0]!.ruleId,
    validFrom: "2026-11-18", validThrough: "2026-11-25", reviewedOn: "2026-11-18", reviewBy: "2026-11-25",
    reviewerRef: "synthetic-reviewer", evidenceIds: ["synthetic-unit-review"] }, f.catalog, data, now);
  f.plan.shipment.items[0]!.description = description + " 1 MW";
  const result = applyClassificationAssignments(f.plan, f.input, f.catalog, [approval], data, now);
  assert.ok(result.items[0]!.issues.includes("CLASSIFICATION_PRODUCT_DESCRIPTION_MISMATCH"));
  assert.equal(result.plan.shipment.items[0]!.classificationConfirmed, false);
  assert.equal(result.items[0]!.assignment, null);
});

test("a trusted catalogue can map a Unicode SKU to an existing opaque product identifier", () => {
  const f = fixture();
  f.request.product.sku = "品番/A 1";
  f.input.bindings[0]!.productIdentifier = "internal-product-1";
  f.plan.shipment.items[0]!.productIdentifier = "internal-product-1";
  const proposal = proposeClassification(f.request, f.catalog, data, now);
  const approval = createClassificationApproval({ id: "unicode-sku-plan-approval", request: f.request,
    requestDigest: proposal.requestDigest, ruleId: proposal.candidates[0]!.ruleId,
    validFrom: "2026-11-18", validThrough: "2026-11-25", reviewedOn: "2026-11-18", reviewBy: "2026-11-25",
    reviewerRef: "synthetic-reviewer", evidenceIds: ["synthetic-sku-map-review"] }, f.catalog, data, now);
  const result = applyClassificationAssignments(f.plan, f.input, f.catalog, [approval], data, now);
  assert.equal(result.status, "classified");
  assert.equal(result.items[0]!.sku, "品番/A 1");
  assert.equal(result.plan.shipment.items[0]!.productIdentifier, "internal-product-1");
  f.input.bindings[0]!.productIdentifier = "different-internal-product";
  const held = applyClassificationAssignments(f.plan, f.input, f.catalog, [approval], data, now);
  assert.equal(held.plan.shipment.items[0]!.classificationConfirmed, false);
  assert.ok(held.items[0]!.issues.includes("CLASSIFICATION_PRODUCT_SKU_MISMATCH"));
});

test("conflicting existing HS6 or national codes are preserved for review, never overwritten", () => {
  for (const conflict of ["hs6", "national"] as const) {
    const f = fixture();
    if (conflict === "hs6") f.plan.shipment.items[0]!.hs6 = "999999";
    else f.plan.lines = [{ itemId: f.plan.shipment.items[0]!.id, tariffCode: "999999999", customsValue: "100" }];
    const original = structuredClone(f.plan);
    const result = applyClassificationAssignments(f.plan, f.input, f.catalog, [f.approval], data, now);
    assert.ok(result.items[0]!.issues.includes("CLASSIFICATION_EXISTING_CODE_CONFLICT"));
    assert.equal(result.plan.shipment.items[0]!.classificationConfirmed, false);
    assert.equal(result.plan.shipment.items[0]!.hs6, original.shipment.items[0]!.hs6);
    assert.deepEqual(result.plan.lines, original.lines);
  }
});

test("changed product revisions and expired approval cannot preserve a stale true flag", () => {
  const f = fixture(); f.plan.shipment.items[0]!.classificationConfirmed = true;
  f.input.bindings[0]!.product.revision = "revision-2";
  assert.equal(applyClassificationAssignments(f.plan, f.input, f.catalog, [f.approval], data, now).plan.shipment.items[0]!.classificationConfirmed, false);
  f.input.bindings[0]!.product.revision = f.approval.revision;
  const expired = new Date("2026-12-01T00:00:00Z");
  assert.equal(applyClassificationAssignments(f.plan, f.input, f.catalog, [f.approval], data, expired).plan.shipment.items[0]!.classificationConfirmed, false);
});

test("duplicate, unknown and client-supplied approval bindings are rejected", () => {
  const f = fixture();
  for (const bindings of [[...f.input.bindings, ...f.input.bindings], [{ ...f.input.bindings[0]!, itemId: "not-in-order" }]])
    assert.throws(() => applyClassificationAssignments(f.plan, { ...f.input, bindings }, f.catalog, [f.approval], data, now), InputError);
  assert.throws(() => applyClassificationAssignments(f.plan, { ...f.input, approval: f.approval }, f.catalog, [], data, now), InputError);
});
