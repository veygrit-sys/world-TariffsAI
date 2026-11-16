import test from "node:test";
import assert from "node:assert/strict";
import { previewCheckout } from "../src/checkout.ts";
import { planCustoms } from "../src/customs-plan.ts";
import { loadTariffCatalog } from "../src/tariffs.ts";
import { data, now, shipment } from "./helpers.ts";

test("checkout VAT and import amounts use separate subtotals with handoff evidence", () => {
  const result = previewCheckout(shipment(), data, now);
  assert.equal(result.context, "shipment_preview");
  assert.equal(result.checkoutTax.status, "estimate_available");
  assert.deepEqual(result.checkoutTax.knownSubtotal, { currency: "GBP", value: "22.00" });
  assert.equal(result.importTaxAndDuty.status, "partial_estimate");
  assert.deepEqual(result.importTaxAndDuty.knownSubtotal, { currency: "GBP", value: "0.00" });
  assert.deepEqual(result.importTaxAndDuty.charges.map(({ kind, collection }) => [kind, collection]), [
    ["customs_duty", "not_applicable"],
    ["import_vat_gst", "not_applicable"],
  ]);
  assert.ok(result.importTaxAndDuty.unresolvedCharges.includes("trade_remedies"));
  assert.deepEqual(result.otherUnresolvedCharges, ["brokerage", "handling"]);
  assert.equal(result.taxHandoff, "evidence_present");
  assert.equal(result.checkoutReady, false);
  assert.equal(result.shippingAuthorized, false);
  assert.equal(result.landedCostTotal, null);
});

test("missing VAT handoff evidence preserves import VAT as unknown", () => {
  const result = previewCheckout(shipment({ taxEvidenceConfirmed: false }), data, now);
  assert.deepEqual(result.checkoutTax.knownSubtotal, { currency: "GBP", value: "22.00" });
  assert.deepEqual(result.importTaxAndDuty.charges.map(({ kind }) => kind), ["customs_duty"]);
  assert.ok(result.importTaxAndDuty.unresolvedCharges.includes("import_vat_gst"));
  assert.equal(result.taxHandoff, "evidence_required");
});

test("import-stage duty is excluded from checkout even with DDP and a qualified EU shipment", () => {
  const importDate = "2026-11-12";
  const result = previewCheckout(shipment({
    destinationCountry: "FR", regime: "ioss", currency: "EUR", incoterm: "DDP", importDate,
    euDeclaration: { itemCount: 1, countConfirmed: true },
  }), data, new Date(importDate + "T00:00:00Z"));
  assert.equal(result.checkoutTax.knownSubtotal, null);
  assert.equal(result.checkoutTax.status, "review_required");
  assert.deepEqual(result.importTaxAndDuty.knownSubtotal, { currency: "EUR", value: "3.00" });
  assert.ok(result.importTaxAndDuty.unresolvedCharges.includes("import_vat_gst"));
  assert.equal(result.taxHandoff, "not_evaluated");
});

test("existing reference data and an unresolved territory never create a payable rate", () => {
  for (const change of [{ destinationCountry: "HK" }, { destinationZone: "special" as const }]) {
    const result = previewCheckout(shipment(change), data, now);
    assert.equal(result.checkoutTax.knownSubtotal, null);
    assert.equal(result.importTaxAndDuty.knownSubtotal, null);
    assert.equal(result.status, "needs_review");
  }
});

test("expired assessment amounts are withheld at the rule review boundary", () => {
  const preview = previewCheckout(
    shipment({ importDate: "2026-12-11" }),
    data,
    new Date("2026-12-11T14:59:59.500Z"),
  );
  assert.equal(preview.status, "needs_review");
  assert.equal(preview.requiresRequote, true);
  assert.equal(preview.checkoutTax.knownSubtotal, null);
  assert.equal(preview.importTaxAndDuty.knownSubtotal, null);
  assert.ok(preview.checkoutTax.unresolvedCharges.includes("sales_vat_gst"));
});

test("nonzero import GST is never shown as checkout GST", () => {
  const base = shipment();
  const result = previewCheckout(shipment({
    destinationCountry: "SG",
    currency: "SGD",
    sellerTaxRegistration: "not_registered",
    items: base.items.map((item) => ({ ...item, unitValue: "450.00" })),
  }), data, now);
  assert.equal(result.checkoutTax.knownSubtotal, null);
  assert.deepEqual(result.importTaxAndDuty.knownSubtotal, { currency: "SGD", value: "41.40" });
  assert.ok(result.importTaxAndDuty.charges.some(({ kind, collection }) =>
    kind === "import_vat_gst" && collection === "import"));
});

test("a checkout preview holds undocumented import amounts and keeps the goods subtotal", () => {
  const result = previewCheckout(shipment({
    destinationCountry: "US", currency: "USD", importDate: "2026-11-13",
  }), data, now);
  assert.deepEqual(result.goodsSubtotal, { currency: "USD", value: "100.00" });
  assert.equal(result.customsAmountHold.required, true);
  assert.ok(result.customsAmountHold.reasons.includes("DATED_TARIFF_REFERENCE_REQUIRED"));
  assert.equal(result.requiresRequote, true);
  assert.equal(result.checkoutTax.knownSubtotal, null);
  assert.equal(result.importTaxAndDuty.knownSubtotal, null);
  assert.ok(result.importTaxAndDuty.unresolvedCharges.includes("customs_duty"));
  assert.equal(result.landedCostTotal, null);
});

test("a current scoped duty rule still provides an estimate without a dated standard tariff pack", () => {
  const result = previewCheckout(shipment({ importDate: "2026-11-13" }), data, now);
  assert.equal(result.requiresRequote, false);
  assert.deepEqual(result.checkoutTax.knownSubtotal, { currency: "GBP", value: "22.00" });
  assert.ok(!result.customsAmountHold.reasons.includes("DATED_TARIFF_REFERENCE_REQUIRED"));
  assert.ok(result.customsAmountHold.reasons.includes("IMPORT_CHARGES_UNRESOLVED"));
  assert.equal(result.checkoutReady, false);
});

test("an exact same-day compiled reference stays visible but cannot satisfy the checkout tariff requirement", () => {
  const importDate = "2026-11-12";
  const base = shipment({ destinationCountry: "TL", currency: "USD", importDate });
  const plan = planCustoms({
    shipment: { ...base, items: base.items.map((item) => ({ ...item, hs6: "040900" })) },
    lines: [{ itemId: "line1", tariffCode: "04090000", rateTreatment: "general" }],
  }, data, loadTariffCatalog(data), new Date(importDate + "T00:00:00Z"));
  assert.equal(plan.lines[0]?.tariffReferences?.status, "schedule_reference");
  assert.equal(plan.lines[0]?.tariffReferences?.matches[0]?.rates[0]?.expression, "2.50%");
  assert.deepEqual(plan.checkout.goodsSubtotal, { currency: "USD", value: "100.00" });
  assert.equal(plan.checkout.requiresRequote, true);
  assert.ok(plan.checkout.customsAmountHold.reasons.includes("DATED_TARIFF_REFERENCE_REQUIRED"));
  assert.equal(plan.checkout.importTaxAndDuty.knownSubtotal, null);
  assert.equal(plan.checkout.landedCostTotal, null);
});
