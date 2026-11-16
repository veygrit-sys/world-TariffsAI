import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { CheckoutPreview } from "../src/checkout.ts";
import type { CustomsPlan } from "../src/customs-plan.ts";
import { createHandler } from "../src/http.ts";
import type {
  InvoiceEstimate, InvoiceReconciliation, InvoiceReconciliationInput,
} from "../src/invoice-reconciliation.ts";
import {
  pilotQuoteShipmentDigest, type PilotQuote, type PilotQuoteRequest,
} from "../src/pilot-quote.ts";
import { data } from "./helpers.ts";

const demoDate = "2026-11-12";
const key = "synthetic-pilot-service-key-1234567890";
const peer = { peer: "127.0.0.1" };
const handler = createHandler({
  dataset: data,
  apiKey: key,
  now: () => new Date(demoDate + "T00:00:00Z"),
});
const quotePath = "/v1/pilot/quote";
const reconcilePath = "/v1/pilot/reconcile";
const readinessPath = "/v1/release-readiness";

const currencyByCountry = { JP: "JPY", CN: "CNY", US: "USD" } as const;
const codeByCountry = { JP: "691200000", CN: "69120010", US: "6912001000" } as const;
type PilotCountry = keyof typeof currencyByCountry;
const lanes = [
  ["JP", "CN", "DDP"], ["CN", "JP", "DAP"],
  ["JP", "US", "DAP"], ["US", "JP", "DDP"],
  ["CN", "US", "DDP"], ["US", "CN", "DAP"],
] as const;

function fixture<T>(filename: string): T {
  return JSON.parse(readFileSync(new URL("../examples/" + filename, import.meta.url), "utf8")) as T;
}

const quoteExample = fixture<PilotQuoteRequest>("pilot-quote-jp-us.json");
const invoiceExample = fixture<InvoiceReconciliationInput>("pilot-reconcile-jp-us.json");

function decimal(major: number, currency: string): string {
  return major.toFixed(currency === "JPY" ? 0 : 2);
}

function request(path: string, input?: unknown, auth = true): Request {
  const headers = new Headers(auth ? { authorization: "Bearer " + key } : {});
  if (input === undefined) return new Request("http://localhost" + path, { headers });
  headers.set("content-type", "application/json");
  return new Request("http://localhost" + path, {
    method: "POST",
    headers,
    body: JSON.stringify(input),
  });
}

async function expectJson<T>(response: Response, status = 200): Promise<T> {
  const body: unknown = await response.json();
  assert.equal(response.status, status, JSON.stringify(body));
  return body as T;
}

function bindReview(quote: PilotQuoteRequest): void {
  quote.reviewedShipmentDigest = pilotQuoteShipmentDigest(
    quote.plan, quote.orderId, quote.loadingCountry,
  );
}

function laneQuote(from: PilotCountry, to: PilotCountry, incoterm: "DAP" | "DDP"): PilotQuoteRequest {
  const quote = structuredClone(quoteExample);
  const lane = (from + "-" + to).toLowerCase();
  const currency = currencyByCountry[to];
  const payer = incoterm === "DAP" ? "buyer" : "seller";
  const item = quote.plan.shipment.items[0]!;
  Object.assign(quote.plan.shipment, {
    originCountry: from,
    destinationCountry: to,
    currency,
    incoterm,
    freight: decimal(12, currency),
    insurance: decimal(3, currency),
    customsValue: decimal(200, currency),
  });
  item.originCountry = from;
  item.unitValue = decimal(100, currency);
  quote.plan.lines = [{ itemId: item.id, tariffCode: codeByCountry[to] }];
  quote.loadingCountry = from;
  quote.orderId = "synthetic-order-" + lane;
  quote.estimateId = "synthetic-estimate-" + lane;
  quote.charges = quote.charges.map((charge) => {
    const evidence = {
      ...charge.evidence,
      id: "synthetic-" + lane + "-" + charge.category,
      sourceUrl: charge.evidence.sourceUrl.replace("/jp-us/", "/" + lane + "/"),
      destinationCountry: to,
      currency,
    };
    if (charge.category === "import_vat_gst" && to !== "US") {
      return {
        category: charge.category, method: "confirmed_amount",
        amount: decimal(13, currency), timing: "import", payer, evidence,
      };
    }
    if (charge.method === "confirmed_amount")
      return { ...charge, amount: decimal(Number(charge.amount), currency), payer, evidence };
    return { ...charge, evidence };
  });
  bindReview(quote);
  return quote;
}

function matchingInvoice(estimate: InvoiceEstimate): InvoiceReconciliationInput["invoice"] {
  return {
    invoiceId: "synthetic-invoice-" + estimate.estimateId,
    estimateId: estimate.estimateId,
    orderId: estimate.orderId,
    issuedOn: "2026-11-13",
    currency: estimate.currency,
    charges: estimate.charges.map(({ category, amount }) => {
      assert.ok(amount !== null);
      return { category, amount };
    }),
  };
}

for (const [from, to, incoterm] of lanes) {
  test(`synthetic pilot ${from}-${to} ${incoterm} quotes, prepares customs and reconciles the invoice`, async () => {
    const input = laneQuote(from, to, incoterm);
    const response = await handler(request(quotePath, input), peer);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const quote = await expectJson<PilotQuote>(response);
    const currency = currencyByCountry[to];
    const importCharges = to === "US" ? 20 : 33;
    const buyerImport = incoterm === "DAP" ? importCharges : 0;
    assert.equal(quote.status, "estimated", JSON.stringify(quote));
    assert.equal(quote.productionAuthorized, false);
    assert.deepEqual(quote.buyerAtCheckout, { currency, value: decimal(215, currency) });
    assert.deepEqual(quote.buyerAtImport, { currency, value: decimal(buyerImport, currency) });
    assert.deepEqual(quote.buyerTotal, { currency, value: decimal(215 + buyerImport, currency) });
    assert.deepEqual(quote.importChargesTotal, { currency, value: decimal(importCharges, currency) });
    assert.ok(quote.estimate);
    assert.equal(quote.estimate.estimateId, input.estimateId);
    assert.equal(quote.estimate.issuedOn, demoDate);

    const plan = await expectJson<CustomsPlan>(
      await handler(request("/v1/customs/plan", input.plan), peer),
    );
    assert.equal(plan.origin?.destinationCountry, from);
    assert.equal(plan.destination?.destinationCountry, to);
    assert.equal(plan.checkout.route, "cross_border");
    assert.equal(plan.checkout.shippingAuthorized, false);
    assert.equal(plan.handoff.status, "available_for_review");
    assert.deepEqual(plan.handoff.documents.find(({ code }) => code === "COMMERCIAL_INVOICE"), {
      code: "COMMERCIAL_INVOICE", stage: "shipment", status: "provided",
    });
    assert.deepEqual(plan.handoff.documents.find(({ code }) => code === "EXPORT_DECLARATION"), {
      code: "EXPORT_DECLARATION", stage: "export", status: "check_requirement",
    });
    assert.deepEqual(plan.handoff.documents.find(({ code }) => code === "IMPORT_DECLARATION"), {
      code: "IMPORT_DECLARATION", stage: "import", status: "check_requirement",
    });

    const matched = await expectJson<InvoiceReconciliation>(
      await handler(request(reconcilePath, {
        estimate: quote.estimate,
        invoice: matchingInvoice(quote.estimate),
      }), peer),
    );
    assert.equal(matched.status, "matched");
    assert.equal(matched.differenceTotal, decimal(0, currency));
  });
}

test("the included quote and invoice examples reproduce a carrier charge difference", async () => {
  const quote = await expectJson<PilotQuote>(await handler(request(quotePath, quoteExample), peer));
  assert.equal(quote.status, "estimated", JSON.stringify(quote));
  assert.deepEqual(quote.estimate, invoiceExample.estimate);
  const result = await expectJson<InvoiceReconciliation>(
    await handler(request(reconcilePath, invoiceExample), peer),
  );
  assert.equal(result.status, "differences");
  assert.equal(result.differenceTotal, "0.50");
  assert.deepEqual(result.lines.find(({ category }) => category === "carrier_fee"), {
    category: "carrier_fee", estimate: "5.00", actual: "5.50", difference: "0.50", status: "difference",
    explanation: { reason: "fee", evidenceId: "synthetic-carrier-invoice-fee-adjustment" },
  });
});

test("invoice reconciliation preserves missing amounts and rejects another estimate ID", async () => {
  const input = structuredClone(invoiceExample);
  input.invoice.charges = input.invoice.charges.filter(({ category }) => category !== "carrier_fee");
  const result = await expectJson<InvoiceReconciliation>(
    await handler(request(reconcilePath, input), peer),
  );
  assert.equal(result.status, "needs_review");
  assert.equal(result.actualTotal, null);
  assert.equal(result.lines.find(({ category }) => category === "carrier_fee")?.status, "invoice_missing");

  input.invoice.estimateId = "synthetic-different-estimate";
  const rejected = await expectJson<{ issues: { code: string }[] }>(
    await handler(request(reconcilePath, input), peer), 400,
  );
  assert.equal(rejected.issues[0]?.code, "ESTIMATE_ID_MISMATCH");
});

test("a Japan import with North Korean goods or loading is blocked even after third-country dispatch", async () => {
  for (const factor of ["item origin", "loading country"]) {
    const input = laneQuote("CN", "JP", "DAP");
    if (factor === "item origin") input.plan.shipment.items[0]!.originCountry = "KP";
    else input.loadingCountry = "KP";
    bindReview(input);
    const blocked = await expectJson<PilotQuote>(await handler(request(quotePath, input), peer));
    assert.equal(blocked.status, "blocked", factor);
    assert.equal(blocked.tradePolicy.reasonCode, "JP_KP_ORIGIN_OR_LOADING_EXCLUDED", factor);
    assert.equal(blocked.estimate, null, factor);
    assert.equal(blocked.buyerTotal, null, factor);
    assert.equal(blocked.productionAuthorized, false, factor);
    const legacyPreview = await expectJson<CheckoutPreview>(
      await handler(request("/v1/checkout/preview", {
        ...input.plan.shipment, loadingCountry: input.loadingCountry,
      }), peer),
    );
    assert.equal(legacyPreview.status, "out_of_scope", factor);
    assert.equal(legacyPreview.importTaxAndDuty.knownSubtotal, null, factor);
  }
});

test("the pilot routes require bearer credentials and retain production validation status", async () => {
  for (const [path, input] of [
    [quotePath, quoteExample], [reconcilePath, invoiceExample], [readinessPath, undefined],
  ] as const) {
    assert.equal((await handler(request(path, input, false), peer)).status, 401);
  }
  const readiness = await expectJson<{
    status: string;
    registryDestinations: number;
    productionVerifiedRouteCount: number;
    commercialExclusions: { country: string; reasonCode: string }[];
    routes: {
      route: string; checkout: string; customsHandoff: string; invoiceReconciliation: string;
      productionAuthorized: boolean;
    }[];
  }>(await handler(request(readinessPath), peer));
  assert.equal(readiness.status, "pilot");
  assert.equal(readiness.registryDestinations, 249);
  assert.equal(readiness.productionVerifiedRouteCount, 0);
  assert.deepEqual(readiness.commercialExclusions, [{ country: "KP", reasonCode: "KP_COMMERCIAL_EXCLUDED" }]);
  assert.deepEqual(
    readiness.routes.map(({ route }) => route).sort(),
    lanes.map(([from, to]) => from + "-" + to).sort(),
  );
  for (const route of readiness.routes) {
    assert.equal(route.checkout, "pending_live_validation");
    assert.equal(route.customsHandoff, "pending_live_validation");
    assert.equal(route.invoiceReconciliation, "pending_live_validation");
    assert.equal(route.productionAuthorized, false);
  }
});

test("authenticated checkout and pilot quoting withhold money on an uncovered import date", async () => {
  const input = laneQuote("JP", "US", "DAP");
  input.plan.shipment.importDate = "2026-11-13";
  for (const charge of input.charges) charge.evidence.effectiveThrough = "2026-11-13";
  bindReview(input);

  const preview = await expectJson<CheckoutPreview>(await handler(
    request("/v1/checkout/preview", input.plan.shipment), peer,
  ));
  assert.deepEqual(preview.goodsSubtotal, { currency: "USD", value: "200.00" });
  assert.ok(preview.customsAmountHold.reasons.includes("DATED_TARIFF_REFERENCE_REQUIRED"));
  assert.equal(preview.checkoutTax.knownSubtotal, null);
  assert.equal(preview.importTaxAndDuty.knownSubtotal, null);
  assert.equal(preview.landedCostTotal, null);

  const quote = await expectJson<PilotQuote>(await handler(request(quotePath, input), peer));
  assert.equal(quote.status, "review_required");
  assert.ok(quote.findings.some(({ code }) => code === "DATED_TARIFF_REFERENCE_REQUIRED"));
  assert.deepEqual(quote.goodsSubtotal, preview.goodsSubtotal);
  assert.ok(quote.charges.every(({ amount }) => amount === null));
  assert.equal(quote.buyerTotal, null);
});
