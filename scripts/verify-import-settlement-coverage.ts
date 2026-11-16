import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { parseArgs } from "node:util";
import { isMainThread, parentPort, Worker, workerData } from "node:worker_threads";
import { importSettlementCoverage } from "../src/import-settlement-coverage.ts";
import type { ImportSettlementReconciliation } from "../src/import-settlement-reconciliation.ts";
import { loadTariffCatalog } from "../src/tariffs.ts";
import {
  openSettlementFixture, planEndpoint, prepareSettlementCase, reconcileEndpoint, settlementDate,
  settlementDraft, settlementMatrixCountries, settlementTariffCountries,
} from "../tests/fixtures/import-settlement-worldwide.ts";

const terms = ["DAP", "DDP"] as const;
const tariffCountries = new Set(settlementTariffCountries);
const noFixture = "NO_SYNTHETIC_DESTINATION_TARIFF_FIXTURE";
type Plan = Awaited<ReturnType<typeof prepareSettlementCase>>["review"];
type Preflight = ReturnType<typeof importSettlementCoverage>;

interface RouteGroup {
  status: string;
  reasons: string[];
  origins: string[];
}

interface MarketResult {
  destinationCountry: string;
  hasSyntheticTariff: boolean;
  preflight: RouteGroup[];
  settlement: RouteGroup[];
  heldControl: null | { originCountry: string; status: string; reasons: string[] };
  currency: string | null;
}

interface Partition {
  origins: string[];
  destinations: string[];
  preflightDate: string;
}

function addGroup(groups: Map<string, RouteGroup>, origin: string, status: string, findings: string[] = []) {
  const reasons = [...new Set(findings)].sort();
  const key = JSON.stringify([status, reasons]);
  const group = groups.get(key) ?? { status, reasons, origins: [] };
  group.origins.push(origin);
  groups.set(key, group);
}

async function verifyPartition({ origins, destinations, preflightDate }: Partition): Promise<MarketResult[]> {
  const fixture = openSettlementFixture();
  try {
    // Use the bundled catalog for pair preflight and a separate, one-day synthetic tariff overlay for settlement.
    const bundledTariffs = loadTariffCatalog(fixture.dataset);
    const preflightNow = new Date(`${preflightDate}T02:00:00+09:00`);
    const markets: MarketResult[] = [];
    for (const destinationCountry of destinations) {
      const hasSyntheticTariff = tariffCountries.has(destinationCountry);
      const preflightGroups = new Map<string, RouteGroup>();
      const settlementGroups = new Map<string, RouteGroup>();
      let heldControl: MarketResult["heldControl"] = null;
      let currency: string | null = null;
      for (const originCountry of origins) {
        if (originCountry === destinationCountry) continue;
        const route = originCountry + "-" + destinationCountry;
        const preflight: Preflight = importSettlementCoverage({ originCountry, destinationCountry, date: preflightDate },
          fixture.dataset, bundledTariffs, preflightNow);
        assert.deepEqual([preflight.checkoutReady, preflight.shippingAuthorized, preflight.productionAuthorized], [false, false, false], route);
        addGroup(preflightGroups, originCountry, preflight.status, preflight.reasons);

        if (!hasSyntheticTariff) {
          addGroup(settlementGroups, originCountry, "no_fixture", [noFixture]);
          if (heldControl === null) {
            const { input } = settlementDraft(route, "DAP");
            const review = await fixture.direct<Plan>(planEndpoint, { ...input, quoteRequest: { ...input.quoteRequest, charges: [] } });
            assert.notEqual(review.status, "ready", route);
            assert.deepEqual([review.billingBinding, review.quoteEstimate, review.expiresAt], [null, null, null], route);
            heldControl = { originCountry, status: review.status, reasons: [...review.findings].sort() };
          }
          continue;
        }

        const results = [];
        for (const term of terms) {
          const scenario = await prepareSettlementCase(fixture.direct, route, term);
          const { quote, review, draft } = scenario;
          const context = `${route} ${term}`;
          assert.deepEqual([review.shippingAuthorized, review.productionAuthorized], [false, false], context);
          if (scenario.status === "held") {
            assert.deepEqual([review.billingBinding, review.quoteEstimate, review.expiresAt], [null, null, null], context);
            const reasons = review.findings.filter((finding) => finding !== "CARRIER_ACCEPTANCE_REQUIRED");
            assert.ok(reasons.length, context);
            results.push({ status: review.status, reasons });
            continue;
          }
          assert.deepEqual(quote.buyerAtImport, { currency: draft.currency, value: draft.buyerAtImport }, context);
          assert.deepEqual(quote.buyerAtCheckout, { currency: draft.currency, value: draft.buyerAtCheckout }, context);
          assert.equal(review.billingParty, draft.party, context);
          assert.deepEqual(review.quoteEstimate, quote.estimate, context);
          assert.deepEqual([review.billingBinding?.originCountry, review.billingBinding?.destinationCountry,
            review.billingBinding?.settlementCurrency], [originCountry, destinationCountry, draft.currency], context);
          const result = await fixture.direct<ImportSettlementReconciliation>(reconcileEndpoint, scenario.evidence);
          assert.equal(result.status, "reconciled", `${context} ${JSON.stringify(result.issues)}`);
          assert.equal(result.currency, draft.currency, context);
          assert.deepEqual(result.totals, { customsTax: draft.customsTax, carrierFees: draft.carrierFees, importCost: draft.importTotal }, context);
          assert.deepEqual([result.customsRemittance.status, result.carrierSettlement.status, result.carrierSettlement.paidAmount],
            ["confirmed", "confirmed", draft.importTotal], context);
          assert.equal(currency ?? draft.currency, draft.currency, context);
          currency = draft.currency;
          results.push({ status: "reconciled", reasons: [] });
        }
        assert.deepEqual(results[0], results[1], `${route} DAP/DDP status drift`);
        addGroup(settlementGroups, originCountry, results[0]!.status, results[0]!.reasons);
      }
      markets.push({ destinationCountry, hasSyntheticTariff, preflight: [...preflightGroups.values()],
        settlement: [...settlementGroups.values()], heldControl, currency });
    }
    return markets;
  } finally {
    fixture.close();
  }
}

function startWorker(partition: Partition) {
  const worker = new Worker(new URL(import.meta.url), { workerData: partition });
  const result = new Promise<MarketResult[]>((resolve, reject) => {
    let markets: MarketResult[] | undefined;
    worker.once("message", (value: MarketResult[]) => { markets = value; });
    worker.once("error", reject);
    worker.once("exit", (code) => {
      if (code === 0 && markets) resolve(markets);
      else reject(new Error(`Settlement coverage worker exited with code ${code}`));
    });
  });
  return { worker, result };
}

function parseCountries(value: string | undefined) {
  if (value === undefined) return settlementMatrixCountries;
  const countries = [...new Set(value.split(","))].sort();
  for (const country of countries) assert.ok(settlementMatrixCountries.includes(country), `Unknown matrix country: ${country}`);
  return countries;
}

function counts(groups: RouteGroup[]) {
  const totals: Record<string, number> = {};
  for (const { status, origins } of groups) totals[status] = (totals[status] ?? 0) + origins.length;
  return totals;
}

function summarize(markets: MarketResult[], origins: string[], preflightDate: string) {
  const preflightStatuses = counts(markets.flatMap(({ preflight }) => preflight));
  const syntheticStatuses = counts(markets.flatMap(({ settlement }) => settlement));
  const eligibleDirections = origins.length * markets.length - markets.filter(({ destinationCountry }) => origins.includes(destinationCountry)).length;
  const countAll = (value: Record<string, number>) => Object.values(value).reduce((sum, number) => sum + number, 0);
  assert.equal(countAll(preflightStatuses), eligibleDirections);
  assert.equal(countAll(syntheticStatuses), eligibleDirections);
  const reconciledRoutes = new Set(markets.flatMap(({ destinationCountry, settlement }) => settlement
    .filter(({ status }) => status === "reconciled")
    .flatMap(({ origins }) => origins.map((origin) => origin + "-" + destinationCountry))));
  const reconciledBothWays = [...reconciledRoutes].filter((route) => {
    const [origin, destination] = route.split("-");
    return reconciledRoutes.has(destination + "-" + origin);
  }).length;
  const currencies = [...new Set(markets.flatMap(({ currency }) => currency ? [currency] : []))].sort();
  const positiveOrigins = new Set([...reconciledRoutes].map((route) => route.slice(0, 2)));
  const verifiedDestinations = markets.filter(({ currency }) => currency !== null).length;
  const controls = markets.filter(({ heldControl }) => heldControl !== null).length;
  return {
    schemaVersion: 1,
    preflightDate,
    syntheticImportDate: settlementDate,
    syntheticEvidence: true,
    shippingAuthorized: false,
    productionAuthorized: false,
    productionVerifiedDirections: 0,
    deliveryTerms: terms,
    currencies,
    totals: {
      preflightOriginCountries: origins.length,
      preflightDestinationCountries: markets.length,
      preflightDirections: eligibleDirections,
      syntheticTariffDestinationCountries: markets.filter(({ hasSyntheticTariff }) => hasSyntheticTariff).length,
      syntheticTestedDirections: eligibleDirections - (syntheticStatuses.no_fixture ?? 0),
      syntheticHeldDirections: eligibleDirections - (syntheticStatuses.no_fixture ?? 0) - reconciledRoutes.size,
      syntheticReconciledDirections: reconciledRoutes.size,
      syntheticReconciledCases: reconciledRoutes.size * terms.length,
      syntheticReconciledOriginCountries: positiveOrigins.size,
      syntheticReconciledDestinationCountries: verifiedDestinations,
      syntheticBidirectionalPairs: reconciledBothWays / 2,
      missingEvidenceControls: controls,
      preflightStatuses,
      syntheticStatuses,
    },
    origins,
    destinations: markets,
  };
}

async function run() {
  const { values } = parseArgs({ options: {
    report: { type: "string" }, origins: { type: "string" }, destinations: { type: "string" }, jobs: { type: "string" },
    "preflight-date": { type: "string" },
  } });
  const origins = parseCountries(values.origins);
  const destinations = parseCountries(values.destinations);
  const preflightDate = values["preflight-date"] ?? "2026-11-14";
  const jobLimit = values.jobs === undefined ? Math.min(3, availableParallelism()) : Number(values.jobs);
  assert.ok(Number.isInteger(jobLimit) && jobLimit > 0 && jobLimit <= 16, "--jobs must be an integer from 1 to 16");
  const jobCount = Math.min(jobLimit, destinations.length);
  const partitions = Array.from({ length: jobCount }, (): Partition => ({ origins, destinations: [], preflightDate }));
  const ordered = [...destinations].sort((a, b) => Number(tariffCountries.has(b)) - Number(tariffCountries.has(a)) || a.localeCompare(b));
  ordered.forEach((destination, index) => partitions[index % jobCount]!.destinations.push(destination));
  const jobs = jobCount === 1 ? [] : partitions.map(startWorker);
  try {
    const markets = jobCount === 1 ? await verifyPartition(partitions[0]!) :
      (await Promise.all(jobs.map(({ result }) => result))).flat();
    const report = summarize(markets.sort((a, b) => a.destinationCountry.localeCompare(b.destinationCountry)), origins, preflightDate);
    const json = JSON.stringify(report) + "\n";
    if (values.report) {
      writeFileSync(values.report, json);
      process.stdout.write(JSON.stringify(report.totals) + "\n");
    } else {
      process.stdout.write(json);
    }
  } finally {
    await Promise.all(jobs.map(({ worker }) => worker.terminate()));
  }
}

if (isMainThread) await run();
else parentPort!.postMessage(await verifyPartition(workerData as Partition));
