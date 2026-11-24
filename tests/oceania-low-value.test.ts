import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { previewOceania } from "../src/oceania-low-value.ts";
import type { Shipment } from "../src/types.ts";
import { data } from "./helpers.ts";

const now = new Date("2026-11-25T03:00:00Z");
type Fixture = { shipment: Shipment; evidence: Record<string, unknown> };
function fixture(code: "au" | "nz"): Fixture {
  return JSON.parse(readFileSync(new URL(`../examples/country-pilot/${code}.json`, import.meta.url), "utf8"));
}
function preview(input: Fixture, date = now) {
  return previewOceania(input.shipment, input.evidence, data, date);
}

test("separates seller GST from ordinary duty and import GST for JP→AU and US→NZ", () => {
  for (const [country, expected, currency] of [["au", "35.00", "AUD"], ["nz", "4.50", "NZD"]] as const) {
    const result = preview(fixture(country));
    assert.deepEqual(result.charges.map((c) => [c.category, c.value, c.collection]), [
      ["customs_duty", "0.00", "not_applicable"], ["import_vat_gst", "0.00", "not_applicable"],
      ["checkout_tax", expected, "checkout"],
    ]);
    assert(result.charges.every((c) => c.currency === currency &&
      c.sourceIds.every((id) => result.sources.some((ref) => ref.id === id))));
  }
});

test("threshold includes exactly 1,000 in local currency, excludes international freight and insurance", () => {
  for (const [country, gst] of [["au", "110.10"], ["nz", "165.15"]] as const) {
    const input = fixture(country);
    input.shipment.items[0]!.quantity = 2;
    input.shipment.items[0]!.unitValue = "500.00";
    input.shipment.customsValue = "1000";
    input.shipment.freight = "100";
    input.shipment.insurance = "1";
    assert.equal(preview(input).charges.find((c) => c.category === "checkout_tax")?.value, gst);
    input.shipment.items[0]!.quantity = 1;
    input.shipment.items[0]!.unitValue = input.shipment.customsValue = "1000.01";
    assert.equal(preview(input).charges.length, 0);
    assert(preview(input).reasons.includes("THRESHOLD_EXCEEDED"));
  }
});

test("NZ forwarder and postal operator levies do not become buyer charges", () => {
  const input = fixture("nz");
  for (const route of ["air", "sea", "post"] as const) {
    input.shipment.transport = route;
    const result = preview(input);
    assert(result.reasons.includes(route === "post" ? "NZ_POSTAL_OPERATOR_LEVY_BUYER_SHARE_UNKNOWN" : "NZ_FREIGHT_LEVY_BUYER_SHARE_UNKNOWN"));
    assert(!result.charges.some((c) => c.category === "carrier_fee" || c.category === "customs_fee"));
  }
});

test("both scopes hold incomplete, stale or contradictory claims and special routes", () => {
  const mutations: ((input: Fixture) => void)[] = [
    ({ shipment: s }) => { s.channel = "marketplace"; },
    ({ shipment: s }) => { s.transaction = "private_gift"; },
    ({ shipment: s }) => { s.inventoryStatus = "bonded"; },
    ({ shipment: s }) => { s.consignmentScopeConfirmed = false; },
    ({ shipment: s }) => { delete s.taxEvidenceConfirmed; },
    ({ shipment: s }) => { s.currency = "USD"; },
    ({ shipment: s }) => { s.sellerTaxRegistration = "unknown"; },
    ({ shipment: s }) => { s.items[0]!.goodsType = "tobacco"; },
    ({ shipment: s }) => { s.items[0]!.hs6 = "710812"; },
    ({ shipment: s }) => { s.items[0]!.originCountry = "KP"; },
    ({ shipment: s }) => { s.destinationZone = "special"; },
    ({ shipment: s }) => { s.customsValue = "98.20"; },
    ({ shipment: s }) => { s.importDate = "2026-12-12"; },
    ({ shipment: s }) => { s.importDate = "2026-11-23"; },
    ({ evidence }) => { delete evidence.reference; },
    ({ evidence }) => { evidence.saleDate = "2026-11-26"; },
    ({ evidence }) => { evidence.saleDate = "2025-02-30"; },
    ({ evidence }) => { evidence.residentPrivateConsumer = false; },
    ({ evidence }) => { evidence.allInvoiceAmountsTaxExclusive = "true"; },
    ({ evidence }) => { evidence.assumeNoFreight = true; },
  ];
  for (const country of ["au", "nz"] as const) {
    for (const mutate of mutations) {
      const example = fixture(country);
      mutate(example);
      assert.equal(preview(example).charges.length, 0, mutate.toString());
      assert(preview(example).reasons.length > 0);
    }
    assert.equal(preview(fixture(country), new Date("2026-12-12T01:00:00Z")).charges.length, 0);
    assert.equal(preview(fixture(country), new Date("2026-11-23T00:00:00Z")).charges.length, 0);
  }
});

test("holds AU cargo and an expired or missing core rule even with valid invoice evidence", () => {
  const au = fixture("au");
  au.shipment.transport = "air";
  assert.deepEqual(preview(au).reasons, ["TRANSPORT_REVIEW"]);
  for (const code of ["nz", "au"] as const) {
    const input = fixture(code);
    const result = previewOceania(input.shipment, input.evidence, { ...data, rules: [] }, now);
    assert.equal(result.charges.length, 0);
    assert(result.reasons.includes("RULE_NOT_CURRENT"));
  }
});
