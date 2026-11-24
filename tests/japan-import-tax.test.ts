import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  pilotChargeCategories, pilotQuoteShipmentDigest, quotePilotShipment, type PilotQuoteRequest,
} from "../src/pilot-quote.ts";
import { TariffCatalog, type TariffRate } from "../src/tariffs.ts";
import { data, shipment } from "./helpers.ts";

const date = "2026-11-25";
const now = new Date(date + "T00:00:00Z");
const sourceUrl = "https://customs.example.test/synthetic";
const directory = mkdtempSync(join(tmpdir(), "japan-tax-pilot-"));
after(() => rmSync(directory, { recursive: true, force: true }));
const metadata = join(directory, "source.json");
const lines = join(directory, "lines.json");
const pack = join(directory, "pack");
writeFileSync(metadata, JSON.stringify({
  id: "synthetic-jp-statutory-tax", jurisdiction: "JP", countries: ["JP"], zone: "standard",
  edition: "Synthetic", hsEdition: "HS2022", availableFrom: date, availableThrough: date,
  checkedOn: date, scope: "national_schedule", authority: "Test fixture", sourceUrl, termsUrl: sourceUrl,
  terms: "Test only", inputFiles: [{ url: sourceUrl, sha256: "0".repeat(64) }], limitations: ["Synthetic test only"],
}));
const ordinaryRate = (expression: string, changes: Partial<TariffRate> = {}): TariffRate => ({
  charge: "customs_duty", treatment: "mfn", label: "Synthetic only", expression, ...changes,
});
const cases: [string, TariffRate[]][] = [
  ["691390000", [ordinaryRate("14%")]], ["691390001", [ordinaryRate("Free")]],
  ["691390002", [ordinaryRate("50 yen per kg")]], ["960820000", [ordinaryRate("3.9%"), ordinaryRate("4.6%", { treatment: "general" })]],
  ["691390003", [ordinaryRate("9%", { through: "2026-11-24" }), ordinaryRate("8%", { originCountries: ["US"] }), ordinaryRate("3.8%")]],
  ["691390004", [ordinaryRate("14%"), ordinaryRate("Free", { treatment: "general" })]],
  ["691390005", [ordinaryRate("14%"), ordinaryRate("8%", { treatment: "temporary" })]],
  ["691390006", [ordinaryRate("14%"), ordinaryRate("8%", { condition: "only when applicable" })]],
  ["691390007", [ordinaryRate("14%")]], ["691390007", [ordinaryRate("0%")]],
  ["691390008", [ordinaryRate("14%"), ordinaryRate("JPY 50 per kg", { charge: "excise", treatment: "general" })]],
  ["691390009", [ordinaryRate("14%")]], ["691390009", [ordinaryRate("14%")]],
  ["691390010", [ordinaryRate("14%"), ordinaryRate("10%", { charge: "import_gst", treatment: "general" })]],
];
writeFileSync(lines, JSON.stringify(cases.map(([code, rates]) => ({ code, reference: "Synthetic item", rates }))));
const importer = fileURLToPath(new URL("../scripts/tariffs/import.ts", import.meta.url));
execFileSync(process.execPath, [importer, metadata, lines, pack]);
const catalog = new TariffCatalog(data, [pathToFileURL(pack + "/")]);

function withExtraPack(id: string, rates: TariffRate[], role?: "measures") {
  const extraMeta = join(directory, id + "-source.json"), extraLines = join(directory, id + "-lines.json");
  writeFileSync(extraMeta, JSON.stringify({ ...JSON.parse(readFileSync(metadata, "utf8")), id, role }));
  writeFileSync(extraLines, JSON.stringify([{ code: "691390000", reference: "Synthetic", rates }]));
  const output = join(directory, id);
  execFileSync(process.execPath, [importer, extraMeta, extraLines, output]);
  return new TariffCatalog(data, [pathToFileURL(pack + "/"), pathToFileURL(output + "/")]);
}

function request(value = "534795", schedule: "ordinary" | "ordinary_elected" = "ordinary"): PilotQuoteRequest {
  const draft: PilotQuoteRequest = {
    orderId: "synthetic-cn-jp-order", estimateId: "synthetic-cn-jp-estimate", loadingCountry: "CN",
    plan: {
      shipment: shipment({ originCountry: "CN", destinationCountry: "JP", importDate: date,
        currency: "JPY", incoterm: "DAP", transport: "courier_unspecified", freight: "1000", insurance: "0",
        customsValue: value, customsValueConfirmed: true, japanDeclaration: { singleLineConfirmed: true, dutySchedule: schedule },
        items: [{ id: "sku", description: "Synthetic ordinary item", quantity: 1, unitValue: value,
          originCountry: "CN", goodsType: "ordinary", hs6: "691390", classificationConfirmed: true, standardTaxConfirmed: true }],
      }),
      lines: [{ itemId: "sku", tariffCode: "691390000", rateTreatment: "mfn" }],
    },
    charges: pilotChargeCategories.map(category => {
      const evidence = { id: "synthetic-" + category, sourceUrl,
        sourceType: category === "carrier_fee" ? "carrier" as const : "customs_broker" as const,
        destinationCountry: "JP", currency: "JPY", reviewedOn: date, effectiveFrom: date, effectiveThrough: date, reviewBy: date };
      const common = { evidence, timing: "import" as const, payer: "buyer" as const };
      if (category === "customs_duty" || category === "import_vat_gst") return { ...common, category, method: "japan_single_line_standard" };
      if (category === "carrier_fee") return { ...common, category, method: "confirmed_amount", amount: "550" };
      return { evidence, category, method: "not_applicable" };
    }),
  };
  return draft;
}

function quote(draft: PilotQuoteRequest, dataset = data, rates = catalog) {
  draft.reviewedShipmentDigest = pilotQuoteShipmentDigest(draft.plan, draft.orderId, draft.loadingCountry);
  return quotePilotShipment(draft, dataset, rates, now);
}

test("Japan Customs Answer 1111 line A as a single-line declaration with a separate carrier fee", () => {
  const result = quote(request());
  assert.equal(result.status, "estimated", JSON.stringify(result.findings));
  const duty = result.charges.find(line => line.category === "customs_duty")!;
  assert.equal(duty.amount?.value, "74700");
  assert.equal(duty.calculation?.ratePercent, "14");
  assert.equal(duty.calculation?.taxBase?.value, "534000");
  const vat = result.charges.find(line => line.category === "import_vat_gst")!;
  assert.equal(vat.calculation?.taxBase?.value, "609000");
  assert.equal(vat.calculation?.nationalConsumptionTax?.value, "47500");
  assert.equal(vat.calculation?.localConsumptionTax?.value, "13300");
  assert.equal(vat.amount?.value, "60800");
  assert.equal(vat.calculation?.tariffSnapshotId, "synthetic-jp-statutory-tax");
  assert.equal(result.importChargesTotal?.value, "136050");
  assert.equal(result.checkoutReady, false);
});

test("stored diagnostic quote matches its own reviewed digest and keeps fees separate", () => {
  const draft = JSON.parse(readFileSync(new URL("../examples/pilot-quote-cn-jp-standard.json", import.meta.url), "utf8"));
  const result = quotePilotShipment(draft, data, catalog, now);
  assert.equal(result.status, "estimated", JSON.stringify(result.findings));
  assert.equal(result.charges.find(line => line.category === "customs_duty")?.amount?.value, "700");
  assert.equal(result.charges.find(line => line.category === "import_vat_gst")?.amount?.value, "1900");
  assert.equal(result.importChargesTotal?.value, "3150");
});

test("VAT uses the unrounded customs value and payable duty rather than the raw duty", () => {
  const result = quote(request("201860"));
  assert.equal(result.status, "estimated", JSON.stringify(result.findings));
  const vat = result.charges.find(line => line.category === "import_vat_gst")!;
  assert.equal(vat.calculation?.taxBase?.value, "229000");
  assert.equal(vat.calculation?.nationalConsumptionTax?.value, "17800");
  assert.equal(vat.calculation?.localConsumptionTax?.value, "5000");
});

for (const [value, elected, expected] of [
  ["10000", true, "review_required"], ["10001", true, "estimated"], ["200000", false, "review_required"],
  ["200000", true, "estimated"], ["200001", false, "estimated"],
] as const) test("ordinary tariff election boundary " + value + " " + elected, () => {
  const result = quote(request(value, elected ? "ordinary_elected" : "ordinary"));
  assert.equal(result.status, expected, JSON.stringify(result.findings));
  if (expected === "review_required") assert.ok(result.findings.some(f => f.code === "JAPAN_DUTY_SCHEDULE_REVIEW"));
});

test("a reviewed free MFN rate can still produce import consumption tax", () => {
  const draft = request();
  draft.plan.lines![0]!.tariffCode = "691390001";
  const result = quote(draft);
  assert.equal(result.status, "estimated", JSON.stringify(result.findings));
  assert.equal(result.charges.find(line => line.category === "customs_duty")?.amount?.value, "0");
  assert.notEqual(result.charges.find(line => line.category === "import_vat_gst")?.amount?.value, "0");
});

const outside: [string, (draft: PilotQuoteRequest) => void][] = [
  ["unknown declaration scope", r => { delete r.plan.shipment.japanDeclaration; }],
  ["unconfirmed tax treatment", r => { r.plan.shipment.items[0]!.standardTaxConfirmed = false; }],
  ["reduced-rate goods", r => { r.plan.shipment.items[0]!.goodsType = "food"; }],
  ["unconfirmed value", r => { r.plan.shipment.customsValueConfirmed = false; }],
  ["wrong origin", r => { r.plan.shipment.items[0]!.originCountry = "US"; }],
  ["postal channel", r => { r.plan.shipment.transport = "post"; }],
  ["no reviewed domestic code", r => { r.plan.lines![0]!.tariffCode = "691390"; }],
  ["multiple items", r => { r.plan.shipment.items.push({ ...r.plan.shipment.items[0]!, id: "second" }); }],
  ["specific duty", r => { r.plan.lines![0]!.tariffCode = "691390002"; }],
  ["preferential claim", r => { delete r.plan.lines![0]!.rateTreatment; r.plan.lines![0]!.preferenceAgreement = "rcep"; }],
  ["missing paired calculation", r => { r.charges = r.charges.filter(c => c.category !== "import_vat_gst"); }],
  ["excise applies", r => { r.charges = r.charges.map(c => c.category === "excise"
    ? { category: c.category, evidence: c.evidence, method: "confirmed_amount", amount: "100", timing: "import", payer: "buyer" } : c); }],
  ["stale evidence", r => { r.charges[0]!.evidence.reviewBy = "2026-11-24"; }],
];
for (const [name, change] of outside) test(name + " holds all payable totals", () => {
  const draft = request();
  change(draft);
  const result = quote(draft);
  assert.equal(result.status, "review_required", JSON.stringify(result.findings));
  assert.equal(result.estimate, null);
  assert.ok(result.charges.every(c => c.amount === null));
});

test("changing a reviewed tariff election requires a new shipment review", () => {
  const draft = request("15000");
  draft.reviewedShipmentDigest = pilotQuoteShipmentDigest(draft.plan, draft.orderId, draft.loadingCountry);
  draft.plan.shipment.japanDeclaration!.dutySchedule = "ordinary_elected";
  const result = quotePilotShipment(draft, data, catalog, now);
  assert.ok(result.findings.some(f => f.code === "REVIEWED_SHIPMENT_MISMATCH"));
  assert.equal(result.buyerTotal, null);
});

test("inconsistent HS6 is rejected at the standard quote boundary", () => {
  const draft = request();
  draft.plan.shipment.items[0]!.hs6 = "123456";
  assert.throws(() => quote(draft), /INVALID_INPUT/);
});

test("missing dated tariff and expired statutory evidence each hold the quote", () => {
  const empty = new TariffCatalog(data, []);
  assert.equal(quote(request(), data, empty).status, "review_required");
  const stale = { ...data, sources: data.sources.map(s => s.id === "primary-jp-import-tax-calculation"
    ? { ...s, reviewBy: "2026-11-24" } : s) };
  const result = quote(request(), stale);
  assert.ok(result.findings.some(f => f.code === "JAPAN_CALCULATION_SOURCE_REVIEW"));
  assert.equal(result.buyerTotal, null);
});


test("rate phases and origin filters select only the active MFN expression", () => {
  const draft = request();
  draft.plan.lines![0]!.tariffCode = "691390003";
  const result = quote(draft);
  assert.equal(result.status, "estimated", JSON.stringify(result.findings));
  const duty = result.charges.find(c => c.category === "customs_duty")!;
  assert.equal(duty.calculation?.ratePercent, "3.8");
  assert.equal(duty.amount?.value, "20200");
});

for (const [suffix, reason] of [
  ["004", "JAPAN_TARIFF_OR_TAX_MEASURE_REVIEW"], ["005", "JAPAN_TARIFF_OR_TAX_MEASURE_REVIEW"],
  ["006", "JAPAN_EXACT_MFN_TARIFF_REQUIRED"], ["007", "JAPAN_EXACT_MFN_TARIFF_REQUIRED"],
  ["008", "JAPAN_TARIFF_OR_TAX_MEASURE_REVIEW"], ["009", "JAPAN_EXACT_MFN_TARIFF_REQUIRED"],
  ["010", "JAPAN_TARIFF_OR_TAX_MEASURE_REVIEW"],
] as const) test("an alternate domestic rate, conditional/ambiguous MFN or excise holds " + suffix, () => {
  const draft = request();
  draft.plan.lines![0]!.tariffCode = "691390" + suffix;
  const result = quote(draft);
  assert.ok(result.findings.some(f => f.code === reason), JSON.stringify(result.findings));
  assert.equal(result.buyerTotal, null);
});

test("conflicting equal-priority rate tables and supplementary levies hold for review", () => {
  const overlap = withExtraPack("overlapping-jp", [ordinaryRate("0%")]);
  const first = quote(request(), data, overlap);
  assert.ok(first.findings.some(f => f.code === "JAPAN_TARIFF_SNAPSHOT_REVIEW"));
  assert.equal(first.buyerTotal, null);
  const levy = withExtraPack("extra-jp-levy", [ordinaryRate("3%", { charge: "levy", treatment: "general" })], "measures");
  const second = quote(request(), data, levy);
  assert.ok(second.findings.some(f => f.code === "JAPAN_TARIFF_OR_TAX_MEASURE_REVIEW"));
  assert.equal(second.buyerTotal, null);
});

test("inconsistent confirmed line and declaration values are rejected", () => {
  const draft = request("534795");
  draft.plan.lines![0]!.customsValue = "534794";
  assert.throws(() => quote(draft), (error: { issues?: { code: string }[] }) =>
    error.issues?.some(issue => issue.code === "CUSTOMS_VALUE_TOTAL_MISMATCH") === true);
});
