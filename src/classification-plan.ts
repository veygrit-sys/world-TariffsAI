import { Ajv } from "ajv";
import addFormatsModule from "ajv-formats";
import { loadDataset } from "./dataset.ts";
import { InputError, parseCustomsPlan } from "./schema.ts";
import { parseClassificationRequest } from "./classification.ts";
import type { ClassificationCatalog } from "./classification-catalog.ts";
import {
  assignClassification, type ClassificationAssignment, type ClassificationEvent,
} from "./classification-approvals.ts";
import {
  classificationContextSchema, classificationIdSchema, classificationObject, classificationProductSchema,
  type ClassificationContext, type ClassificationProduct,
} from "./classification-types.ts";
import type { CustomsPlanRequest, Dataset } from "./types.ts";

export interface ClassificationPlanInput {
  authenticatedMerchantId: string;
  context: ClassificationContext;
  /** Load these products from the authenticated merchant's catalogue, not from an end-user payload. */
  bindings: { itemId: string; product: ClassificationProduct; productIdentifier?: string }[];
}
export interface ClassifiedCustomsPlan {
  status: "classified" | "review_required";
  plan: CustomsPlanRequest;
  items: {
    itemId: string;
    sku: string | null;
    status: "applied" | "held";
    assignment: ClassificationAssignment | null;
    issues: string[];
  }[];
  issues: string[];
  shippingAuthorized: false;
  productionAuthorized: false;
}
export const classificationPlanInputSchema = classificationObject({
  authenticatedMerchantId: classificationIdSchema,
  context: classificationContextSchema,
  bindings: { type: "array", maxItems: 100, items: classificationObject({
    itemId: classificationIdSchema, product: classificationProductSchema,
    productIdentifier: classificationIdSchema,
  }, ["itemId", "product"]) },
});
const ajv = new Ajv({ allErrors: true, strict: true });
(addFormatsModule as unknown as (instance: Ajv) => void)(ajv);
const validate = ajv.compile<ClassificationPlanInput>(classificationPlanInputSchema);
const normalizedDescription = (text: string) => text.normalize("NFKC").trim().replace(/\s+/gu, " ");

/** Apply only current, protected approvals to a trusted order snapshot. This does not verify a recipient grant. */
export function applyClassificationAssignments(
  planInput: unknown, input: unknown, catalog: ClassificationCatalog, events: readonly ClassificationEvent[],
  data: Dataset = loadDataset(), now = new Date(),
): ClassifiedCustomsPlan {
  if (!validate(input)) throw new InputError((validate.errors ?? []).slice(0, 20)
    .map(({ instancePath, keyword }) => ({ path: instancePath, code: keyword })));
  const plan = structuredClone(parseCustomsPlan(planInput));
  const ids = new Set<string>();
  for (const item of plan.shipment.items) {
    if (ids.has(item.id)) throw new InputError([{ path: "/shipment/items", code: "DUPLICATE_ITEM_ID" }]);
    ids.add(item.id);
    // A revoked, stale or absent binding must not retain a caller's old confirmation flag.
    item.classificationConfirmed = false;
  }
  const bindings = new Map<string, ClassificationPlanInput["bindings"][number]>();
  for (const [index, binding] of input.bindings.entries()) {
    if (!ids.has(binding.itemId) || bindings.has(binding.itemId))
      throw new InputError([{ path: `/bindings/${index}/itemId`, code: bindings.has(binding.itemId) ? "DUPLICATE_ITEM_ID" : "UNKNOWN_ITEM_ID" }]);
    bindings.set(binding.itemId, binding);
  }
  const lines = new Map<string, NonNullable<CustomsPlanRequest["lines"]>[number]>();
  for (const [index, line] of (plan.lines ?? []).entries()) {
    if (!ids.has(line.itemId) || lines.has(line.itemId))
      throw new InputError([{ path: `/lines/${index}/itemId`, code: lines.has(line.itemId) ? "DUPLICATE_ITEM_ID" : "UNKNOWN_ITEM_ID" }]);
    lines.set(line.itemId, line);
  }
  const scopeIssues: string[] = [];
  if (!plan.shipment.veygrit || plan.shipment.veygrit.merchantId !== input.authenticatedMerchantId)
    scopeIssues.push("CLASSIFICATION_VERIFIED_MERCHANT_ORDER_REQUIRED");
  if (input.context.direction !== "import") scopeIssues.push("CLASSIFICATION_PLAN_IMPORT_CONTEXT_REQUIRED");
  if (input.context.country !== plan.shipment.destinationCountry || input.context.date !== plan.shipment.importDate)
    scopeIssues.push("CLASSIFICATION_PLAN_CONTEXT_MISMATCH");
  const items: ClassifiedCustomsPlan["items"] = [];
  for (const item of plan.shipment.items) {
    const binding = bindings.get(item.id);
    const product = binding?.product;
    const result: ClassifiedCustomsPlan["items"][number] = {
      itemId: item.id, sku: product?.sku ?? null, status: "held", assignment: null, issues: [...scopeIssues],
    };
    items.push(result);
    if (!product) { result.issues.push("CLASSIFICATION_PRODUCT_BINDING_REQUIRED"); continue; }
    if (product.merchantId !== input.authenticatedMerchantId)
      result.issues.push("CLASSIFICATION_PRODUCT_MERCHANT_MISMATCH");
    if (item.productIdentifier !== (binding?.productIdentifier ?? product.sku))
      result.issues.push("CLASSIFICATION_PRODUCT_SKU_MISMATCH");
    if (normalizedDescription(item.description) !== normalizedDescription(product.description))
      result.issues.push("CLASSIFICATION_PRODUCT_DESCRIPTION_MISMATCH");
    if (result.issues.length) continue;
    const request = parseClassificationRequest({ product, context: input.context }, data);
    const assignment = assignClassification(request, catalog, events, data, now);
    result.assignment = assignment;
    if (assignment.status !== "approved" || !assignment.classificationConfirmed || !assignment.hs6 || !assignment.nationalCode) {
      result.issues.push("CLASSIFICATION_CURRENT_APPROVAL_REQUIRED", ...assignment.assignmentIssues);
      continue;
    }
    const line = lines.get(item.id);
    const priorCode = line?.tariffCode?.replace(/[. -]/g, "");
    if ((item.hs6 !== undefined && item.hs6 !== assignment.hs6) ||
        (priorCode !== undefined && priorCode !== assignment.nationalCode)) {
      result.issues.push("CLASSIFICATION_EXISTING_CODE_CONFLICT");
      continue;
    }
    item.hs6 = assignment.hs6;
    item.classificationConfirmed = true;
    if (line) line.tariffCode = assignment.nationalCode;
    else {
      const next = { itemId: item.id, tariffCode: assignment.nationalCode };
      (plan.lines ??= []).push(next);
      lines.set(item.id, next);
    }
    result.status = "applied";
  }
  return {
    status: items.every(item => item.status === "applied") ? "classified" : "review_required",
    plan, items, issues: [...new Set(items.flatMap(item => item.issues))],
    shippingAuthorized: false, productionAuthorized: false,
  };
}
