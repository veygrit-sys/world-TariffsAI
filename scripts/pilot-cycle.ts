import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import type { CheckoutPreview } from "../src/checkout.ts";
import type { CustomsPlan } from "../src/customs-plan.ts";
import { loadDataset } from "../src/dataset.ts";
import { createHandler } from "../src/http.ts";
import { invoiceEstimateChargeCategories } from "../src/invoice-reconciliation.ts";
import type { InvoiceReconciliation, InvoiceReconciliationInput } from "../src/invoice-reconciliation.ts";
import { currencyDigits } from "../src/money.ts";
import type { TariffEvidence } from "../src/tariff-evidence.ts";
import {
  pilotQuoteShipmentDigest, type PilotQuote, type WorldQuoteRequest,
} from "../src/pilot-quote.ts";
import { loadOperationalTariffCatalog, type TariffLine, type TariffSnapshotSource } from "../src/tariffs.ts";
import { PILOT_ROUTES } from "../src/trade-policy.ts";
import type { Dataset } from "../src/types.ts";
import type { WorldDirectionResponse } from "../src/world-directions.ts";
import { allCycleLines, allReviewedDestinations, cycleDate, cycleEvidence, cycleNow, pilotBaseLines, pilotCountries, type CycleProfile } from "./pilot-cycle-evidence.ts";
import { verifyTariffUpdate } from "./verify-tariff-update.ts";
import { worldwideCountries, worldwideRoutes, type CycleBaseLine } from "./worldwide-cycle-lines.ts";

const testServiceKey = "synthetic-cycle-local-credential-1234567890";
const testReviewer = "ephemeral-test-cycle-reviewer";
const nextDate = "2026-11-14";
const discrepancy = "0.50";
const baseLines: Record<string, CycleBaseLine> = { ...pilotBaseLines, ...allCycleLines };
const routeTo = (country: string) => country === "JP" ? "CN-JP" : "JP-" + country;
const profiles = {
  pilot: { routes: PILOT_ROUTES, countries: pilotCountries },
  worldwide: { routes: worldwideRoutes, countries: ["JP", ...worldwideCountries] },
  "all-destinations": { routes: ["JP-GB", ...allReviewedDestinations.filter((country) => country !== "GB").map(routeTo)],
    countries: allReviewedDestinations },
} as const;
const quotePath = (profile: CycleProfile) => profile === "pilot" ? "/v1/pilot/quote" : "/v1/worldwide/quote";
const reconcilePath = (profile: CycleProfile) => profile === "pilot" ? "/v1/pilot/reconcile" : "/v1/worldwide/reconcile";
const clockFor = (profile: CycleProfile) => profile === "all-destinations" ? "2026-11-13T12:00:00+09:00" : cycleNow;
const destinationCodes = (dataset: Dataset) => [...dataset.countries, ...dataset.supplementalRegions]
  .filter(({ code, inScope }) => inScope && code !== "KP").map(({ code }) => code).sort();
const digest = (draft: WorldQuoteRequest) =>
  pilotQuoteShipmentDigest(draft.plan, draft.orderId, draft.loadingCountry, draft.usJurisdictionApplies);
const script = (name: string) => fileURLToPath(new URL(name, import.meta.url));
const readJson = async <T>(path: string): Promise<T> => JSON.parse(await readFile(path, "utf8")) as T;
const writeJson = (path: string, value: unknown) =>
  writeFile(path, JSON.stringify(value, null, 2) + "\n", { flag: "wx", mode: 0o600 });
const run = (name: string, args: string[]) =>
  JSON.parse(execFileSync(process.execPath, [script(name), ...args], { encoding: "utf8", timeout: 60_000 }));

function service(dataset: Dataset, env: NodeJS.ProcessEnv, profile: CycleProfile = "pilot") {
  const now = new Date(clockFor(profile));
  const handle = createHandler({
    dataset, tariffs: loadOperationalTariffCatalog(dataset, env, now),
    apiKey: testServiceKey, now: () => now,
  });
  let requests = 0;
  return async <T>(path: string, input?: unknown, status = 200): Promise<T> => {
    // Use a separate simulated client for each batch below the handler's per-minute limit.
    const peer = "127.0.0." + (1 + Math.floor(requests++ / 50));
    const response = await handle(new Request("http://localhost" + path, {
      headers: { authorization: "Bearer " + testServiceKey, "content-type": "application/json" },
      ...(input !== undefined ? { method: "POST", body: JSON.stringify(input) } : {}),
    }), { peer });
    const result: unknown = await response.json();
    assert.equal(response.status, status, JSON.stringify(result));
    assert.equal(response.headers.get("cache-control"), "no-store");
    return result as T;
  };
}

function rebind(draft: WorldQuoteRequest) {
  draft.reviewedShipmentDigest = digest(draft);
}

function draftForLane(
  template: WorldQuoteRequest, route: string, index: number, rate: string, observed: boolean, profile: CycleProfile,
) {
  const [from, to] = route.split("-") as [string, string];
  const base = baseLines[to] ?? { code: "691200", hs6: "691200", currency: "USD", treatment: "general" as const };
  const deliveryTerms = index % 2 === 0 ? "DAP" : "DDP";
  const payer = deliveryTerms === "DAP" ? "buyer" : "seller";
  const digits = currencyDigits(base.currency);
  const decimal = (number: number) => number.toFixed(digits);
  const customsValue = baseLines[to]?.customsValue ?? (to === "JP" ? 300_000 : profile === "pilot" ? 200 :
    digits === 0 ? 200_000 : profile === "worldwide" ? 2000 : 2500);
  const freight = to === "JP" ? 9_000 : 12;
  const insurance = to === "JP" ? 1_000 : digits === 0 ? 2 : 3;
  const unitValue = (customsValue - freight - insurance) / 2;
  const itemId = "cycle-synthetic-item";
  const expected = {
    customs_duty: decimal(customsValue * Number(rate) / 100),
    import_vat_gst: decimal(to === "US" ? 0 : to === "JP" ? (observed ? 30_500 : 31_200) : 13),
    additional_duty: decimal(to === "JP" ? 0 : 2),
    excise: decimal(0),
    customs_fee: decimal(to === "JP" ? 200 : 3),
    carrier_fee: decimal(to === "JP" ? 500 : 5),
    checkout_tax: decimal(0),
  };
  const draft = structuredClone(template);
  draft.orderId = "cycle-order-" + route;
  draft.estimateId = "cycle-estimate-" + route;
  draft.loadingCountry = from;
  Object.assign(draft.plan.shipment, {
    originCountry: from, destinationCountry: to, importDate: cycleDate,
    currency: base.currency, incoterm: deliveryTerms,
    freight: decimal(freight), insurance: decimal(insurance), customsValue: decimal(customsValue),
    items: [{
      ...draft.plan.shipment.items[0]!, id: itemId, originCountry: from,
      description: "Synthetic cycle item (" + base.code + ")", unitValue: decimal(unitValue), hs6: base.hs6,
    }],
  });
  draft.plan.lines = [{ itemId, tariffCode: base.code, rateTreatment: base.treatment }];
  if (profile !== "pilot") draft.tradeReview = { status: "confirmed", evidence: {
    id: "cycle-fixture-trade-" + route, sourceUrl: "https://test.example/synthetic/trade/" + route,
    sourceType: "customs_broker", dispatchCountry: from, destinationCountry: to,
    effectiveFrom: cycleDate, effectiveThrough: nextDate, reviewedOn: cycleDate, reviewBy: nextDate,
  } };
  draft.charges = draft.charges.map(({ category, evidence }) => {
    const datedEvidence = {
      ...evidence, id: "cycle-fixture-" + route + "-" + category,
      sourceUrl: "https://test.example/synthetic/" + route + "/" + category,
      destinationCountry: to, currency: base.currency,
      effectiveFrom: cycleDate, effectiveThrough: nextDate, reviewedOn: cycleDate, reviewBy: nextDate,
    };
    return Number(expected[category]) === 0
      ? { category, evidence: datedEvidence, method: "not_applicable" }
      : { category, evidence: datedEvidence, method: "confirmed_amount", amount: expected[category],
          timing: "import", payer };
  });
  rebind(draft);
  const importCharges = invoiceEstimateChargeCategories.reduce((sum, key) => sum + Number(expected[key]), 0);
  const buyerAtImport = deliveryTerms === "DAP" ? importCharges : 0;
  return {
    draft, expected, rate, deliveryTerms,
    goodsSubtotal: decimal(unitValue * 2), importFees: decimal(importCharges),
    buyerAtImport: decimal(buyerAtImport), buyerTotal: decimal(customsValue + buyerAtImport),
    zero: decimal(0),
  };
}

function ecCase(quote: PilotQuote, draft: WorldQuoteRequest, profile: CycleProfile) {
  return {
    quote,
    ...(profile !== "pilot" ? { quoteEndpoint: quotePath(profile) } : {}),
    expected: {
      orderId: draft.orderId, shipmentDigest: digest(draft),
      importDate: draft.plan.shipment.importDate, currency: draft.plan.shipment.currency,
    },
    now: clockFor(profile),
  };
}

type CheckoutCase = ReturnType<typeof ecCase> & { id: string; invoice: InvoiceReconciliationInput["invoice"] | null };

function requireNoPayableEstimate(quote: PilotQuote) {
  assert.notEqual(quote.status, "estimated");
  assert.deepEqual([quote.importChargesTotal, quote.buyerAtCheckout, quote.buyerAtImport, quote.buyerTotal, quote.estimate],
    [null, null, null, null, null]);
  assert.ok(quote.charges.every(({ amount }) => amount === null));
  assert.deepEqual([quote.checkoutReady, quote.shippingAuthorized, quote.productionAuthorized], [false, false, false]);
}

async function checkAllDestinations(
  dataset: Dataset, api: ReturnType<typeof service>, template: WorldQuoteRequest, issuedCases: CheckoutCase[],
) {
  const codes = destinationCodes(dataset);
  assert.equal(codes.length, 248);
  assert.equal(new Set(codes).size, codes.length);
  const issuedByRoute = new Map(issuedCases.map((entry) => [entry.id, entry]));
  const checkoutCases: CheckoutCase[] = [];
  const destinations = [];
  for (const [index, country] of codes.entries()) {
    const route = routeTo(country);
    const evidence = await api<TariffEvidence>(`/v1/tariffs/evidence?country=${country}&date=${cycleDate}`);
    const direction = await api<WorldDirectionResponse>(
      `/v1/worldwide/direction?originCountry=${route.slice(0, 2)}&destinationCountry=${country}&date=${cycleDate}`);
    assert.deepEqual([evidence.country, evidence.referenceDate, evidence.tariffEffectiveDateVerifiedByAcquisition,
      direction.direction, direction.productionAuthorized], [country, cycleDate, false, route, false]);
    let entry = issuedByRoute.get(route);
    if (entry) {
      assert.equal(entry.quote.status, "estimated");
      assert.equal(evidence.evidenceBasis, "published_tariff_on_date");
    } else {
      const { draft } = draftForLane(template, route, index, "0", false, "all-destinations");
      // Unverified routes must have no approval or numeric broker evidence in the test order.
      delete draft.tradeReview;
      delete draft.reviewedShipmentDigest;
      draft.charges = [];
      const quote = await api<PilotQuote>(quotePath("all-destinations"), draft);
      requireNoPayableEstimate(quote);
      entry = { id: route, ...ecCase(quote, draft, "all-destinations"), invoice: null };
    }
    checkoutCases.push(entry);
    destinations.push({
      country, nameJa: direction.destination.nameJa, route, evidenceBasis: evidence.evidenceBasis,
      sourceStatus: evidence.sourceStatus, customsScope: evidence.customsScope?.classification ?? null,
      tariffStatus: direction.destinationTariffStatus, territoryReviewRequired: direction.territoryReviewRequired,
      quoteStatus: entry.quote.status, tradeReason: entry.quote.tradePolicy.reasonCode,
      findings: [...new Set(entry.quote.findings.map(({ code }) => code))],
      signedTestLine: entry.invoice !== null, reconciliation: entry.invoice ? "matched" : "no_issued_estimate",
    });
  }
  const { draft } = draftForLane(template, "JP-KP", 0, "0", false, "all-destinations");
  const excluded = await api<PilotQuote>(quotePath("all-destinations"), draft);
  requireNoPayableEstimate(excluded);
  assert.equal(excluded.status, "blocked");
  return { checkoutCases, destinations, excluded: { country: "KP", status: excluded.status, reason: excluded.tradePolicy.reasonCode } };
}

function requireHold(quote: PilotQuote) {
  assert.equal(quote.status, "review_required", JSON.stringify(quote.findings));
  assert.ok(quote.findings.some(({ code }) => code === "DATED_TARIFF_REFERENCE_REQUIRED"));
  assert.ok(quote.goodsSubtotal);
  assert.equal(quote.importChargesTotal, null);
  assert.equal(quote.buyerTotal, null);
  assert.equal(quote.estimate, null);
  assert.ok(quote.charges.every(({ amount }) => amount === null));
}

export async function runPilotCycle(officialEvidence?: string, profile: CycleProfile = "pilot") {
  const temp = await mkdtemp(join(tmpdir(), "veygrit-test-cycle-"));
  const dataset = loadDataset();
  const evidence = officialEvidence ? resolve(officialEvidence) : join(temp, "evidence");
  const observed = officialEvidence !== undefined;
  const approvalPath = join(temp, "approval.json");
  const trustedKeys = join(temp, "trusted-keys.json");
  const privateKeyPath = join(temp, "ephemeral-key.pem");
  const snapshotId = (country: string) => "test-cycle-" + country.toLowerCase() + "-20261113";
  const { routes, countries } = profiles[profile];
  const rateFor = (country: string) => observed ? baseLines[country]!.observedRate : baseLines[country]!.syntheticRate;
  const expressionFor = (country: string) =>
    (observed && baseLines[country]!.observedExpression) || rateFor(country) + "%";
  try {
    const evidenceAssets = await cycleEvidence(evidence, observed, profile);
    const candidate = [];
    for (const country of countries) {
      const assets = evidenceAssets.filter((asset) => asset.country === country);
      const base = baseLines[country]!;
      assert.ok(assets[0]);
      const source: TariffSnapshotSource = {
        id: snapshotId(country), jurisdiction: base.jurisdiction ?? country, countries: [country],
        zone: "standard", edition: "Isolated cycle test: " + base.edition, hsEdition: "HS 2022",
        availableFrom: cycleDate, availableThrough: cycleDate, checkedOn: cycleDate,
        scope: "published_baseline", authority: observed ? base.authority : "Synthetic test source",
        sourceUrl: assets[0].url, termsUrl: observed ? base.termsUrl : "https://test.example/synthetic/", terms: "Test reference and numeric selected line only. Original document is not redistributed.",
        inputFiles: assets.map(({ sourceId, url, sha256 }) => ({
          name: sourceId ?? (observed ? base.edition : "Synthetic fixture"), url, sha256,
        })),
        limitations: ["Temporary non-production test overlay, single exact line and ordinary tariff only.", base.scope],
      };
      const lines: TariffLine[] = [{
        code: base.code, reference: "Isolated test item",
        rates: [{ charge: "customs_duty", treatment: base.treatment, label: "Ordinary test line", expression: expressionFor(country) }],
      }];
      const prefix = join(temp, country);
      await writeJson(prefix + "-source.json", source);
      await writeJson(prefix + "-lines.json", lines);
      const imported = run("tariffs/import.ts", [prefix + "-source.json", prefix + "-lines.json", prefix]);
      assert.equal(imported.id, snapshotId(country));
      candidate.push(prefix);
    }

    const inputCount = new Set(evidenceAssets.map(({ sha256 }) => sha256)).size;
    const options = { today: cycleDate, date: cycleDate, require: [...countries], evidence, active: [], candidate };
    const prepared = await verifyTariffUpdate(dataset, { ...options, prepareReview: true });
    assert.equal(prepared.status, "review_required");
    assert.equal(prepared.activation, null);
    assert.equal(prepared.verifiedSourceInputCount, inputCount);
    assert.ok(prepared.approvalDraft);
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    await writeFile(privateKeyPath, privateKey.export({ type: "pkcs8", format: "pem" }), { flag: "wx", mode: 0o600 });
    await writeJson(trustedKeys, { [testReviewer]: publicKey.export({ type: "spki", format: "pem" }) });
    const draftPath = join(temp, "review-draft.json");
    await writeJson(draftPath, {
      ...prepared.approvalDraft, keyId: testReviewer,
      reviewer: "Synthetic cycle QA only", referenceUrl: "https://test.example/synthetic/tariff-cycle",
    });
    const signed = run("sign-tariff-review.ts", ["--draft", draftPath, "--private-key", privateKeyPath, "--out", approvalPath]);
    assert.equal(signed.status, "signed");
    const verified = await verifyTariffUpdate(dataset, { ...options, review: approvalPath, trustedKeys });
    assert.equal(verified.status, "verified", JSON.stringify(verified.blockers));
    assert.equal(verified.verifiedSourceInputCount, inputCount);
    assert.equal(verified.requiredCoverage.length, countries.length);
    for (const row of verified.requiredCoverage)
      assert.deepEqual([row.status, row.snapshotId], ["published_reference", snapshotId(row.country)]);
    assert.ok(verified.activation);
    const proposed = verified.activation.proposedValue;
    assert.throws(() => loadOperationalTariffCatalog(dataset, { VEYGRIT_TARIFF_DIR: proposed }, new Date(clockFor(profile))),
      /UPDATE_REVIEW_REQUIRED/);
    const active = service(dataset, {
      VEYGRIT_TARIFF_DIR: proposed, VEYGRIT_TARIFF_APPROVAL: approvalPath, VEYGRIT_TARIFF_TRUSTED_KEYS: trustedKeys,
    }, profile);
    const baseline = service(dataset, { VEYGRIT_TARIFF_DIR: verified.activation.rollbackValue }, profile);
    const template = await readJson<WorldQuoteRequest>(script("../examples/pilot-quote-jp-us.json"));
    const quoteUrl = quotePath(profile);
    const reconcileUrl = reconcilePath(profile);
    const laneResults = [];
    let checkoutCases: CheckoutCase[] = [];
    let firstInvoice: InvoiceReconciliationInput | undefined;
    let firstDraft: WorldQuoteRequest | undefined;
    for (const [index, route] of routes.entries()) {
      const to = route.split("-")[1]!;
      const fixture = draftForLane(template, route, index, rateFor(to), observed, profile);
      const { draft, expected, deliveryTerms } = fixture;
      const previewBefore = await baseline<PilotQuote>(quoteUrl, draft);
      requireHold(previewBefore);
      const plan = await active<CustomsPlan>("/v1/customs/plan", draft.plan);
      const duty = plan.lines[0]?.dutyScenario;
      assert.equal(duty?.status, "calculated", route + " " + JSON.stringify(duty));
      assert.equal(duty.snapshotId, snapshotId(to));
      assert.equal(duty.expression, expressionFor(to));
      assert.equal(duty.amount.value, expected.customs_duty);
      assert.equal(plan.baseDutyScenario.knownSubtotal?.value, expected.customs_duty);
      assert.ok(duty.sourceUrls.includes(evidenceAssets.find(({ country }) => country === to)!.url));

      const quote = await active<PilotQuote>(quoteUrl, draft);
      assert.equal(quote.status, "estimated", route + " " + JSON.stringify(quote.findings));
      assert.deepEqual([quote.goodsSubtotal?.value, quote.importChargesTotal?.value, quote.buyerAtImport?.value, quote.buyerTotal?.value],
        [fixture.goodsSubtotal, fixture.importFees, fixture.buyerAtImport, fixture.buyerTotal]);
      assert.deepEqual([quote.checkoutReady, quote.shippingAuthorized, quote.productionAuthorized], [false, false, false]);
      assert.equal(quote.tradePolicy.status, PILOT_ROUTES.some((pilotRoute) => pilotRoute === route) ? "pilot" : "eligible_for_review");
      assert.deepEqual(quote.charges.find(({ category }) => category === "customs_duty")?.amount, duty.amount);
      assert.ok(quote.estimate);
      const reconcile: InvoiceReconciliationInput = {
        estimate: quote.estimate,
        invoice: {
          invoiceId: "cycle-invoice-" + route, orderId: draft.orderId, estimateId: draft.estimateId,
          currency: draft.plan.shipment.currency, issuedOn: nextDate,
          charges: invoiceEstimateChargeCategories.map((category) => ({ category, amount: expected[category] })),
        },
      };
      const match = await active<InvoiceReconciliation>(reconcileUrl, reconcile);
      assert.deepEqual([match.status, match.differenceTotal], ["matched", fixture.zero]);
      firstInvoice ??= reconcile;
      firstDraft ??= draft;
      checkoutCases.push({ id: route, ...ecCase(quote, draft, profile), invoice: reconcile.invoice });
      laneResults.push({
        route, deliveryTerms, tariffCode: baseLines[to]!.code, tariffSnapshotId: duty.snapshotId,
        baseRatePercent: fixture.rate, rateExpression: duty.expression, baseDuty: duty.amount,
        goodsSubtotal: quote.goodsSubtotal, importFees: quote.importChargesTotal, buyerTotal: quote.buyerTotal,
        orderId: quote.orderId, estimateId: quote.estimate.estimateId,
        reconciliation: { status: match.status, differenceTotal: match.differenceTotal },
      });
    }

    assert.ok(firstInvoice && firstDraft);
    const difference = structuredClone(firstInvoice);
    const carrier = difference.invoice.charges.find(({ category }) => category === "carrier_fee")!;
    carrier.amount = (Number(carrier.amount) + Number(discrepancy)).toFixed(2);
    carrier.explanation = { reason: "fee", evidenceId: "cycle-synthetic-carrier-adjustment" };
    const discrepant = await active<InvoiceReconciliation>(reconcileUrl, difference);
    assert.deepEqual([discrepant.status, discrepant.differenceTotal], ["differences", discrepancy]);
    const missing = structuredClone(firstInvoice);
    missing.invoice.charges = missing.invoice.charges.filter(({ category }) => category !== "carrier_fee");
    const incomplete = await active<InvoiceReconciliation>(reconcileUrl, missing);
    assert.deepEqual([incomplete.status, incomplete.actualTotal], ["needs_review", null]);
    const wrong = structuredClone(firstInvoice);
    wrong.invoice.estimateId = "another-synthetic-estimate";
    const rejected = await active<{ issues: { code: string }[] }>(reconcileUrl, wrong, 400);
    assert.equal(rejected.issues[0]?.code, "ESTIMATE_ID_MISMATCH");

    const later = structuredClone(firstDraft);
    later.plan.shipment.importDate = nextDate;
    rebind(later);
    const held = await active<PilotQuote>(quoteUrl, later);
    requireHold(held);
    const preview = await active<CheckoutPreview>("/v1/checkout/preview", later.plan.shipment);
    assert.equal(preview.customsAmountHold.required, true);
    assert.deepEqual(preview.goodsSubtotal, held.goodsSubtotal);
    const uncoveredDate = { id: "uncovered-import-date", ...ecCase(held, later, profile), invoice: null };
    if (profile !== "pilot") {
      const unreviewed = structuredClone(firstDraft);
      delete unreviewed.tradeReview;
      const noTradeReview = await active<PilotQuote>(quoteUrl, unreviewed);
      assert.equal(noTradeReview.status, "review_required");
      assert.deepEqual(noTradeReview.findings, [{ code: "WORLDWIDE_TRADE_REVIEW_REQUIRED" }]);
      assert.deepEqual([noTradeReview.buyerTotal, noTradeReview.estimate], [null, null]);
    }
    for (const [index, route] of routes.entries()) {
      const to = route.split("-")[1]!;
      const { draft } = draftForLane(template, route, index, rateFor(to), observed, profile);
      requireHold(await baseline<PilotQuote>(quoteUrl, draft));
    }
    const matrix = profile === "all-destinations" ? await checkAllDestinations(dataset, active, template, checkoutCases) : null;
    if (matrix) checkoutCases = matrix.checkoutCases;
    checkoutCases.push(uncoveredDate);
    const readiness = await active<{ productionVerifiedRouteCount: number }>("/v1/release-readiness");
    assert.equal(readiness.productionVerifiedRouteCount, 0);
    return {
      report: {
        status: "passed", profile, referenceDate: cycleDate, evidenceMode: observed ? "observed_official_base_lines" : "synthetic_acquisition",
        evidenceAssets, review: { draft: prepared.status, signed: signed.status, verification: verified.status, temporaryTestKey: true },
        lanes: laneResults, invoiceDifference: discrepant.differenceTotal, missingInvoiceAmountHeld: true,
        unrelatedEstimateRejected: true, unsignedOverlayRejected: true, nextDateHeld: true, rollbackHeld: true,
        ...(profile !== "pilot" ? { missingTradeReviewHeld: true } : {}),
        ...(matrix ? { destinations: matrix.destinations, northKoreaExclusion: matrix.excluded } : {}),
        testOrdersAndInvoices: true, productionVerifiedRouteCount: readiness.productionVerifiedRouteCount,
      },
      checkoutCases,
    };
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

interface WooTestReport {
  status: string;
  wordpressVersion: string;
  woocommerceVersion: string;
  phpVersion: string;
  cases: {
    id: string;
    quoteEndpoint?: string;
    wooOrderId: number;
    syntheticOrderId: string;
    estimateId: string | null;
    shipmentDigest: string | null;
    storedEstimate: PilotQuote["estimate"];
    orderTotalsPreserved: boolean;
    priorEstimatePreservedAfterHold: boolean | null;
    sameEstimateIdConflictRejected: boolean | null;
    orderStatus: string;
    renderedHtml: string;
    preview: {
      goodsSubtotal: PilotQuote["goodsSubtotal"];
      importFees: PilotQuote["importChargesTotal"];
      buyerTotal: PilotQuote["buyerTotal"];
      awaitingCustomsReview: boolean;
    };
  }[];
}

export async function reconcileDisplayedOrders(checkoutCases: CheckoutCase[], woo: WooTestReport, profile: CycleProfile = "pilot") {
  assert.equal(woo.status, "passed");
  const dataset = loadDataset();
  const expectedRoutes = profile === "all-destinations" ? destinationCodes(dataset).map(routeTo) : profiles[profile].routes;
  assert.deepEqual(checkoutCases.map(({ id }) => id), [...expectedRoutes, "uncovered-import-date"]);
  assert.deepEqual(woo.cases.map(({ id }) => id), checkoutCases.map(({ id }) => id));
  const reconcile = service(dataset, {}, profile);
  const reconciled = [];
  const heldOrders = [];
  let heldWithoutEstimate = false;
  for (const [index, checkoutCase] of checkoutCases.entries()) {
    const stored = woo.cases[index]!;
    const { quote, invoice, expected } = checkoutCase;
    assert.equal(checkoutCase.quoteEndpoint ?? quotePath("pilot"), quotePath(profile));
    assert.equal(stored.quoteEndpoint ?? quotePath("pilot"), quotePath(profile));
    assert.equal(stored.syntheticOrderId, expected.orderId);
    assert.equal(stored.orderStatus, "pending");
    assert.equal(stored.orderTotalsPreserved, true);
    assert.deepEqual(stored.preview.goodsSubtotal, quote.goodsSubtotal);
    const shouldHaveInvoice = profiles[profile].routes.some((route) => route === checkoutCase.id);
    assert.equal(invoice !== null, shouldHaveInvoice);
    if (!invoice) {
      requireNoPayableEstimate(quote);
      assert.deepEqual([stored.estimateId, stored.storedEstimate, stored.preview.importFees, stored.preview.buyerTotal],
        [null, null, null, null]);
      assert.equal(stored.preview.awaitingCustomsReview, true);
      assert.ok(stored.renderedHtml.includes("確認中"));
      heldWithoutEstimate = true;
      heldOrders.push({ route: checkoutCase.id, wooOrderId: stored.wooOrderId, status: quote.status,
        orderId: stored.syntheticOrderId, estimateStored: false });
      continue;
    }
    assert.equal(quote.status, "estimated");
    assert.equal(stored.priorEstimatePreservedAfterHold, true);
    assert.equal(stored.sameEstimateIdConflictRejected, true);
    assert.equal(stored.estimateId, invoice.estimateId);
    assert.equal(stored.shipmentDigest, expected.shipmentDigest);
    assert.ok(stored.storedEstimate);
    assert.deepEqual(stored.storedEstimate, quote.estimate);
    assert.equal(stored.preview.awaitingCustomsReview, false);
    assert.deepEqual(stored.preview.importFees, quote.importChargesTotal);
    assert.deepEqual(stored.preview.buyerTotal, quote.buyerTotal);
    const result = await reconcile<InvoiceReconciliation>(reconcilePath(profile), { estimate: stored.storedEstimate, invoice });
    assert.equal(result.status, "matched");
    assert.equal(Number(result.differenceTotal), 0);
    reconciled.push({
      route: checkoutCase.id, wooOrderId: stored.wooOrderId, orderId: result.orderId,
      estimateId: result.estimateId, invoiceId: result.invoiceId, currency: result.currency,
      estimateTotal: result.estimatedTotal, invoiceTotal: result.actualTotal, differenceTotal: result.differenceTotal,
      status: result.status,
    });
  }
  assert.equal(reconciled.length, profiles[profile].routes.length);
  assert.equal(heldWithoutEstimate, true);
  return {
    status: "passed", profile, referenceDate: cycleDate,
    runtime: { wordpress: woo.wordpressVersion, woocommerce: woo.woocommerceVersion, php: woo.phpVersion },
    estimateSource: "reloaded disposable WooCommerce order metadata",
    invoiceSource: "independent synthetic invoice fixture",
    reconciled, heldWithoutEstimate, ...(profile === "all-destinations" ? { heldOrders } : {}),
    issuedEstimatesPreservedAfterHold: true, conflictingEstimateRejected: true,
    productionAuthorized: false,
  };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const { values } = parseArgs({ options: {
    report: { type: "string" }, "checkout-cases": { type: "string" }, "official-evidence": { type: "string" },
    "reconcile-woocommerce": { type: "string" }, worldwide: { type: "boolean" },
    "all-destinations": { type: "boolean" },
  } });
  assert.ok(!values.worldwide || !values["all-destinations"], "Select a single cycle profile");
  const profile = values["all-destinations"] ? "all-destinations" : values.worldwide ? "worldwide" : "pilot";
  let report;
  if (values["reconcile-woocommerce"]) {
    assert.ok(values["checkout-cases"] && !values["official-evidence"],
      "Provide --checkout-cases with --reconcile-woocommerce");
    report = await reconcileDisplayedOrders(await readJson<CheckoutCase[]>(values["checkout-cases"]),
      await readJson<WooTestReport>(values["reconcile-woocommerce"]), profile);
  } else {
    const result = await runPilotCycle(values["official-evidence"], profile);
    report = result.report;
    if (values["checkout-cases"]) await writeJson(values["checkout-cases"], result.checkoutCases);
  }
  if (values.report) await writeJson(values.report, report);
  console.log(JSON.stringify(report, null, 2));
}
