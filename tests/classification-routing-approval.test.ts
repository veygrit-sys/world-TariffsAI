import assert from "node:assert/strict";
import test from "node:test";
import { ClassificationCatalog } from "../src/classification-catalog.ts";
import { createClassificationApproval } from "../src/classification-approvals.ts";
import type { ClassificationEvent } from "../src/classification-approvals.ts";
import { proposeClassification } from "../src/classification.ts";
import { routeClassification } from "../src/classification-routing.ts";
import type { ClassificationCatalogDocument, ClassificationRequest } from "../src/classification-types.ts";
import { InputError } from "../src/schema.ts";
import { data } from "./helpers.ts";
import {
  classificationFixtureApprovalInput, classificationFixtureDocument,
  classificationFixtureNow as now, classificationFixtureRequest,
} from "./fixtures/classification.ts";

function witnessFixture(): { document: ClassificationCatalogDocument; request: ClassificationRequest } {
  const document = classificationFixtureDocument(), request = classificationFixtureRequest();
  request.product.attributes.glaze = "plain";
  const original = document.rules[0]!;
  document.rules.push({
    ...structuredClone(original), id: "synthetic-higher-ranked-partial",
    requiredAttributes: ["material", "intended_use", "construction", "glaze", "verification"],
    attributeConditions: { ...original.attributeConditions, glaze: ["plain"], verification: ["yes"] },
    questions: { verification: "Has this additional fact been verified?" },
  });
  return { document, request };
}

function review(catalog: ClassificationCatalog, request: ClassificationRequest, ruleId: string) {
  return createClassificationApproval({ ...classificationFixtureApprovalInput(catalog, request), ruleId }, catalog, data, now);
}

test("an automatically selected complete witness can be explicitly reviewed and reused outside the preview", () => {
  const { document, request } = witnessFixture(), catalog = new ClassificationCatalog(document, data);
  const originalRequest = structuredClone(request);
  const selected = routeClassification(request, catalog, [], data, now);
  assert.equal(selected.status, "candidate_selected");
  assert.equal(selected.selectedCandidate?.ruleId, "synthetic-ceramic-cup");
  assert.equal(selected.selectedCandidate?.eligibleForApproval, true);
  assert.equal(selected.assignment.candidates[0]!.ruleId, "synthetic-higher-ranked-partial");
  assert.ok(!selected.assignment.candidates.some(candidate => candidate.ruleId === selected.selectedCandidate!.ruleId));
  assert.equal(selected.assignment.hs6, null);
  assert.equal(selected.classificationConfirmed, false);

  const event = review(catalog, request, selected.selectedCandidate!.ruleId);
  const originalEvent = structuredClone(event);
  const assigned = routeClassification(request, catalog, [event], data, now);
  assert.equal(assigned.status, "assigned");
  assert.equal(assigned.classificationConfirmed, true);
  assert.equal(assigned.selectedCandidate, null);
  assert.equal(assigned.assignment.nationalCode, "691200100");
  assert.equal(assigned.assignment.approval?.id, event.id);
  assert.deepEqual(assigned.assignment.assignmentIssues, []);
  assert.deepEqual(request, originalRequest);
  assert.deepEqual(event, originalEvent);
});

test("an explicit operator review can choose a fourth complete identity without changing ambiguity before review", () => {
  const document = classificationFixtureDocument(), request = classificationFixtureRequest();
  for (let index = 0; index < 3; index++) document.rules.push({
    ...structuredClone(document.rules[0]!), id: "synthetic-alternative-" + index, nationalCode: "69120020" + index,
  });
  const catalog = new ClassificationCatalog(document, data);
  const preview = proposeClassification(request, catalog, data, now);
  const hidden = catalog.rules.find(rule => !preview.candidates.some(candidate => candidate.ruleId === rule.id))!;
  assert.ok(hidden);
  assert.equal(preview.candidates.length, 3);
  const beforeReview = routeClassification(request, catalog, [], data, now);
  assert.equal(beforeReview.status, "ambiguous");
  assert.equal(beforeReview.completeIdentityCount, 4);
  assert.equal(beforeReview.selectedCandidate, null);
  const event = review(catalog, request, hidden.id);
  const assigned = routeClassification(request, catalog, [event], data, now);
  assert.equal(assigned.status, "assigned");
  assert.equal(assigned.assignment.nationalCode, hidden.nationalCode);
  assert.equal(assigned.assignment.approval?.id, event.id);
  assert.equal(routeClassification(request, catalog, [], data, now).status, "ambiguous");
});

test("full-set review still requires complete attributes, exact country, direction, edition and current sources", () => {
  const fixture = witnessFixture();
  const scenarios: { changeRequest?: (request: ClassificationRequest) => void; changeDocument?: (document: ClassificationCatalogDocument) => void }[] = [
    { changeRequest: request => { delete request.product.attributes.material; } },
    { changeRequest: request => { request.product.attributes.material = "steel"; } },
    { changeRequest: request => { request.context.country = "US"; } },
    { changeRequest: request => { request.context.direction = "export"; } },
    { changeRequest: request => { request.context.hsEdition = "HS2017"; } },
    { changeDocument: document => { document.sources[0]!.checkedOn = "2026-11-19"; } },
    { changeDocument: document => { document.sources[0]!.effectiveFrom = "2026-11-19"; } },
    { changeDocument: document => { document.sources[0]!.effectiveThrough = "2026-11-17"; } },
    { changeDocument: document => { document.sources[0]!.checkedOn = "2026-11-16"; document.sources[0]!.reviewBy = "2026-11-17"; } },
    { changeDocument: document => { document.sources[0]!.referenceBasis = "national_edition_reference"; } },
  ];
  for (const scenario of scenarios) {
    const { document, request } = structuredClone(fixture);
    scenario.changeRequest?.(request); scenario.changeDocument?.(document);
    const catalog = new ClassificationCatalog(document, data);
    assert.throws(() => review(catalog, request, "synthetic-ceramic-cup"), error => error instanceof InputError &&
      error.issues.some(issue => issue.code === "CLASSIFICATION_REVIEWABLE_CODE_REQUIRED"));
  }
  const catalog = new ClassificationCatalog(fixture.document, data);
  assert.throws(() => review(catalog, fixture.request, "synthetic-higher-ranked-partial"), error => error instanceof InputError &&
    error.issues.some(issue => issue.code === "CLASSIFICATION_REVIEWABLE_CODE_REQUIRED"));
});

test("reviewed hidden witnesses remain held after revocation, expiry, source changes and product changes", () => {
  const { document, request } = witnessFixture(), catalog = new ClassificationCatalog(document, data);
  const event = review(catalog, request, "synthetic-ceramic-cup");
  const revoked: ClassificationEvent = {
    type: "revoked", id: "synthetic-hidden-witness-revoked", approvalId: event.id, revokedOn: "2026-11-18",
    reviewerRef: "synthetic-reviewer", evidenceIds: ["synthetic-withdrawal-evidence"], reason: "Source needs rechecking.",
  };
  const scenarios = [
    { request, catalog, events: [event, revoked], clock: now },
    { request, catalog, events: [event], clock: new Date("2026-11-26T03:00:00Z") },
    { request: { ...request, product: { ...request.product, revision: "v2" } }, catalog, events: [event], clock: now },
  ];
  const changed = structuredClone(document);
  changed.sources[0]!.url = "https://test.example/classification/jp/revised";
  scenarios.push({ request, catalog: new ClassificationCatalog(changed, data), events: [event], clock: now });
  for (const scenario of scenarios) {
    const result = routeClassification(scenario.request, scenario.catalog, scenario.events, data, scenario.clock);
    assert.equal(result.status, "review_required");
    assert.equal(result.classificationConfirmed, false);
    assert.equal(result.selectedCandidate, null);
    assert.equal(result.assignment.hs6, null);
    assert.equal(result.assignment.nationalCode, null);
    assert.equal(result.assignment.approval, null);
  }
});
