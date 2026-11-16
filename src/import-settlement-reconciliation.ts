import { isDeepStrictEqual } from "node:util";
import { Ajv } from "ajv";
import addFormatsModule from "ajv-formats";
import { loadDataset, todayJst } from "./dataset.ts";
import { EU_COUNTRIES, requiresCustomsTerritoryReview } from "./engine.ts";
import {
  invoiceReconciliationInputSchema,
  invoiceReconciliationOutputSchema,
  reconcileInvoice,
  type InvoiceEstimate,
  type InvoiceReconciliation,
  type InvoiceReconciliationInput,
} from "./invoice-reconciliation.ts";
import { minor, money } from "./money.ts";
import { InputError } from "./schema.ts";
import type { Dataset } from "./types.ts";

export interface ImportSettlementScope {
  merchantId: string;
  orderId: string;
  shipmentId: string;
  estimateId: string;
  declarationId: string;
  originCountry: string;
  destinationCountry: string;
  /** Optional only for a saved legacy China-to-Japan billing binding. */
  settlementCurrency?: string;
  remittanceRoute: "carrier_advance";
  carrierId: string;
  carrierService: string;
  billingParty: "seller" | "buyer";
  billingAccountRef: string;
}

export const importSettlementTaxCategories = [
  "customs_duty", "import_vat_gst", "additional_duty", "excise",
] as const;

type TaxCategory = (typeof importSettlementTaxCategories)[number];

export interface CustomsRemittanceEvidence extends ImportSettlementScope {
  remittanceId: string;
  currency: string;
  paidOn: string;
  taxes: { category: TaxCategory; amount: string }[];
}

export interface CarrierInvoiceEvidence extends ImportSettlementScope {
  invoice: InvoiceReconciliationInput["invoice"];
}

export interface CarrierPaymentEvidence extends ImportSettlementScope {
  receiptId: string;
  invoiceId: string;
  currency: string;
  paidOn: string;
  amount: string;
}

export interface ImportSettlementReconciliationInput {
  scope: ImportSettlementScope;
  estimate: InvoiceEstimate;
  remittances?: CustomsRemittanceEvidence[];
  carrierInvoices?: CarrierInvoiceEvidence[];
  carrierPayments?: CarrierPaymentEvidence[];
}

type EvidenceStatus = "missing" | "partial" | "confirmed" | "needs_review";

export interface ImportSettlementReconciliation {
  status: "pending" | "reconciled" | "needs_review";
  orderId: string;
  shipmentId: string;
  estimateId: string;
  currency: string;
  customsRemittance: { status: EvidenceStatus; remittanceId: string | null; amount: string | null };
  carrierSettlement: {
    status: EvidenceStatus;
    invoiceId: string | null;
    receiptIds: string[];
    invoicedAmount: string | null;
    paidAmount: string | null;
  };
  invoiceReconciliation: InvoiceReconciliation | null;
  totals: { customsTax: string | null; carrierFees: string | null; importCost: string | null };
  issues: { path: string; code: string }[];
}

const object = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({
  type: "object",
  additionalProperties: false,
  properties,
  required,
});
const opaque = { type: "string", pattern: "^[A-Za-z0-9_.:-]{1,100}$" };
const amount = { type: "string", pattern: "^(0|[1-9]\\d{0,11})(\\.\\d{1,4})?$" };
const currencySchema = { type: "string", pattern: "^[A-Z]{3}$" };
const countrySchema = { type: "string", pattern: "^[A-Z]{2}$" };
const date = { type: "string", format: "date" };
const scopeFields = {
  merchantId: opaque,
  orderId: opaque,
  shipmentId: opaque,
  estimateId: opaque,
  declarationId: opaque,
  originCountry: countrySchema,
  destinationCountry: countrySchema,
  settlementCurrency: currencySchema,
  remittanceRoute: { const: "carrier_advance" },
  carrierId: opaque,
  carrierService: opaque,
  billingParty: { enum: ["seller", "buyer"] },
  billingAccountRef: opaque,
};
const requiredScopeFields = Object.keys(scopeFields).filter((key) => key !== "settlementCurrency");
const scopedObject = (properties: Record<string, unknown>) => object(
  { ...scopeFields, ...properties }, [...requiredScopeFields, ...Object.keys(properties)],
);
const scopeSchema = {
  ...scopedObject({}),
  if: { properties: { originCountry: { const: "CN" }, destinationCountry: { const: "JP" } } },
  else: {
    properties: { settlementCurrency: currencySchema },
    required: ["settlementCurrency"],
  },
};
const documents = (items: Record<string, unknown>) => ({ type: "array", maxItems: 100, items });

export const importSettlementReconciliationInputSchema = object({
  scope: scopeSchema,
  estimate: invoiceReconciliationInputSchema.properties.estimate,
  remittances: documents(scopedObject({
    remittanceId: opaque,
    currency: currencySchema,
    paidOn: date,
    taxes: {
      type: "array", maxItems: importSettlementTaxCategories.length,
      items: object({ category: { enum: importSettlementTaxCategories }, amount }),
    },
  })),
  carrierInvoices: documents(scopedObject({
    invoice: invoiceReconciliationInputSchema.properties.invoice,
  })),
  carrierPayments: documents(scopedObject({
    receiptId: opaque, invoiceId: opaque, currency: currencySchema, paidOn: date, amount,
  })),
}, ["scope", "estimate"]);

const statusSchema = { enum: ["missing", "partial", "confirmed", "needs_review"] };
const nullable = (schema: object) => ({ anyOf: [schema, { type: "null" }] });
const total = nullable({ type: "string", pattern: "^(0|[1-9]\\d{0,13})(\\.\\d{1,4})?$" });

export const importSettlementReconciliationOutputSchema = object({
  status: { enum: ["pending", "reconciled", "needs_review"] },
  orderId: opaque,
  shipmentId: opaque,
  estimateId: opaque,
  currency: currencySchema,
  customsRemittance: object({ status: statusSchema, remittanceId: nullable(opaque), amount: total }),
  carrierSettlement: object({
    status: statusSchema,
    invoiceId: nullable(opaque),
    receiptIds: { type: "array", items: opaque },
    invoicedAmount: total,
    paidAmount: total,
  }),
  invoiceReconciliation: nullable(invoiceReconciliationOutputSchema),
  totals: object({ customsTax: total, carrierFees: total, importCost: total }),
  issues: { type: "array", items: object({ path: { type: "string" }, code: { type: "string" } }) },
});

const ajv = new Ajv({ allErrors: true, strict: true });
const addFormats = addFormatsModule as unknown as (instance: Ajv) => void;
addFormats(ajv);
const validate = ajv.compile<ImportSettlementReconciliationInput>(importSettlementReconciliationInputSchema);

type Issues = ImportSettlementReconciliation["issues"];
const scopeKeys = Object.keys(scopeFields) as (keyof ImportSettlementScope)[];
const serviceFeeCategories = ["customs_fee", "carrier_fee"] as const;
let defaultSettlementCountries: Set<string> | undefined;

function settlementCountries(data: Dataset): Set<string> {
  return new Set([...data.countries, ...data.supplementalRegions]
    .filter(({ code, inScope }) => inScope && code !== "KP")
    .map(({ code }) => code));
}

function deduplicate<T extends ImportSettlementScope>(
  documents: readonly T[], scope: ImportSettlementScope, path: string,
  identify: (document: T) => string, normalize: (document: T) => unknown, issues: Issues,
): T[] {
  const unique = new Map<string, { document: T; normalized: unknown }>();
  for (const [index, document] of documents.entries()) {
    const wrongKey = scopeKeys.find((key) => scope[key] !== document[key]);
    if (wrongKey) {
      issues.push({ path: `${path}/${index}/${wrongKey}`, code: "SETTLEMENT_SCOPE_MISMATCH" });
      continue;
    }
    const id = identify(document);
    const previous = unique.get(id);
    const normalized = normalize(document);
    if (!previous) unique.set(id, { document, normalized });
    else if (!isDeepStrictEqual(previous.normalized, normalized)) {
      issues.push({ path: `${path}/${index}`, code: "CONFLICTING_SETTLEMENT_DOCUMENT" });
    }
  }
  return [...unique.values()].map(({ document }) => document);
}

function ordered<T extends { category: string }>(charges: readonly T[]): T[] {
  return [...charges].sort((left, right) => left.category.localeCompare(right.category));
}

function minorAt(value: string, currency: string, path: string): bigint {
  try {
    return minor(value, currency);
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    throw new InputError([{ path, code: error.message }]);
  }
}

function sumKnown<T extends string>(categories: readonly T[], lines: ReadonlyMap<T, bigint>): bigint | null {
  let total = 0n;
  for (const category of categories) {
    const value = lines.get(category);
    if (value === undefined) return null;
    total += value;
  }
  return total;
}

/** Reconcile authorized evidence for one carrier-advance shipment and declaration. */
export function reconcileImportSettlement(
  input: unknown, now = new Date(), data?: Dataset,
): ImportSettlementReconciliation {
  if (!validate(input)) {
    throw new InputError((validate.errors ?? []).slice(0, 20).map((error) => ({
      path: error.instancePath, code: error.keyword,
    })));
  }

  const { scope, estimate } = input;
  const { originCountry, destinationCountry } = scope;
  const countries = data ? settlementCountries(data) : (defaultSettlementCountries ??= settlementCountries(loadDataset()));
  if (originCountry === destinationCountry ||
      (EU_COUNTRIES.has(originCountry) && EU_COUNTRIES.has(destinationCountry)) ||
      !countries.has(originCountry) || !countries.has(destinationCountry) ||
      requiresCustomsTerritoryReview(originCountry, destinationCountry)) {
    throw new InputError([{ path: "/scope", code: "SETTLEMENT_ROUTE_OUT_OF_SCOPE" }]);
  }
  if (scope.orderId !== estimate.orderId || scope.estimateId !== estimate.estimateId) {
    throw new InputError([{ path: "/estimate", code: "SETTLEMENT_ESTIMATE_SCOPE_MISMATCH" }]);
  }
  if (scope.settlementCurrency !== undefined && scope.settlementCurrency !== estimate.currency) {
    throw new InputError([{ path: "/estimate/currency", code: "SETTLEMENT_ESTIMATE_CURRENCY_MISMATCH" }]);
  }
  const today = todayJst(now);
  if (estimate.issuedOn > today) {
    throw new InputError([{ path: "/estimate/issuedOn", code: "SETTLEMENT_DATE_OUT_OF_RANGE" }]);
  }
  const { currency } = estimate;

  // Reuse validation for the issued estimate even before a carrier invoice exists.
  reconcileInvoice({
    estimate,
    invoice: { orderId: estimate.orderId, estimateId: estimate.estimateId,
      invoiceId: "estimate-validation", issuedOn: estimate.issuedOn, currency, charges: [] },
  });

  const issues: Issues = [];
  const checkEvidence = (path: string, actualCurrency: string, occurredOn: string, earliest: string) => {
    const sameCurrency = actualCurrency === currency;
    if (!sameCurrency) issues.push({ path: path + "/currency", code: "CURRENCY_MISMATCH" });
    if (occurredOn < earliest || occurredOn > today) {
      issues.push({ path, code: "SETTLEMENT_DATE_OUT_OF_RANGE" });
    }
    return sameCurrency;
  };
  const display = (value: bigint | null) => value === null ? null : money(value, currency).value;

  const remittances = deduplicate(input.remittances ?? [], scope, "/remittances",
    (document) => document.remittanceId, (document) => ({ ...document, taxes: ordered(document.taxes) }), issues);
  if (remittances.length > 1) issues.push({ path: "/remittances", code: "MULTIPLE_REMITTANCES_UNSUPPORTED" });
  const remittance = remittances[0];
  const taxes = new Map<TaxCategory, bigint>();
  if (remittance && checkEvidence("/remittances", remittance.currency, remittance.paidOn, estimate.issuedOn)) {
    for (const tax of remittance.taxes) {
      if (taxes.has(tax.category)) issues.push({ path: "/remittances/taxes", code: "DUPLICATE_TAX_CATEGORY" });
      taxes.set(tax.category, minorAt(tax.amount, currency, "/remittances/taxes/amount"));
    }
  }
  const remittanceInvalid = issues.length !== 0;
  const taxTotal = remittanceInvalid ? null : sumKnown(importSettlementTaxCategories, taxes);
  const customsRemittance: ImportSettlementReconciliation["customsRemittance"] = {
    status: remittanceInvalid ? "needs_review" : !remittance ? "missing" : taxTotal === null ? "partial" : "confirmed",
    remittanceId: remittanceInvalid ? null : remittance?.remittanceId ?? null,
    amount: display(taxTotal),
  };

  const priorIssues = issues.length;
  const invoices = deduplicate(input.carrierInvoices ?? [], scope, "/carrierInvoices",
    ({ invoice }) => invoice.invoiceId,
    (document) => ({ ...document, invoice: { ...document.invoice, charges: ordered(document.invoice.charges) } }),
    issues);
  if (invoices.length > 1) issues.push({ path: "/carrierInvoices", code: "MULTIPLE_INVOICES_UNSUPPORTED" });
  const invoice = invoices[0]?.invoice;
  if (invoice) {
    checkEvidence("/carrierInvoices/invoice", invoice.currency, invoice.issuedOn, estimate.issuedOn);
    if (invoice.orderId !== scope.orderId || invoice.estimateId !== scope.estimateId) {
      issues.push({ path: "/carrierInvoices/invoice", code: "SETTLEMENT_INVOICE_SCOPE_MISMATCH" });
    }
  }
  const invoiceInvalid = issues.length !== priorIssues;
  const invoiceReconciliation = invoice && !invoiceInvalid ? reconcileInvoice({ estimate, invoice }) : null;
  const invoiceTotal = invoiceReconciliation?.actualTotal ?? null;
  const posted = new Map(invoiceReconciliation?.lines.flatMap(({ category, actual }) =>
    actual === null ? [] : [[category, minorAt(actual, currency, "/carrierInvoices/invoice/charges")]]));
  const serviceFees = sumKnown(serviceFeeCategories, posted);

  const priorPaymentIssues = issues.length;
  const receipts = deduplicate(input.carrierPayments ?? [], scope, "/carrierPayments",
    (document) => document.receiptId, (document) => document, issues);
  const expectedInvoiceId = invoice?.invoiceId ?? receipts[0]?.invoiceId;
  let paid = 0n;
  for (const receipt of receipts) {
    const sameCurrency = checkEvidence("/carrierPayments", receipt.currency, receipt.paidOn, invoice?.issuedOn ?? estimate.issuedOn);
    if (receipt.invoiceId !== expectedInvoiceId) {
      issues.push({ path: "/carrierPayments/invoiceId", code: "SETTLEMENT_INVOICE_ID_MISMATCH" });
    }
    if (sameCurrency) paid += minorAt(receipt.amount, currency, "/carrierPayments/amount");
  }
  const paymentInvalid = issues.length !== priorPaymentIssues;
  const paidAmount = paymentInvalid || !receipts.length ? null : paid;
  const invoiced = invoiceTotal === null ? null : [...posted.values()].reduce((total, value) => total + value, 0n);
  const overpaid = paidAmount !== null && invoiced !== null && paidAmount > invoiced;
  if (overpaid) issues.push({ path: "/carrierPayments/amount", code: "CARRIER_PAYMENT_EXCEEDS_INVOICE" });
  const carrierSettlement: ImportSettlementReconciliation["carrierSettlement"] = {
    status: invoiceInvalid || paymentInvalid || overpaid ? "needs_review" : !receipts.length ? "missing"
      : invoiced !== null && paidAmount === invoiced ? "confirmed" : "partial",
    invoiceId: invoiceInvalid ? null : invoice?.invoiceId ?? null,
    receiptIds: paymentInvalid ? [] : receipts.map(({ receiptId }) => receiptId),
    invoicedAmount: invoiceTotal,
    paidAmount: display(paidAmount),
  };

  let taxMismatch = false;
  if (!remittanceInvalid && invoiceReconciliation) {
    for (const category of importSettlementTaxCategories) {
      const paidTax = taxes.get(category);
      const billedTax = posted.get(category);
      if (paidTax !== undefined && billedTax !== undefined && paidTax !== billedTax) {
        taxMismatch = true;
        issues.push({ path: `/carrierInvoices/invoice/charges/${category}`, code: "CARRIER_TAX_REMITTANCE_MISMATCH" });
      }
    }
  }
  if (invoiceReconciliation?.lines.some(({ status }) => status === "difference")) {
    issues.push({ path: "/carrierInvoices/invoice", code: "ESTIMATE_INVOICE_DIFFERENCE" });
  }
  const unclassifiedCharge = posted.has("other");
  if (unclassifiedCharge) {
    issues.push({ path: "/carrierInvoices/invoice/charges", code: "UNCLASSIFIED_CARRIER_CHARGE" });
  }

  // The carrier invoice already includes the customs principal. Use tax evidence
  // to cross-check each tax line, then add only the carrier's distinct service fees.
  const cost = !taxMismatch && !unclassifiedCharge && taxTotal !== null && serviceFees !== null && invoiceTotal !== null
    ? taxTotal + serviceFees : null;
  const status = issues.length ? "needs_review"
    : customsRemittance.status === "confirmed" && carrierSettlement.status === "confirmed"
      && invoiceReconciliation?.status === "matched" ? "reconciled" : "pending";
  return {
    status, orderId: scope.orderId, shipmentId: scope.shipmentId, estimateId: scope.estimateId,
    currency, customsRemittance, carrierSettlement, invoiceReconciliation,
    totals: { customsTax: display(taxTotal), carrierFees: display(serviceFees), importCost: display(cost) },
    issues,
  };
}
