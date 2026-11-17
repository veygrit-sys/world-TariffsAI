export type ClassificationDirection = "import" | "export";

export interface ClassificationProduct {
  merchantId: string;
  sku: string;
  revision: string;
  description: string;
  attributes: Record<string, string>;
}

export interface ClassificationContext {
  country: string;
  direction: ClassificationDirection;
  date: string;
  hsEdition: string;
}

export interface ClassificationRequest {
  product: ClassificationProduct;
  context: ClassificationContext;
}

export interface ClassificationSource {
  id: string;
  title: string;
  url: string;
  kind: "classification_ruling" | "tariff_schedule" | "hs_nomenclature";
  countries: string[];
  direction: ClassificationDirection | "both";
  hsEdition: string;
  checkedOn: string;
  reviewBy: string;
  effectiveFrom: string;
  /** Inclusive catalog applicability boundary, not a declaration of legal validity. */
  effectiveThrough: string;
  terms: string;
}

export interface ClassificationRule {
  id: string;
  title: string;
  country: string;
  direction: ClassificationDirection | "both";
  hsEdition: string;
  hs6: string;
  nationalCode?: string;
  tariffEdition?: string;
  keywords: string[];
  requiredAttributes: string[];
  attributeConditions: Record<string, string[]>;
  questions: Record<string, string>;
  sourceIds: string[];
  rationale: string;
}

export interface ClassificationCatalogDocument {
  version: string;
  sources: ClassificationSource[];
  rules: ClassificationRule[];
}

export interface ClassificationCandidate {
  ruleId: string;
  hs6: string;
  nationalCode: string | null;
  tariffEdition: string | null;
  title: string;
  rationale: string;
  sourceIds: string[];
  matchedAttributes: string[];
  missingAttributes: string[];
  /** Eligibility still requires a separate, recorded operator approval. */
  eligibleForApproval: boolean;
  classificationConfirmed: false;
}

export interface ClassificationQuestion {
  attribute: string;
  question: string;
  candidateRuleIds: string[];
}

export interface ClassificationProposal {
  status: "needs_attributes" | "candidates" | "unsupported" | "review_required";
  merchantId: string;
  sku: string;
  revision: string;
  context: ClassificationContext;
  productFingerprint: string;
  contextDigest: string;
  requestDigest: string;
  catalogDigest: string;
  catalogVersion: string;
  candidates: ClassificationCandidate[];
  questions: ClassificationQuestion[];
  findings: { code: string; sourceId?: string }[];
  classificationConfirmed: false;
}

export const classificationObject = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({
  type: "object", additionalProperties: false, properties, required,
});
export const classificationIdSchema = {
  type: "string", minLength: 1, maxLength: 100, pattern: "^[A-Za-z0-9_.:-]+$",
};
export const classificationDigestSchema = { type: "string", pattern: "^[a-f0-9]{64}$" };
export const classificationDateSchema = { type: "string", format: "date" };
export const classificationSkuSchema = {
  type: "string", minLength: 1, maxLength: 100, pattern: "^[^\\u0000-\\u001f\\u007f-\\u009f]+$",
};
export const classificationAttributeKeySchema = {
  type: "string", pattern: "^[a-z][a-z0-9_]{0,49}$", not: { enum: ["constructor", "prototype", "__proto__"] },
};
const attributeMap = {
  type: "object", maxProperties: 50, propertyNames: classificationAttributeKeySchema,
  additionalProperties: { type: "string", minLength: 1, maxLength: 500 },
};
export const classificationProductSchema = classificationObject({
  merchantId: classificationIdSchema, sku: classificationSkuSchema, revision: classificationIdSchema,
  description: { type: "string", minLength: 1, maxLength: 4000 }, attributes: attributeMap,
});
export const classificationContextSchema = classificationObject({
  country: { type: "string", pattern: "^[A-Z]{2}$" }, direction: { enum: ["import", "export"] },
  date: classificationDateSchema, hsEdition: { type: "string", minLength: 1, maxLength: 40 },
});
export const classificationRequestSchema = classificationObject({
  product: classificationProductSchema, context: classificationContextSchema,
});
const strings = (items: object, maxItems: number, minItems = 0) => ({ type: "array", items, minItems, maxItems, uniqueItems: true });
const shortText = { type: "string", minLength: 1, maxLength: 1000 };
const attributes = strings(classificationAttributeKeySchema, 50);
export const classificationCandidateSchema = classificationObject({
  ruleId: classificationIdSchema, hs6: { type: "string", pattern: "^[0-9]{6}$" },
  nationalCode: { anyOf: [{ type: "string", pattern: "^[0-9]{7,12}$" }, { type: "null" }] },
  tariffEdition: { anyOf: [{ type: "string", minLength: 1, maxLength: 100 }, { type: "null" }] },
  title: shortText, rationale: shortText, sourceIds: strings(classificationIdSchema, 20, 1),
  matchedAttributes: attributes, missingAttributes: attributes,
  eligibleForApproval: { type: "boolean" }, classificationConfirmed: { const: false },
});
export const classificationProposalSchema = classificationObject({
  status: { enum: ["needs_attributes", "candidates", "unsupported", "review_required"] },
  merchantId: classificationIdSchema, sku: classificationSkuSchema, revision: classificationIdSchema,
  context: classificationContextSchema,
  productFingerprint: classificationDigestSchema, contextDigest: classificationDigestSchema,
  requestDigest: classificationDigestSchema, catalogDigest: classificationDigestSchema,
  catalogVersion: classificationIdSchema,
  candidates: { type: "array", minItems: 0, maxItems: 3, items: classificationCandidateSchema },
  questions: { type: "array", maxItems: 50, items: classificationObject({
    attribute: classificationAttributeKeySchema, question: shortText,
    candidateRuleIds: strings(classificationIdSchema, 3, 1),
  }) },
  findings: { type: "array", maxItems: 2000, items: classificationObject({
    code: classificationIdSchema, sourceId: classificationIdSchema,
  }, ["code"]) },
  classificationConfirmed: { const: false },
});
