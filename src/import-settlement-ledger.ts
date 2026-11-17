import { Ajv } from "ajv";
import addFormatsModule from "ajv-formats";
import { loadDataset, todayJst } from "./dataset.ts";
import { invoiceEstimateChargeCategories, invoiceReconciliationInputSchema, type InvoiceEstimate, type InvoiceEstimateChargeCategory } from "./invoice-reconciliation.ts";
import { InputError } from "./schema.ts";
import { settlementFxRateSchema, settlementFxConversionSchema, type SettlementFxRate, type SettlementFxConversion } from "./settlement-fx.ts";
import type { Dataset } from "./types.ts";
import {
  validateLedgerScope, validateLedgerAllocation, prepareLedger, convertLedgerEntries,
  validateLedgerReferences, validateRefundLimits, indexLedgerEntries,
} from "./settlement-ledger/evidence.ts";
import { collectLedgerAccounting, finishLedgerReconciliation } from "./settlement-ledger/accounting.ts";

export interface SettlementLedgerScope {
  merchantId: string; orderId: string; estimateId: string;
  originCountry: string; destinationCountry: string; settlementCurrency: string;
  carrierId: string; carrierService: string; billingParty: "seller" | "buyer";
  billingAccountRef: string; remittanceRoute: "carrier_advance";
}
export interface SettlementParcel {
  parcelId: string; shipmentId: string; declarationId: string;
  items: { itemId: string; quantity: number }[];
}
export type SettlementLedgerEntryKind = "customs_remittance" | "customs_refund" | "carrier_invoice" | "carrier_credit" | "carrier_payment" | "carrier_refund";
export interface SettlementLedgerEntry {
  entryId: string; kind: SettlementLedgerEntryKind; scope: SettlementLedgerScope;
  declarationId: string; parcelIds: string[]; occurredOn: string; evidenceId: string;
  currency: string; fxRateId?: string;
  /** Required on payment/refund receipts: invoice entry or original payment entry respectively. */
  referenceEntryId?: string;
  charges?: { category: InvoiceEstimateChargeCategory; amount: string }[];
  amount?: string;
  /** Subsequent assessment and credit documents explicitly link their original posting. */
  adjustment?: { kind: "additional_assessment" | "refund"; referenceEntryId: string; evidenceId: string };
}
export interface ImportSettlementLedgerInput {
  scope: SettlementLedgerScope; estimate: InvoiceEstimate;
  items: { itemId: string; quantity: number }[];
  parcels: SettlementParcel[]; entries: SettlementLedgerEntry[];
  fxRates?: SettlementFxRate[];
  /** Acknowledges only a known estimate variance, bound to this exact canonical ledger. */
  varianceReview?: { ledgerDigest: string; evidenceId: string; reviewerRef: string; reviewedOn: string };
}
export interface ImportSettlementLedger {
  status: "pending" | "reconciled" | "needs_review";
  orderId: string; estimateId: string; currency: string; ledgerDigest: string;
  declarations: { declarationId: string; parcelIds: string[]; status: "pending" | "reconciled" | "needs_review" }[];
  totals: {
    originalEstimate: string | null; originalInvoiced: string | null;
    additionalAssessments: string | null; credits: string | null; adjustedInvoiced: string | null;
    customsTax: string | null; carrierFees: string | null;
    paid: string | null; refunded: string | null; netPaid: string | null; balance: string | null;
  };
  conversions: { entryId: string; category: InvoiceEstimateChargeCategory | "payment"; conversion: SettlementFxConversion }[];
  issues: { path: string; code: string }[];
  shippingAuthorized: false; productionAuthorized: false;
}
const object = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({ type: "object", additionalProperties: false, properties, required });
const id = { type: "string", pattern: "^[A-Za-z0-9_.:-]{1,100}$" };
const currency = { type: "string", pattern: "^[A-Z]{3}$" };
const date = { type: "string", format: "date" };
const amount = { type: "string", pattern: "^(0|[1-9]\\d{0,11})(\\.\\d{1,4})?$" };
const total = { anyOf: [{ type: "string", pattern: "^-?(0|[1-9]\\d{0,17})(\\.\\d{1,4})?$" }, { type: "null" }] };
const digest = { type: "string", pattern: "^[a-f0-9]{64}$" };
const allocation = object({ itemId: id, quantity: { type: "integer", minimum: 1, maximum: 1000000 } });
const array = (items: object, maxItems = 1000, minItems = 0) => ({ type: "array", items, minItems, maxItems });
const scopeSchema = object({
  merchantId: id, orderId: id, estimateId: id,
  originCountry: { type: "string", pattern: "^[A-Z]{2}$" }, destinationCountry: { type: "string", pattern: "^[A-Z]{2}$" },
  settlementCurrency: currency, carrierId: id, carrierService: id,
  billingParty: { enum: ["seller", "buyer"] }, billingAccountRef: id, remittanceRoute: { const: "carrier_advance" },
});
const kinds = ["customs_remittance", "customs_refund", "carrier_invoice", "carrier_credit", "carrier_payment", "carrier_refund"] as const;
export const importSettlementLedgerInputSchema = object({
  scope: scopeSchema, estimate: invoiceReconciliationInputSchema.properties.estimate,
  items: array(allocation, 100, 1),
  parcels: array(object({ parcelId: id, shipmentId: id, declarationId: id, items: array(allocation, 100, 1) }), 999, 1),
  entries: array(object({
    entryId: id, kind: { enum: kinds }, scope: scopeSchema, declarationId: id,
    parcelIds: { ...array(id, 999, 1), uniqueItems: true }, occurredOn: date, evidenceId: id,
    currency, fxRateId: id, referenceEntryId: id,
    charges: array(object({ category: { enum: invoiceEstimateChargeCategories }, amount }), 6, 1), amount,
    adjustment: object({ kind: { enum: ["additional_assessment", "refund"] }, referenceEntryId: id, evidenceId: id }),
  }, ["entryId", "kind", "scope", "declarationId", "parcelIds", "occurredOn", "evidenceId", "currency"])),
  fxRates: array(settlementFxRateSchema, 100),
  varianceReview: object({ ledgerDigest: digest, evidenceId: id, reviewerRef: id, reviewedOn: date }),
}, ["scope", "estimate", "items", "parcels", "entries"]);
const statuses = { enum: ["pending", "reconciled", "needs_review"] };
export const importSettlementLedgerOutputSchema = object({
  status: statuses, orderId: id, estimateId: id, currency, ledgerDigest: digest,
  declarations: array(object({ declarationId: id, parcelIds: array(id, 999, 1), status: statuses }), 999),
  totals: object(Object.fromEntries(["originalEstimate", "originalInvoiced", "additionalAssessments", "credits", "adjustedInvoiced", "customsTax", "carrierFees", "paid", "refunded", "netPaid", "balance"].map((name) => [name, total]))),
  conversions: array(object({ entryId: id, category: { enum: [...invoiceEstimateChargeCategories, "payment"] }, conversion: settlementFxConversionSchema }), 6000),
  issues: array(object({ path: { type: "string" }, code: { type: "string" } }), 10000),
  shippingAuthorized: { const: false }, productionAuthorized: { const: false },
});
const ajv = new Ajv({ allErrors: true, strict: true });
(addFormatsModule as unknown as (instance: Ajv) => void)(ajv);
const validate = ajv.compile<ImportSettlementLedgerInput>(importSettlementLedgerInputSchema);
/** Reconcile reviewed ledger evidence in ordered, independently readable phases. */
export function reconcileImportSettlementLedger(
  input: unknown, now = new Date(), data: Dataset = loadDataset(),
): ImportSettlementLedger {
  if (!validate(input)) {
    throw new InputError((validate.errors ?? []).slice(0, 20)
      .map(({ instancePath, keyword }) => ({ path: instancePath, code: keyword })));
  }
  const today = todayJst(now);
  const issues: ImportSettlementLedger["issues"] = [];
  validateLedgerScope(input, data, today, issues);
  const declarations = validateLedgerAllocation(input, issues);
  const prepared = prepareLedger(input, issues);
  const { values, conversions } = convertLedgerEntries(input, prepared, declarations, today, now, issues);
  const references = validateLedgerReferences(prepared.entries, issues);
  validateRefundLimits(prepared.entries, references, values, issues);
  const index = indexLedgerEntries(prepared.entries, references);
  const accounting = collectLedgerAccounting(declarations, index, values, issues);
  return finishLedgerReconciliation(input, prepared, accounting, conversions, today, issues);
}
