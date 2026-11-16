import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { planCustoms } from "../src/customs-plan.ts";
import { pilotQuoteShipmentDigest, quoteWorldShipment, type WorldQuoteRequest } from "../src/pilot-quote.ts";
import { loadTariffCatalog } from "../src/tariffs.ts";
import { data, shipment } from "./helpers.ts";

const date = "2026-11-12";
const now = new Date(date + "T00:00:00Z");
const catalog = loadTariffCatalog(data);
const quoteExample = JSON.parse(readFileSync(
  new URL("../examples/worldwide-quote-br-de.json", import.meta.url), "utf8",
)) as WorldQuoteRequest;

test("published exact tariff lines with unverified eligibility stay reference-only", () => {
  for (const [destinationCountry, tariffCode, rateTreatment] of [
    ["GB", "1515601100", "mfn"],
    ["GE", "68129990000", "general"],
  ] as const) {
    const input = shipment({
      destinationCountry, importDate: date, transaction: "b2b_sale", incoterm: "DAP",
      customsValue: "100.00", customsValueConfirmed: true,
    });
    input.items[0]!.hs6 = tariffCode.slice(0, 6);
    const result = planCustoms({
      shipment: input,
      lines: [{ itemId: "line1", tariffCode, rateTreatment }],
    }, data, catalog, now);
    const line = result.lines[0]!;
    assert.equal(line.tariffReferences?.status, "schedule_reference", destinationCountry);
    assert.ok(line.tariffReferences?.matches.some(({ rates }) =>
      rates.some(({ condition }) => !!condition)), destinationCountry);
    assert.deepEqual(line.dutyScenario,
      { status: "review_required", reason: "RATE_CONDITION_REVIEW" }, destinationCountry);
    assert.equal(result.baseDutyScenario.knownSubtotal, null, destinationCountry);
  }
});

test("the EU postal flat duty rejects conflicting quote evidence and counts matching evidence once", () => {
  const request = structuredClone(quoteExample);
  request.plan.shipment.items[0]!.unitValue = "50.00";
  request.plan.shipment.transport = "post";
  request.plan.shipment.customsValue = "100.00";
  request.plan.shipment.euDeclaration = { itemCount: 2, countConfirmed: true, flatDutyTreatmentConfirmed: true };
  request.reviewedShipmentDigest = pilotQuoteShipmentDigest(request.plan, request.orderId, request.loadingCountry);
  const index = request.charges.findIndex(({ category }) => category === "customs_duty");
  const confirmed = request.charges[index]!;
  assert.equal(confirmed.method, "confirmed_amount");
  request.charges[index] = { category: "customs_duty", evidence: confirmed.evidence, method: "not_applicable" };
  const excluded = quoteWorldShipment(request, data, catalog, now);
  request.charges[index] = { ...confirmed, amount: "0.00" };
  const zero = quoteWorldShipment(request, data, catalog, now);
  for (const result of [excluded, zero]) {
    assert.equal(result.status, "review_required");
    assert.deepEqual(result.findings, [{ code: "CHARGE_CONFLICTS_WITH_APPLICABLE_RULE", category: "customs_duty" }]);
    assert.equal(result.charges.find(({ category }) => category === "customs_duty")?.amount, null);
    assert.equal(result.buyerTotal, null);
  }
  request.charges[index] = { ...confirmed, amount: "6.00" };
  const matching = quoteWorldShipment(request, data, catalog, now);
  assert.equal(matching.status, "estimated");
  assert.deepEqual(matching.buyerTotal, { currency: "EUR", value: "171.00" });
  assert.deepEqual(matching.estimate?.charges.filter(({ category }) => category === "customs_duty"),
    [{ category: "customs_duty", amount: "6.00" }]);
});

test("explicit origin customs territory is part of the reviewed shipment digest", () => {
  const { plan, orderId, loadingCountry, reviewedShipmentDigest } = quoteExample;
  assert.equal(pilotQuoteShipmentDigest(plan, orderId, loadingCountry), reviewedShipmentDigest);
  const special = { ...plan, shipment: { ...plan.shipment, originZone: "special" as const } };
  const digest = (originCustomsTerritory: string) => pilotQuoteShipmentDigest(
    { ...special, originCustomsTerritory }, orderId, loadingCountry,
  );
  assert.notEqual(digest("TERRITORY_A"), digest("TERRITORY_B"));
});
