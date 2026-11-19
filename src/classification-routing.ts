import { loadDataset } from "./dataset.ts";
import { analyzeClassificationCandidates } from "./classification.ts";
import type { ClassificationCandidateAnalysis } from "./classification.ts";
import type { ClassificationCatalog } from "./classification-catalog.ts";
import { parseClassificationBatch } from "./classification-batch.ts";
import {
  assignClassification, classificationAssignmentSchema,
  type ClassificationAssignment, type ClassificationEvent,
} from "./classification-approvals.ts";
import {
  classificationCandidateSchema, classificationContextSchema, classificationDigestSchema,
  classificationIdSchema, classificationObject, classificationProposalSchema,
  classificationSkuSchema,
  type ClassificationCandidate, type ClassificationContext, type ClassificationQuestion,
} from "./classification-types.ts";
import type { Dataset } from "./types.ts";

export const classificationRoutingStatuses = [
  "assigned", "candidate_selected", "needs_attributes", "ambiguous", "review_required", "unsupported",
] as const;
export type ClassificationRoutingStatus = typeof classificationRoutingStatuses[number];

export interface ClassificationRoutingResult {
  merchantId: string;
  sku: string;
  revision: string;
  context: ClassificationContext;
  status: ClassificationRoutingStatus;
  classificationConfirmed: boolean;
  selectedCandidate: ClassificationCandidate | null;
  assignment: ClassificationAssignment;
  matchingIdentityCount: number;
  completeIdentityCount: number;
  questions: ClassificationQuestion[];
  questionsTruncated: boolean;
  decisionReasons: string[];
}

export interface ClassificationRoutingGroup {
  status: "assigned" | "candidate_selected";
  hs6: string;
  nationalCode: string | null;
  tariffEdition: string | null;
  classificationConfirmed: boolean;
  skus: string[];
}

export interface ClassificationRoutingBatch {
  merchantId: string;
  context: ClassificationContext;
  catalogVersion: string;
  catalogDigest: string;
  classificationConfirmed: boolean;
  counts: Record<ClassificationRoutingStatus, number>;
  queues: Record<ClassificationRoutingStatus, string[]>;
  groups: ClassificationRoutingGroup[];
  results: ClassificationRoutingResult[];
  shippingAuthorized: false;
  productionAuthorized: false;
}

const count = { type: "integer", minimum: 0, maximum: 5000 };
const nullable = (schema: object) => ({ anyOf: [schema, { type: "null" }] });
const skuList = { type: "array", maxItems: 100, uniqueItems: true, items: classificationSkuSchema };
export const classificationRoutingResultSchema = classificationObject({
  merchantId: classificationIdSchema, sku: classificationSkuSchema, revision: classificationIdSchema,
  context: classificationContextSchema, status: { enum: classificationRoutingStatuses },
  classificationConfirmed: { type: "boolean" }, selectedCandidate: nullable(classificationCandidateSchema),
  assignment: classificationAssignmentSchema,
  matchingIdentityCount: count, completeIdentityCount: count,
  questions: classificationProposalSchema.properties.questions,
  questionsTruncated: { type: "boolean" },
  decisionReasons: { type: "array", minItems: 1, maxItems: 10000, uniqueItems: true, items: classificationIdSchema },
});

export const classificationRoutingBatchOutputSchema = classificationObject({
  merchantId: classificationIdSchema, context: classificationContextSchema,
  catalogVersion: classificationIdSchema, catalogDigest: classificationDigestSchema,
  classificationConfirmed: { type: "boolean" },
  counts: classificationObject(Object.fromEntries(classificationRoutingStatuses.map(status => [status,
    { type: "integer", minimum: 0, maximum: 100 }]))),
  queues: classificationObject(Object.fromEntries(classificationRoutingStatuses.map(status => [status, skuList]))),
  groups: { type: "array", maxItems: 100, items: classificationObject({
    status: { enum: ["assigned", "candidate_selected"] }, hs6: { type: "string", pattern: "^[0-9]{6}$" },
    nationalCode: nullable({ type: "string", pattern: "^[0-9]{7,12}$" }),
    tariffEdition: nullable({ type: "string", minLength: 1, maxLength: 100 }),
    classificationConfirmed: { type: "boolean" }, skus: { ...skuList, minItems: 1 },
  }) },
  results: { type: "array", minItems: 1, maxItems: 100, items: classificationRoutingResultSchema },
  shippingAuthorized: { const: false }, productionAuthorized: { const: false },
});

function identity(candidate: ClassificationCandidate): string {
  return JSON.stringify([candidate.hs6, candidate.nationalCode, candidate.tariffEdition]);
}

/** Collect questions beyond the public proposal's three displayed identities. */
function routingQuestions(analysis: ClassificationCandidateAnalysis): {
  questions: ClassificationQuestion[]; questionsTruncated: boolean;
} {
  const questions = new Map<string, ClassificationQuestion>();
  for (const { rule, candidate } of analysis.rankedCandidates) {
    for (const attribute of candidate.missingAttributes) {
      const question = questions.get(attribute) ?? {
        attribute,
        question: Object.hasOwn(rule.questions, attribute)
          ? rule.questions[attribute]! : `Provide the confirmed ${attribute.replaceAll("_", " ")}.`,
        candidateRuleIds: [],
      };
      if (question.candidateRuleIds.length < 3 && !question.candidateRuleIds.includes(rule.id))
        question.candidateRuleIds.push(rule.id);
      questions.set(attribute, question);
    }
  }
  return { questions: [...questions.values()].slice(0, 50), questionsTruncated: questions.size > 50 };
}

/** Select work and an unconfirmed reference; only protected reviews can supply an assignment. */
export function routeClassification(
  input: unknown, catalog: ClassificationCatalog, events: readonly ClassificationEvent[],
  data: Dataset = loadDataset(), now = new Date(),
): ClassificationRoutingResult {
  const analysis = analyzeClassificationCandidates(input, catalog, data, now);
  const assignment = assignClassification(analysis.request, catalog, events, data, now);
  const identities = new Map<string, ClassificationCandidate[]>();
  for (const { candidate } of analysis.rankedCandidates) {
    const key = identity(candidate);
    const alternatives = identities.get(key) ?? [];
    alternatives.push(candidate);
    identities.set(key, alternatives);
  }
  const complete = [...identities.values()].flatMap(alternatives => {
    const witness = alternatives.find(candidate => candidate.missingAttributes.length === 0);
    return witness ? [witness] : [];
  });
  const base = {
    merchantId: assignment.merchantId, sku: assignment.sku, revision: assignment.revision,
    context: assignment.context, assignment,
    matchingIdentityCount: identities.size, completeIdentityCount: complete.length,
    classificationConfirmed: false, selectedCandidate: null,
    questions: [] as ClassificationQuestion[], questionsTruncated: false,
  };
  if (assignment.status === "approved") return {
    ...base, status: "assigned", classificationConfirmed: true,
    decisionReasons: ["CLASSIFICATION_ROUTING_APPROVAL_REUSED"],
  };
  const sourceIssues = analysis.proposal.findings.filter(finding => finding.code.startsWith("CLASSIFICATION_SOURCE_"));
  if (assignment.status === "review_required" || assignment.assignmentIssues.length || sourceIssues.length) return {
    ...base, status: "review_required",
    decisionReasons: [...new Set(["CLASSIFICATION_ROUTING_REVIEW_REQUIRED", ...assignment.assignmentIssues,
      ...sourceIssues.map(finding => finding.code)])],
  };
  if (!identities.size) return {
    ...base, status: "unsupported",
    decisionReasons: analysis.proposal.findings.length
      ? [...new Set(analysis.proposal.findings.map(finding => finding.code))]
      : ["CLASSIFICATION_REFERENCE_NOT_FOUND"],
  };
  if (complete.length > 1) return {
    ...base, status: "ambiguous", decisionReasons: ["CLASSIFICATION_ROUTING_MULTIPLE_COMPLETE_IDENTITIES"],
  };
  if (!complete.length || identities.size > 1) return {
    ...base, ...routingQuestions(analysis), status: "needs_attributes",
    decisionReasons: ["CLASSIFICATION_ROUTING_ATTRIBUTES_REQUIRED"],
  };
  return {
    ...base, status: "candidate_selected", selectedCandidate: complete[0]!,
    decisionReasons: ["CLASSIFICATION_ROUTING_UNIQUE_COMPLETE_IDENTITY"],
  };
}

/** Keep every SKU in exactly one queue, preserving first appearance within each selected code group. */
export function routeClassificationBatch(
  input: unknown, catalog: ClassificationCatalog, events: readonly ClassificationEvent[],
  data: Dataset = loadDataset(), now = new Date(),
): ClassificationRoutingBatch {
  const batch = parseClassificationBatch(input, data);
  const counts = Object.fromEntries(classificationRoutingStatuses.map(status => [status, 0])) as
    Record<ClassificationRoutingStatus, number>;
  const queues = Object.fromEntries(classificationRoutingStatuses.map(status => [status, [] as string[]])) as
    Record<ClassificationRoutingStatus, string[]>;
  const groups = new Map<string, ClassificationRoutingGroup>();
  const results = batch.products.map(product => routeClassification({ product, context: batch.context }, catalog, events, data, now));
  for (const result of results) {
    counts[result.status]++;
    queues[result.status].push(result.sku);
    if (result.status !== "assigned" && result.status !== "candidate_selected") continue;
    const selected = result.status === "assigned" ? result.assignment : result.selectedCandidate!;
    const hs6 = selected.hs6!;
    const key = JSON.stringify([result.status, hs6, selected.nationalCode, selected.tariffEdition]);
    const group = groups.get(key) ?? {
      status: result.status, hs6, nationalCode: selected.nationalCode, tariffEdition: selected.tariffEdition,
      classificationConfirmed: result.classificationConfirmed, skus: [],
    };
    group.skus.push(result.sku);
    groups.set(key, group);
  }
  return {
    merchantId: batch.products[0]!.merchantId, context: batch.context,
    catalogVersion: catalog.version, catalogDigest: catalog.digest,
    classificationConfirmed: results.every(result => result.classificationConfirmed),
    counts, queues, groups: [...groups.values()], results,
    shippingAuthorized: false, productionAuthorized: false,
  };
}
