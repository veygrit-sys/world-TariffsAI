import type { ImportSettlementLedgerInput } from "../../src/import-settlement-ledger.ts";
import type { ImportSettlementPlanInput } from "../../src/import-settlement-plan.ts";
import { ledgerFixture } from "./import-settlement-ledger.ts";
import { rebindQuote, settlementDraft } from "./import-settlement-worldwide.ts";

export const ledgerContractTime = "2026-11-18T00:00:00Z";
export const planContractTime = "2026-11-13T02:00:00+09:00";
export interface RefactorCase {
  name: string;
  kind: "ledger" | "plan";
  input: unknown;
  approval?: "current" | "base" | "past" | "future";
}

/** Deterministic public-contract probes captured before the rc.24 internal refactor. */
export function ledgerContractCases(): RefactorCase[] {
  const cases: RefactorCase[] = [];
  const add = (name: string, change: (input: ImportSettlementLedgerInput) => void = () => {},
    approval?: RefactorCase["approval"]) => {
    const input = ledgerFixture();
    change(input);
    cases.push({ name, kind: "ledger", input, ...(approval ? { approval } : {}) });
  };
  const entry = (input: ImportSettlementLedgerInput, id: string) => input.entries.find(x => x.entryId === id)!;
  add("combined-without-variance-review");
  add("combined-reviewed", undefined, "current");
  add("reordered-reviewed", input => {
    input.entries.reverse(); input.items.reverse(); input.parcels.reverse();
    for (const value of input.entries) { value.parcelIds.reverse(); value.charges?.reverse(); }
  }, "current");
  add("exact-document-and-rate-replay", input => {
    input.entries.push(structuredClone(input.entries[0]!));
    input.fxRates!.push(structuredClone(input.fxRates![0]!));
  }, "current");
  add("partial-payment", input => { entry(input, "payment-2").amount = "150"; }, "current");
  add("missing-assessment-payment", input => { input.entries = input.entries.filter(x => x.entryId !== "assessment-payment"); }, "current");
  add("missing-all-payments", input => { input.entries = input.entries.filter(x => !["carrier_payment", "carrier_refund"].includes(x.kind)); }, "current");
  add("missing-tax-document", input => { input.entries = input.entries.filter(x => x.entryId !== "tax-1"); }, "current");
  add("missing-zero-tax-category", input => { entry(input, "tax-1").charges = entry(input, "tax-1").charges!.filter(x => x.category !== "excise"); }, "current");
  add("missing-zero-invoice-category", input => { entry(input, "invoice-1").charges = entry(input, "invoice-1").charges!.filter(x => x.category !== "excise"); }, "current");
  add("unknown-estimate-amount", input => { input.estimate.charges[0]!.amount = null; }, "current");
  add("quantity-excess", input => { input.parcels[0]!.items[0]!.quantity = 2; });
  add("quantity-missing", input => { input.items[0]!.quantity = 3; });
  add("unknown-product", input => { input.parcels[0]!.items[0]!.itemId = "missing-product"; });
  add("duplicate-parent-item", input => { input.items.push(structuredClone(input.items[0]!)); });
  add("duplicate-parcel-item", input => { input.parcels[0]!.items.push(structuredClone(input.parcels[0]!.items[0]!)); });
  add("duplicate-parcel-id", input => { input.parcels[1]!.parcelId = input.parcels[0]!.parcelId; });
  add("multiple-allocation-diagnostics", input => {
    input.items.push(structuredClone(input.items[0]!));
    input.parcels[1]!.parcelId = input.parcels[0]!.parcelId;
    input.parcels[0]!.items.push({ itemId: "missing-product", quantity: 1 }, structuredClone(input.parcels[0]!.items[0]!));
    input.items[1]!.quantity = 2;
  });
  add("wrong-merchant", input => { entry(input, "tax-1").scope.merchantId = "another-merchant"; });
  add("wrong-billing-account", input => { entry(input, "invoice-1").scope.billingAccountRef = "another-account"; });
  add("wrong-parcel-group", input => { entry(input, "tax-1").parcelIds = ["parcel-2"]; });
  add("unknown-declaration", input => { entry(input, "tax-1").declarationId = "unknown-declaration"; });
  add("conflicting-document-id", input => {
    const value = structuredClone(entry(input, "payment-2")); value.amount = "151"; input.entries.push(value);
  });
  add("conflicting-rate-id", input => { input.fxRates!.push({ ...input.fxRates![0]!, numerator: "101" }); });
  add("missing-fx", input => { input.fxRates = []; });
  add("expired-fx", input => { input.fxRates![0]!.reviewBy = "2026-11-17"; });
  add("future-fx-review", input => { input.fxRates![0]!.reviewedOn = "2026-11-19"; });
  add("fx-outside-applicable-period", input => { input.fxRates![0]!.validFrom = "2026-11-15"; });
  add("wrong-fx-direction", input => { input.fxRates![0]!.from = "EUR"; });
  add("unnecessary-fx", input => { entry(input, "payment-2").fxRateId = "synthetic-usdjpy"; });
  add("unsupported-evidence-currency", input => { entry(input, "payment-2").currency = "ZZZ"; });
  add("unsupported-settlement-currency", input => { input.scope.settlementCurrency = "ZZZ"; input.estimate.currency = "ZZZ"; });
  add("invalid-native-precision", input => { entry(input, "payment-2").amount = "160.01"; });
  add("missing-reference", input => { entry(input, "invoice-credit").adjustment!.referenceEntryId = "missing"; });
  add("wrong-reference-kind", input => { entry(input, "invoice-credit").adjustment!.referenceEntryId = "payment-2"; });
  add("cross-declaration-reference", input => { entry(input, "payment-2").referenceEntryId = "invoice-1"; });
  add("future-document", input => { entry(input, "payment-2").occurredOn = "2026-11-19"; });
  add("refund-before-original", input => { entry(input, "tax-refund").occurredOn = "2026-11-13"; });
  add("same-day-reference-cycle", input => {
    entry(input, "tax-1").occurredOn = "2026-11-15";
    entry(input, "tax-1").adjustment = { kind: "additional_assessment", referenceEntryId: "assessment-tax", evidenceId: "cycle-proof" };
  });
  add("refund-exceeds-tax-category", input => { entry(input, "tax-refund").charges = [{ category: "import_vat_gst", amount: "1" }]; });
  add("cumulative-refund-excess", input => {
    const value = structuredClone(entry(input, "tax-refund")); value.entryId = "second-tax-refund"; value.charges![0]!.amount = "145"; input.entries.push(value);
  });
  add("cash-refund-exceeds-credit", input => { entry(input, "payment-refund").amount = "11"; });
  add("refund-original-currency-mismatch", input => {
    const value = entry(input, "payment-refund"); value.currency = "USD"; value.amount = "0.10"; value.fxRateId = "synthetic-usdjpy";
  });
  add("refund-fx-cannot-hide-native-excess", input => {
    const payment = entry(input, "payment-2"); payment.currency = "USD"; payment.amount = "1.60"; payment.fxRateId = "synthetic-usdjpy";
    const refund = entry(input, "payment-refund"); refund.currency = "USD"; refund.amount = "2.00"; refund.fxRateId = "refund-rate";
    input.fxRates!.push({ ...input.fxRates![0]!, id: "refund-rate", numerator: "1" });
  });
  add("overpayment", input => { entry(input, "payment-2").amount = "161"; }, "current");
  add("tax-principal-disagreement", input => { entry(input, "tax-1").charges![0]!.amount = "99"; }, "current");
  add("duplicate-charge-category", input => { entry(input, "invoice-1").charges!.push({ category: "customs_duty", amount: "1" }); });
  add("invalid-receipt-shape", input => { entry(input, "payment-2").charges = [{ category: "customs_duty", amount: "1" }]; });
  add("unsupported-route", input => { input.scope.destinationCountry = "KP"; for (const value of input.entries) value.scope.destinationCountry = "KP"; });
  add("backdated-variance-review", undefined, "past");
  add("future-variance-review", undefined, "future");
  add("stale-variance-digest", input => { entry(input, "payment-2").amount = "150"; }, "base");
  add("multiple-diagnostics-order", input => {
    entry(input, "tax-1").scope.merchantId = "another-merchant";
    entry(input, "payment-2").occurredOn = "2026-11-19";
    entry(input, "invoice-credit").adjustment!.referenceEntryId = "missing";
    input.parcels[0]!.items[0]!.quantity = 3;
  });
  cases.push({ name: "unknown-top-level-field", kind: "ledger", input: { ...ledgerFixture(), privateAddress: "unexpected" } });
  return cases;
}

export function planContractCases(): RefactorCase[] {
  const cases: RefactorCase[] = [];
  const base = (): ImportSettlementPlanInput => structuredClone(settlementDraft("CN-JP", "DDP").input);
  const add = (name: string, input: ImportSettlementPlanInput, approval?: RefactorCase["approval"]) => {
    cases.push({ name, kind: "plan", input, ...(approval ? { approval } : {}) });
  };
  add("single-no-acceptance", base());
  add("single-accepted", base(), "current");
  const multi = base();
  const first = multi.quoteRequest.plan.shipment.items[0]!;
  first.quantity = 2; first.unitValue = "100000";
  multi.quoteRequest.plan.shipment.items.push({ ...first, id: "second-item", quantity: 1, unitValue: "90000" });
  multi.quoteRequest.plan.lines![0]!.customsValue = "200000";
  multi.quoteRequest.plan.lines!.push({ ...multi.quoteRequest.plan.lines![0]!, itemId: "second-item", customsValue: "100000" });
  multi.parcelCount = 2;
  multi.parcels = [{ parcelId: "parcel-1", items: [{ itemId: first.id, quantity: 1 }] },
    { parcelId: "parcel-2", items: [{ itemId: first.id, quantity: 1 }, { itemId: "second-item", quantity: 1 }] }];
  rebindQuote(multi.quoteRequest);
  add("multiple-accepted", structuredClone(multi), "current");
  const change = (name: string, mutate: (input: ImportSettlementPlanInput) => void) => {
    const input = structuredClone(multi); mutate(input); add(name, input, "current");
  };
  change("multiple-missing-allocation", input => { delete input.parcels; });
  change("multiple-parcel-count-mismatch", input => { input.parcelCount = 3; });
  change("multiple-duplicate-parcel", input => { input.parcels![1]!.parcelId = "parcel-1"; });
  change("multiple-duplicate-parcel-item", input => { input.parcels![0]!.items.push(structuredClone(input.parcels![0]!.items[0]!)); });
  change("multiple-unknown-item", input => { input.parcels![0]!.items[0]!.itemId = "unknown-product"; });
  change("multiple-missing-quantity", input => { input.parcels![0]!.items[0]!.quantity = 2; });
  change("multiple-extra-quantity", input => { input.parcels![1]!.items[1]!.quantity = 2; });
  change("multiple-allocation-diagnostics", input => {
    input.parcelCount = 3; input.parcels![1]!.parcelId = "parcel-1";
    input.parcels![0]!.items.push({ itemId: "unknown-product", quantity: 1 });
  });
  const missingImporter = base(); delete missingImporter.importerReview; add("single-missing-importer", missingImporter, "current");
  const wrongParty = base(); wrongParty.requestedBillTo.party = "buyer"; add("single-wrong-bill-to", wrongParty, "current");
  const unsupported = base(); unsupported.remittanceRoute = "postal_delegation"; add("single-unsupported-payment-route", unsupported, "current");
  add("single-future-acceptance", base(), "future");
  const schema = base(); cases.push({ name: "single-unknown-top-level-field", kind: "plan", input: { ...schema, privateAddress: "unexpected" } });
  return cases;
}
