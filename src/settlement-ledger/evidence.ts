import { isDeepStrictEqual } from "node:util";
import { EU_COUNTRIES, requestDigest, requiresCustomsTerritoryReview } from "../engine.ts";
import { invoiceEstimateChargeCategories, reconcileInvoice, type InvoiceEstimateChargeCategory } from "../invoice-reconciliation.ts";
import { currencyDigits, minor } from "../money.ts";
import { inspectParcelAllocation } from "../parcel-allocation.ts";
import { InputError } from "../schema.ts";
import { convertSettlementMoney, type SettlementFxRate } from "../settlement-fx.ts";
import type { Dataset } from "../types.ts";
import type {
  ImportSettlementLedger, ImportSettlementLedgerInput, SettlementLedgerEntry,
} from "../import-settlement-ledger.ts";

export type LedgerIssues = ImportSettlementLedger["issues"];
export type LedgerCategory = InvoiceEstimateChargeCategory | "payment";
export type LedgerValues = Map<string, Map<LedgerCategory, bigint>>;

export interface PreparedLedger {
  entries: Map<string, SettlementLedgerEntry>;
  rates: Map<string, SettlementFxRate>;
  digest: string;
}

export interface EntryIndex {
  byDeclaration: Map<string, SettlementLedgerEntry[]>;
  byReference: Map<string, SettlementLedgerEntry[]>;
}

export const taxCategories = invoiceEstimateChargeCategories.slice(0, 4);
export const feeCategories = invoiceEstimateChargeCategories.slice(4);

function addIssue(issues: LedgerIssues, path: string, code: string): void {
  issues.push({ path, code });
}

export function validateLedgerScope(
  input: ImportSettlementLedgerInput, data: Dataset, today: string, issues: LedgerIssues,
): void {
  const { scope, estimate } = input;
  const currency = scope.settlementCurrency;
  const countries = new Set([...data.countries, ...data.supplementalRegions]
    .filter(({ inScope, code }) => inScope && code !== "KP")
    .map(({ code }) => code));
  if (
    scope.originCountry === scope.destinationCountry ||
    !countries.has(scope.originCountry) || !countries.has(scope.destinationCountry) ||
    (EU_COUNTRIES.has(scope.originCountry) && EU_COUNTRIES.has(scope.destinationCountry)) ||
    requiresCustomsTerritoryReview(scope.originCountry, scope.destinationCountry)
  ) addIssue(issues, "/scope", "SETTLEMENT_ROUTE_OUT_OF_SCOPE");
  if (
    scope.orderId !== estimate.orderId || scope.estimateId !== estimate.estimateId ||
    currency !== estimate.currency
  ) addIssue(issues, "/estimate", "SETTLEMENT_ESTIMATE_SCOPE_MISMATCH");
  if (estimate.issuedOn > today)
    addIssue(issues, "/estimate/issuedOn", "SETTLEMENT_DATE_OUT_OF_RANGE");

  // Validate an issued estimate even while the actual invoice is still missing.
  try {
    currencyDigits(currency);
    reconcileInvoice({
      estimate,
      invoice: {
        orderId: estimate.orderId, estimateId: estimate.estimateId,
        invoiceId: "ledger-validation", issuedOn: estimate.issuedOn, currency, charges: [],
      },
    });
  } catch (error) {
    if (error instanceof InputError) throw error;
    if (error instanceof RangeError)
      throw new InputError([{ path: "/scope/settlementCurrency", code: error.message }]);
    throw error;
  }
}

export function validateLedgerAllocation(
  input: ImportSettlementLedgerInput, issues: LedgerIssues,
): Map<string, string[]> {
  const allocation = inspectParcelAllocation(input.items, input.parcels);
  for (const diagnostic of allocation.diagnostics) {
    switch (diagnostic.kind) {
      case "duplicate_item":
        addIssue(issues, "/items", "DUPLICATE_ITEM_ID");
        break;
      case "duplicate_parcel":
        addIssue(issues, "/parcels", "DUPLICATE_PARCEL_ID");
        break;
      case "parcel_item_mismatch":
      case "quantity_mismatch":
        addIssue(issues, "/parcels/items", "PARCEL_ALLOCATION_MISMATCH");
        break;
    }
  }
  const declarations = new Map<string, string[]>();
  for (const parcel of input.parcels) {
    const ids = declarations.get(parcel.declarationId) ?? [];
    ids.push(parcel.parcelId);
    declarations.set(parcel.declarationId, ids);
  }
  return declarations;
}

function orderedCharges<T extends { category: string }>(charges: T[]): T[] {
  return [...charges].sort((left, right) => left.category.localeCompare(right.category));
}

function normalizeEntry(entry: SettlementLedgerEntry) {
  return {
    ...entry,
    parcelIds: [...entry.parcelIds].sort(),
    ...(entry.charges ? { charges: orderedCharges(entry.charges) } : {}),
  };
}

export function prepareLedger(
  input: ImportSettlementLedgerInput, issues: LedgerIssues,
): PreparedLedger {
  const entries = new Map<string, SettlementLedgerEntry>();
  for (const entry of input.entries) {
    const previous = entries.get(entry.entryId);
    if (previous && !isDeepStrictEqual(normalizeEntry(previous), normalizeEntry(entry)))
      addIssue(issues, "/entries", "CONFLICTING_SETTLEMENT_DOCUMENT");
    else if (!previous) entries.set(entry.entryId, entry);
  }
  const rates = new Map<string, SettlementFxRate>();
  for (const rate of input.fxRates ?? []) {
    const previous = rates.get(rate.id);
    if (previous && !isDeepStrictEqual(previous, rate))
      addIssue(issues, "/fxRates", "CONFLICTING_FX_RATE");
    else rates.set(rate.id, rate);
  }
  // Keep the canonical structure stable: existing variance reviews refer to it.
  const digest = requestDigest({
    scope: input.scope,
    estimate: { ...input.estimate, charges: orderedCharges(input.estimate.charges) },
    items: [...input.items].sort((left, right) => left.itemId.localeCompare(right.itemId)),
    parcels: input.parcels.map((parcel) => ({
      ...parcel,
      items: [...parcel.items].sort((left, right) => left.itemId.localeCompare(right.itemId)),
    })).sort((left, right) => left.parcelId.localeCompare(right.parcelId)),
    entries: [...entries.values()].map(normalizeEntry)
      .sort((left, right) => left.entryId.localeCompare(right.entryId)),
    fxRates: [...rates.values()].sort((left, right) => left.id.localeCompare(right.id)),
  });
  return { entries, rates, digest };
}

function convertedValue(
  entry: SettlementLedgerEntry, value: string, category: LedgerCategory,
  currency: string, rates: PreparedLedger["rates"], now: Date,
  conversions: ImportSettlementLedger["conversions"],
): bigint {
  if (entry.currency === currency) {
    if (entry.fxRateId)
      throw new InputError([{ path: "/entries/fxRateId", code: "UNNECESSARY_FX_RATE" }]);
    return minor(value, currency);
  }
  const rate = entry.fxRateId ? rates.get(entry.fxRateId) : undefined;
  if (!rate) throw new InputError([{ path: "/entries/fxRateId", code: "SETTLEMENT_FX_REQUIRED" }]);
  const conversion = convertSettlementMoney(
    { currency: entry.currency, value }, currency, rate, entry.occurredOn, now,
  );
  conversions.push({ entryId: entry.entryId, category, conversion });
  return minor(conversion.converted.value, currency);
}

export function convertLedgerEntries(
  input: ImportSettlementLedgerInput, prepared: PreparedLedger,
  declarations: Map<string, string[]>, today: string, now: Date, issues: LedgerIssues,
): { values: LedgerValues; conversions: ImportSettlementLedger["conversions"] } {
  const values: LedgerValues = new Map();
  const conversions: ImportSettlementLedger["conversions"] = [];
  for (const entry of prepared.entries.values()) {
    const path = "/entries/" + entry.entryId;
    if (!isDeepStrictEqual(input.scope, entry.scope))
      addIssue(issues, path + "/scope", "SETTLEMENT_SCOPE_MISMATCH");
    if (
      !declarations.has(entry.declarationId) ||
      !isDeepStrictEqual([...entry.parcelIds].sort(), [...(declarations.get(entry.declarationId) ?? [])].sort())
    ) addIssue(issues, path + "/parcelIds", "SETTLEMENT_PARCEL_SCOPE_MISMATCH");
    if (entry.occurredOn < input.estimate.issuedOn || entry.occurredOn > today)
      addIssue(issues, path + "/occurredOn", "SETTLEMENT_DATE_OUT_OF_RANGE");
    const receipt = entry.kind === "carrier_payment" || entry.kind === "carrier_refund";
    const invalidShape = receipt
      ? entry.amount === undefined || entry.charges !== undefined || !entry.referenceEntryId || entry.adjustment !== undefined
      : !entry.charges || entry.amount !== undefined || entry.referenceEntryId !== undefined;
    if (invalidShape) addIssue(issues, path, "SETTLEMENT_ENTRY_SHAPE_INVALID");

    const actual = new Map<LedgerCategory, bigint>();
    try {
      currencyDigits(entry.currency);
      if (receipt && entry.amount !== undefined) {
        actual.set("payment", convertedValue(
          entry, entry.amount, "payment", input.scope.settlementCurrency, prepared.rates, now, conversions,
        ));
      }
      for (const charge of entry.charges ?? []) {
        if (actual.has(charge.category)) addIssue(issues, path + "/charges", "DUPLICATE_CHARGE_CATEGORY");
        if (entry.kind.startsWith("customs_") && !taxCategories.includes(charge.category))
          addIssue(issues, path + "/charges", "CUSTOMS_FEE_CATEGORY_INVALID");
        actual.set(charge.category, convertedValue(
          entry, charge.amount, charge.category, input.scope.settlementCurrency, prepared.rates, now, conversions,
        ));
      }
    } catch (error) {
      if (error instanceof InputError)
        issues.push(...error.issues.map((issue) => ({ path: path + issue.path, code: issue.code })));
      else if (error instanceof RangeError) addIssue(issues, path, error.message);
      else throw error;
    }
    values.set(entry.entryId, actual);
  }
  return { values, conversions };
}

export function validateLedgerReferences(
  entries: PreparedLedger["entries"], issues: LedgerIssues,
): Map<string, string> {
  const references = new Map<string, string>();
  for (const entry of entries.values()) {
    const path = "/entries/" + entry.entryId;
    const targetId = entry.referenceEntryId ?? entry.adjustment?.referenceEntryId;
    const target = targetId ? entries.get(targetId) : undefined;
    const refundDocument = entry.kind === "customs_refund" || entry.kind === "carrier_credit";
    if (refundDocument && entry.adjustment?.kind !== "refund")
      addIssue(issues, path, "REFUND_REFERENCE_REQUIRED");
    if (
      entry.adjustment && !refundDocument &&
      (!["customs_remittance", "carrier_invoice"].includes(entry.kind) || entry.adjustment.kind !== "additional_assessment")
    ) addIssue(issues, path, "ADJUSTMENT_KIND_MISMATCH");
    if (targetId) {
      const expected = entry.kind === "carrier_payment" || entry.kind === "carrier_credit" ? "carrier_invoice"
        : entry.kind === "carrier_refund" ? "carrier_payment"
        : entry.kind === "customs_refund" ? "customs_remittance" : entry.kind;
      if (
        !target || target.entryId === entry.entryId || target.kind !== expected ||
        target.declarationId !== entry.declarationId || target.occurredOn > entry.occurredOn
      ) addIssue(issues, path, "SETTLEMENT_REFERENCE_INVALID");
      else references.set(entry.entryId, target.entryId);
    }
    if (entry.kind === "carrier_refund" && !targetId)
      addIssue(issues, path, "REFUND_REFERENCE_REQUIRED");
  }
  for (const id of references.keys()) {
    const seen = new Set<string>();
    let current: string | undefined = id;
    while (current) {
      if (seen.has(current)) {
        addIssue(issues, "/entries/" + id, "SETTLEMENT_REFERENCE_CYCLE");
        break;
      }
      seen.add(current);
      current = references.get(current);
    }
  }
  return references;
}

export function entryValue(
  values: LedgerValues, entry: SettlementLedgerEntry, category: LedgerCategory,
): bigint {
  return values.get(entry.entryId)?.get(category) ?? 0n;
}

function originalValue(entry: SettlementLedgerEntry, category: LedgerCategory): string | undefined {
  return category === "payment" ? entry.amount : entry.charges?.find((line) => line.category === category)?.amount;
}

export function validateRefundLimits(
  entries: PreparedLedger["entries"], references: Map<string, string>, values: LedgerValues, issues: LedgerIssues,
): void {
  const consumed = new Map<string, bigint>();
  const originalConsumed = new Map<string, bigint>();
  for (const entry of entries.values()) {
    if (!["customs_refund", "carrier_credit", "carrier_refund"].includes(entry.kind)) continue;
    const target = entries.get(references.get(entry.entryId) ?? "");
    if (!target) continue;
    if (entry.currency !== target.currency)
      addIssue(issues, "/entries/" + entry.entryId, "REFUND_ORIGINAL_CURRENCY_MISMATCH");
    for (const [category, value] of values.get(entry.entryId) ?? []) {
      const key = target.entryId + ":" + category;
      const used = (consumed.get(key) ?? 0n) + value;
      consumed.set(key, used);
      if (!values.get(target.entryId)?.has(category) || used > entryValue(values, target, category))
        addIssue(issues, "/entries/" + entry.entryId, "REFUND_EXCEEDS_REFERENCED_AMOUNT");
      if (entry.currency === target.currency) {
        const original = originalValue(entry, category);
        const originalTarget = originalValue(target, category);
        try {
          if (original === undefined || originalTarget === undefined) continue;
          const originalUsed = (originalConsumed.get(key) ?? 0n) + minor(original, entry.currency);
          originalConsumed.set(key, originalUsed);
          if (originalUsed > minor(originalTarget, target.currency))
            addIssue(issues, "/entries/" + entry.entryId, "REFUND_EXCEEDS_ORIGINAL_AMOUNT");
        } catch (error) {
          if (!(error instanceof RangeError)) throw error;
        }
      }
    }
  }
}

function appendEntry(index: Map<string, SettlementLedgerEntry[]>, key: string, entry: SettlementLedgerEntry): void {
  const group = index.get(key) ?? [];
  group.push(entry);
  index.set(key, group);
}

/** Build insertion-ordered indexes once; accounting still follows parcel declaration order. */
export function indexLedgerEntries(
  entries: PreparedLedger["entries"], references: Map<string, string>,
): EntryIndex {
  const byDeclaration = new Map<string, SettlementLedgerEntry[]>();
  const byReference = new Map<string, SettlementLedgerEntry[]>();
  for (const entry of entries.values()) {
    appendEntry(byDeclaration, entry.declarationId, entry);
    const target = references.get(entry.entryId);
    if (target !== undefined) appendEntry(byReference, target, entry);
  }
  return { byDeclaration, byReference };
}
