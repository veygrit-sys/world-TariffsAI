import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { after } from "node:test";
import { Ajv } from "ajv";
import addFormatsModule from "ajv-formats";
import type { reviewImportSettlementPlan } from "../src/import-settlement-plan.ts";
import { reconcileImportSettlement, type ImportSettlementReconciliation } from "../src/import-settlement-reconciliation.ts";
import {
  openSettlementFixture, planEndpoint, rebindQuote, reconcileEndpoint, settlementDate, settlementDraft,
  settlementRoutes, verifiedSettlementCase,
} from "./fixtures/import-settlement-worldwide.ts";

type Plan = ReturnType<typeof reviewImportSettlementPlan>;
type Issues = { issues: { path: string; code: string }[] };
const fixture = openSettlementFixture();
after(fixture.close);
const { api, baseline } = fixture;

test("worldwide import settlement verifies both DAP and DDP through invoice and carrier payment for each direction", async () => {
  const countries = new Set(settlementRoutes.flatMap((route) => route.split("-")));
  assert.equal(countries.size, 16);
  assert.equal(settlementRoutes.length, 34);
  const currencies = new Set<string>();
  const doc = JSON.parse(readFileSync(new URL("../docs/openapi.json", import.meta.url), "utf8")) as {
    components: { schemas: Record<string, object> };
  };
  const ajv = new Ajv({ strict: true });
  (addFormatsModule as unknown as (instance: Ajv) => void)(ajv);
  const schemas = ["ImportSettlementPlanInput", "ImportSettlementPlan", "ImportSettlementReconciliationInput", "ImportSettlementReconciliation"]
    .map((name) => ajv.compile(doc.components.schemas[name]!));

  for (const route of settlementRoutes) {
    const [origin, destination] = route.split("-");
    for (const terms of ["DAP", "DDP"] as const) {
      const { draft, input, quote, review, evidence } = await verifiedSettlementCase(api, route, terms);
      currencies.add(draft.currency);
      assert.deepEqual([review.billingBinding!.originCountry, review.billingBinding!.destinationCountry], [origin, destination]);
      assert.equal(review.billingBinding!.settlementCurrency, draft.currency);
      assert.equal(review.billingBinding!.billingAccountRef, input.requestedBillTo.accountRef);
      assert.equal(review.billingParty, draft.party);
      assert.equal(review.deliveryTerms, terms);
      assert.equal(review.quoteRequestDigest, quote.requestDigest);
      assert.equal(review.ruleSetVersion, quote.ruleSetVersion);
      assert.deepEqual(review.quoteEstimate, quote.estimate);
      assert.deepEqual([review.shippingAuthorized, review.productionAuthorized], [false, false]);
      assert.deepEqual(quote.buyerAtCheckout, { currency: draft.currency, value: draft.buyerAtCheckout });
      assert.deepEqual(quote.buyerAtImport, { currency: draft.currency, value: draft.buyerAtImport });

      const result = await api<ImportSettlementReconciliation>(reconcileEndpoint, evidence);
      assert.equal(result.status, "reconciled", route + " " + JSON.stringify(result.issues));
      assert.equal(result.currency, draft.currency);
      assert.equal(result.customsRemittance.status, "confirmed");
      assert.equal(result.carrierSettlement.status, "confirmed");
      assert.equal(result.carrierSettlement.paidAmount, draft.importTotal);
      assert.deepEqual(result.totals, { customsTax: draft.customsTax, carrierFees: draft.carrierFees, importCost: draft.importTotal });
      for (const [index, value] of [input, review, evidence, result].entries()) {
        const validate = schemas[index]!;
        assert.ok(validate(value), route + " " + JSON.stringify(validate.errors));
      }
    }
  }
  assert.equal(currencies.size, 16);
});

test("worldwide import settlement holds stale, incomplete or wrong-route trade and billing evidence", async () => {
  const { input } = await verifiedSettlementCase(api, "JP-CN", "DAP");
  const noApproval = structuredClone(input);
  delete noApproval.quoteRequest.tradeReview;
  const wrongApproval = structuredClone(input);
  const approval = wrongApproval.quoteRequest.tradeReview;
  assert.ok(approval?.status === "confirmed");
  approval.evidence.dispatchCountry = "CN";
  const changedEstimate = structuredClone(input);
  const fee = changedEstimate.quoteRequest.charges.find(({ category }) => category === "carrier_fee");
  assert.ok(fee?.method === "confirmed_amount");
  fee.amount = "8.50";
  const changedRoute = settlementDraft("CN-JP", "DAP").input;
  changedRoute.quoteRequest.orderId = input.quoteRequest.orderId;
  changedRoute.quoteRequest.estimateId = input.quoteRequest.estimateId;
  changedRoute.quoteRequest.plan.shipment.veygrit!.orderId = input.quoteRequest.orderId;
  rebindQuote(changedRoute.quoteRequest);
  const withReverseProof = { ...changedRoute, shipmentId: input.shipmentId, carrierAcceptance: input.carrierAcceptance };
  const pastReference = structuredClone(input);
  pastReference.quoteRequest.plan.shipment.importDate = "2026-11-14";
  rebindQuote(pastReference.quoteRequest);
  const wrongLoading = structuredClone(input);
  wrongLoading.quoteRequest.loadingCountry = "DE";
  rebindQuote(wrongLoading.quoteRequest);
  const missingImporter = { ...input };
  delete missingImporter.importerReview;
  const expired = structuredClone(input);
  expired.carrierAcceptance!.expiresAt = expired.carrierAcceptance!.acceptedAt;

  for (const [draft, requiredFinding] of [
    [noApproval, "CURRENT_ESTIMATE_REQUIRED"],
    [wrongApproval, "CURRENT_ESTIMATE_REQUIRED"],
    [pastReference, "CURRENT_ESTIMATE_REQUIRED"],
    [missingImporter, "IMPORTER_REVIEW_REQUIRED"],
    [expired, "CARRIER_ACCEPTANCE_DATE_INVALID"],
    [withReverseProof, "CARRIER_ACCEPTANCE_SCOPE_MISMATCH"],
    [changedEstimate, "CARRIER_ACCEPTANCE_SCOPE_MISMATCH"],
    [wrongLoading, "SETTLEMENT_ROUTE_OUT_OF_SCOPE"],
  ] as const) {
    const result = await api<Plan>(planEndpoint, draft);
    assert.notEqual(result.status, "ready");
    assert.ok(result.findings.includes(requiredFinding), JSON.stringify(result.findings));
    assert.deepEqual([result.billingBinding, result.quoteEstimate, result.expiresAt], [null, null, null]);
  }
  const tariffMissing = await baseline<Plan>(planEndpoint, input);
  assert.equal(tariffMissing.status, "review_required");
  assert.ok(tariffMissing.findings.includes("CURRENT_ESTIMATE_REQUIRED"));
  assert.ok(tariffMissing.findings.includes("DATED_TARIFF_REFERENCE_REQUIRED"));
  assert.equal(tariffMissing.billingBinding, null);
  const pilotMisuse = await api<Plan>(planEndpoint, { ...input, quoteProfile: "pilot" });
  assert.equal(pilotMisuse.status, "out_of_scope");
  assert.deepEqual(pilotMisuse.findings, ["WORLDWIDE_QUOTE_REQUIRED"]);
  assert.equal(pilotMisuse.billingBinding, null);
});

test("domestic, intra-EU, excluded countries and unsupported shipment shapes cannot confirm billing", async () => {
  for (const route of ["JP-JP", "DE-FR", "KP-JP", "JP-KP", "JP-AQ", "ZA-NA"]) {
    const { input } = settlementDraft(route, "DDP");
    const plan = await api<Plan>(planEndpoint, input);
    assert.notEqual(plan.status, "ready", route);
    assert.equal(plan.billingBinding, null);
  }
  const { input } = settlementDraft("JP-GB", "DAP");
  const restrictedOrigin = structuredClone(input);
  restrictedOrigin.quoteRequest.plan.shipment.items[0]!.originCountry = "KP";
  rebindQuote(restrictedOrigin.quoteRequest);
  const unsupportedTransport = structuredClone(input);
  unsupportedTransport.quoteRequest.plan.shipment.transport = "post";
  rebindQuote(unsupportedTransport.quoteRequest);
  const accepted = await verifiedSettlementCase(api, "JP-GB", "DAP");
  for (const draft of [
    restrictedOrigin, unsupportedTransport, { ...accepted.input, parcelCount: 2 },
    { ...accepted.input, direct: false }, { ...accepted.input, buyerIsRecipient: false },
  ]) {
    assert.equal((await api<Plan>(planEndpoint, draft)).billingBinding, null);
  }
});

test("settlement validates route, currency and receipt identity and keeps remittance distinct from payment", async () => {
  const { evidence } = await verifiedSettlementCase(api, "JP-OM", "DDP");
  const partial = await api<ImportSettlementReconciliation>(reconcileEndpoint, { ...evidence, carrierPayments: [] });
  assert.deepEqual([partial.status, partial.customsRemittance.status, partial.carrierSettlement.status], ["pending", "confirmed", "missing"]);
  assert.equal(partial.totals.carrierFees, "8.123");
  const replay = await api<ImportSettlementReconciliation>(reconcileEndpoint, {
    ...evidence,
    remittances: [...evidence.remittances!, ...evidence.remittances!],
    carrierInvoices: [...evidence.carrierInvoices!, ...evidence.carrierInvoices!],
    carrierPayments: [...evidence.carrierPayments!, ...evidence.carrierPayments!],
  });
  assert.equal(replay.status, "reconciled");
  assert.equal(replay.carrierSettlement.receiptIds.length, 1);

  const reverse = structuredClone(evidence);
  [reverse.remittances![0]!.originCountry, reverse.remittances![0]!.destinationCountry] =
    [reverse.scope.destinationCountry, reverse.scope.originCountry];
  const wrongRoute = await api<ImportSettlementReconciliation>(reconcileEndpoint, reverse);
  assert.equal(wrongRoute.status, "needs_review");
  assert.ok(wrongRoute.issues.some(({ code }) => code === "SETTLEMENT_SCOPE_MISMATCH"));

  const switched = structuredClone(evidence);
  switched.carrierPayments![0]!.currency = "JPY";
  const wrongCurrency = await api<ImportSettlementReconciliation>(reconcileEndpoint, switched);
  assert.equal(wrongCurrency.status, "needs_review");
  assert.ok(wrongCurrency.issues.some(({ code }) => code === "CURRENCY_MISMATCH"));
  assert.equal(wrongCurrency.carrierSettlement.paidAmount, null);

  const scopeCurrency = { ...evidence, scope: { ...evidence.scope, settlementCurrency: "CNY" } };
  const wrongScopeCurrency = await api<Issues>(reconcileEndpoint, scopeCurrency, 400);
  assert.ok(wrongScopeCurrency.issues.some(({ code }) => code === "SETTLEMENT_ESTIMATE_CURRENCY_MISMATCH"));

  const unbound = structuredClone(evidence);
  delete unbound.scope.settlementCurrency;
  await api<Issues>(reconcileEndpoint, unbound, 400);
  for (const invalidScope of [
    { originCountry: "JP", destinationCountry: "JP" }, { originCountry: "DE", destinationCountry: "FR" },
    { destinationCountry: "AX" }, { destinationCountry: "KP" }, { destinationCountry: "ZZ" },
  ]) {
    const invalid = await api<Issues>(reconcileEndpoint, { ...evidence, scope: { ...evidence.scope, ...invalidScope } }, 400);
    assert.ok(invalid.issues.some(({ code }) => code === "SETTLEMENT_ROUTE_OUT_OF_SCOPE"));
  }

  const impossibleDate = structuredClone(evidence);
  impossibleDate.remittances![0]!.paidOn = "2026-11-14";
  const badDate = await api<ImportSettlementReconciliation>(reconcileEndpoint, impossibleDate);
  assert.ok(badDate.issues.some(({ code }) => code === "SETTLEMENT_DATE_OUT_OF_RANGE"));
  assert.equal(replay.invoiceReconciliation?.lines.length, 6);
  assert.equal(replay.invoiceReconciliation?.differenceTotal, "0.000");
  assert.equal(evidence.estimate.issuedOn, settlementDate);

  const historical = structuredClone(evidence);
  historical.remittances![0]!.paidOn = "2026-11-14";
  historical.carrierInvoices![0]!.invoice.issuedOn = "2026-11-14";
  historical.carrierPayments![0]!.paidOn = "2026-11-15";
  assert.equal(reconcileImportSettlement(historical, new Date("2026-11-16T00:00:00+09:00")).status, "reconciled");
});
