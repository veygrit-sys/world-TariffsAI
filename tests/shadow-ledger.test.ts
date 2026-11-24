import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { captureCountryPreview, captureShadowQuote, summarizeShadowLedger, type ShadowOrder } from "../src/shadow-ledger.ts";
import { InputError } from "../src/schema.ts";
import type { PilotQuote } from "../src/pilot-quote.ts";

const read = () => JSON.parse(readFileSync(new URL("../examples/shadow-ledger.json", import.meta.url), "utf8"));
const route = (input: unknown) => summarizeShadowLedger(input, "synthetic").routes[0]!;
const errorCode = (code: string) => (e: unknown) => e instanceof InputError && e.issues.some(i => i.code === code);

test("live defaults exclude synthetic observations and do not turn empty rates into zero", () => {
  const result = summarizeShadowLedger(read(), "live", true);
  assert.equal(result.cnJpPilot.orders, 0);
  assert.equal(result.routes[0]?.offerRate, null);
  assert.deepEqual(result.site, { version: 1, products: [], orders: [] });
  assert.equal(result.productionAuthorized, false);
});

test("holds stay in coverage; manually confirmed fees never count as independent matches", () => {
  const result = route(read());
  assert.deepEqual([result.eligibleOrders, result.uniqueSkus, result.offerRate], [2, 2, 0.5]);
  assert.deepEqual(result.reviewTime, {measuredOrders: 2, totalMinutes: 12, meanMinutes: 6});
  assert.deepEqual(result.maximumUnderstatementByCurrency, [{ currency: "JPY", value: "100", comparedOrders: 1 }]);
  const duty = result.charges.find(c => c.category === "customs_duty")!;
  const tax = result.charges.find(c => c.category === "import_vat_gst")!;
  const fee = result.charges.find(c => c.category === "carrier_fee")!;
  assert.deepEqual([duty.matchRate, tax.matchRate, fee.confirmedAmount, fee.compared, fee.matchRate], [1, 0, 1, 0, null]);
  assert.equal(result.holdReasons.DATED_TARIFF_REFERENCE_REQUIRED, 1);
  assert.equal(result.offeredWithInvoice, 1);
});

test("missing actuals stay unknown, extra posted fees count in total shortfall, zero duty is measurable", () => {
  const input = read();
  const original = input.orders[0];
  original.quote.estimate.charges[0].amount = "0";
  const invoice = original.observation.invoice;
  invoice.charges.push({category: "other", amount: "19"});
  const full = route(input);
  assert.equal(full.zeroDutyWithPositiveActual, 1);
  assert.equal(full.maximumUnderstatementByCurrency[0]?.value, "419");
  invoice.charges.splice(1, 1);
  const partial = route(input);
  assert.deepEqual(partial.maximumUnderstatementByCurrency, []);
  assert.equal(partial.charges.find(c => c.category === "import_vat_gst")!.compared, 0);
  assert.equal(partial.charges.find(c => c.category === "customs_duty")!.compared, 1);
});

test("distinct currencies remain separate, and incompatible currency, scope or precision is rejected", () => {
  const input = read();
  const second = structuredClone(input.orders[0]);
  second.orderId = second.quote.estimate.orderId = second.observation.invoice.orderId = "demo-usd";
  second.quote.estimate.currency = second.observation.invoice.currency = "USD";
  second.quote.methods.customs_duty = second.quote.methods.import_vat_gst = "ad_valorem";
  input.orders.push(second);
  const max = route(input).maximumUnderstatementByCurrency;
  assert.deepEqual(max.map(row => [row.currency, row.value]), [["JPY", "100"], ["USD", "100.00"]]);
  second.observation.invoice.currency = "EUR";
  assert.throws(() => route(input), errorCode("CURRENCY_MISMATCH"));
  second.observation.invoice.currency = "USD";
  second.observation.invoice.estimateId = "wrong";
  assert.throws(() => route(input), errorCode("ESTIMATE_ID_MISMATCH"));
  second.observation.invoice.estimateId = second.quote.estimate.estimateId;
  second.quote.estimate.charges[0].amount = "2.001";
  assert.throws(() => route(input), errorCode("CURRENCY_PRECISION"));
});

test("pending invoices count as offered, repeated order IDs cannot inflate progress", () => {
  const input = read();
  delete input.orders[0].observation;
  assert.equal(route(input).offeredWithInvoice, 0);
  assert.deepEqual(route(input).maximumUnderstatementByCurrency, []);
  input.orders.push(structuredClone(input.orders[0]));
  assert.throws(() => route(input), errorCode("DUPLICATE_SHADOW_ORDER"));
});

test("held orders can collect an actual invoice without ever measuring a quote or a zero estimate", () => {
  const input = read();
  const held = input.orders[1];
  held.observation = structuredClone(input.orders[0].observation);
  held.observation.invoice.orderId = held.orderId;
  delete held.observation.invoice.estimateId;
  const result = summarizeShadowLedger(input, "synthetic", true);
  assert.equal(result.routes[0]?.offeredWithInvoice, 1);
  assert.equal(result.site!.orders[1]?.charges[0]?.estimate, null);
  assert.equal(result.site!.orders[1]?.charges[0]?.actual, "300");
  held.observation.invoice.charges[0].amount = "300.5";
  assert.throws(() => route(input), errorCode("CURRENCY_PRECISION"));
});

test("site projection uses stable scoped aliases and removes raw refs or arbitrary codes", () => {
  const input = read();
  input.orders[1].quote.reasons.push("PERSONAL_123400");
  const selected = summarizeShadowLedger(input, "synthetic", true);
  const text = JSON.stringify(selected);
  assert.equal(selected.site!.orders[0]!.skuKeys[0], selected.site!.products[0]!.skuKey);
  for (const secret of ["demo-order", "demo-est", "demo-sku", "demo-invoice", "demo-carrier", "PERSONAL_123400"])
    assert.ok(!text.includes(secret));
  assert.equal(selected.routes[0]!.holdReasons.OTHER_HOLD, 1);
  assert.equal(summarizeShadowLedger(input, "synthetic").site, undefined);
  input.products[0].classification = "confirmed";
  assert.throws(() => summarizeShadowLedger(input, "synthetic", true), errorCode("SHADOW_CONFIRMED_CLASSIFICATION_EVIDENCE_REQUIRED"));
});

test("captured quote uses its pre-invoice methods; extra personal fields fail closed", () => {
  const input = read();
  const order: ShadowOrder = input.orders[0];
  assert.ok(order.quote.status === "offered");
  const quote = order.quote;
  const raw = {
    status: "estimated", estimate: quote.estimate,
    charges: Object.entries(quote.methods).map(([category, method]) => ({
      category, calculation: {method}, evidence: {reviewBy: "2026-11-30"},
    })),
  } as PilotQuote;
  const snapshot = captureShadowQuote(raw);
  assert.deepEqual(snapshot, quote);
  raw.estimate!.estimateId = "changed";
  assert.notDeepEqual(snapshot, quote);
  assert.deepEqual(captureShadowQuote({ status: "review_required", findings: [] } as unknown as PilotQuote),
    { status: "held", reasons: ["REVIEW_REQUIRED"] });
  input.orders[1].recipientAddress = "example";
  assert.throws(() => route(input), errorCode("additionalProperties"));
});

test("unconfirmed or incompatible estimates cannot be presented as offered", () => {
  const invalid = (change: (row: ReturnType<typeof read>) => void, code: string) => {
    const input = read();
    change(input.orders[0]);
    assert.throws(() => route(input), errorCode(code));
  };
  invalid(row => { row.quote.estimate.charges[0].amount = null; }, "SHADOW_OFFER_AMOUNT_REQUIRED");
  invalid(row => { row.quote.estimate.charges[2].amount = "50"; }, "SHADOW_NONZERO_NOT_APPLICABLE");
  invalid(row => { row.capturedOn = "2024-04-28"; }, "SHADOW_ESTIMATE_DATE_MISMATCH");
  invalid(row => { row.route = "JP-US"; }, "SHADOW_JAPAN_METHOD_SCOPE");
});

const readWorld = () => JSON.parse(readFileSync(new URL("../examples/shadow-ledger-world.json", import.meta.url), "utf8"));

test("worldwide route groups preserve the original JP target alias and isolate SKU, order and fee metrics", () => {
  const data = readWorld();
  const report = summarizeShadowLedger(data, "synthetic", true);
  assert.equal(report.routes.length, 11);
  assert.deepEqual(report.cnJpPilot, { orders: 2, targetOrders: 30, skus: 2, targetSkus: 10 });
  assert.deepEqual(report.pilots.find(p => p.route === "CN-JP"), { route: "CN-JP", ...report.cnJpPilot });
  assert.deepEqual(report.pilots.find(p => p.route === "US-GB"), {
    route: "US-GB", orders: 1, targetOrders: 30, skus: 1, targetSkus: 10,
  });
  const gb = report.routes.find(r => r.route === "US-GB")!;
  const sg = report.routes.find(r => r.route === "JP-SG")!;
  assert.deepEqual(gb.maximumUnderstatementByCurrency, [{ currency: "GBP", comparedOrders: 1, value: "0.75" }]);
  assert.deepEqual(sg.maximumUnderstatementByCurrency, [{ currency: "SGD", comparedOrders: 1, value: "0.00" }]);
  assert.ok(gb.charges.every(c => c.independentlyQuoted === 0 && c.confirmedAmount === 1));
  assert.equal(report.site!.products.filter(p => p.route === "JP-GB").length, 1);
  const orders = report.site!.orders;
  assert.ok(orders.every(row => !row.holdReasons.includes("OTHER_HOLD")));
  assert.ok(orders.find(row => row.route === "AU-NZ")!.holdReasons.includes("NZ_POSTAL_OPERATOR_LEVY_BUYER_SHARE_UNKNOWN"));
  assert.deepEqual(summarizeShadowLedger(data, "live", true).routes.map(r => r.route), ["CN-JP"]);
  assert.equal(report.productionAuthorized, false);

  const extra = structuredClone(data.orders.at(-1));
  extra.route = "XK-SG";
  data.orders.push(extra);
  assert.throws(() => summarizeShadowLedger(data, "synthetic"), errorCode("DUPLICATE_SHADOW_ORDER"));
  extra.orderId = "extra-review";
  assert.ok(summarizeShadowLedger(data, "synthetic").routes.some(r => r.route === "XK-SG"));
});

test("non-commercial, domestic and unknown directions reject order records and product-only requests", () => {
  for (const route of ["SG-SG", "AQ-SG", "AU-KP", "KP-NZ", "ZZ-CA", "HK-ZZ"]) {
    const data = read();
    data.orders[1].route = route;
    assert.throws(() => summarizeShadowLedger(data, "synthetic"), errorCode("SHADOW_ROUTE_OUT_OF_SCOPE"));
    data.orders = [];
    data.products[0].route = route;
    assert.throws(() => summarizeShadowLedger(data, "synthetic"), errorCode("SHADOW_ROUTE_OUT_OF_SCOPE"));
  }
});

test("a product-only lane is tracked with zero order progress; duplicate classifications fail even without site output", () => {
  const data = read();
  data.orders = [];
  data.products[0].route = "KE-MX";
  const report = summarizeShadowLedger(data, "synthetic");
  assert.deepEqual(report.pilots.find(row => row.route === "KE-MX"), {
    route: "KE-MX", orders: 0, skus: 0, targetOrders: 30, targetSkus: 10,
  });
  data.products.push(structuredClone(data.products[0]));
  assert.throws(() => summarizeShadowLedger(data, "synthetic"), errorCode("DUPLICATE_SHADOW_PRODUCT"));
});

test("partial estimates remain held and expose only recognized reason codes", () => {
  const data = read();
  const order = data.orders[1];
  order.route = "JP-SG";
  order.quote = captureCountryPreview({
    status: "partial_estimate",
    reasons: ["CARRIER_FEE_REQUIRED", "PARTIAL_ESTIMATE", "unstructured free text"],
  });
  assert.deepEqual(order.quote, { status: "held", reasons: ["CARRIER_FEE_REQUIRED", "PARTIAL_ESTIMATE", "OTHER_HOLD"] });
  const report = summarizeShadowLedger(data, "synthetic", true);
  const lane = report.routes.find(row => row.route === "JP-SG")!;
  assert.deepEqual([lane.eligibleOrders, lane.offered, lane.held, lane.offerRate], [1, 0, 1, 0]);
  assert.equal(lane.holdReasons.PARTIAL_ESTIMATE, 1);
  assert.equal(lane.charges.find(c => c.category === "import_vat_gst")!.matchRate, null);
  assert.deepEqual(captureCountryPreview({ status: "needs_review", reasons: [] }), {
    status: "held", reasons: ["REVIEW_REQUIRED"],
  });
});
