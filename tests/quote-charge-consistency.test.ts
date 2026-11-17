import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { planCustoms } from "../src/customs-plan.ts";
import {
  pilotChargeCategories, pilotQuoteShipmentDigest, quoteWorldShipment,
  type PilotChargeCategory, type WorldQuoteRequest,
} from "../src/pilot-quote.ts";
import { TariffCatalog } from "../src/tariffs.ts";
import { data, shipment } from "./helpers.ts";

const importDate = "2026-11-12";
const now = new Date(importDate + "T00:00:00Z");
const sourceUrl = "https://test.example/synthetic/quote-consistency";
const root = mkdtempSync(join(tmpdir(), "quote-charge-consistency-"));
after(() => rmSync(root, { recursive: true, force: true }));
const jurisdictions = [
  ["GB", "GBP", "air"], ["SG", "SGD", "air"],
  ["AU", "AUD", "post"], ["NZ", "NZD", "air"],
] as const;
const directories = jurisdictions.map(([country]) => {
  const source = join(root, country + "-source.json");
  const lines = join(root, country + "-lines.json");
  const pack = join(root, country + "-pack");
  writeFileSync(source, JSON.stringify({
    id: "quote-consistency-" + country.toLowerCase(), jurisdiction: country, countries: [country],
    zone: "standard", edition: "Synthetic", hsEdition: "HS 2022",
    availableFrom: importDate, availableThrough: importDate, checkedOn: importDate,
    scope: "published_baseline", authority: "Test source", sourceUrl, termsUrl: sourceUrl,
    terms: "Test only", inputFiles: [{ url: sourceUrl, sha256: "0".repeat(64) }],
    limitations: ["Synthetic test; not a legal rate"],
  }));
  writeFileSync(lines, JSON.stringify([{
    code: "6912001000", reference: "Synthetic ordinary item",
    rates: [{ charge: "customs_duty", treatment: "mfn", label: "Example only", expression: "5%" }],
  }]));
  execFileSync(process.execPath, [fileURLToPath(new URL("../scripts/tariffs/import.ts", import.meta.url)), source, lines, pack]);
  return pathToFileURL(pack + "/");
});
// Use only these synthetic packs, regardless of the developer's private catalog.
const catalog = new TariffCatalog(data, directories);

function request(destinationCountry: string, currency: string, transport: "air" | "post" = "air"): WorldQuoteRequest {
  const dates = { reviewedOn: importDate, effectiveFrom: importDate, effectiveThrough: importDate, reviewBy: importDate };
  const draft: WorldQuoteRequest = {
    orderId: "synthetic-order", estimateId: "synthetic-quote", loadingCountry: "JP",
    plan: {
      shipment: shipment({ originCountry: "JP", destinationCountry, currency, transport,
        importDate, incoterm: "DAP", customsValue: "100", customsValueConfirmed: true }),
      lines: [{ itemId: "line1", tariffCode: "6912001000" }],
    },
    tradeReview: { status: "confirmed", evidence: {
      ...dates, id: "synthetic-trade-review", sourceUrl, sourceType: "customs_broker",
      dispatchCountry: "JP", destinationCountry,
    } },
    charges: pilotChargeCategories.map(category => ({ category, method: "not_applicable", evidence: {
      ...dates, id: "synthetic-" + category, sourceUrl,
      sourceType: category === "carrier_fee" ? "carrier" : "customs_broker",
      destinationCountry, currency,
    } })),
  };
  return bind(draft);
}

function bind(draft: WorldQuoteRequest): WorldQuoteRequest {
  draft.reviewedShipmentDigest = pilotQuoteShipmentDigest(draft.plan, draft.orderId, draft.loadingCountry);
  return draft;
}

function amount(draft: WorldQuoteRequest, category: PilotChargeCategory, value: string): void {
  draft.charges = draft.charges.map(charge => charge.category === category
    ? { category, evidence: charge.evidence, method: "confirmed_amount", amount: value, timing: "import", payer: "buyer" }
    : charge);
}

function conflict(draft: WorldQuoteRequest, category: PilotChargeCategory): void {
  const quote = quoteWorldShipment(draft, data, catalog, now);
  assert.equal(quote.status, "review_required");
  assert.equal(quote.estimate, null);
  assert.equal(quote.buyerTotal, null);
  assert.ok(quote.charges.every(charge => charge.amount === null));
  assert.deepEqual(quote.findings, [{ code: "CHARGE_CONFLICTS_WITH_APPLICABLE_RULE", category }]);
}

for (const [country, currency, transport] of jurisdictions) {
  test(`${country} assessed consignment duty zero rejects positive evidence and accepts explicit zero`, () => {
    const draft = request(country, currency, transport);
    const plan = planCustoms(draft.plan, data, catalog, now);
    assert.ok(plan.checkout.importTaxAndDuty.charges.some(charge =>
      charge.kind === "customs_duty" && charge.collection === "not_applicable" && charge.amount.value === "0.00"));
    amount(draft, "customs_duty", "2");
    conflict(draft, "customs_duty");
    amount(draft, "customs_duty", "0");
    const matching = quoteWorldShipment(draft, data, catalog, now);
    assert.equal(matching.status, "estimated", JSON.stringify(matching.findings));
    assert.deepEqual(matching.buyerTotal, { currency, value: "110.00" });
  });
}

for (const [country, currency] of [["GB", "GBP"], ["SG", "SGD"], ["NZ", "NZD"]] as const) {
  test(`${country} confirmed import tax handoff zero rejects contradictory import tax evidence`, () => {
    const draft = request(country, currency);
    const plan = planCustoms(draft.plan, data, catalog, now);
    assert.ok(plan.checkout.importTaxAndDuty.charges.some(charge =>
      charge.kind === "import_vat_gst" && charge.collection === "not_applicable" && charge.amount.value === "0.00"));
    amount(draft, "import_vat_gst", "2");
    conflict(draft, "import_vat_gst");
    amount(draft, "import_vat_gst", "0");
    assert.equal(quoteWorldShipment(draft, data, catalog, now).status, "estimated");
  });
}

test("Singapore's assessed import GST also rejects a lower contradictory reviewed amount", () => {
  const draft = request("SG", "SGD");
  draft.plan.shipment.sellerTaxRegistration = "not_registered";
  draft.plan.shipment.items[0]!.unitValue = "400";
  draft.plan.shipment.customsValue = "400";
  bind(draft);
  const plan = planCustoms(draft.plan, data, catalog, now);
  const gst = plan.checkout.importTaxAndDuty.charges.find(charge => charge.kind === "import_vat_gst")!;
  assert.equal(gst.amount.value, "36.90");
  conflict(draft, "import_vat_gst");
  amount(draft, "import_vat_gst", gst.amount.value);
  assert.equal(quoteWorldShipment(draft, data, catalog, now).status, "estimated");
});

test("unconfirmed eligibility does not turn a tariff reference into a zero-duty assessment", () => {
  const draft = request("SG", "SGD");
  draft.plan.shipment.items[0]!.nonDutiableConfirmed = false;
  bind(draft);
  const plan = planCustoms(draft.plan, data, catalog, now);
  assert.equal(plan.checkout.importTaxAndDuty.charges.some(charge => charge.kind === "customs_duty"), false);
  amount(draft, "customs_duty", "2");
  assert.equal(quoteWorldShipment(draft, data, catalog, now).status, "estimated");
});

test("above-threshold NZ goods do not inherit the low-value zero-duty assessment", () => {
  const draft = request("NZ", "NZD");
  draft.plan.shipment.items[0]!.unitValue = "1001";
  draft.plan.shipment.customsValue = "1001";
  bind(draft);
  assert.equal(planCustoms(draft.plan, data, catalog, now).checkout.importTaxAndDuty.charges.some(charge => charge.kind === "customs_duty"), false);
  amount(draft, "customs_duty", "2");
  assert.equal(quoteWorldShipment(draft, data, catalog, now).status, "estimated");
});
