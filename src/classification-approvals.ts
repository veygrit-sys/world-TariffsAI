import { isDeepStrictEqual } from "node:util";
import { Ajv } from "ajv";
import addFormatsModule from "ajv-formats";
import { todayJst } from "./dataset.ts";
import { parseClassificationRequest, proposeClassification } from "./classification.ts";
import type { ClassificationCatalog } from "./classification-catalog.ts";
import {
  classificationObject as object, classificationIdSchema as id,
  classificationDateSchema as date, classificationDigestSchema as digest,
  classificationSkuSchema,
  classificationRequestSchema, classificationProposalSchema,
  type ClassificationRequest, type ClassificationProposal,
} from "./classification-types.ts";
import { InputError } from "./schema.ts";
import type { Dataset } from "./types.ts";

/** An operator assertion, not a customs ruling or permission to ship. */
export interface ClassificationApprovalEvent {
  type: "approved";
  id: string;
  merchantId: string;
  sku: string;
  revision: string;
  productFingerprint: string;
  requestDigest: string;
  country: string;
  direction: "import" | "export";
  hsEdition: string;
  ruleId: string;
  hs6: string;
  nationalCode: string;
  tariffEdition: string;
  catalogDigest: string;
  sourceIds: string[];
  validFrom: string;
  validThrough: string;
  reviewedOn: string;
  reviewBy: string;
  reviewerRef: string;
  evidenceIds: string[];
}

export interface ClassificationRevocationEvent {
  type: "revoked";
  id: string;
  approvalId: string;
  revokedOn: string;
  reviewerRef: string;
  evidenceIds: string[];
  reason: string;
}

export type ClassificationEvent = ClassificationApprovalEvent | ClassificationRevocationEvent;

export interface ClassificationApprovalInput {
  id: string;
  request: ClassificationRequest;
  requestDigest: string;
  ruleId: string;
  validFrom: string;
  validThrough: string;
  reviewedOn: string;
  reviewBy: string;
  reviewerRef: string;
  evidenceIds: string[];
}

export type ClassificationAssignment = Omit<ClassificationProposal, "status" | "classificationConfirmed"> & {
  status: ClassificationProposal["status"] | "approved";
  classificationConfirmed: boolean;
  hs6: string | null;
  nationalCode: string | null;
  tariffEdition: string | null;
  approval: Pick<ClassificationApprovalEvent,
    "id" | "reviewedOn" | "reviewBy" | "reviewerRef" | "evidenceIds" | "validFrom" | "validThrough"> | null;
  assignmentIssues: string[];
};

const identifiers = { type: "array", minItems: 1, maxItems: 20, uniqueItems: true, items: id };
const code = { type: "string", pattern: "^[0-9]{7,12}$" };
const edition = { type: "string", minLength: 1, maxLength: 100 };
const approvalProperties = {
  type: { const: "approved" }, id, merchantId: id, sku: classificationSkuSchema, revision: id,
  productFingerprint: digest, requestDigest: digest,
  country: { type: "string", pattern: "^[A-Z]{2}$" }, direction: { enum: ["import", "export"] },
  hsEdition: { type: "string", minLength: 1, maxLength: 40 }, ruleId: id,
  hs6: { type: "string", pattern: "^[0-9]{6}$" }, nationalCode: code, tariffEdition: edition,
  catalogDigest: digest, sourceIds: identifiers,
  validFrom: date, validThrough: date, reviewedOn: date, reviewBy: date,
  reviewerRef: id, evidenceIds: identifiers,
};
export const classificationApprovalEventSchema = object(approvalProperties);
export const classificationRevocationEventSchema = object({
  type: { const: "revoked" }, id, approvalId: id, revokedOn: date, reviewerRef: id,
  evidenceIds: identifiers, reason: { type: "string", minLength: 1, maxLength: 1000 },
});
export const classificationEventsSchema = {
  type: "array", maxItems: 10000,
  items: { oneOf: [classificationApprovalEventSchema, classificationRevocationEventSchema] },
};
export const classificationApprovalInputSchema = object({
  id, request: classificationRequestSchema, requestDigest: digest, ruleId: id,
  validFrom: date, validThrough: date, reviewedOn: date, reviewBy: date,
  reviewerRef: id, evidenceIds: identifiers,
});
const nullable = (value: object) => ({ anyOf: [value, { type: "null" }] });
export const classificationAssignmentSchema = object({
  ...classificationProposalSchema.properties,
  status: { enum: ["approved", "needs_attributes", "candidates", "unsupported", "review_required"] },
  classificationConfirmed: { type: "boolean" },
  hs6: nullable(approvalProperties.hs6), nationalCode: nullable(code), tariffEdition: nullable(edition),
  approval: nullable(object({ id, reviewedOn: date, reviewBy: date, reviewerRef: id,
    evidenceIds: identifiers, validFrom: date, validThrough: date })),
  assignmentIssues: { type: "array", maxItems: 10000, items: id },
});

const ajv = new Ajv({ allErrors: true, strict: true });
(addFormatsModule as unknown as (instance: Ajv) => void)(ajv);
const validateEvents = ajv.compile<ClassificationEvent[]>(classificationEventsSchema);
const validateApproval = ajv.compile<ClassificationApprovalInput>(classificationApprovalInputSchema);
function fail(path: string, code: string): never {
  throw new InputError([{ path, code }]);
}

/** Validate protected event history. Expired approvals remain as history. */
export function parseClassificationEvents(input: unknown, now = new Date()): ClassificationEvent[] {
  if (!validateEvents(input)) fail("/events", "INVALID_CLASSIFICATION_EVENTS");
  const today = todayJst(now);
  const unique = new Map<string, ClassificationEvent>();
  for (const event of input) {
    const previous = unique.get(event.id);
    if (previous && !isDeepStrictEqual(previous, event)) fail("/events", "CONFLICTING_CLASSIFICATION_EVENT");
    if (!previous) unique.set(event.id, event);
    if (event.type === "approved") {
      if (!event.nationalCode.startsWith(event.hs6)) fail("/events", "CLASSIFICATION_CODE_PREFIX_MISMATCH");
      if (event.validFrom > event.validThrough || event.reviewedOn > event.reviewBy || event.validThrough > event.reviewBy)
        fail("/events", "INVALID_CLASSIFICATION_APPROVAL_RANGE");
      if (event.reviewedOn > today) fail("/events", "CLASSIFICATION_REVIEW_NOT_OBSERVED");
    } else if (event.revokedOn > today) fail("/events", "CLASSIFICATION_REVOCATION_NOT_OBSERVED");
  }
  const result = [...unique.values()];
  const observed = new Map<string, ClassificationApprovalEvent>();
  for (const event of result) {
    if (event.type === "approved") observed.set(event.id, event);
    else {
      const original = observed.get(event.approvalId);
      if (!original) fail("/events", "CLASSIFICATION_REVOCATION_REFERENCE_INVALID");
      if (event.revokedOn < original.reviewedOn) fail("/events", "CLASSIFICATION_REVOCATION_DATE_INVALID");
    }
  }
  return structuredClone(result);
}

/** Produce a record only after the caller has explicitly reviewed a proposal. */
export function createClassificationApproval(
  input: unknown, catalog: ClassificationCatalog, data: Dataset, now = new Date(),
): ClassificationApprovalEvent {
  if (!validateApproval(input)) fail("/approval", "INVALID_CLASSIFICATION_APPROVAL_REQUEST");
  const proposal = proposeClassification(input.request, catalog, data, now);
  if (proposal.requestDigest !== input.requestDigest) fail("/requestDigest", "CLASSIFICATION_REVIEW_SCOPE_MISMATCH");
  const candidate = proposal.candidates.find(value => value.ruleId === input.ruleId);
  if (!candidate?.eligibleForApproval || !candidate.nationalCode || !candidate.tariffEdition)
    fail("/ruleId", "CLASSIFICATION_REVIEWABLE_CODE_REQUIRED");
  const sources = candidate.sourceIds.map(sourceId => catalog.source(sourceId));
  if (sources.some(source => !source)) fail("/ruleId", "CLASSIFICATION_SOURCE_REQUIRED");
  const today = todayJst(now);
  if (input.reviewedOn > today || sources.some(source => source!.checkedOn > input.reviewedOn))
    fail("/reviewedOn", "CLASSIFICATION_REVIEW_NOT_OBSERVED");
  if (input.validFrom > input.request.context.date || input.validThrough < input.request.context.date ||
      sources.some(source => input.validFrom < source!.effectiveFrom || input.validThrough > source!.effectiveThrough ||
        input.reviewBy > source!.reviewBy))
    fail("/validThrough", "CLASSIFICATION_APPROVAL_SOURCE_RANGE_MISMATCH");
  const event: ClassificationApprovalEvent = {
    type: "approved", id: input.id,
    merchantId: proposal.merchantId, sku: proposal.sku, revision: proposal.revision,
    productFingerprint: proposal.productFingerprint, requestDigest: proposal.requestDigest,
    country: proposal.context.country, direction: proposal.context.direction,
    hsEdition: proposal.context.hsEdition, ruleId: candidate.ruleId,
    hs6: candidate.hs6, nationalCode: candidate.nationalCode, tariffEdition: candidate.tariffEdition,
    catalogDigest: proposal.catalogDigest, sourceIds: [...candidate.sourceIds],
    validFrom: input.validFrom, validThrough: input.validThrough, reviewedOn: input.reviewedOn,
    reviewBy: input.reviewBy, reviewerRef: input.reviewerRef, evidenceIds: [...input.evidenceIds],
  };
  parseClassificationEvents([event], now);
  if (event.reviewBy < today) fail("/reviewBy", "CLASSIFICATION_REVIEW_EXPIRED");
  return event;
}

/** Record withdrawal of a previously observed operator approval. */
export function createClassificationRevocation(
  input: unknown, events: readonly ClassificationEvent[], now = new Date(),
): ClassificationRevocationEvent {
  const history = parseClassificationEvents([...events, input], now);
  const candidate = history.find(event => event.id === (input as { id?: unknown })?.id);
  if (!candidate || candidate.type !== "revoked") fail("/revocation", "INVALID_CLASSIFICATION_REVOCATION");
  return structuredClone(candidate);
}

function approvalIssue(
  event: ClassificationApprovalEvent, request: ClassificationRequest, proposal: ClassificationProposal,
  catalog: ClassificationCatalog, revoked: ReadonlySet<string>, today: string,
): string | null {
  if (event.revision !== request.product.revision) return "CLASSIFICATION_PRODUCT_REVISION_CHANGED";
  if (event.productFingerprint !== proposal.productFingerprint) return "CLASSIFICATION_PRODUCT_CHANGED";
  if (event.country !== request.context.country || event.direction !== request.context.direction || event.hsEdition !== request.context.hsEdition)
    return "CLASSIFICATION_CONTEXT_CHANGED";
  if (revoked.has(event.id)) return "CLASSIFICATION_APPROVAL_REVOKED";
  if (event.catalogDigest !== catalog.digest) return "CLASSIFICATION_CATALOG_CHANGED";
  if (today > event.reviewBy || request.context.date > event.reviewBy)
    return "CLASSIFICATION_REVIEW_EXPIRED";
  if (request.context.date < event.validFrom || request.context.date > event.validThrough)
    return "CLASSIFICATION_APPROVAL_DATE_OUT_OF_RANGE";
  const candidate = proposal.candidates.find(value => value.ruleId === event.ruleId);
  if (!candidate?.eligibleForApproval || candidate.hs6 !== event.hs6 || candidate.nationalCode !== event.nationalCode ||
      candidate.tariffEdition !== event.tariffEdition ||
      !isDeepStrictEqual([...candidate.sourceIds].sort(), [...event.sourceIds].sort()))
    return "CLASSIFICATION_APPROVAL_NO_LONGER_APPLICABLE";
  const sources = event.sourceIds.map(sourceId => catalog.source(sourceId));
  if (sources.some(source => !source || source.checkedOn > event.reviewedOn ||
      event.validFrom < source.effectiveFrom || event.validThrough > source.effectiveThrough ||
      event.reviewBy > source.reviewBy)) return "CLASSIFICATION_APPROVAL_SOURCE_CHANGED";
  return null;
}

/** Apply protected operator records; request bodies cannot supply their own approval. */
export function assignClassification(
  input: unknown, catalog: ClassificationCatalog, inputEvents: readonly ClassificationEvent[], data: Dataset, now = new Date(),
): ClassificationAssignment {
  const request = parseClassificationRequest(input, data);
  const proposal = proposeClassification(request, catalog, data, now);
  const events = parseClassificationEvents(inputEvents, now);
  const revoked = new Set(events.flatMap(event => event.type === "revoked" ? [event.approvalId] : []));
  const matching = events.filter((event): event is ClassificationApprovalEvent => event.type === "approved" &&
    event.merchantId === request.product.merchantId && event.sku === request.product.sku);
  const assignmentIssues: string[] = [];
  const active: ClassificationApprovalEvent[] = [];
  for (const event of matching) {
    const issue = approvalIssue(event, request, proposal, catalog, revoked, todayJst(now));
    if (issue) { if (!assignmentIssues.includes(issue)) assignmentIssues.push(issue); }
    else active.push(event);
  }
  const result: ClassificationAssignment = {
    ...proposal, status: matching.length ? "review_required" : proposal.status,
    classificationConfirmed: false, hs6: null, nationalCode: null, tariffEdition: null,
    approval: null, assignmentIssues,
  };
  if (!active.length) return result;
  if (new Set(active.map(event => event.hs6 + ":" + event.nationalCode + ":" + event.tariffEdition)).size > 1) {
    result.assignmentIssues.push("CONFLICTING_CLASSIFICATION_APPROVALS");
    return result;
  }
  active.sort((left, right) => right.reviewedOn.localeCompare(left.reviewedOn) || right.id.localeCompare(left.id));
  const selected = active[0]!;
  return {
    ...result, status: "approved", classificationConfirmed: true,
    hs6: selected.hs6, nationalCode: selected.nationalCode, tariffEdition: selected.tariffEdition,
    approval: { id: selected.id, reviewedOn: selected.reviewedOn, reviewBy: selected.reviewBy,
      reviewerRef: selected.reviewerRef, evidenceIds: [...selected.evidenceIds],
      validFrom: selected.validFrom, validThrough: selected.validThrough },
    assignmentIssues: [],
  };
}
