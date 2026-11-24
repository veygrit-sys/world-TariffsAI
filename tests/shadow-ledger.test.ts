import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { captureShadowQuote, summarizeShadowLedger, type ShadowOrder } from "../src/shadow-ledger.ts";
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
