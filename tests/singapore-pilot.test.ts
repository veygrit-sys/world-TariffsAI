import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { invoiceEstimateChargeCategories, reconcileInvoice } from "../src/invoice-reconciliation.ts";
import { previewSG } from "../src/singapore-pilot.ts";
import type { Shipment } from "../src/types.ts";
import { data } from "./helpers.ts";

const demo = JSON.parse(readFileSync(new URL("../examples/country-pilot/sg.json", import.meta.url), "utf8")) as {
  shipment: Shipment; evidence: Record<string, unknown>;
};
const now = new Date("2026-11-25T00:00:00Z");
const preview = (shipment = structuredClone(demo.shipment), evidence: unknown = demo.evidence) =>
  previewSG(shipment, evidence, data, now);
const value = (result: ReturnType<typeof preview>, category: string) =>
  result.charges.find(charge => charge.category === category)?.value;

function border(goods: string, freight: string, cif: string) {
  const shipment = structuredClone(demo.shipment);
  shipment.items[0]!.unitValue = goods;
  shipment.items[0]!.quantity = 1;
  shipment.freight = freight;
  shipment.sellerTaxRegistration = "not_registered";
  shipment.customsValue = cif;
  shipment.customsValueConfirmed = true;
  shipment.taxEvidenceConfirmed = false;
  return { shipment, evidence: { ...demo.evidence, checkoutGst: "not_collected", cifWithoutFurtherAdjustments: true, singleImportLineConfirmed: true } };
}

test("registered retailer includes charged delivery in GST even when the consignment exceeds SGD400", () => {
  const result = preview();
  assert.deepEqual(result.charges.map(c => [c.category, c.value, c.currency, c.collection]), [
    ["customs_duty", "0.00", "SGD", "not_applicable"],
    ["checkout_tax", "39.60", "SGD", "checkout"],
    ["import_vat_gst", "0.00", "SGD", "not_applicable"],
  ]);
  assert.deepEqual(result.reasons, ["SG_CUSTOMS_FEE_REVIEW", "SG_CARRIER_FEE_REVIEW"]);
  const ids = new Set(result.sources.map(s => s.id));
  assert.ok(result.charges.every(c => c.sourceIds.length && c.sourceIds.every(id => ids.has(id))));
  const shipment = structuredClone(demo.shipment);
  shipment.items[0]!.unitValue = "400.00";
  shipment.items[0]!.quantity = 1;
  shipment.insurance = "0.50";
  assert.equal(value(preview(shipment), "checkout_tax"), "37.85");
  shipment.items[0]!.unitValue = "400.01";
  assert.deepEqual(preview(shipment).charges, []);
});

test("requires GST collection information item by item and explicitly handles duplicates", () => {
  const noHandoff = preview(demo.shipment, { ...demo.evidence, checkoutGst: "unverified" });
  assert.equal(value(noHandoff, "checkout_tax"), "39.60");
  assert.equal(value(noHandoff, "import_vat_gst"), undefined);
  assert.ok(noHandoff.reasons.includes("SG_GST_PAID_ITEM_HANDOFF_REQUIRED"));
  assert.equal(value(preview({ ...demo.shipment, taxEvidenceConfirmed: false }), "import_vat_gst"), undefined);
  const alternateMethod = preview(demo.shipment, { ...demo.evidence, sellerUsesSalesValueThreshold: false });
  assert.ok(alternateMethod.reasons.includes("SG_OVR_ENTRY_VALUE_METHOD_REVIEW"));
  assert.equal(value(alternateMethod, "checkout_tax"), undefined);
  assert.ok(preview(demo.shipment, { ...demo.evidence, checkoutGst: "not_collected" }).reasons.includes("SG_CHECKOUT_COLLECTION_CONFLICT"));
  const noRounding = preview(demo.shipment, { ...demo.evidence, sellerRoundsOnInvoiceTotal: false });
  assert.equal(value(noRounding, "checkout_tax"), undefined);
  const duplicate = preview(demo.shipment, { ...demo.evidence, checkoutGst: "charged_twice" });
  assert.ok(duplicate.reasons.includes("SG_DOUBLE_COLLECTION_REFUND_REVIEW"));
  assert.equal(value(duplicate, "import_vat_gst"), undefined);
  assert.equal(value(duplicate, "checkout_tax"), undefined);
});

test("an unregistered seller uses full, reviewed consignment CIF for import relief", () => {
  for (const [goods, freight, cif, expected] of [
    ["399.99", "0.00", "399.99", "0.00"],
    ["390.00", "10.00", "400.00", "0.00"],
    ["400.00", "1.00", "401.00", "36.09"],
    ["400.00", "40.00", "440.00", "39.60"],
  ] as const) {
    const { shipment, evidence } = border(goods, freight, cif);
    const result = preview(shipment, evidence);
    assert.equal(value(result, "checkout_tax"), "0.00");
    assert.equal(value(result, "import_vat_gst"), expected, cif);
    assert.equal(result.charges.find(c => c.category === "import_vat_gst")?.collection,
      expected === "0.00" ? "not_applicable" : "import");
  }
  const at401 = border("400.00", "1.00", "401.00");
  assert.ok(preview(at401.shipment, { ...at401.evidence, singleImportLineConfirmed: false }).reasons.includes("SG_IMPORT_LINE_SCOPE_REQUIRED"));
  const { shipment, evidence } = border("400.00", "0.01", "400.01");
  const result = preview(shipment, evidence);
  assert.ok(result.reasons.includes("SG_IMPORT_PERMIT_ROUNDING_REVIEW"));
  assert.equal(value(result, "import_vat_gst"), undefined);
});

test("unreviewed or conflicting CIF, split parcels, and unknown seller collection cannot create relief", () => {
  const { shipment, evidence } = border("370", "30", "400");
  assert.equal(value(preview({ ...shipment, customsValueConfirmed: false }, evidence), "import_vat_gst"), undefined);
  assert.ok(preview({ ...shipment, customsValue: "370" }, evidence).reasons.includes("SG_CIF_SCOPE_MISMATCH"));
  assert.ok(preview(shipment, { ...evidence, cifWithoutFurtherAdjustments: false }).reasons.includes("SG_REVIEWED_CIF_REQUIRED"));
  assert.ok(preview({ ...shipment, consignmentScopeConfirmed: false }, evidence).reasons.includes("SG_AGGREGATED_CONSIGNMENT_REQUIRED"));
  assert.ok(preview(shipment, { ...evidence, checkoutGst: "paid_and_transmitted" }).reasons.includes("SG_CHECKOUT_COLLECTION_CONFLICT"));
});

test("rejects missing or mistyped evidence, foreign currency, unclassified goods and out-of-scope routes", () => {
  for (const evidence of [null, {}, { ...demo.evidence, buyerNotGstRegistered: "yes" },
    { ...demo.evidence, paidAtBorder: false }, { ...demo.evidence, singleOverseasSaleToConsumer: false },
    { ...demo.evidence, sellerRegistrationVerified: false }]) assert.deepEqual(preview(demo.shipment, evidence).charges, []);
  for (const change of [
    { originCountry: "SG" }, { destinationCountry: "MY" }, { currency: "USD" },
    { sellerTaxRegistration: "unknown" }, { channel: "marketplace" }, { transport: "sea" },
    { transaction: "b2b_sale" }, { regime: "unknown" }, { inventoryStatus: "bonded" },
    { loadingCountry: "DE" }, { destinationZone: "special" },
  ] satisfies Partial<Shipment>[]) assert.deepEqual(preview({ ...demo.shipment, ...change }).charges, []);
  for (const change of [
    { classificationConfirmed: false }, { goodsType: "alcohol" }, { standardTaxConfirmed: false }, { nonDutiableConfirmed: false },
  ] satisfies Partial<Shipment["items"][number]>[]) {
    const shipment = structuredClone(demo.shipment);
    Object.assign(shipment.items[0]!, change);
    assert.deepEqual(preview(shipment).charges, []);
  }
});

test("the dates of evaluation and import, and the underlying source rule, must all be current", () => {
  for (const date of ["2026-11-24", "2026-12-03"]) {
    const result = previewSG(demo.shipment, demo.evidence, data, new Date(date + "T00:00:00Z"));
    assert.deepEqual(result.reasons, ["SG_SOURCE_REVIEW"]);
    assert.deepEqual(preview({ ...demo.shipment, importDate: date }).charges, []);
  }
  const noSgRule = { ...data, rules: data.rules.filter(rule => rule.id !== "SG_LOW_VALUE") };
  assert.deepEqual(previewSG(demo.shipment, demo.evidence, noSgRule, now).charges, []);
});

test("a simulated carrier invoice exposes duplicate import GST and unquoted fees on their own lines", () => {
  const result = preview();
  const ids = { orderId: "sg-demo", estimateId: "sg-demo-estimate", issuedOn: "2026-11-25", currency: "SGD" };
  const comparison = reconcileInvoice({
    estimate: { ...ids, charges: invoiceEstimateChargeCategories.map(category => ({
      category, amount: value(result, category) ?? null,
    })) },
    invoice: { ...ids, invoiceId: "sg-synthetic-carrier", charges: [
      { category: "customs_duty", amount: "0.00" },
      { category: "import_vat_gst", amount: "39.60" },
      { category: "carrier_fee", amount: "5.00" },
    ] },
  });
  assert.equal(comparison.lines.find(l => l.category === "import_vat_gst")?.difference, "39.60");
  assert.equal(comparison.lines.find(l => l.category === "carrier_fee")?.status, "estimate_missing");
  assert.equal(comparison.differenceTotal, null);
});
