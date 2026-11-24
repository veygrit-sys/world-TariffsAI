import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { requestDigest } from "../src/engine.ts";
import { previewGB } from "../src/gb-low-value-pilot.ts";
import { minor } from "../src/money.ts";
import { data } from "./helpers.ts";
import type { Shipment } from "../src/types.ts";

const example = JSON.parse(readFileSync(new URL("../examples/country-pilot/gb.json", import.meta.url), "utf8")) as {
  shipment: Shipment;
  evidence: {
    saleDate: string; destinationRegion: string; stockAtSale: string; invoiceBasis: string;
    deliveryContract: string; nonExciseConfirmed: boolean; skuReviews: { itemId: string; sku: string; vatTreatment: string }[];
  };
};
const now = new Date("2026-11-25T00:00:00Z");
const run = (request: typeof example = example) => previewGB(request.shipment, request.evidence, data, now);
const charge = (result: ReturnType<typeof run>, category: string) => result.charges.find(c => c.category === category)?.value;

test("synthetic GB receipt independently reconciles checkout VAT and customer payment for the bound order", () => {
  const receipt = JSON.parse(readFileSync(new URL("./fixtures/gb-pilot-pos-receipt.json", import.meta.url), "utf8"));
  assert.equal(receipt.fixtureKind, "synthetic_test");
  assert.equal(receipt.documentType, "merchant_checkout_receipt");
  assert.equal(requestDigest(example), receipt.requestDigest);
  assert.equal(example.evidence.saleDate, receipt.saleDate);
  assert.equal(example.shipment.currency, receipt.currency);
  assert.equal(example.shipment.freight, receipt.delivery);
  const result = run();
  const checkout = result.charges.find(c => c.category === "checkout_tax" && c.collection === "checkout")!;
  assert.equal(checkout.value, receipt.checkoutVat);
  const goods = example.shipment.items.reduce((sum, i) => sum + BigInt(i.quantity) * minor(i.unitValue, "GBP"), 0n);
  assert.equal(goods, minor(receipt.netGoods, "GBP"));
  assert.equal(goods + minor(receipt.delivery, "GBP") + minor(checkout.value, "GBP"), minor(receipt.customerPayment, "GBP"));
  assert.equal(charge(result, "customs_duty"), "0.00");
  assert.equal(charge(result, "import_vat_gst"), "0.00");
  assert.deepEqual(result.charges.map(c => c.category).sort(), ["checkout_tax", "customs_duty", "import_vat_gst"]);
  assert.ok(result.charges.every(c => c.sourceIds.length && c.sourceIds.every(id => result.sources.some(s => s.id === id))));
});

test("independent dispatch and manufacture, with delivery in England, Wales or Scotland", () => {
  for (const [country, region] of [["JP", "england"], ["US", "wales"], ["CN", "scotland"]] as const) {
    const order = structuredClone(example);
    order.shipment.originCountry = country;
    order.shipment.items[0]!.originCountry = "DE";
    order.evidence.destinationRegion = region;
    assert.equal(charge(run(order), "checkout_tax"), "25.60");
  }
});

test("exactly GBP 135 intrinsic qualifies across invoice lines and GBP 135.01 needs a different procedure", () => {
  const order = structuredClone(example);
  const item = { ...order.shipment.items[0]!, id: "L2", quantity: 1, unitValue: "15.00" };
  order.shipment.items.push(item);
  order.evidence.skuReviews.push({ ...order.evidence.skuReviews[0]!, itemId: "L2" });
  assert.equal(charge(run(order), "checkout_tax"), "28.60");
  item.unitValue = "15.01";
  assert.deepEqual(run(order).charges, []);
  assert.deepEqual(run(order).reasons, ["THRESHOLD_EXCEEDED"]);
});

test("qualifying physical literary works and the contractual delivery are zero-rated", () => {
  const order = structuredClone(example);
  order.shipment.items[0] = {
    ...order.shipment.items[0]!, hs6: "490199", description: "Printed and bound novel, no bundled items",
    productIdentifier: "SYNTHETIC-PRINTED-NOVEL", standardTaxConfirmed: false,
  };
  order.evidence.skuReviews[0] = { sku: "SYNTHETIC-PRINTED-NOVEL", itemId: "L1", vatTreatment: "bound_printed_literary_work" };
  const book = run(order);
  assert.equal(charge(book, "checkout_tax"), "0.00");
  assert.equal(charge(book, "import_vat_gst"), "0.00");
  assert.ok(book.charges.find(c => c.category === "checkout_tax")?.sourceIds.includes("gb-pilot-hmrc-printed-books"));
  order.evidence.deliveryContract = "separate_service";
  assert.equal(charge(run(order), "checkout_tax"), undefined);
  order.evidence.deliveryContract = "delivery_required";
  order.shipment.items[0]!.hs6 = "482010";
  assert.equal(charge(run(order), "checkout_tax"), undefined);
  order.shipment.items[0]!.hs6 = "490199";
  order.shipment.items[0]!.standardTaxConfirmed = true;
  assert.equal(charge(run(order), "checkout_tax"), undefined);
});

test("unknowns, exceptions and conflicting invoice facts prevent amounts beyond their scope", () => {
  for (const changes of [
    { destinationRegion: "northern_ireland" }, { destinationRegion: "unknown" }, { stockAtSale: "inside_uk" },
    { invoiceBasis: "other" }, { nonExciseConfirmed: false }, { phantom: true }, { saleDate: "2026-11-26" },
    { saleDate: "2026-11-23" }, { saleDate: "2026-02-31" },
  ]) {
    assert.deepEqual(previewGB(example.shipment, { ...example.evidence, ...changes }, data, now).charges, []);
  }
  for (const changes of [
    { channel: "marketplace" }, { destinationZone: "special" }, { originCountry: "GG" }, { originCountry: "JE" },
    { transaction: "b2b_sale" }, { transaction: "private_gift" }, { inventoryStatus: "bonded" },
    { consignmentScopeConfirmed: false }, { currency: "USD" },
  ] as Partial<Shipment>[]) {
    assert.deepEqual(run({ ...example, shipment: { ...example.shipment, ...changes } }).charges, []);
  }
  for (const changes of [{ insurance: "1.00" }, { sellerTaxRegistration: "unknown" }] as Partial<Shipment>[])
    assert.deepEqual(run({ ...example, shipment: { ...example.shipment, ...changes } }).charges.map(c => c.category), ["customs_duty"]);
  const noHandoff = run({ ...example, shipment: { ...example.shipment, taxEvidenceConfirmed: false } });
  assert.equal(charge(noHandoff, "checkout_tax"), "25.60");
  assert.equal(charge(noHandoff, "import_vat_gst"), undefined);
});

test("incomplete, mismatched, duplicated or mixed SKU reviews never release checkout or import VAT", () => {
  const order = structuredClone(example);
  const review = order.evidence.skuReviews[0]!;
  for (const reviews of [[], [review, review], [{ ...review, sku: "WRONG" }], [{ ...review, itemId: "wrong" }],
    [{ ...review, vatTreatment: "unreviewed" }]]) {
    assert.equal(charge(run({ ...order, evidence: { ...order.evidence, skuReviews: reviews } }), "checkout_tax"), undefined);
  }
  order.shipment.items.push({ ...order.shipment.items[0]!, quantity: 1, unitValue: "1.00", id: "L2", hs6: "490199",
    productIdentifier: "SYNTHETIC-BOOK", standardTaxConfirmed: false });
  order.evidence.skuReviews.push({ itemId: "L2", sku: "SYNTHETIC-BOOK", vatTreatment: "bound_printed_literary_work" });
  assert.deepEqual(run(order).charges.map(c => c.category), ["customs_duty"]);
});

test("review date, sale date, import date, source presence and source expiry limit every amount", () => {
  for (const date of ["2026-11-23T00:00:00Z", "2026-12-12T00:00:00Z"])
    assert.deepEqual(previewGB(example.shipment, example.evidence, data, new Date(date)).charges, []);
  for (const importDate of ["2026-11-23", "2026-12-12"])
    assert.deepEqual(run({ ...example, shipment: { ...example.shipment, importDate } }).charges, []);
  for (const sources of [data.sources.filter(s => s.id !== "primary-gb-duty"),
    data.sources.map(s => s.id === "primary-gb-rate" ? { ...s, reviewBy: "2026-11-24" } : s)])
    assert.deepEqual(previewGB(example.shipment, example.evidence, { ...data, sources }, now).charges, []);
});
