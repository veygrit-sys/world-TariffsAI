import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { additionalCycleLines } from "../../scripts/all-destination-cycle-lines.ts";
import { pilotBaseLines } from "../../scripts/pilot-cycle-evidence.ts";
import { worldwideBaseLines, worldwideCountries, type CycleBaseLine } from "../../scripts/worldwide-cycle-lines.ts";
import { createHandler } from "../../src/http.ts";
import { reviewImportSettlementPlan, type ImportSettlementPlanInput } from "../../src/import-settlement-plan.ts";
import {
  importSettlementTaxCategories, reconcileImportSettlement, type ImportSettlementReconciliationInput, type ImportSettlementScope,
} from "../../src/import-settlement-reconciliation.ts";
import { invoiceEstimateChargeCategories } from "../../src/invoice-reconciliation.ts";
import { currencyDigits, minor, money, roundRatio } from "../../src/money.ts";
import {
  pilotChargeCategories, pilotQuoteShipmentDigest, quoteWorldShipment, type PilotChargeEvidence, type PilotQuote, type WorldQuoteRequest,
} from "../../src/pilot-quote.ts";
import { loadTariffCatalog, tariffStatistics, validateTariffImport } from "../../src/tariffs.ts";
import { data, shipment } from "../helpers.ts";

export const settlementDate = "2026-11-13";
export const settlementNow = "2026-11-13T02:00:00+09:00";
const sourceUrl = "https://test.example/synthetic/import-settlement/";
export const settlementApiKey = "synthetic-worldwide-settlement-test-service-key";
const extra = ["CN", "US", ...worldwideCountries, "BR", "OM"];
export const settlementRoutes = [
  ...extra.flatMap((country) => ["JP-" + country, country + "-JP"]),
  "BR-DE", "DE-BR", "OM-SG", "SG-OM",
];
const tariffLines: Readonly<Record<string, CycleBaseLine>> = {
  ...pilotBaseLines,
  ...worldwideBaseLines,
  ...additionalCycleLines,
};
export const settlementTariffCountries = Object.keys(tariffLines).sort();
export const settlementMatrixCountries = [...data.countries, ...data.supplementalRegions]
  .filter(({ inScope, code }) => inScope && code !== "KP").map(({ code }) => code).sort();
export const settlementMatrixRoutes = settlementMatrixCountries.flatMap((origin) =>
  settlementMatrixCountries.filter((destination) => origin !== destination).map((destination) => origin + "-" + destination));

function fixtureRate(country: string, line: CycleBaseLine): string {
  return country === "SG" || country === "CH" || country === "LI" ? "0" : line.syntheticRate;
}

function tariffCatalog(directory: string) {
  const snapshots = Object.entries(tariffLines).map(([country, line]) => {
    const id = "synthetic-settlement-" + country.toLowerCase();
    const url = sourceUrl + country;
    const expression = fixtureRate(country, line) + "%";
    const { source, lines } = validateTariffImport({
      id, jurisdiction: line.jurisdiction ?? country, countries: [country], zone: "standard",
      edition: "Synthetic settlement QA only", hsEdition: "HS 2022",
      availableFrom: settlementDate, availableThrough: settlementDate, checkedOn: settlementDate,
      scope: "published_baseline", authority: "Synthetic test source", sourceUrl: url,
      termsUrl: url, terms: "Test only", inputFiles: [{ url, sha256: "0".repeat(64) }],
      limitations: ["Single ordinary tariff line for a synthetic test only."],
    }, [{
      code: line.code, reference: "Synthetic ceramic item",
      rates: [{ charge: "customs_duty", treatment: line.treatment, label: "Synthetic test rate", expression }],
    }], data);
    const file = id + ".json.gz";
    const bytes = gzipSync(JSON.stringify({ id, lines }));
    writeFileSync(join(directory, file), bytes);
    return { ...source, file, sha256: createHash("sha256").update(bytes).digest("hex"), statistics: tariffStatistics(lines) };
  });
  writeFileSync(join(directory, "manifest.json"), JSON.stringify({ version: 1, snapshots }));
  return loadTariffCatalog(data, directory);
}

export function openSettlementFixture() {
  const directory = mkdtempSync(join(tmpdir(), "worldwide-import-settlement-test-"));
  const close = () => rmSync(directory, { recursive: true, force: true });
  try {
    const tariffs = tariffCatalog(directory);
    const now = new Date(settlementNow);
    const makeApi = (withTestTariffs: boolean) => {
      const handle = createHandler({
        dataset: data, tariffs: withTestTariffs ? tariffs : loadTariffCatalog(data), apiKey: settlementApiKey, now: () => now,
      });
      let requests = 0;
      return async <T>(path: string, input: unknown, status = 200, key = settlementApiKey): Promise<T> => {
        const peerIndex = Math.floor(requests++ / 50);
        const peer = `127.${Math.floor(peerIndex / 65536)}.${Math.floor(peerIndex / 256) % 256}.${peerIndex % 256}`;
        const response = await handle(new Request("http://localhost" + path, {
          method: "POST",
          headers: { authorization: "Bearer " + key, "content-type": "application/json" },
          body: JSON.stringify(input),
        }), { peer });
        const result: unknown = await response.json();
        assert.equal(response.status, status, JSON.stringify(result));
        assert.equal(response.headers.get("cache-control"), "no-store");
        return result as T;
      };
    };
    const direct = async <T>(path: string, input: unknown): Promise<T> => {
      if (path === worldQuoteEndpoint) return quoteWorldShipment(input, data, tariffs, now) as T;
      if (path === planEndpoint) return reviewImportSettlementPlan(input, data, tariffs, now) as T;
      if (path === reconcileEndpoint) return reconcileImportSettlement(input, now, data) as T;
      throw new Error("Unknown settlement fixture endpoint: " + path);
    };
    let baseline: ReturnType<typeof makeApi> | undefined;
    return {
      api: makeApi(true), direct, close, dataset: data, tariffs,
      get baseline() { return baseline ??= makeApi(false); },
    };
  } catch (error) {
    close();
    throw error;
  }
}

export type DeliveryTerms = "DAP" | "DDP";
export const planEndpoint = "/v1/import-settlement/plan";
export const reconcileEndpoint = "/v1/import-settlement/reconcile";
export const worldQuoteEndpoint = "/v1/worldwide/quote";

export function rebindQuote(quoteRequest: WorldQuoteRequest) {
  quoteRequest.reviewedShipmentDigest = pilotQuoteShipmentDigest(
    quoteRequest.plan, quoteRequest.orderId, quoteRequest.loadingCountry, quoteRequest.usJurisdictionApplies,
  );
}

export function settlementDraft(route: string, terms: DeliveryTerms) {
  const [originCountry, destinationCountry] = route.split("-") as [string, string];
  const base = tariffLines[destinationCountry] ?? tariffLines.JP!;
  const { currency } = base;
  const digits = currencyDigits(currency);
  const party = terms === "DDP" ? "seller" : "buyer";
  const orderId = "synthetic-order-" + route + "-" + terms;
  const merchantId = "synthetic-merchant";
  const itemId = "synthetic-ceramic-item";
  const customsValue = base.customsValue ?? (digits === 0 ? 300_000 : 2500);
  const freight = currency === "JPY" ? 9000 : 12;
  const insurance = currency === "JPY" ? 1000 : 3;
  const format = (value: number | string) => money(minor(String(value), currency), currency).value;
  const [whole, fraction = ""] = fixtureRate(destinationCountry, base).split(".") as [string, string?];
  const rateNumerator = BigInt(whole + fraction);
  const rateDenominator = 100n * 10n ** BigInt(fraction.length);
  const amounts = {
    customs_duty: money(roundRatio(minor(String(customsValue), currency), rateNumerator, rateDenominator), currency).value,
    import_vat_gst: format(destinationCountry === "US" ? 0 : currency === "JPY" ? 30500 : 13),
    additional_duty: format(currency === "JPY" ? 0 : 2),
    excise: format(0),
    customs_fee: format(currency === "JPY" ? 200 : 3),
    carrier_fee: format(currency === "JPY" ? 500 : digits === 0 ? 5 : digits === 3 ? "5.123" : "5.50"),
    checkout_tax: format(0),
  };
  const sum = (categories: readonly (keyof typeof amounts)[]) =>
    money(categories.reduce((total, category) => total + minor(amounts[category], currency), 0n), currency).value;
  const importTotal = sum(invoiceEstimateChargeCategories);
  const customsTax = sum(importSettlementTaxCategories);
  const carrierFees = sum(["customs_fee", "carrier_fee"]);
  const dates = { reviewedOn: settlementDate, effectiveFrom: settlementDate, effectiveThrough: settlementDate, reviewBy: settlementDate };
  const quoteRequest: WorldQuoteRequest = {
    orderId, estimateId: "synthetic-estimate-" + route + "-" + terms, loadingCountry: originCountry,
    plan: {
      shipment: shipment({
        originCountry, destinationCountry, currency, incoterm: terms, importDate: settlementDate,
        customsValue: format(customsValue), customsValueConfirmed: true, freight: format(freight), insurance: format(insurance),
        items: [{ id: itemId, description: "Synthetic ceramic item", originCountry, goodsType: "ordinary",
          quantity: 1, unitValue: format(customsValue - freight - insurance), hs6: base.hs6, classificationConfirmed: true }],
        veygrit: { merchantId, orderId, cartVersion: "synthetic-cart-v1", addressTokenRef: "synthetic-address-token",
          addressVersion: "synthetic-address-v1", grantRef: "synthetic-address-grant" },
      }),
      lines: [{ itemId, tariffCode: base.code, rateTreatment: base.treatment }],
      availableDocuments: ["COMMERCIAL_INVOICE", "PACKING_LIST", "TRANSPORT_DOCUMENT"],
    },
    charges: pilotChargeCategories.map((category) => {
      const evidence: PilotChargeEvidence = {
        id: "synthetic-charge-" + route + "-" + category, sourceUrl: sourceUrl + route + "/" + category,
        sourceType: category === "carrier_fee" ? "carrier" : "customs_broker", destinationCountry, currency, ...dates,
      };
      return minor(amounts[category], currency) === 0n ? { category, evidence, method: "not_applicable" } :
        { category, evidence, method: "confirmed_amount", amount: amounts[category], payer: party, timing: "import" };
    }),
    tradeReview: { status: "confirmed", evidence: {
      id: "synthetic-trade-" + route, sourceUrl: sourceUrl + route + "/trade", sourceType: "customs_broker",
      dispatchCountry: originCountry, destinationCountry, ...dates,
    } },
  };
  rebindQuote(quoteRequest);
  const input = {
    merchantId, shipmentId: "synthetic-shipment-" + route + "-" + terms, quoteRequest, quoteProfile: "worldwide",
    carrierId: "synthetic-carrier", carrierService: "synthetic-courier", parcelCount: 1, direct: true,
    remittanceRoute: "carrier_advance", buyerIsRecipient: true, requestedBillTo: { party, accountRef: "synthetic-account-" + party },
    importerReview: { importerRef: "synthetic-importer", brokerRef: "synthetic-broker", evidenceRef: "synthetic-importer-review" },
  } satisfies ImportSettlementPlanInput;
  return { input, currency, party, amounts, customsTax, carrierFees, importTotal,
    buyerAtCheckout: format(customsValue), buyerAtImport: terms === "DAP" ? importTotal : format(0) };
}

type SettlementReview = ReturnType<typeof reviewImportSettlementPlan>;
type SettlementFixtureRequest = <T>(path: string, input: unknown) => Promise<T>;

export async function prepareSettlementCase(api: SettlementFixtureRequest, route: string, terms: DeliveryTerms) {
  const draft = settlementDraft(route, terms);
  const quote = await api<PilotQuote>(worldQuoteEndpoint, draft.input.quoteRequest);
  const before = await api<SettlementReview>(planEndpoint, draft.input);
  if (quote.status !== "estimated" || before.status === "out_of_scope") {
    assert.notEqual(before.status, "ready", route);
    assert.equal(before.billingBinding, null, route);
    return { status: "held", draft, input: draft.input, quote, review: before } as const;
  }
  assert.ok(quote.estimate);
  assert.equal(before.status, "review_required", route + " " + JSON.stringify(before.findings));
  assert.ok(before.findings.includes("CARRIER_ACCEPTANCE_REQUIRED"));
  assert.equal(before.billingBinding, null);
  const input: ImportSettlementPlanInput = {
    ...draft.input,
    carrierAcceptance: {
      scopeDigest: before.scopeDigest, billTo: draft.input.requestedBillTo, evidenceRef: "synthetic-acceptance-" + route,
      acceptedAt: "2026-11-13T01:30:00+09:00", expiresAt: "2026-11-13T02:30:00+09:00",
    },
  };
  const review = await api<SettlementReview>(planEndpoint, input);
  if (review.status !== "ready") {
    assert.equal(review.billingBinding, null, route);
    return { status: "held", draft, input, quote, review } as const;
  }
  assert.ok(review.billingBinding);
  const scope: ImportSettlementScope = { ...review.billingBinding, declarationId: "synthetic-declaration-" + route };
  const charges = invoiceEstimateChargeCategories.map((category) => ({ category, amount: draft.amounts[category] }));
  const invoiceId = "synthetic-invoice-" + route;
  const evidence: ImportSettlementReconciliationInput = {
    scope, estimate: quote.estimate,
    remittances: [{ ...scope, remittanceId: "synthetic-remittance-" + route, currency: draft.currency, paidOn: settlementDate,
      taxes: importSettlementTaxCategories.map((category) => ({ category, amount: draft.amounts[category] })) }],
    carrierInvoices: [{ ...scope, invoice: { invoiceId, orderId: quote.orderId, estimateId: quote.estimateId,
      currency: draft.currency, issuedOn: settlementDate, charges } }],
    carrierPayments: [{ ...scope, receiptId: "synthetic-receipt-" + route, invoiceId, currency: draft.currency,
      paidOn: settlementDate, amount: draft.importTotal }],
  };
  return { status: "ready", draft, input, quote, review, evidence } as const;
}

export async function verifiedSettlementCase(api: SettlementFixtureRequest, route: string, terms: DeliveryTerms) {
  const result = await prepareSettlementCase(api, route, terms);
  assert.equal(result.status, "ready", route + " " + JSON.stringify(result.review.findings));
  return result;
}

/** Cases for the isolated WooCommerce order projection runner. */
export async function settlementCases(routes: readonly string[] = settlementRoutes) {
  const fixture = openSettlementFixture();
  try {
    const result = [];
    for (const route of routes) {
      for (const terms of ["DAP", "DDP"] as const) {
        const { draft, quote, review, input, evidence } = await verifiedSettlementCase(fixture.api, route, terms);
        result.push({
          id: route + "-" + terms, quote, quoteEndpoint: worldQuoteEndpoint,
          expected: {
            orderId: quote.orderId, shipmentDigest: quote.shipmentDigest, shipmentId: input.shipmentId,
            settlementScopeDigest: review.scopeDigest, importDate: quote.importDate, currency: quote.currency,
            quoteProfile: "worldwide",
          },
          now: settlementNow, settlementReview: review, expectedImportFeePayer: draft.party,
          expectedPayments: {
            buyerAtCheckout: { currency: quote.currency, value: draft.buyerAtCheckout },
            buyerAtImport: { currency: quote.currency, value: draft.buyerAtImport },
          },
          invoice: evidence.carrierInvoices![0]!.invoice,
        });
      }
    }
    return result;
  } finally {
    fixture.close();
  }
}
