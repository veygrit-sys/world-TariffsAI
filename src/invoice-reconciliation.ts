import { Ajv } from "ajv";
import addFormatsModule from "ajv-formats";
import { currencyDigits, minor, money } from "./money.ts";
import { InputError } from "./schema.ts";

export const invoiceEstimateChargeCategories = [
  "customs_duty",
  "import_vat_gst",
  "additional_duty",
  "excise",
  "customs_fee",
  "carrier_fee",
] as const;
const invoiceChargeCategories = [...invoiceEstimateChargeCategories, "other"] as const;

export type InvoiceEstimateChargeCategory = (typeof invoiceEstimateChargeCategories)[number];
export type InvoiceChargeCategory = (typeof invoiceChargeCategories)[number];

const discrepancyReasons = [
  "tariff_rate", "customs_value", "exchange_rate", "tax_treatment", "fee", "rounding", "other",
] as const;

export interface InvoiceDiscrepancyExplanation {
  reason: (typeof discrepancyReasons)[number];
  evidenceId: string;
}

export interface InvoiceEstimate {
  estimateId: string;
  orderId: string;
  issuedOn: string;
  currency: string;
  charges: { category: InvoiceEstimateChargeCategory; amount: string | null }[];
}

export interface InvoiceReconciliationInput {
  estimate: InvoiceEstimate;
  invoice: {
    invoiceId: string;
    estimateId: string;
    orderId: string;
    issuedOn: string;
    currency: string;
    charges: {
      category: InvoiceChargeCategory;
      amount: string;
      explanation?: InvoiceDiscrepancyExplanation;
    }[];
  };
}

const reconciliationStatuses = ["needs_review", "matched", "differences"] as const;
const lineStatuses = ["matched", "difference", "estimate_missing", "invoice_missing", "amounts_missing"] as const;

export interface InvoiceReconciliationLine {
  category: InvoiceChargeCategory;
  estimate: string | null;
  actual: string | null;
  difference: string | null;
  status: (typeof lineStatuses)[number];
  explanation?: InvoiceDiscrepancyExplanation;
}

export interface InvoiceReconciliation {
  estimateId: string;
  invoiceId: string;
  orderId: string;
  currency: string;
  status: (typeof reconciliationStatuses)[number];
  lines: InvoiceReconciliationLine[];
  estimatedTotal: string | null;
  actualTotal: string | null;
  differenceTotal: string | null;
}

const object = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({
  type: "object",
  additionalProperties: false,
  properties,
  required,
});
const opaqueId = { type: "string", pattern: "^[A-Za-z0-9_.:-]{1,100}$" };
const amount = { type: "string", pattern: "^(0|[1-9]\\d{0,11})(\\.\\d{1,4})?$" };
const currency = { type: "string", pattern: "^[A-Z]{3}$" };
const date = { type: "string", format: "date" };
const nullable = (schema: object) => ({ anyOf: [schema, { type: "null" }] });
const invoiceFields = { estimateId: opaqueId, orderId: opaqueId, currency, issuedOn: date };
const explanation = object({ reason: { enum: discrepancyReasons }, evidenceId: opaqueId });

export const invoiceReconciliationInputSchema = object({
  estimate: object({
    ...invoiceFields,
    charges: {
      type: "array",
      minItems: invoiceEstimateChargeCategories.length,
      maxItems: invoiceEstimateChargeCategories.length,
      items: object({
        category: { enum: invoiceEstimateChargeCategories },
        amount: nullable(amount),
      }),
    },
  }),
  invoice: object({
    ...invoiceFields,
    invoiceId: opaqueId,
    charges: {
      type: "array",
      maxItems: invoiceChargeCategories.length,
      items: object({ category: { enum: invoiceChargeCategories }, amount, explanation }, ["category", "amount"]),
    },
  }),
});

const signedTotal = nullable({ type: "string", pattern: "^-?(0|[1-9]\\d{0,12})(\\.\\d{1,4})?$" });
export const invoiceReconciliationOutputSchema = object({
  estimateId: opaqueId,
  invoiceId: opaqueId,
  orderId: opaqueId,
  currency,
  status: { enum: reconciliationStatuses },
  lines: {
    type: "array",
    items: object(
      {
        category: { enum: invoiceChargeCategories },
        estimate: nullable(amount),
        actual: nullable(amount),
        difference: signedTotal,
        status: { enum: lineStatuses },
        explanation,
      },
      ["category", "estimate", "actual", "difference", "status"],
    ),
  },
  estimatedTotal: signedTotal,
  actualTotal: signedTotal,
  differenceTotal: signedTotal,
});

const ajv = new Ajv({ allErrors: true, strict: true });
const addFormats = addFormatsModule as unknown as (instance: Ajv) => void;
addFormats(ajv);
const validInput = ajv.compile<InvoiceReconciliationInput>(invoiceReconciliationInputSchema);

function fail(path: string, code: string): never {
  throw new InputError([{ path, code }]);
}

function checkCurrency(value: string, path: string): void {
  try {
    currencyDigits(value);
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    fail(path, error.message);
  }
}

interface ReconciliationCharge<T> {
  amount: T;
  explanation?: InvoiceDiscrepancyExplanation;
}

function amounts(
  charges: readonly (ReconciliationCharge<string | null> & { category: InvoiceChargeCategory })[],
  currency: string,
  path: string,
): Map<InvoiceChargeCategory, ReconciliationCharge<bigint | null>> {
  const values = new Map<InvoiceChargeCategory, ReconciliationCharge<bigint | null>>();
  for (const [index, charge] of charges.entries()) {
    if (values.has(charge.category)) {
      fail(`${path}/${index}/category`, "DUPLICATE_CHARGE_CATEGORY");
    }
    try {
      const amount = charge.amount === null ? null : minor(charge.amount, currency);
      values.set(charge.category, charge.explanation ? { amount, explanation: charge.explanation } : { amount });
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      fail(`${path}/${index}/amount`, error.message);
    }
  }
  return values;
}

function formatAmount(value: bigint | null, currency: string): string | null {
  if (value === null) return null;
  return value < 0n ? `-${money(-value, currency).value}` : money(value, currency).value;
}

function lineStatus(estimated: bigint | null, actual: bigint | null): InvoiceReconciliationLine["status"] {
  if (estimated === null && actual === null) return "amounts_missing";
  if (estimated === null) return "estimate_missing";
  if (actual === null) return "invoice_missing";
  return estimated === actual ? "matched" : "difference";
}

/** Compares a saved import-stage estimate to its corresponding posted charges. */
export function reconcileInvoice(input: unknown): InvoiceReconciliation {
  if (!validInput(input)) {
    throw new InputError((validInput.errors ?? []).slice(0, 20).map((error) => ({
      path: error.instancePath,
      code: error.keyword,
    })));
  }
  const { estimate, invoice } = input;
  const { estimateId, orderId, currency } = estimate;
  if (invoice.estimateId !== estimateId) fail("/invoice/estimateId", "ESTIMATE_ID_MISMATCH");
  if (invoice.orderId !== orderId) fail("/invoice/orderId", "ORDER_ID_MISMATCH");
  checkCurrency(currency, "/estimate/currency");
  checkCurrency(invoice.currency, "/invoice/currency");
  if (invoice.currency !== currency) fail("/invoice/currency", "CURRENCY_MISMATCH");
  if (invoice.issuedOn < estimate.issuedOn) fail("/invoice/issuedOn", "INVOICE_PREDATES_ESTIMATE");

  const expected = amounts(estimate.charges, currency, "/estimate/charges");
  const posted = amounts(invoice.charges, currency, "/invoice/charges");
  const lines: InvoiceReconciliationLine[] = [];
  let estimatedTotal: bigint | null = 0n;
  let actualTotal: bigint | null = 0n;
  let hasDifference = false;
  for (const category of invoiceChargeCategories) {
    if (!expected.has(category) && !posted.has(category)) continue;
    const estimated = expected.get(category)?.amount ?? null;
    const postedCharge = posted.get(category);
    const actual = postedCharge?.amount ?? null;
    const difference = estimated === null || actual === null ? null : actual - estimated;
    const status = lineStatus(estimated, actual);
    hasDifference ||= status === "difference";
    estimatedTotal = estimatedTotal === null || estimated === null ? null : estimatedTotal + estimated;
    actualTotal = actualTotal === null || actual === null ? null : actualTotal + actual;
    const line: InvoiceReconciliationLine = {
      category,
      estimate: formatAmount(estimated, currency),
      actual: formatAmount(actual, currency),
      difference: formatAmount(difference, currency),
      status,
    };
    if (status !== "matched" && postedCharge?.explanation) {
      line.explanation = { ...postedCharge.explanation };
    }
    lines.push(line);
  }

  let status: InvoiceReconciliation["status"] = "needs_review";
  let differenceTotal: bigint | null = null;
  if (estimatedTotal !== null && actualTotal !== null) {
    status = hasDifference ? "differences" : "matched";
    differenceTotal = actualTotal - estimatedTotal;
  }
  return {
    estimateId,
    invoiceId: invoice.invoiceId,
    orderId,
    currency,
    status,
    lines,
    estimatedTotal: formatAmount(estimatedTotal, currency),
    actualTotal: formatAmount(actualTotal, currency),
    differenceTotal: formatAmount(differenceTotal, currency),
  };
}
