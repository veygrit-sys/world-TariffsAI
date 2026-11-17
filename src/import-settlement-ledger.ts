import { isDeepStrictEqual } from "node:util";
import { Ajv } from "ajv";
import addFormatsModule from "ajv-formats";
import { loadDataset, todayJst } from "./dataset.ts";
import { EU_COUNTRIES, requestDigest, requiresCustomsTerritoryReview } from "./engine.ts";
import { invoiceEstimateChargeCategories, invoiceReconciliationInputSchema, reconcileInvoice, type InvoiceEstimate, type InvoiceEstimateChargeCategory } from "./invoice-reconciliation.ts";
import { currencyDigits, minor, money } from "./money.ts";
import { InputError } from "./schema.ts";
import { convertSettlementMoney, settlementFxRateSchema, settlementFxConversionSchema, type SettlementFxRate, type SettlementFxConversion } from "./settlement-fx.ts";
import type { Dataset } from "./types.ts";

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
const taxCategories = invoiceEstimateChargeCategories.slice(0, 4);
const feeCategories = invoiceEstimateChargeCategories.slice(4);
const signed = (value: bigint, c: string) => value < 0n ? "-" + money(-value, c).value : money(value, c).value;
const sum = (values: Iterable<bigint>) => [...values].reduce((a, b) => a + b, 0n);
const ordered = <T extends { category: string }>(values: T[]) => [...values].sort((a, b) => a.category.localeCompare(b.category));

/** Immutable evidence ledger. It compares submitted records; it does not initiate payments or authorise shipment. */
export function reconcileImportSettlementLedger(input: unknown, now = new Date(), data: Dataset = loadDataset()): ImportSettlementLedger {
  if (!validate(input)) throw new InputError((validate.errors ?? []).slice(0, 20).map(({ instancePath, keyword }) => ({ path: instancePath, code: keyword })));
  const { scope, estimate } = input;
  const c = scope.settlementCurrency;
  const today = todayJst(now);
  const issues: ImportSettlementLedger["issues"] = [];
  const add = (path: string, code: string) => issues.push({ path, code });
  const countries = new Set([...data.countries, ...data.supplementalRegions].filter(x => x.inScope && x.code !== "KP").map(x => x.code));
  if (scope.originCountry === scope.destinationCountry || !countries.has(scope.originCountry) || !countries.has(scope.destinationCountry) ||
      (EU_COUNTRIES.has(scope.originCountry) && EU_COUNTRIES.has(scope.destinationCountry)) || requiresCustomsTerritoryReview(scope.originCountry, scope.destinationCountry)) add("/scope", "SETTLEMENT_ROUTE_OUT_OF_SCOPE");
  if (scope.orderId !== estimate.orderId || scope.estimateId !== estimate.estimateId || c !== estimate.currency) add("/estimate", "SETTLEMENT_ESTIMATE_SCOPE_MISMATCH");
  if (estimate.issuedOn > today) add("/estimate/issuedOn", "SETTLEMENT_DATE_OUT_OF_RANGE");
  try { currencyDigits(c); reconcileInvoice({ estimate, invoice: { orderId: estimate.orderId, estimateId: estimate.estimateId, invoiceId: "ledger-validation", issuedOn: estimate.issuedOn, currency: c, charges: [] } }); }
  catch (error) { if (!(error instanceof InputError || error instanceof RangeError)) throw error; throw error instanceof InputError ? error : new InputError([{ path: "/scope/settlementCurrency", code: error.message }]); }

  const items = new Map<string, number>();
  for (const item of input.items) { if (items.has(item.itemId)) add("/items", "DUPLICATE_ITEM_ID"); items.set(item.itemId, item.quantity); }
  const allocated = new Map<string, number>();
  const parcelIds = new Set<string>();
  const declarations = new Map<string, string[]>();
  for (const parcel of input.parcels) {
    if (parcelIds.has(parcel.parcelId)) add("/parcels", "DUPLICATE_PARCEL_ID");
    parcelIds.add(parcel.parcelId);
    declarations.set(parcel.declarationId, [...(declarations.get(parcel.declarationId) ?? []), parcel.parcelId]);
    const local = new Set<string>();
    for (const item of parcel.items) {
      if (!items.has(item.itemId) || local.has(item.itemId)) add("/parcels/items", "PARCEL_ALLOCATION_MISMATCH");
      local.add(item.itemId); allocated.set(item.itemId, (allocated.get(item.itemId) ?? 0) + item.quantity);
    }
  }
  for (const [itemId, quantity] of items) if (allocated.get(itemId) !== quantity) add("/parcels/items", "PARCEL_ALLOCATION_MISMATCH");
  const normalized = (e: SettlementLedgerEntry) => ({ ...e, parcelIds: [...e.parcelIds].sort(), ...(e.charges ? { charges: ordered(e.charges) } : {}) });
  const entries = new Map<string, SettlementLedgerEntry>();
  for (const entry of input.entries) {
    const prior = entries.get(entry.entryId);
    if (prior && !isDeepStrictEqual(normalized(prior), normalized(entry))) add("/entries", "CONFLICTING_SETTLEMENT_DOCUMENT");
    else if (!prior) entries.set(entry.entryId, entry);
  }
  const rates = new Map<string, SettlementFxRate>();
  for (const rate of input.fxRates ?? []) {
    const prior = rates.get(rate.id);
    if (prior && !isDeepStrictEqual(prior, rate)) add("/fxRates", "CONFLICTING_FX_RATE");
    else rates.set(rate.id, rate);
  }
  const ledgerDigest = requestDigest({ scope, estimate: { ...estimate, charges: ordered(estimate.charges) },
    items: [...input.items].sort((a,b) => a.itemId.localeCompare(b.itemId)),
    parcels: input.parcels.map(p => ({ ...p, items: [...p.items].sort((a,b) => a.itemId.localeCompare(b.itemId)) })).sort((a,b) => a.parcelId.localeCompare(b.parcelId)),
    entries: [...entries.values()].map(normalized).sort((a,b) => a.entryId.localeCompare(b.entryId)),
    fxRates: [...rates.values()].sort((a,b) => a.id.localeCompare(b.id)),
  });
  const conversions: ImportSettlementLedger["conversions"] = [];
  const values = new Map<string, Map<InvoiceEstimateChargeCategory | "payment", bigint>>();
  const getValue = (entry: SettlementLedgerEntry, value: string, category: InvoiceEstimateChargeCategory | "payment"): bigint => {
    if (entry.currency === c) {
      if (entry.fxRateId) throw new InputError([{ path: "/entries/fxRateId", code: "UNNECESSARY_FX_RATE" }]);
      return minor(value, c);
    }
    const rate = entry.fxRateId ? rates.get(entry.fxRateId) : undefined;
    if (!rate) throw new InputError([{ path: "/entries/fxRateId", code: "SETTLEMENT_FX_REQUIRED" }]);
    const conversion = convertSettlementMoney({ currency: entry.currency, value }, c, rate, entry.occurredOn, now);
    conversions.push({ entryId: entry.entryId, category, conversion });
    return minor(conversion.converted.value, c);
  };
  for (const entry of entries.values()) {
    const path = "/entries/" + entry.entryId;
    if (!isDeepStrictEqual(scope, entry.scope)) add(path + "/scope", "SETTLEMENT_SCOPE_MISMATCH");
    if (!declarations.has(entry.declarationId) || !isDeepStrictEqual([...entry.parcelIds].sort(), [...(declarations.get(entry.declarationId) ?? [])].sort())) add(path + "/parcelIds", "SETTLEMENT_PARCEL_SCOPE_MISMATCH");
    if (entry.occurredOn < estimate.issuedOn || entry.occurredOn > today) add(path + "/occurredOn", "SETTLEMENT_DATE_OUT_OF_RANGE");
    const receipt = entry.kind === "carrier_payment" || entry.kind === "carrier_refund";
    if (receipt ? entry.amount === undefined || entry.charges !== undefined || !entry.referenceEntryId || entry.adjustment !== undefined
      : !entry.charges || entry.amount !== undefined || entry.referenceEntryId !== undefined) add(path, "SETTLEMENT_ENTRY_SHAPE_INVALID");
    const actual = new Map<InvoiceEstimateChargeCategory | "payment", bigint>();
    try {
      currencyDigits(entry.currency);
      if (receipt && entry.amount !== undefined) actual.set("payment", getValue(entry, entry.amount, "payment"));
      for (const charge of entry.charges ?? []) {
        if (actual.has(charge.category)) add(path + "/charges", "DUPLICATE_CHARGE_CATEGORY");
        if (entry.kind.startsWith("customs_") && !taxCategories.includes(charge.category)) add(path + "/charges", "CUSTOMS_FEE_CATEGORY_INVALID");
        actual.set(charge.category, getValue(entry, charge.amount, charge.category));
      }
    } catch (error) {
      if (error instanceof InputError) issues.push(...error.issues.map(x => ({ path: path + x.path, code: x.code })));
      else if (error instanceof RangeError) add(path, error.message);
      else throw error;
    }
    values.set(entry.entryId, actual);
  }
  const refs = new Map<string, string>();
  for (const entry of entries.values()) {
    const path = "/entries/" + entry.entryId;
    const targetId = entry.referenceEntryId ?? entry.adjustment?.referenceEntryId;
    const target = targetId ? entries.get(targetId) : undefined;
    const refundDocument = entry.kind === "customs_refund" || entry.kind === "carrier_credit";
    if (refundDocument && entry.adjustment?.kind !== "refund") add(path, "REFUND_REFERENCE_REQUIRED");
    if (entry.adjustment && !refundDocument && (!["customs_remittance", "carrier_invoice"].includes(entry.kind) || entry.adjustment.kind !== "additional_assessment")) add(path, "ADJUSTMENT_KIND_MISMATCH");
    if (targetId) {
      const expected = entry.kind === "carrier_payment" || entry.kind === "carrier_credit" ? "carrier_invoice"
        : entry.kind === "carrier_refund" ? "carrier_payment" : entry.kind === "customs_refund" ? "customs_remittance" : entry.kind;
      if (!target || target.entryId === entry.entryId || target.kind !== expected || target.declarationId !== entry.declarationId || target.occurredOn > entry.occurredOn) add(path, "SETTLEMENT_REFERENCE_INVALID");
      else refs.set(entry.entryId, target.entryId);
    }
    if (entry.kind === "carrier_refund" && !targetId) add(path, "REFUND_REFERENCE_REQUIRED");
  }
  // Cycles are invalid even when documents share the same date.
  for (const id of refs.keys()) {
    const seen = new Set<string>(); let current: string | undefined = id;
    while (current) { if (seen.has(current)) { add("/entries/" + id, "SETTLEMENT_REFERENCE_CYCLE"); break; } seen.add(current); current = refs.get(current); }
  }
  const v = (entry: SettlementLedgerEntry, category: InvoiceEstimateChargeCategory | "payment") => values.get(entry.entryId)?.get(category) ?? 0n;
  // Refunds/credits cannot exceed the referenced original in any individual category or currency.
  const consumed = new Map<string, bigint>();
  const originalConsumed = new Map<string, bigint>();
  for (const entry of entries.values()) {
    if (!["customs_refund", "carrier_credit", "carrier_refund"].includes(entry.kind)) continue;
    const target = entries.get(refs.get(entry.entryId) ?? ""); if (!target) continue;
    if (entry.currency !== target.currency) add("/entries/" + entry.entryId, "REFUND_ORIGINAL_CURRENCY_MISMATCH");
    for (const [category, value] of values.get(entry.entryId) ?? []) {
      const key = target.entryId + ":" + category;
      const used = (consumed.get(key) ?? 0n) + value; consumed.set(key, used);
      if (!values.get(target.entryId)?.has(category) || used > v(target, category)) add("/entries/" + entry.entryId, "REFUND_EXCEEDS_REFERENCED_AMOUNT");
      if (entry.currency === target.currency) {
        const original = category === "payment" ? entry.amount : entry.charges?.find(x => x.category === category)?.amount;
        const originalTarget = category === "payment" ? target.amount : target.charges?.find(x => x.category === category)?.amount;
        try {
          if (original === undefined || originalTarget === undefined) continue;
          const originalUsed = (originalConsumed.get(key) ?? 0n) + minor(original, entry.currency);
          originalConsumed.set(key, originalUsed);
          if (originalUsed > minor(originalTarget, target.currency)) add("/entries/" + entry.entryId, "REFUND_EXCEEDS_ORIGINAL_AMOUNT");
        } catch (error) { if (!(error instanceof RangeError)) throw error; }
      }
    }
  }
  const byDeclaration: ImportSettlementLedger["declarations"] = [];
  let originalInvoiced = 0n, assessments = 0n, credits = 0n, taxTotal = 0n, fees = 0n, paid = 0n, refunded = 0n;
  const posted = new Map<InvoiceEstimateChargeCategory, bigint>();
  let incomplete = false, missingAmounts = false;
  for (const [declarationId, ids] of declarations) {
    const startingIssues = issues.length;
    const group = [...entries.values()].filter(e => e.declarationId === declarationId);
    const baseTax = group.filter(e => e.kind === "customs_remittance" && !e.adjustment);
    const baseInvoices = group.filter(e => e.kind === "carrier_invoice" && !e.adjustment);
    if (baseTax.length > 1 || baseInvoices.length > 1) add("/entries/" + declarationId, "MULTIPLE_BASE_DOCUMENTS");
    const tax = new Map<InvoiceEstimateChargeCategory, bigint>();
    const invoice = new Map<InvoiceEstimateChargeCategory, bigint>();
    for (const entry of group) {
      const lines = values.get(entry.entryId) ?? new Map();
      const entryTotal = sum(lines.values());
      if (entry.kind === "customs_remittance" || entry.kind === "customs_refund") {
        const sign = entry.kind === "customs_refund" ? -1n : 1n;
        for (const [category, value] of lines) if (category !== "payment") tax.set(category, (tax.get(category) ?? 0n) + sign * value);
      } else if (entry.kind === "carrier_invoice" || entry.kind === "carrier_credit") {
        const sign = entry.kind === "carrier_credit" ? -1n : 1n;
        for (const [category, value] of lines) if (category !== "payment") invoice.set(category, (invoice.get(category) ?? 0n) + sign * value);
        if (entry.kind === "carrier_credit") credits += entryTotal;
        else if (entry.adjustment) assessments += entryTotal;
        else originalInvoiced += entryTotal;
      } else if (entry.kind === "carrier_payment") paid += entryTotal;
      else refunded += entryTotal;
    }
    const complete = baseTax.length === 1 && baseInvoices.length === 1 &&
      taxCategories.every(x => values.get(baseTax[0]!.entryId)?.has(x)) &&
      invoiceEstimateChargeCategories.every(x => values.get(baseInvoices[0]!.entryId)?.has(x));
    if (!complete) { incomplete = true; missingAmounts = true; }
    for (const category of taxCategories) {
      const actual = tax.get(category), billed = invoice.get(category);
      if (actual !== undefined && billed !== undefined && actual !== billed) add("/entries/" + declarationId + "/" + category, "CARRIER_TAX_REMITTANCE_MISMATCH");
    }
    for (const [category, value] of invoice) { if (value < 0n) add("/entries/" + declarationId, "NEGATIVE_SETTLEMENT_AMOUNT"); posted.set(category, (posted.get(category) ?? 0n) + value); }
    for (const value of tax.values()) if (value < 0n) add("/entries/" + declarationId, "NEGATIVE_SETTLEMENT_AMOUNT");
    taxTotal += sum(tax.values()); fees += sum(feeCategories.map(x => invoice.get(x) ?? 0n));
    let cashIncomplete = false;
    for (const billed of group.filter(e => e.kind === "carrier_invoice")) {
      const invoiceAmount = sum((values.get(billed.entryId) ?? new Map()).values());
      const invoiceCredits = group.filter(e => e.kind === "carrier_credit" && refs.get(e.entryId) === billed.entryId).reduce((a,e) => a + sum((values.get(e.entryId) ?? new Map()).values()), 0n);
      const receipts = group.filter(e => e.kind === "carrier_payment" && refs.get(e.entryId) === billed.entryId);
      const receiptIds = new Set(receipts.map(e => e.entryId));
      const payment = receipts.reduce((a,e) => a + v(e,"payment"), 0n);
      const cashRefund = group.filter(e => e.kind === "carrier_refund" && receiptIds.has(refs.get(e.entryId) ?? "")).reduce((a,e) => a + v(e,"payment"), 0n);
      if (cashRefund > invoiceCredits) add("/entries/" + billed.entryId, "CARRIER_REFUND_EXCEEDS_CREDIT");
      if (payment - cashRefund > invoiceAmount - invoiceCredits) add("/entries/" + billed.entryId, "CARRIER_PAYMENT_EXCEEDS_INVOICE");
      if (payment - cashRefund !== invoiceAmount - invoiceCredits || !receipts.length) cashIncomplete = true;
    }
    if (cashIncomplete) incomplete = true;
    byDeclaration.push({ declarationId, parcelIds: [...ids].sort(), status: issues.length > startingIssues ? "needs_review" : complete && !cashIncomplete ? "reconciled" : "pending" });
  }
  const estimated = new Map(estimate.charges.map(x => [x.category, x.amount === null ? null : minor(x.amount, c)]));
  const originalEstimate = [...estimated.values()].some(x => x === null) ? null : sum(estimated.values() as Iterable<bigint>);
  const variance = invoiceEstimateChargeCategories.some(category => estimated.get(category) !== posted.get(category));
  const review = input.varianceReview;
  const latestEntryDate = [...entries.values()].reduce((latest, entry) => entry.occurredOn > latest ? entry.occurredOn : latest,
    [...rates.values()].reduce((latest, rate) => rate.reviewedOn > latest ? rate.reviewedOn : latest, estimate.issuedOn));
  if (review && (review.ledgerDigest !== ledgerDigest || review.reviewedOn < latestEntryDate || review.reviewedOn > today)) add("/varianceReview", "VARIANCE_REVIEW_INVALID");
  if (originalEstimate === null) incomplete = true;
  if (variance && !missingAmounts && originalEstimate !== null && !review) add("/varianceReview", "ESTIMATE_INVOICE_DIFFERENCE");
  const adjusted = originalInvoiced + assessments - credits, netPaid = paid - refunded;
  if ([adjusted, taxTotal, fees, netPaid].some(x => x < 0n)) add("/entries", "NEGATIVE_SETTLEMENT_AMOUNT");
  const invalid = issues.length > 0;
  const display = (value: bigint | null) => value === null || invalid || missingAmounts ? null : signed(value, c);
  const status = invalid ? "needs_review" : incomplete ? "pending" : "reconciled";
  // A document-scope failure invalidates the overall evidence chain, including local summaries.
  if (invalid) for (const declaration of byDeclaration) declaration.status = "needs_review";
  return {
    status, orderId: scope.orderId, estimateId: scope.estimateId, currency: c, ledgerDigest, declarations: byDeclaration,
    totals: { originalEstimate: originalEstimate === null ? null : signed(originalEstimate, c), originalInvoiced: display(originalInvoiced), additionalAssessments: display(assessments), credits: display(credits), adjustedInvoiced: display(adjusted), customsTax: display(taxTotal), carrierFees: display(fees), paid: display(paid), refunded: display(refunded), netPaid: display(netPaid), balance: display(adjusted - netPaid) },
    conversions, issues, shippingAuthorized: false, productionAuthorized: false,
  };
}
