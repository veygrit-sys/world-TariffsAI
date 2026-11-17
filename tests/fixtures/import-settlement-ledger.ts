import { invoiceEstimateChargeCategories } from "../../src/invoice-reconciliation.ts";
import type { ImportSettlementLedgerInput, SettlementLedgerEntry, SettlementLedgerScope } from "../../src/import-settlement-ledger.ts";

/** Synthetic records, not a tax or exchange-rate claim. */
export function ledgerFixture(): ImportSettlementLedgerInput {
  const scope: SettlementLedgerScope = {
    merchantId: "merchant-ledger", orderId: "order-ledger", estimateId: "estimate-ledger",
    originCountry: "CN", destinationCountry: "JP", settlementCurrency: "JPY",
    carrierId: "synthetic-carrier", carrierService: "synthetic-service", billingParty: "seller",
    billingAccountRef: "synthetic-account", remittanceRoute: "carrier_advance",
  };
  const charge = (customsDuty: string, carrierFee?: string) => invoiceEstimateChargeCategories
    .filter(category => carrierFee !== undefined || !["customs_fee", "carrier_fee"].includes(category))
    .map(category => ({ category, amount: category === "customs_duty" ? customsDuty : category === "carrier_fee" ? carrierFee! : "0" }));
  const entry = (entryId: string, kind: SettlementLedgerEntry["kind"], declarationId: string,
    changes: Partial<SettlementLedgerEntry>): SettlementLedgerEntry => ({
    entryId, kind, scope: { ...scope }, declarationId,
    parcelIds: [declarationId === "declaration-1" ? "parcel-1" : "parcel-2"],
    occurredOn: "2026-11-14", evidenceId: "synthetic-" + entryId, currency: "JPY", ...changes,
  });
  return {
    scope, estimate: { orderId: scope.orderId, estimateId: scope.estimateId, issuedOn: "2026-11-13", currency: "JPY",
      charges: charge("250", "20") },
    items: [{ itemId: "ceramic-a", quantity: 2 }, { itemId: "ceramic-b", quantity: 1 }],
    parcels: [
      { parcelId: "parcel-1", shipmentId: "shipment-1", declarationId: "declaration-1", items: [{ itemId: "ceramic-a", quantity: 1 }] },
      { parcelId: "parcel-2", shipmentId: "shipment-2", declarationId: "declaration-2", items: [{ itemId: "ceramic-a", quantity: 1 }, { itemId: "ceramic-b", quantity: 1 }] },
    ],
    entries: [
      entry("tax-1", "customs_remittance", "declaration-1", { charges: charge("100") }),
      entry("invoice-1", "carrier_invoice", "declaration-1", { charges: charge("100", "10") }),
      entry("payment-1", "carrier_payment", "declaration-1", { referenceEntryId: "invoice-1", currency: "USD", fxRateId: "synthetic-usdjpy", amount: "1.10" }),
      entry("tax-2", "customs_remittance", "declaration-2", { charges: charge("150") }),
      entry("invoice-2", "carrier_invoice", "declaration-2", { charges: charge("150", "10") }),
      entry("payment-2", "carrier_payment", "declaration-2", { referenceEntryId: "invoice-2", amount: "160" }),
      entry("assessment-tax", "customs_remittance", "declaration-1", {
        occurredOn: "2026-11-15", charges: [{ category: "customs_duty", amount: "20" }],
        adjustment: { kind: "additional_assessment", referenceEntryId: "tax-1", evidenceId: "synthetic-assessment-tax" },
      }),
      entry("assessment-invoice", "carrier_invoice", "declaration-1", {
        occurredOn: "2026-11-15", charges: [{ category: "customs_duty", amount: "20" }],
        adjustment: { kind: "additional_assessment", referenceEntryId: "invoice-1", evidenceId: "synthetic-assessment-invoice" },
      }),
      entry("assessment-payment", "carrier_payment", "declaration-1", { occurredOn: "2026-11-15", referenceEntryId: "assessment-invoice", amount: "20" }),
      entry("tax-refund", "customs_refund", "declaration-2", {
        occurredOn: "2026-11-16", charges: [{ category: "customs_duty", amount: "10" }],
        adjustment: { kind: "refund", referenceEntryId: "tax-2", evidenceId: "synthetic-customs-refund" },
      }),
      entry("invoice-credit", "carrier_credit", "declaration-2", {
        occurredOn: "2026-11-16", charges: [{ category: "customs_duty", amount: "10" }],
        adjustment: { kind: "refund", referenceEntryId: "invoice-2", evidenceId: "synthetic-carrier-credit" },
      }),
      entry("payment-refund", "carrier_refund", "declaration-2", { occurredOn: "2026-11-16", referenceEntryId: "payment-2", amount: "10" }),
    ],
    fxRates: [{ id: "synthetic-usdjpy", from: "USD", to: "JPY", numerator: "100", denominator: "1", purpose: "import_settlement",
      sourceId: "synthetic-rate-source", evidenceId: "synthetic-rate-evidence", validFrom: "2026-11-13", validTo: "2026-11-19",
      reviewedOn: "2026-11-14", reviewBy: "2026-11-18", rounding: "half_up" }],
  };
}
