import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { reconcileCountryPreview } from "../src/country-preview-reconcile.ts";
import { InputError } from "../src/schema.ts";
import { data } from "./helpers.ts";

const now = new Date("2026-11-25T00:00:00Z");
const example = (file: string) => JSON.parse(readFileSync(new URL("../examples/country-pilot/" + file, import.meta.url), "utf8"));
const gb = example("gb-receipt.json");
const run = (document: Record<string, unknown>, request = gb.request) => reconcileCountryPreview({ request, document }, data, now);
const line = (category: string, value: string) => ({ category, value });
const border = { stage: "import", currency: "GBP", issuedOn: "2026-11-25", requestDigest: gb.document.requestDigest };
const matched = { estimated: "25.60", observed: "25.60", difference: "0.00", status: "matched" };

test("bound synthetic merchant receipt matches the GB checkout tax only", () => {
  const result = reconcileCountryPreview(gb, data, now);
  assert.equal(result.status, "matched_components");
  assert.equal(result.stage, "checkout");
  assert.equal(result.previewStatus, "partial_estimate");
  assert.deepEqual(result.lines, [{ category: "checkout_tax", ...matched, sourceIds: ["primary-gb-sale", "primary-gb-delivery", "primary-gb-rate"] }]);
  assert.ok(!result.reasons.some(r => r.startsWith("DOCUMENT_")));
  assert.equal(result.landedCostTotal, null);
  assert.deepEqual([result.checkoutReady, result.shippingAuthorized, result.productionAuthorized], [false, false, false]);
});

test("observed less or more than forecast yields a signed minor-unit difference", () => {
  for (const [value, delta] of [["25.59", "-0.01"], ["26", "0.40"]]) {
    const result = run({ ...gb.document, lines: [line("checkout_tax", value!)] });
    assert.equal(result.status, "differences");
    assert.equal(result.lines[0]!.status, "difference");
    assert.equal(result.lines[0]!.difference, delta);
  }
});

test("GB border zeroes require explicit matching lines and an unestimated fee remains unknown", () => {
  const lines = [line("customs_duty", "0.00"), line("import_vat_gst", "0.00")];
  assert.equal(run({ ...border, lines }).status, "matched_components");
  const subtotal = run({ ...border, lines: [lines[1], line("carrier_fee", "6.50")] });
  assert.equal(subtotal.status, "needs_review");
  assert.deepEqual(subtotal.lines.map(l => [l.category, l.estimated, l.observed, l.difference, l.status]), [
    ["customs_duty", "0.00", null, null, "document_missing"],
    ["import_vat_gst", "0.00", "0.00", "0.00", "matched"],
    ["carrier_fee", null, "6.50", null, "estimate_missing"],
  ]);
  assert.equal(run({ ...border, lines: [] }).status, "needs_review");
  assert.ok(run({ ...border, lines: [] }).lines.every(l => l.observed === null && l.difference === null));
});

test("collection stage is part of the comparison, including non-applicable checkout tax", () => {
  const wrong = run({ ...border, lines: [line("checkout_tax", "25.60")] });
  assert.equal(wrong.status, "needs_review");
  assert.ok(wrong.reasons.includes("DOCUMENT_COLLECTION_STAGE_MISMATCH"));
  assert.deepEqual(wrong.lines.find(l => l.category === "checkout_tax"),
    { category: "checkout_tax", estimated: null, observed: "25.60", difference: null, status: "not_comparable", sourceIds: [] });
  const cn = example("cn.json");
  const cnReceipt = run({ stage: "checkout", currency: "CNY", lines: [line("import_vat_gst", "9.10")] }, cn);
  assert.equal(cnReceipt.lines[0]!.status, "matched");
  const cnImport = run({ stage: "import", currency: "CNY", lines: [line("import_vat_gst", "9.10")] }, cn);
  assert.equal(cnImport.lines.find(l => l.category === "import_vat_gst")!.status, "not_comparable");
  const sg = example("sg.json");
  sg.shipment.sellerTaxRegistration = "not_registered";
  sg.shipment.customsValueConfirmed = true;
  sg.shipment.customsValue = "440.00";
  Object.assign(sg.evidence, { checkoutGst: "not_collected", cifWithoutFurtherAdjustments: true, singleImportLineConfirmed: true });
  const receipt = run({ stage: "checkout", currency: "SGD", lines: [line("checkout_tax", "0")] }, sg);
  assert.deepEqual(receipt.lines.map(l => [l.category, l.status]), [["checkout_tax", "matched"]]);
  const invoice = run({ stage: "import", currency: "SGD", lines: [line("customs_duty", "0"), line("import_vat_gst", "39.60")] }, sg);
  assert.equal(invoice.status, "matched_components");
  assert.ok(invoice.lines.every(l => l.category !== "checkout_tax"));
});

test("EU F00 matching compares an import fee and keeps buyer liability and pass-through unconfirmed", () => {
  const de = example("de.json");
  const result = run({ stage: "import", currency: "EUR", lines: [line("customs_duty", "3.00"), line("customs_fee", "2.00")] }, de);
  assert.equal(result.status, "matched_components");
  assert.equal(result.lines.find(l => l.category === "customs_fee")!.status, "matched");
  assert.ok(result.reasons.includes("BUYER_FEE_LIABILITY_UNCONFIRMED"));
  assert.equal(result.checkoutReady, false);
});

test("unbound facts are identified and mismatched currency, request or document dates suppress arithmetic", () => {
  const simple = run({ stage: "checkout", currency: "GBP", lines: [line("checkout_tax", "25.60")] });
  assert.equal(simple.lines[0]!.status, "matched");
  assert.ok(simple.reasons.includes("DOCUMENT_BINDING_UNVERIFIED"));
  assert.ok(simple.reasons.includes("DOCUMENT_DATE_UNVERIFIED"));
  for (const [doc, reason] of [
    [{ ...gb.document, currency: "USD" }, "DOCUMENT_CURRENCY_MISMATCH"],
    [{ ...gb.document, requestDigest: "a".repeat(64) }, "DOCUMENT_REQUEST_MISMATCH"],
    [{ ...gb.document, issuedOn: "2026-11-23" }, "DOCUMENT_DATE_OUT_OF_SEQUENCE"],
    [{ ...gb.document, issuedOn: "2026-11-26" }, "DOCUMENT_DATE_OUT_OF_SEQUENCE"],
    [{ ...border, lines: [line("import_vat_gst", "0.00")], issuedOn: "2026-11-24" }, "DOCUMENT_DATE_OUT_OF_SEQUENCE"],
  ] as const) {
    const r = run(doc);
    assert.equal(r.status, "needs_review");
    assert.ok(r.reasons.includes(reason));
    assert.ok(r.lines.every(l => l.difference === null && l.status === "not_comparable"));
  }
  const stale = reconcileCountryPreview(gb, data, new Date("2027-01-01T00:00:00Z"));
  assert.equal(stale.status, "needs_review");
  assert.equal(stale.lines[0]!.status, "estimate_missing");
});

test("the same request is recomputed and the caller cannot inject an estimate, personal details or duplicate lines", () => {
  const changed = structuredClone(gb.request);
  changed.shipment.items[0].unitValue = "50.00";
  assert.equal(run(gb.document, changed).lines[0]!.estimated, "21.60");
  assert.equal(run(gb.document, changed).lines[0]!.status, "not_comparable");
  for (const doc of [{ ...gb.document, currency: "ZZZ" }, { ...gb.document, issuedOn: "2026-02-30" },
    { ...gb.document, lines: [line("customs_duty", "0.001")] }, { ...gb.document, lines: [line("other", "1.00")] },
    { ...gb.document, lines: [line("checkout_tax", "-0.01")] }, { ...gb.document, lines: [line("checkout_tax", "1"), line("checkout_tax", "2")] },
    { ...gb.document, recipient: "SYNTHETIC" }, { ...gb.document, lines: [{ category: "checkout_tax", value: "25.60", estimated: "25.60" }] }])
    assert.throws(() => run(doc), InputError);
  assert.throws(() => reconcileCountryPreview({ ...gb, preview: { charges: [] } }, data, now), InputError);
});
