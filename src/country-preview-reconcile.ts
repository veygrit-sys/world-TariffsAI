import { Ajv } from "ajv";
import { previewCountryShipment, type CountryPreviewResult } from "./country-preview.ts";
import { todayJst } from "./dataset.ts";
import { currencyDigits, minor, money } from "./money.ts";
import { pilotChargeCategories, type PilotChargeCategory } from "./pilot-quote.ts";
import { InputError } from "./schema.ts";
import type { Dataset } from "./types.ts";
import { isDate } from "./wco.ts";

type Stage = "checkout" | "import";
interface ObservedDocument {
  stage: Stage;
  currency: string;
  lines: { category: PilotChargeCategory; value: string }[];
  requestDigest?: string;
  issuedOn?: string;
}

export const countryPreviewDocumentSchema = {
  type: "object", additionalProperties: false, required: ["stage", "currency", "lines"],
  properties: {
    stage: { enum: ["checkout", "import"] },
    currency: { type: "string", pattern: "^[A-Z]{3}$" },
    requestDigest: { type: "string", pattern: "^[a-f0-9]{64}$" },
    issuedOn: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
    lines: {
      type: "array", maxItems: pilotChargeCategories.length,
      items: {
        type: "object", additionalProperties: false, required: ["category", "value"],
        properties: {
          category: { enum: pilotChargeCategories },
          value: { type: "string", pattern: "^(0|[1-9]\\d{0,11})(\\.\\d{1,4})?$" },
        },
      },
    },
  },
};

const validate = new Ajv({ ownProperties: true, allErrors: true }).compile<{
  request: { shipment: { currency: string; importDate: string }; evidence?: Record<string, unknown> };
  document: ObservedDocument;
}>({
  type: "object", additionalProperties: false, required: ["request", "document"],
  properties: { request: { type: "object" }, document: countryPreviewDocumentSchema },
});

export interface CountryPreviewReconciliation {
  requestDigest: string;
  stage: Stage;
  previewCurrency: string;
  documentCurrency: string;
  previewStatus: CountryPreviewResult["status"];
  status: "matched_components" | "differences" | "needs_review";
  lines: {
    category: PilotChargeCategory;
    estimated: string | null;
    observed: string | null;
    difference: string | null;
    status: "matched" | "difference" | "estimate_missing" | "document_missing" | "not_comparable";
    sourceIds: string[];
  }[];
  reasons: string[];
  landedCostTotal: null;
  checkoutReady: false;
  productionAuthorized: false;
  shippingAuthorized: false;
}

function readObserved(document: ObservedDocument): Map<PilotChargeCategory, bigint> {
  try { currencyDigits(document.currency); }
  catch { throw new InputError([{ path: "/document/currency", code: "UNSUPPORTED_CURRENCY" }]); }
  const amounts = new Map<PilotChargeCategory, bigint>();
  for (const [index, line] of document.lines.entries()) {
    if (amounts.has(line.category))
      throw new InputError([{ path: `/document/lines/${index}/category`, code: "DUPLICATE_DOCUMENT_CATEGORY" }]);
    try { amounts.set(line.category, minor(line.value, document.currency)); }
    catch { throw new InputError([{ path: `/document/lines/${index}/value`, code: "INVALID_DOCUMENT_AMOUNT" }]); }
  }
  return amounts;
}

/** Compare the same stage and category only. Signed differences are observed minus estimated. */
export function reconcileCountryPreview(input: unknown, data: Dataset, now = new Date()): CountryPreviewReconciliation {
  if (!validate(input)) throw new InputError((validate.errors ?? []).slice(0, 20).map(e => ({ path: e.instancePath, code: e.keyword })));
  const { document, request } = input;
  if (document.issuedOn !== undefined && !isDate(document.issuedOn))
    throw new InputError([{ path: "/document/issuedOn", code: "INVALID_DATE" }]);
  const observed = readObserved(document);
  const preview = previewCountryShipment(request, data, now);
  const { currency: previewCurrency, importDate } = request.shipment;
  const result: CountryPreviewReconciliation = {
    requestDigest: preview.requestDigest, stage: document.stage, previewCurrency, documentCurrency: document.currency,
    previewStatus: preview.status, status: "needs_review", lines: [], reasons: [...preview.reasons],
    landedCostTotal: null, checkoutReady: false, productionAuthorized: false, shippingAuthorized: false,
  };
  const holds: string[] = [];
  if (document.currency !== previewCurrency) holds.push("DOCUMENT_CURRENCY_MISMATCH");
  if (document.requestDigest === undefined) result.reasons.push("DOCUMENT_BINDING_UNVERIFIED");
  else if (document.requestDigest !== preview.requestDigest) holds.push("DOCUMENT_REQUEST_MISMATCH");
  if (document.issuedOn === undefined) result.reasons.push("DOCUMENT_DATE_UNVERIFIED");
  else {
    const earliest = document.stage === "import" ? importDate : request.evidence?.saleDate;
    if (document.issuedOn > todayJst(now) || (typeof earliest === "string" && document.issuedOn < earliest))
      holds.push("DOCUMENT_DATE_OUT_OF_SEQUENCE");
  }
  result.reasons.push(...holds);
  // An explicit zero for a non-applicable border charge remains a border component.
  const stageOf = (c: CountryPreviewResult["charges"][number]): Stage =>
    c.collection === "not_applicable" ? c.category === "checkout_tax" ? "checkout" : "import" : c.collection;
  for (const category of pilotChargeCategories) {
    const candidates = preview.charges.filter(c => c.category === category);
    const expected = candidates.filter(c => stageOf(c) === document.stage);
    const actual = observed.get(category);
    if (!expected.length && actual === undefined) continue;
    const charge = expected.length === 1 ? expected[0] : undefined;
    const line: CountryPreviewReconciliation["lines"][number] = {
      category, estimated: charge?.value ?? null, observed: actual === undefined ? null : money(actual, document.currency).value,
      difference: null, status: "not_comparable", sourceIds: charge?.sourceIds ?? [],
    };
    if (holds.length === 0) {
      if (!expected.length && candidates.length) result.reasons.push("DOCUMENT_COLLECTION_STAGE_MISMATCH");
      else if (!expected.length) line.status = "estimate_missing";
      else if (!charge || charge.currency !== previewCurrency || !charge.sourceIds.length ||
          !charge.sourceIds.every(id => preview.sources.some(s => s.id === id))) result.reasons.push("PREVIEW_COMPONENT_REVIEW");
      else if (actual === undefined) line.status = "document_missing";
      else {
        const delta = actual - minor(charge.value, previewCurrency);
        line.difference = delta < 0n ? "-" + money(-delta, previewCurrency).value : money(delta, previewCurrency).value;
        line.status = delta === 0n ? "matched" : "difference";
      }
    }
    result.lines.push(line);
  }
  if (result.lines.some(line => line.status === "difference")) result.status = "differences";
  else if (result.lines.length && result.lines.every(line => line.status === "matched")) result.status = "matched_components";
  result.reasons = [...new Set(result.reasons)];
  return result;
}
