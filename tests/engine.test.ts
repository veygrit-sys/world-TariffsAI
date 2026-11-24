import test from "node:test";
import assert from "node:assert/strict";
import { assess } from "../src/engine.ts";
import { InputError } from "../src/schema.ts";
import { data, now, shipment } from "./helpers.ts";
import type { Shipment } from "../src/types.ts";
const run = (change: Partial<Shipment> = {}, assessmentTime = now) =>
  assess(shipment(change), data, assessmentTime);
const euEvidenceReviewedAt = new Date("2026-11-12T00:00:00Z");
const charge = (r: ReturnType<typeof run>, kind: string) =>
  r.charges.find((c) => c.kind === kind)?.amount.value;
const has = (r: ReturnType<typeof run>, code: string) =>
  r.findings.some((f) => f.code === code);

test("GB charges 20% on tax-exclusive delivered goods and separates zero import VAT", () => {
  const r = run();
  assert.equal(charge(r, "sales_vat_gst"), "22.00");
  assert.equal(charge(r, "customs_duty"), "0.00");
  assert.equal(charge(r, "import_vat_gst"), "0.00");
  assert.equal(r.status, "partial_estimate");
  assert.equal(r.landedCostTotal, null);
  assert.equal(r.shippingAuthorized, false);
  assert.equal(r.checkoutReady, false);
  assert.ok(r.unknownCharges.includes("brokerage"));
  assert.ok(r.sourceIds.includes("primary-gb-rate"));
});
test("GB 135 threshold excludes separately stated shipping", () => {
  const s = shipment();
  s.items[0]!.unitValue = "135.00";
  const r = assess({ ...s, freight: "20.00" }, data, now);
  assert.equal(charge(r, "sales_vat_gst"), "31.00");
});
test("GB 135.01 is not treated as low value", () => {
  const s = shipment();
  s.items[0]!.unitValue = "135.01";
  const r = assess(s, data, now);
  assert.equal(r.charges.length, 0);
  assert.ok(has(r, "THRESHOLD_EXCEEDED"));
});
for (const change of [
  { transaction: "private_gift" },
  { transaction: "b2b_sale" },
  { transaction: "return" },
  { transaction: "sample" },
  { channel: "marketplace" },
  { regime: "unknown" },
  { originCountry: "JE" },
] as Partial<Shipment>[]) {
  test("GB outside scoped sale: " + JSON.stringify(change), () =>
    assert.equal(run(change).charges.length, 0),
  );
}
test("unconfirmed product standard rate is not coerced", () => {
  const s = shipment();
  s.items[0]!.standardTaxConfirmed = false;
  const r = assess(s, data, now);
  assert.equal(charge(r, "sales_vat_gst"), undefined);
  assert.ok(has(r, "STANDARD_TAX_REQUIRED"));
});
test("unregistered seller does not get automatic checkout VAT quote", () => {
  const r = run({ sellerTaxRegistration: "not_registered" });
  assert.equal(charge(r, "sales_vat_gst"), undefined);
  assert.ok(has(r, "SELLER_TAX_REQUIRED"));
});
test("checkout VAT evidence is needed before asserting no import VAT", () => {
  const r = run({ taxEvidenceConfirmed: false });
  assert.equal(charge(r, "sales_vat_gst"), "22.00");
  assert.equal(charge(r, "import_vat_gst"), undefined);
  assert.ok(r.unknownCharges.includes("import_vat_gst"));
});
test("EU counts actual declared items, including separately declared lines of the same HS6", () => {
  const s = shipment({
    destinationCountry: "DE",
    currency: "EUR",
    regime: "ioss",
    euDeclaration: { itemCount: 3, countConfirmed: true },
    freight: "0.00",
  });
  const item = s.items[0]!;
  s.items = [
    { ...item, quantity: 2, unitValue: "10.00" },
    { ...item, id: "line2", quantity: 3, unitValue: "5.00" },
    { ...item, id: "line3", hs6: "490199", unitValue: "20.00" },
  ];
  const r = assess(s, data, euEvidenceReviewedAt);
  assert.equal(charge(r, "customs_duty"), "9.00");
  s.euDeclaration = { itemCount: 1, countConfirmed: true };
  assert.ok(has(assess(s, data, euEvidenceReviewedAt), "EU_DECLARATION_ITEM_COUNT_REQUIRED"));
  delete s.euDeclaration;
  assert.equal(charge(assess(s, data, euEvidenceReviewedAt), "customs_duty"), undefined);
  assert.equal(charge(r, "import_vat_gst"), undefined);
});
test("EU exactly 150 is within the scoped threshold", () => {
  const s = shipment({
    destinationCountry: "FR",
    currency: "EUR",
    regime: "ioss",
    euDeclaration: { itemCount: 1, countConfirmed: true },
  });
  s.items[0]!.unitValue = "150.00";
  assert.equal(charge(assess(s, data, euEvidenceReviewedAt), "customs_duty"), "3.00");
});
test("EU greater than 150 does not use the flat fee", () => {
  const s = shipment({
    destinationCountry: "FR",
    currency: "EUR",
    regime: "ioss",
  });
  s.items[0]!.unitValue = "150.01";
  assert.equal(assess(s, data, euEvidenceReviewedAt).charges.length, 0);
});
test("EU standard declaration accepts a confirmed flat-duty treatment for post and courier", () => {
  for (const transport of ["post", "courier_unspecified"] as const)
  assert.equal(
    charge(
      run({ destinationCountry: "DE", currency: "EUR", transport,
        euDeclaration: { itemCount: 1, countConfirmed: true, flatDutyTreatmentConfirmed: true } }, euEvidenceReviewedAt),
      "customs_duty",
    ),
    "3.00",
  );
});
test("EU non-postal non-IOSS is held for current legal-scope review", () => {
  const r = run({ destinationCountry: "DE", currency: "EUR" }, euEvidenceReviewedAt);
  assert.equal(r.charges.length, 0);
  assert.ok(has(r, "EU_PROCEDURE_REVIEW"));
});
test("EU requires confirmed HS categories", () => {
  const s = shipment({
    destinationCountry: "DE",
    currency: "EUR",
    regime: "ioss",
  });
  s.items[0]!.classificationConfirmed = false;
  assert.ok(has(assess(s, data, euEvidenceReviewedAt), "CLASSIFICATION_REQUIRED"));
});
test("EU IOSS registration is not inferred from regime string", () =>
  assert.equal(
    run({
      destinationCountry: "DE",
      currency: "EUR",
      regime: "ioss",
      sellerTaxRegistration: "unknown",
    }, euEvidenceReviewedAt).charges.length,
    0,
  ));
test("EU missing product identifiers is a separate review checkpoint", () => {
  const s = shipment({
    destinationCountry: "DE",
    currency: "EUR",
    regime: "ioss",
  });
  delete s.items[0]!.productIdentifier;
  assert.ok(has(assess(s, data, euEvidenceReviewedAt), "EU_PRODUCT_ID_REQUIRED"));
});
for (const date of ["2026-06-30", "2026-12-03", "2028-07-01"])
  test("EU no active, current rule on " + date, () => {
    const r = run({
      destinationCountry: "DE",
      currency: "EUR",
      regime: "ioss",
      importDate: date,
    }, euEvidenceReviewedAt);
    assert.equal(r.charges.length, 0);
    assert.ok(has(r, "RULE_NOT_CURRENT"));
  });
test("review staleness cannot be bypassed by backdating import date", () => {
  const r = assess(
    shipment({ destinationCountry: "DE", currency: "EUR", regime: "ioss" }),
    data,
    new Date("2026-12-03T00:00:00Z"),
  );
  assert.equal(r.charges.length, 0);
  assert.ok(has(r, "RULE_NOT_CURRENT"));
});
test("SG item sales-value test differs from consignment CIF", () => {
  const s = shipment({
    destinationCountry: "SG",
    currency: "SGD",
    freight: "25.00",
  });
  s.items[0]!.unitValue = "395.00";
  const r = assess(s, data, now);
  assert.equal(charge(r, "sales_vat_gst"), "37.80");
  assert.equal(charge(r, "import_vat_gst"), "0.00");
});
test("SG several low-value units may exceed 400 total and use checkout GST", () => {
  const s = shipment({
    destinationCountry: "SG",
    currency: "SGD",
    freight: "0.00",
  });
  s.items[0]!.unitValue = "200.00";
  s.items[0]!.quantity = 3;
  assert.equal(charge(assess(s, data, now), "sales_vat_gst"), "54.00");
});
test("SG non-registered seller uses CIF boundary at import", () => {
  const s = shipment({
    destinationCountry: "SG",
    currency: "SGD",
    sellerTaxRegistration: "not_registered",
    freight: "5.00",
  });
  s.items[0]!.unitValue = "395.00";
  assert.equal(charge(assess(s, data, now), "import_vat_gst"), "0.00");
  s.freight = "5.01";
  assert.equal(charge(assess(s, data, now), "import_vat_gst"), "36.00");
});
test("SG unknown transport or dutiability cannot assume GST relief", () => {
  assert.equal(
    run({ destinationCountry: "SG", currency: "SGD", transport: "sea" }).charges
      .length,
    0,
  );
  const s = shipment({ destinationCountry: "SG", currency: "SGD" });
  s.items[0]!.nonDutiableConfirmed = false;
  assert.equal(assess(s, data, now).charges.length, 0);
});
test("JP requires explicit customs valuation and relief eligibility", () => {
  const s = shipment({
    originCountry: "US",
    destinationCountry: "JP",
    currency: "JPY",
    freight: "1000",
    insurance: "0",
  });
  s.items[0]!.unitValue = "15000";
  let r = assess(s, data, now);
  assert.equal(r.charges.length, 0);
  assert.ok(has(r, "CUSTOMS_VALUE_REQUIRED"));
  s.customsValue = "10000";
  s.customsValueConfirmed = true;
  r = assess(s, data, now);
  assert.equal(charge(r, "import_vat_gst"), "0");
  s.items[0]!.japanReliefEligibility = "ineligible";
  assert.equal(assess(s, data, now).charges.length, 0);
});
test("AU scoped postal border duty does not imply zero sales GST", () => {
  const s = shipment({
    destinationCountry: "AU",
    currency: "AUD",
    transport: "post",
    customsValue: "1000.00",
    customsValueConfirmed: true,
  });
  const r = assess(s, data, now);
  assert.equal(charge(r, "customs_duty"), "0.00");
  assert.equal(charge(r, "sales_vat_gst"), undefined);
  assert.ok(r.unknownCharges.includes("sales_vat_gst"));
});
test("NZ seller GST includes delivery and no duplicated import GST", () => {
  const r = run({ destinationCountry: "NZ", currency: "NZD" });
  assert.equal(charge(r, "sales_vat_gst"), "16.50");
  assert.equal(charge(r, "import_vat_gst"), "0.00");
});
test("NZ aggregated shipment above 1000 is held", () => {
  const s = shipment({ destinationCountry: "NZ", currency: "NZD" });
  s.items[0]!.unitValue = "1000.01";
  assert.equal(assess(s, data, now).charges.length, 0);
});
test("China checks three evidence streams but does not invent 9.1% tax", () => {
  const r = run({
    destinationCountry: "CN",
    currency: "CNY",
    regime: "cn_9610",
    china: {
      positiveListConfirmed: true,
      identityEvidenceConfirmed: true,
      electronicRecordsConfirmed: true,
      annualRemaining: "26000.00",
    },
  });
  assert.equal(r.charges.length, 0);
  assert.ok(has(r, "CN_TAX_REVIEW"));
  assert.equal(r.estimatedTaxSubtotal, null);
});
test("China missing evidence and remaining quota block basic eligibility", () => {
  assert.ok(
    has(
      run({ destinationCountry: "CN", currency: "CNY", regime: "cn_1210" }),
      "CN_EVIDENCE_REQUIRED",
    ),
  );
  const r = run({
    destinationCountry: "CN",
    currency: "CNY",
    regime: "cn_9610",
    china: {
      positiveListConfirmed: true,
      identityEvidenceConfirmed: true,
      electronicRecordsConfirmed: true,
      annualRemaining: "100.00",
    },
  });
  assert.ok(has(r, "CN_LIMIT_REVIEW"));
});
test("US below 800 never gets automatic exemption", () => {
  const r = run({ destinationCountry: "US", currency: "USD" });
  assert.equal(r.charges.length, 0);
  assert.equal(r.estimatedTaxSubtotal, null);
  assert.ok(has(r, "US_REVIEW"));
});
test("Kosovo is recognised as a supplemental index without pretending it is an ISO assignment", () => {
  const r = run({ destinationCountry: "XK" });
  assert.ok(has(r, "UNSUPPORTED_JURISDICTION"));
  assert.equal(
    data.countries.some((c) => c.code === "XK"),
    false,
  );
  assert.equal(data.supplementalRegions[0]?.codeScheme, "user_assigned");
});
test("stale China framework cannot pass the basic eligibility check", () => {
  const r = assess(
    shipment({
      destinationCountry: "CN",
      currency: "CNY",
      regime: "cn_9610",
      china: {
        positiveListConfirmed: true,
        identityEvidenceConfirmed: true,
        electronicRecordsConfirmed: true,
        annualRemaining: "26000.00",
      },
    }),
    data,
    new Date("2027-01-01T00:00:00Z"),
  );
  assert.ok(has(r, "RULE_NOT_CURRENT"));
  assert.ok(!has(r, "CN_TAX_REVIEW"));
});
for (const country of ["GH", "KE", "AR", "SA", "IN", "HK", "MO"])
  test(
    "recognised country without installed numeric coverage: " + country,
    () => {
      const r = run({ destinationCountry: country });
      assert.equal(r.charges.length, 0);
      assert.equal(r.shippingAuthorized, false);
      assert.ok(has(r, "UNSUPPORTED_JURISDICTION"));
    },
  );
test("all 249 ISO destinations are recognised with geographic and commercial exclusions", () => {
  for (const c of data.countries) {
    const r = run({ destinationCountry: c.code });
    assert.equal(r.status === "out_of_scope", c.code === "AQ" || c.code === "KP");
    if (c.code === "KP") {
      assert.ok(has(r, "KP_COMMERCIAL_EXCLUDED"));
      assert.ok(r.sources.some(({ id }) => id === "primary-jp-kp-trade"));
      assert.equal(r.charges.length, 0);
    }
  }
});
test("same country and intra-EU retain local tax review", () => {
  assert.equal(run({ destinationCountry: "JP" }).route, "domestic");
  const r = run({
    originCountry: "FR",
    destinationCountry: "DE",
    currency: "EUR",
  });
  assert.equal(r.route, "eu_intra_union");
  assert.equal(r.charges.length, 0);
});
test("special territory and bonded stock do not inherit mainland/domestic rules", () => {
  assert.equal(run({ destinationZone: "special" }).route, "unresolved");
  assert.equal(run({ destinationZone: "unknown" }).charges.length, 0);
  assert.equal(
    run({ originCountry: "GB", inventoryStatus: "bonded" }).charges.length,
    0,
  );
});
test("wrong currency, unconfirmed aggregation and regulated goods withhold calculation", () => {
  assert.equal(run({ currency: "USD" }).charges.length, 0);
  assert.equal(run({ consignmentScopeConfirmed: false }).charges.length, 0);
  const s = shipment();
  s.items[0]!.goodsType = "battery";
  assert.equal(assess(s, data, now).charges.length, 0);
});
test("DDP does not authorise shipping or establish a payable landed total", () => {
  const r = run({ incoterm: "DDP" });
  assert.equal(r.shippingAuthorized, false);
  assert.equal(r.landedCostTotal, null);
});
test("Veygrit references cannot impersonate verified grants", () => {
  const r = run({
    veygrit: {
      merchantId: "synthetic-shop",
      orderId: "synthetic-order",
      cartVersion: "1",
      addressTokenRef: "opaque-ref",
      addressVersion: "1",
      grantRef: "grant-ref",
    },
  });
  assert.ok(has(r, "GRANT_RECHECK_REQUIRED"));
  assert.equal(r.shippingAuthorized, false);
});
test("stable digest binds cart, amount, origin and address version", () => {
  const a = run(),
    s = shipment();
  s.items[0]!.unitValue = "101.00";
  const b = assess(s, data, now);
  assert.notEqual(a.requestDigest, b.requestDigest);
  assert.equal(a.requestDigest, run().requestDigest);
});
test("validation rejects extra personal data, impossible dates, invalid money and duplicate lines", () => {
  assert.throws(
    () => assess({ ...shipment(), address: "private" }, data, now),
    InputError,
  );
  assert.throws(() => run({ importDate: "2026-02-30" }), InputError);
  assert.throws(() => run({ currency: "ZZZ" }), InputError);
  assert.throws(() => run({ freight: "1.001" }), InputError);
  const s = shipment();
  s.items.push({ ...s.items[0]! });
  assert.throws(() => assess(s, data, now), InputError);
});
