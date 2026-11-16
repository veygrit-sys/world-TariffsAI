import assert from "node:assert/strict";
import { planCustoms } from "../src/customs-plan.ts";
import { loadDataset } from "../src/dataset.ts";
import { reviewImportSettlementPlan, type ImportSettlementPlanInput } from "../src/import-settlement-plan.ts";
import { importSettlementTaxCategories, reconcileImportSettlement, type ImportSettlementReconciliationInput } from "../src/import-settlement-reconciliation.ts";
import { invoiceEstimateChargeCategories } from "../src/invoice-reconciliation.ts";
import { currencyDigits, minor, money } from "../src/money.ts";
import { pilotChargeCategories, pilotQuoteShipmentDigest, quoteWorldShipment, type PilotChargeCategory, type PilotChargeEvidence } from "../src/pilot-quote.ts";
import { loadTariffCatalog } from "../src/tariffs.ts";
import { loadTerritoryRegistry } from "../src/territories.ts";
import type { BaseDutyTreatment, CustomsPlanRequest, Shipment } from "../src/types.ts";

export const publishedSettlementDates = ["2026-11-11", "2026-11-12"] as const;
const source = "https://test.example/historical-import-settlement";
export type PublishedSettlementTerm = "DAP" | "DDP";
export interface PublishedSettlementSample {
  country: string;
  code: string;
  currency: string;
  expression: string;
  treatment?: BaseDutyTreatment;
  date?: string;
  description?: string;
  holdReason?: string;
}

// Existing exact tariff lines in the bundled catalog for the stated observation date.
// The shipment, fees, review evidence, carrier acceptance and payments are synthetic.
export const historicalPublishedSettlementSamples: readonly PublishedSettlementSample[] = [
  { country: "AM", code: "6912002300", currency: "AMD", expression: "15%" },
  { country: "AZ", code: "6912002300", currency: "AZN", expression: "15%" },
  { country: "BJ", code: "6912001000", currency: "XOF", expression: "20%" },
  { country: "BY", code: "6912002300", currency: "BYN", expression: "15%", date: publishedSettlementDates[0], holdReason: "RU_BY_TRADE_REVIEW" },
  { country: "CK", code: "69120000", currency: "NZD", expression: "Free" },
  { country: "CR", code: "6912001000", currency: "CRC", expression: "15%" },
  { country: "FO", code: "69120023", currency: "DKK", expression: "5%", date: publishedSettlementDates[0] },
  { country: "GE", code: "39261000000", currency: "GEL", expression: "5%", description: "Plastic office and school supplies" },
  { country: "GT", code: "6912001000", currency: "GTQ", expression: "15%" },
  { country: "HN", code: "6912001000", currency: "HNL", expression: "15%" },
  { country: "IL", code: "6912000000", currency: "ILS", expression: "0%" },
  { country: "KG", code: "6912002300", currency: "KGS", expression: "15%" },
  { country: "KZ", code: "6912002300", currency: "KZT", expression: "15%" },
  { country: "MY", code: "9003110000", currency: "MYR", expression: "0%", description: "Plastic spectacle frames without lenses" },
  { country: "NC", code: "69120010", currency: "XPF", expression: "5%" },
  { country: "NG", code: "6912001000", currency: "NGN", expression: "20%" },
  { country: "NI", code: "6912001000", currency: "NIO", expression: "15%" },
  { country: "PR", code: "6912001000", currency: "USD", expression: "0.7%", treatment: "mfn" },
  { country: "PW", code: "69120000", currency: "USD", expression: "0%" },
  { country: "RU", code: "6912002300", currency: "RUB", expression: "15%", date: publishedSettlementDates[0], holdReason: "RU_BY_TRADE_REVIEW" },
  { country: "SV", code: "6912001000", currency: "USD", expression: "15%" },
  { country: "TG", code: "6912001000", currency: "XOF", expression: "20%" },
  { country: "TJ", code: "6912002300", currency: "TJS", expression: "10%" },
  { country: "UA", code: "6912002300", currency: "UAH", expression: "5%", treatment: "mfn", date: publishedSettlementDates[0] },
  { country: "UZ", code: "9003110000", currency: "UZS", expression: "5%", description: "Plastic spectacle frames without lenses" },
  { country: "ZW", code: "69120000", currency: "USD", expression: "60%", date: publishedSettlementDates[0] },
];
export const historicalJapanSettlementSample: PublishedSettlementSample = { country: "JP", code: "691390000", currency: "JPY", expression: "2.3%", treatment: "mfn", description: "Non-porcelain ceramic statuette" };

const dataset = loadDataset();
const catalog = loadTariffCatalog(dataset);
const territorySourcesCheckedOn = loadTerritoryRegistry().checkedOn;
export const publishedSettlementTerms = ["DAP", "DDP"] as const;
export const publishedSettlementOrigins = [...dataset.countries, ...dataset.supplementalRegions]
  .filter(({ code, inScope }) => inScope && code !== "KP").map(({ code }) => code).sort();

function draft(originCountry: string, sample: PublishedSettlementSample, date: string, term: PublishedSettlementTerm, recordHolds: boolean) {
  const { country: destinationCountry, currency, code: tariffCode } = sample;
  const zeroDecimals = currencyDigits(currency) === 0;
  const value = zeroDecimals ? "300000" : "2500";
  const freight = zeroDecimals ? "9000" : "12";
  const insurance = zeroDecimals ? "1000" : "3";
  const route = originCountry + "-" + destinationCountry;
  const orderId = "historic-order-" + route + "-" + term;
  const itemId = "historic-item";
  const party = term === "DAP" ? "buyer" : "seller";
  const shipment: Shipment = {
    originCountry, destinationCountry, loadingCountry: originCountry, originZone: "standard", destinationZone: "standard",
    importDate: date, currency, locale: "en", freight, insurance,
    customsValue: value, customsValueConfirmed: true, consignmentScopeConfirmed: true,
    incoterm: term, transaction: "b2c_sale", channel: "direct", transport: "air", regime: "standard",
    inventoryStatus: "free_circulation", sellerTaxRegistration: "registered",
    items: [{
      id: itemId, originCountry, description: sample.description ?? "Non-porcelain ceramic tableware",
      quantity: 1, hs6: tariffCode.slice(0, 6), goodsType: "ordinary", classificationConfirmed: true,
      ...(sample.treatment === "zero_duty_policy" ? { nonDutiableConfirmed: true } : {}),
      unitValue: money(minor(value, currency) - minor(freight, currency) - minor(insurance, currency), currency).value,
    }],
  };
  const now = new Date(date + "T02:00:00+09:00");
  const plan: CustomsPlanRequest = {
    shipment,
    lines: [{ itemId, tariffCode, rateTreatment: sample.treatment ?? "general" as const }],
    availableDocuments: ["COMMERCIAL_INVOICE", "PACKING_LIST", "TRANSPORT_DOCUMENT"],
  };
  const planResult = planCustoms(plan, dataset, catalog, now);
  const duty = planResult.lines[0]!.dutyScenario;
  const amounts: Record<PilotChargeCategory, string> = {
    customs_duty: duty.status === "calculated" ? duty.amount.value : "0",
    import_vat_gst: "13", additional_duty: "0", excise: "0", customs_fee: "3", carrier_fee: "5", checkout_tax: "0",
  };
  const evidenceDates = { reviewedOn: date, effectiveFrom: date, effectiveThrough: date, reviewBy: date };
  const input: ImportSettlementPlanInput = {
    merchantId: "historic-merchant", shipmentId: "historic-shipment-" + route + "-" + term,
    carrierId: "historic-carrier", carrierService: "historic-air", parcelCount: 1,
    remittanceRoute: "carrier_advance", direct: true, buyerIsRecipient: true,
    requestedBillTo: { party, accountRef: "historic-account-" + party }, quoteProfile: "worldwide",
    importerReview: { importerRef: "historic-importer", brokerRef: "historic-broker", evidenceRef: "historic-importer-proof" },
    quoteRequest: {
      plan, orderId, estimateId: "historic-estimate-" + route + "-" + term, loadingCountry: originCountry,
      reviewedShipmentDigest: pilotQuoteShipmentDigest(plan, orderId, originCountry),
      tradeReview: { status: "confirmed", evidence: {
        id: "historic-trade-" + route, sourceType: "customs_broker", sourceUrl: source + "/trade",
        dispatchCountry: originCountry, destinationCountry, ...evidenceDates,
      } },
      charges: recordHolds && duty.status !== "calculated" ? [] : pilotChargeCategories.map((category) => {
        const evidence: PilotChargeEvidence = {
          id: "historic-charge-" + category, sourceUrl: source + "/charge",
          sourceType: category === "carrier_fee" ? "carrier" : "customs_broker",
          destinationCountry, currency, ...evidenceDates,
        };
        return minor(amounts[category], currency) === 0n ? { category, method: "not_applicable", evidence }
          : { category, method: "confirmed_amount", amount: amounts[category], timing: "import", payer: party, evidence };
      }),
    },
  };
  return { input, duty, now, amounts, route };
}

/** Verify a strict historical sample, or record evidence holds in a multi-origin batch. */
export function verifyPublishedSettlement(
  origin: string,
  destination: PublishedSettlementSample,
  date: string,
  term: PublishedSettlementTerm,
  { holdReason, recordHolds = false }: { holdReason?: string | undefined; recordHolds?: boolean } = {},
) {
  const { input, duty, now, amounts, route } = draft(origin, destination, date, term, recordHolds);
  const { currency, code } = destination;
  const quote = quoteWorldShipment(input.quoteRequest, dataset, catalog, now);
  const preview = reviewImportSettlementPlan(input, dataset, catalog, now);
  assert.deepEqual([preview.shippingAuthorized, preview.productionAuthorized], [false, false]);
  if (holdReason) {
    assert.notEqual(quote.status, "estimated", route);
    assert.equal(preview.status, "review_required", route);
    assert.ok(preview.findings.includes(holdReason), route + ": " + JSON.stringify(preview.findings));
    assert.equal(preview.billingBinding, null);
    return { term, status: "held", reason: holdReason } as const;
  }

  if (recordHolds && (duty.status !== "calculated" || quote.status !== "estimated")) {
    assert.notEqual(quote.status, "estimated", route);
    assert.notEqual(preview.status, "ready", route);
    assert.equal(preview.billingBinding, null, route);
    const reasons = preview.findings.filter((finding) => finding !== "CARRIER_ACCEPTANCE_REQUIRED");
    if (duty.status === "review_required") reasons.push(duty.reason);
    if (duty.status === "not_requested") reasons.push("PUBLISHED_DUTY_NOT_REQUESTED");
    assert.ok(reasons.length, route);
    return { term, status: "held", findings: [...new Set(reasons)].sort() } as const;
  }

  assert.equal(duty.status, "calculated", route);
  if (!recordHolds) assert.equal(duty.expression, destination.expression, route);
  if (destination.treatment === "zero_duty_policy") {
    const policy = catalog.destinationCustomsProfile(destination.country, date)?.generalDutyPolicy;
    assert.ok(policy && territorySourcesCheckedOn <= date, route);
    assert.equal(duty.basis, "confirmed_zero_duty_policy", route);
    assert.equal(duty.expression, "0%", route);
    assert.equal(duty.snapshotId, null, route);
    assert.ok(duty.sourceUrls.length, route);
  } else {
    assert.ok(duty.snapshotId, route);
    const snapshot = catalog.destinationSnapshots(destination.country).find(({ id }) => id === duty.snapshotId);
    if (recordHolds) {
      assert.ok(snapshot && snapshot.availableFrom <= date && date <= snapshot.availableThrough && snapshot.checkedOn <= date, route);
    }
  }
  assert.equal(quote.status, "estimated", route + ": " + JSON.stringify(quote.findings));
  assert.ok(quote.estimate);
  assert.equal(preview.status, "review_required");
  assert.deepEqual(preview.findings, ["CARRIER_ACCEPTANCE_REQUIRED"]);
  input.carrierAcceptance = {
    scopeDigest: preview.scopeDigest, billTo: input.requestedBillTo, evidenceRef: "historic-bill-to",
    acceptedAt: date + "T01:45:00+09:00", expiresAt: date + "T02:10:00+09:00",
  };
  const ready = reviewImportSettlementPlan(input, dataset, catalog, now);
  assert.equal(ready.status, "ready", route + ": " + JSON.stringify(ready.findings));
  assert.deepEqual(ready.quoteEstimate, quote.estimate);
  assert.ok(ready.billingBinding);
  assert.deepEqual([ready.shippingAuthorized, ready.productionAuthorized], [false, false]);
  const scope = { ...ready.billingBinding, declarationId: "historic-declaration-" + route };
  const invoiceId = "historic-invoice-" + route;
  const sum = (categories: readonly PilotChargeCategory[]) =>
    money(categories.reduce((value, category) => value + minor(amounts[category], currency), 0n), currency).value;
  const amount = sum(invoiceEstimateChargeCategories);
  assert.equal(quote.buyerAtImport?.value, term === "DAP" ? amount : money(0n, currency).value);
  const charges = invoiceEstimateChargeCategories.map((category) => ({ category, amount: amounts[category] }));
  const reconciliation: ImportSettlementReconciliationInput = {
    scope, estimate: quote.estimate,
    remittances: [{ ...scope, remittanceId: "historic-remittance-" + route, currency, paidOn: date,
      taxes: importSettlementTaxCategories.map((category) => ({ category, amount: amounts[category] })) }],
    carrierInvoices: [{ ...scope, invoice: { invoiceId, orderId: quote.orderId, estimateId: quote.estimateId,
      currency, issuedOn: date, charges } }],
    carrierPayments: [{ ...scope, receiptId: "historic-receipt-" + route, invoiceId, currency, paidOn: date, amount }],
  };
  const result = reconcileImportSettlement(reconciliation, now, dataset);
  assert.equal(result.status, "reconciled", route + ": " + JSON.stringify(result.issues));
  assert.deepEqual(result.totals, { customsTax: sum(importSettlementTaxCategories),
    carrierFees: sum(["customs_fee", "carrier_fee"]), importCost: amount });
  return { term, status: "reconciled", tariffCode: code, snapshotId: duty.snapshotId,
    tariffExpression: duty.expression, currency, baseDuty: duty.amount.value,
    ...(recordHolds ? { basis: duty.basis, sourceUrls: duty.sourceUrls } : {}) } as const;
}

