import { invoiceEstimateChargeCategories, type InvoiceEstimateChargeCategory } from "../invoice-reconciliation.ts";
import { minor, money } from "../money.ts";
import type {
  ImportSettlementLedger, ImportSettlementLedgerInput, SettlementLedgerEntry,
} from "../import-settlement-ledger.ts";
import {
  entryValue, feeCategories, taxCategories,
  type EntryIndex, type LedgerCategory, type LedgerIssues, type LedgerValues, type PreparedLedger,
} from "./evidence.ts";

type ChargeTotals = Map<InvoiceEstimateChargeCategory, bigint>;

interface DeclarationPostings {
  tax: ChargeTotals;
  invoice: ChargeTotals;
  originalInvoiced: bigint;
  assessments: bigint;
  credits: bigint;
  paid: bigint;
  refunded: bigint;
}

export interface LedgerAccounting {
  declarations: ImportSettlementLedger["declarations"];
  posted: ChargeTotals;
  originalInvoiced: bigint;
  assessments: bigint;
  credits: bigint;
  customsTax: bigint;
  carrierFees: bigint;
  paid: bigint;
  refunded: bigint;
  incomplete: boolean;
  missingAmounts: boolean;
}

function sum(values: Iterable<bigint>): bigint {
  return [...values].reduce((total, value) => total + value, 0n);
}

function addChargeTotals(
  totals: ChargeTotals, lines: ReadonlyMap<LedgerCategory, bigint>, sign: bigint,
): void {
  for (const [category, value] of lines) {
    if (category !== "payment") totals.set(category, (totals.get(category) ?? 0n) + sign * value);
  }
}

function postDeclaration(group: readonly SettlementLedgerEntry[], values: LedgerValues): DeclarationPostings {
  const result: DeclarationPostings = {
    tax: new Map(), invoice: new Map(), originalInvoiced: 0n, assessments: 0n,
    credits: 0n, paid: 0n, refunded: 0n,
  };
  for (const entry of group) {
    const lines = values.get(entry.entryId) ?? new Map<LedgerCategory, bigint>();
    const entryTotal = sum(lines.values());
    if (entry.kind === "customs_remittance" || entry.kind === "customs_refund") {
      addChargeTotals(result.tax, lines, entry.kind === "customs_refund" ? -1n : 1n);
    } else if (entry.kind === "carrier_invoice" || entry.kind === "carrier_credit") {
      addChargeTotals(result.invoice, lines, entry.kind === "carrier_credit" ? -1n : 1n);
      if (entry.kind === "carrier_credit") result.credits += entryTotal;
      else if (entry.adjustment) result.assessments += entryTotal;
      else result.originalInvoiced += entryTotal;
    } else if (entry.kind === "carrier_payment") result.paid += entryTotal;
    else result.refunded += entryTotal;
  }
  return result;
}

function compareDeclarationTaxes(
  declarationId: string, tax: ChargeTotals, invoice: ChargeTotals, issues: LedgerIssues,
): void {
  for (const category of taxCategories) {
    const actual = tax.get(category);
    const billed = invoice.get(category);
    if (actual !== undefined && billed !== undefined && actual !== billed)
      issues.push({ path: "/entries/" + declarationId + "/" + category, code: "CARRIER_TAX_REMITTANCE_MISMATCH" });
  }
}

function carrierCashIncomplete(
  invoices: readonly SettlementLedgerEntry[], index: EntryIndex, values: LedgerValues, issues: LedgerIssues,
): boolean {
  let incomplete = false;
  for (const billed of invoices) {
    const invoiceAmount = sum((values.get(billed.entryId) ?? new Map()).values());
    const related = index.byReference.get(billed.entryId) ?? [];
    const invoiceCredits = related.filter((entry) => entry.kind === "carrier_credit")
      .reduce((total, entry) => total + sum((values.get(entry.entryId) ?? new Map()).values()), 0n);
    const receipts = related.filter((entry) => entry.kind === "carrier_payment");
    const payment = receipts.reduce((total, entry) => total + entryValue(values, entry, "payment"), 0n);
    const cashRefund = receipts.reduce((total, receipt) => total +
      (index.byReference.get(receipt.entryId) ?? [])
        .filter((entry) => entry.kind === "carrier_refund")
        .reduce((refundTotal, entry) => refundTotal + entryValue(values, entry, "payment"), 0n), 0n);
    if (cashRefund > invoiceCredits)
      issues.push({ path: "/entries/" + billed.entryId, code: "CARRIER_REFUND_EXCEEDS_CREDIT" });
    if (payment - cashRefund > invoiceAmount - invoiceCredits)
      issues.push({ path: "/entries/" + billed.entryId, code: "CARRIER_PAYMENT_EXCEEDS_INVOICE" });
    if (payment - cashRefund !== invoiceAmount - invoiceCredits || !receipts.length) incomplete = true;
  }
  return incomplete;
}

export function collectLedgerAccounting(
  declarations: Map<string, string[]>, index: EntryIndex, values: LedgerValues, issues: LedgerIssues,
): LedgerAccounting {
  const accounting: LedgerAccounting = {
    declarations: [], posted: new Map(), originalInvoiced: 0n, assessments: 0n,
    credits: 0n, customsTax: 0n, carrierFees: 0n, paid: 0n, refunded: 0n,
    incomplete: false, missingAmounts: false,
  };
  for (const [declarationId, ids] of declarations) {
    const startingIssues = issues.length;
    const group = index.byDeclaration.get(declarationId) ?? [];
    const baseTax = group.filter((entry) => entry.kind === "customs_remittance" && !entry.adjustment);
    const invoices = group.filter((entry) => entry.kind === "carrier_invoice");
    const baseInvoices = invoices.filter((entry) => !entry.adjustment);
    if (baseTax.length > 1 || baseInvoices.length > 1)
      issues.push({ path: "/entries/" + declarationId, code: "MULTIPLE_BASE_DOCUMENTS" });
    const postings = postDeclaration(group, values);
    const complete = baseTax.length === 1 && baseInvoices.length === 1 &&
      taxCategories.every((category) => values.get(baseTax[0]!.entryId)?.has(category)) &&
      invoiceEstimateChargeCategories.every((category) => values.get(baseInvoices[0]!.entryId)?.has(category));
    if (!complete) {
      accounting.incomplete = true;
      accounting.missingAmounts = true;
    }
    compareDeclarationTaxes(declarationId, postings.tax, postings.invoice, issues);
    for (const [category, value] of postings.invoice) {
      if (value < 0n) issues.push({ path: "/entries/" + declarationId, code: "NEGATIVE_SETTLEMENT_AMOUNT" });
      accounting.posted.set(category, (accounting.posted.get(category) ?? 0n) + value);
    }
    for (const value of postings.tax.values()) {
      if (value < 0n) issues.push({ path: "/entries/" + declarationId, code: "NEGATIVE_SETTLEMENT_AMOUNT" });
    }
    accounting.originalInvoiced += postings.originalInvoiced;
    accounting.assessments += postings.assessments;
    accounting.credits += postings.credits;
    accounting.paid += postings.paid;
    accounting.refunded += postings.refunded;
    accounting.customsTax += sum(postings.tax.values());
    accounting.carrierFees += sum(feeCategories.map((category) => postings.invoice.get(category) ?? 0n));
    const cashIncomplete = carrierCashIncomplete(invoices, index, values, issues);
    if (cashIncomplete) accounting.incomplete = true;
    accounting.declarations.push({
      declarationId, parcelIds: [...ids].sort(),
      status: issues.length > startingIssues ? "needs_review"
        : complete && !cashIncomplete ? "reconciled" : "pending",
    });
  }
  return accounting;
}

function validateVarianceReview(
  input: ImportSettlementLedgerInput, prepared: PreparedLedger, accounting: LedgerAccounting,
  today: string, issues: LedgerIssues,
): bigint | null {
  const estimated = new Map(input.estimate.charges.map((charge) => [
    charge.category, charge.amount === null ? null : minor(charge.amount, input.scope.settlementCurrency),
  ]));
  const originalEstimate = [...estimated.values()].some((value) => value === null)
    ? null : sum(estimated.values() as Iterable<bigint>);
  const variance = invoiceEstimateChargeCategories.some((category) => estimated.get(category) !== accounting.posted.get(category));
  const latestRateDate = [...prepared.rates.values()].reduce((latest, rate) =>
    rate.reviewedOn > latest ? rate.reviewedOn : latest, input.estimate.issuedOn);
  const latestEntryDate = [...prepared.entries.values()].reduce((latest, entry) =>
    entry.occurredOn > latest ? entry.occurredOn : latest, latestRateDate);
  const review = input.varianceReview;
  if (review && (
    review.ledgerDigest !== prepared.digest || review.reviewedOn < latestEntryDate || review.reviewedOn > today
  )) issues.push({ path: "/varianceReview", code: "VARIANCE_REVIEW_INVALID" });
  if (originalEstimate === null) accounting.incomplete = true;
  if (variance && !accounting.missingAmounts && originalEstimate !== null && !review)
    issues.push({ path: "/varianceReview", code: "ESTIMATE_INVOICE_DIFFERENCE" });
  return originalEstimate;
}

function signed(value: bigint, currency: string): string {
  return value < 0n ? "-" + money(-value, currency).value : money(value, currency).value;
}

export function finishLedgerReconciliation(
  input: ImportSettlementLedgerInput, prepared: PreparedLedger, accounting: LedgerAccounting,
  conversions: ImportSettlementLedger["conversions"], today: string, issues: LedgerIssues,
): ImportSettlementLedger {
  const originalEstimate = validateVarianceReview(input, prepared, accounting, today, issues);
  const adjusted = accounting.originalInvoiced + accounting.assessments - accounting.credits;
  const netPaid = accounting.paid - accounting.refunded;
  if ([adjusted, accounting.customsTax, accounting.carrierFees, netPaid].some((value) => value < 0n))
    issues.push({ path: "/entries", code: "NEGATIVE_SETTLEMENT_AMOUNT" });
  const invalid = issues.length > 0;
  const currency = input.scope.settlementCurrency;
  const display = (value: bigint | null) => value === null || invalid || accounting.missingAmounts
    ? null : signed(value, currency);
  const status = invalid ? "needs_review" : accounting.incomplete ? "pending" : "reconciled";
  // A broken document chain also invalidates its declaration summaries.
  if (invalid) {
    for (const declaration of accounting.declarations) declaration.status = "needs_review";
  }
  return {
    status, orderId: input.scope.orderId, estimateId: input.scope.estimateId,
    currency, ledgerDigest: prepared.digest, declarations: accounting.declarations,
    totals: {
      originalEstimate: originalEstimate === null ? null : signed(originalEstimate, currency),
      originalInvoiced: display(accounting.originalInvoiced), additionalAssessments: display(accounting.assessments),
      credits: display(accounting.credits), adjustedInvoiced: display(adjusted),
      customsTax: display(accounting.customsTax), carrierFees: display(accounting.carrierFees),
      paid: display(accounting.paid), refunded: display(accounting.refunded),
      netPaid: display(netPaid), balance: display(adjusted - netPaid),
    },
    conversions, issues, shippingAuthorized: false, productionAuthorized: false,
  };
}
