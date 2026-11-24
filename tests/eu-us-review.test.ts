import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { ask } from "../src/assistant.ts";
import { currentRule } from "../src/dataset.ts";
import { createDataReviewReport } from "../src/data-review.ts";
import { assess } from "../src/engine.ts";
import { data, shipment } from "./helpers.ts";

const reviewedAt = new Date("2026-11-22T00:00:00Z");
const targetIds = [
  "primary-eu-law", "primary-eu-guidance", "primary-eu-declaration-item",
  "primary-eu-union-handling-fee", "primary-us-de-minimis",
  "primary-us-nonpostal-suspension", "primary-us-postal-suspension",
  "primary-us-postal-delayed-compliance", "primary-eu-duty-handling-guidance",
  "primary-us-postal-entry13-modification",
];

// Regulation 2026/1022 Art 1(1)(a), Art 2(2)-(3): the changed definition
// applies from July; the November boundary concerns PID data, not transport.
for (const importDate of ["2026-07-01", "2026-10-31", "2026-11-01", "2026-11-22"])
  for (const transport of ["post", "courier_unspecified"] as const) {
    test(`EU ${importDate} ${transport}: confirmation, not transport, enables flat duty`, () => {
      const request = shipment({ destinationCountry: "DE", currency: "EUR", importDate, transport,
        euDeclaration: { itemCount: 1, countConfirmed: true } });
      for (const flatDutyTreatmentConfirmed of [undefined, false, true]) {
        request.euDeclaration = { itemCount: 1, countConfirmed: true };
        if (flatDutyTreatmentConfirmed !== undefined)
          request.euDeclaration.flatDutyTreatmentConfirmed = flatDutyTreatmentConfirmed;
        const result = assess(request, data, reviewedAt);
        assert.equal(result.charges.find(c => c.kind === "customs_duty")?.amount.value,
          flatDutyTreatmentConfirmed ? "3.00" : undefined);
        assert.equal(result.findings.some(f => f.code === "EU_PROCEDURE_REVIEW"), !flatDutyTreatmentConfirmed);
        assert.equal(result.findings.some(f => f.code === "EU_HANDLING_FEE_REVIEW"), importDate >= "2026-11-01");
        assert.equal(result.landedCostTotal, null);
      }
    });
  }

test("EU quantity, exact threshold, PID date and unresolved UHF remain separate", () => {
  const request = shipment({ destinationCountry: "FR", currency: "EUR", regime: "ioss",
    euDeclaration: { itemCount: 2, countConfirmed: true } });
  request.items[0] = { ...request.items[0]!, quantity: 10, unitValue: "15.00" };
  delete request.items[0]!.productIdentifier;
  for (const importDate of ["2026-10-31", "2026-11-01"]) {
    const result = assess({ ...request, importDate }, data, reviewedAt);
    assert.equal(result.charges.find(c => c.kind === "customs_duty")?.amount.value, "6.00");
    assert.equal(result.findings.some(f => f.code === "EU_PRODUCT_ID_REQUIRED"), importDate >= "2026-11-01");
    assert.ok(result.unknownCharges.includes("handling"));
  }
  request.items[0]!.unitValue = "15.01";
  assert.equal(assess(request, data, reviewedAt).charges.length, 0);
});

test("the November 25 audit covers every renewed source and preserves first observation dates", () => {
  const originalCheckedOn: Record<string, string> = {
    "primary-eu-law": "2026-11-11", "primary-eu-guidance": "2026-11-11",
    "primary-us-de-minimis": "2026-11-11",
    "primary-eu-duty-handling-guidance": "2026-11-22",
    "primary-us-postal-entry13-modification": "2026-11-22",
  };
  const audit = JSON.parse(readFileSync(new URL("../docs/EU_US_SOURCE_REVIEW_20261125.json", import.meta.url), "utf8"));
  assert.deepEqual(audit.sources.map((row: {sourceId: string}) => row.sourceId).sort(), [...targetIds].sort());
  assert.equal(audit.reviewedOn, "2026-11-25");
  assert.equal(audit.dataset, data.version);
  assert.equal(audit.reviewBy, "2026-12-02");
  for (const id of targetIds) {
    const source = data.sources.find(row => row.id === id)!;
    assert.equal(source.reviewBy, audit.reviewBy, id);
    assert.equal(source.checkedOn, originalCheckedOn[id] ?? "2026-11-12", id);
  }
  const rule = data.rules.find(row => row.id === "EU_TEMP_LOW_VALUE")!;
  assert.equal(rule.reviewBy, audit.reviewBy);
  assert.equal(rule.validFrom, "2026-07-01");
  assert.equal(rule.validTo, "2028-07-01");
  const report = createDataReviewReport(data, { date: "2026-11-25" });
  assert.ok(targetIds.every(id => report.primarySourcesUpcoming.some(row => row.id === id)));
  assert.ok(report.activeRulesUpcoming.some(row => row.id === rule.id));
});

test("EU fails closed at the JST review boundary even for a backdated import", () => {
  const request = shipment({ destinationCountry: "DE", currency: "EUR", regime: "ioss",
    importDate: "2026-11-22", euDeclaration: { itemCount: 1, countConfirmed: true } });
  assert.equal(assess(request, data, new Date("2026-12-02T14:59:59Z")).charges.length, 1);
  const expired = assess(request, data, new Date("2026-12-02T15:00:00Z"));
  assert.equal(expired.charges.length, 0);
  assert.ok(expired.findings.some(f => f.code === "RULE_NOT_CURRENT"));
});

test("EU legal end is exclusive independently of review deadlines (synthetic refreshed fixture)", () => {
  const synthetic = structuredClone(data);
  for (const source of synthetic.sources) source.reviewBy = "2029-01-01";
  synthetic.rules.find(r => r.id === "EU_TEMP_LOW_VALUE")!.reviewBy = "2029-01-01";
  assert.equal(currentRule(synthetic, "EU_TEMP_LOW_VALUE", "2026-06-30", reviewedAt), null);
  assert.ok(currentRule(synthetic, "EU_TEMP_LOW_VALUE", "2026-07-01", reviewedAt));
  assert.ok(currentRule(synthetic, "EU_TEMP_LOW_VALUE", "2028-06-30", reviewedAt));
  assert.equal(currentRule(synthetic, "EU_TEMP_LOW_VALUE", "2028-07-01", reviewedAt), null);
});

for (const transport of ["post", "air"] as const)
  for (const value of ["799.99", "800.00", "800.01", "2500.00", "2500.01"])
    test(`US ${transport} USD ${value}: neither exemption nor postal tax rate is inferred`, () => {
      const request = shipment({ destinationCountry: "US", currency: "USD", transport, importDate: "2026-11-22" });
      request.items[0]!.unitValue = value;
      const result = assess(request, data, reviewedAt);
      assert.equal(result.charges.length, 0);
      assert.equal(result.status, "needs_review");
      assert.equal(result.estimatedTaxSubtotal, null);
      assert.equal(result.landedCostTotal, null);
      assert.ok(result.findings.some(f => f.code === "US_REVIEW"));
      const expected = transport === "post"
        ? ["primary-us-postal-suspension", "primary-us-postal-delayed-compliance"]
        : ["primary-us-nonpostal-suspension"];
      assert.ok(expected.every(id => result.sourceIds.includes(id)));
      assert.equal(result.sourceIds.includes("primary-us-postal-delayed-compliance"), transport === "post");
    });

test("new postal transition evidence is unavailable before observation, after review and at its legal boundary", async () => {
  const find = async (importDate: string, now: Date) => (await ask({
    question: "US postal entry documents", destinationCountry: "US", importDate,
  }, data, undefined, now)).evidence.find(row => row.id === "us-postal-compliance-transition");
  assert.equal((await find("2026-11-22", new Date("2026-11-21T14:59:59Z")))?.expired, true);
  assert.equal((await find("2026-11-22", new Date("2026-11-21T15:00:00Z")))?.expired, false);
  assert.equal((await find("2026-11-22", new Date("2026-12-02T15:00:00Z")))?.expired, true);
  assert.equal((await find("2027-01-20", reviewedAt))?.expired, true);
  assert.equal((await find("2026-10-21", reviewedAt))?.expired, true);
  // Isolate the transition end from the operational review expiry. This refresh
  // isolates the legal end from the current weekly review window.
  const synthetic = structuredClone(data);
  for (const source of synthetic.sources) source.reviewBy = "2027-02-01";
  for (const [importDate, expired] of [["2027-01-19", false], ["2027-01-20", true]] as const) {
    const answer = await ask({ question: "US postal entry documents", destinationCountry: "US", importDate },
      synthetic, undefined, new Date("2027-01-19T00:00:00Z"));
    assert.equal(answer.evidence.find(row => row.id === "us-postal-compliance-transition")?.expired, expired);
  }
});

test("nonpostal procedure cites the effective rule and labels October NPRM as proposed", () => {
  const records = JSON.parse(readFileSync(new URL("../data/special-procedures.json", import.meta.url), "utf8"));
  const row = records.find((p: { id: string }) => p.id === "us_nonpostal_no_de_minimis");
  assert.ok(row.sources.some((s: { url: string }) => s.url.endsWith("2026-12670.htm")));
  assert.match(row.sources.find((s: { url: string }) => s.url.endsWith("2026-20650.htm")).title, /proposed rule/);
});
