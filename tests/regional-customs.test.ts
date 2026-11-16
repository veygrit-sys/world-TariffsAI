import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Ajv } from "ajv";
import addFormatsModule from "ajv-formats";
import { planCustoms } from "../src/customs-plan.ts";
import { rolloutMarket } from "../src/rollout-market.ts";
import { loadTariffCatalog } from "../src/tariffs.ts";
import { worldDirection, worldDirectionCoverage } from "../src/world-directions.ts";
import { data, shipment } from "./helpers.ts";

const catalog = loadTariffCatalog(data);
const date = "2026-11-12";
const now = new Date(date + "T00:00:00Z");

function direction(originCountry: string, destinationCountry: string, referenceDate = date) {
  return worldDirection({ originCountry, destinationCountry, date: referenceDate }, data, catalog, now);
}

test("reversing a shipment switches the official import procedure to its new destination", () => {
  const toEurope = direction("JP", "DE");
  const toAsia = direction("DE", "JP");
  const germany = toEurope.destinationProcedures;
  const japan = toAsia.destinationProcedures;
  assert.ok(germany && japan);
  assert.equal(germany.country, "DE");
  assert.equal(germany.pass, 3);
  assert.equal(japan.country, "JP");
  assert.equal(japan.pass, 2);
  for (const profile of [germany, japan]) {
    assert.equal(profile.status, "official_procedure");
    assert.match(profile.reviewedOn, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(profile.guidance.length);
  }
  assert.notDeepEqual(germany.sources.map(({ url }) => url), japan.sources.map(({ url }) => url));
  assert.equal(toEurope.productionAuthorized, false);
  assert.equal(toAsia.productionAuthorized, false);
});

test("regional procedure counts match the distinct imported profiles and keep the original directional totals", () => {
  const coverage = worldDirectionCoverage(data, catalog, date, now);
  const regionalCounts = new Map([
    [2, { registry: 0, references: 0, procedures: 0 }],
    [3, { registry: 0, references: 0, procedures: 0 }],
    [4, { registry: 0, references: 0, procedures: 0 }],
    [5, { registry: 0, references: 0, procedures: 0 }],
    [6, { registry: 0, references: 0, procedures: 0 }],
  ]);
  const registry = [...data.countries, ...data.supplementalRegions].filter(({ inScope }) => inScope);
  for (const { code } of registry) {
    const pass = rolloutMarket(code)?.pass;
    const count = pass === undefined ? undefined : regionalCounts.get(pass);
    if (!count) continue;
    const profile = direction("US", code).destinationProcedures;
    assert.ok(profile, code);
    assert.equal(profile.country, code);
    assert.equal(profile.pass, pass);
    count.registry++;

    const sourceUrls = new Set(profile.sources.map(({ url }) => url));
    for (const source of profile.sources) {
      assert.equal(new URL(source.url).protocol, "https:", code);
      assert.ok(source.authority && source.title, code);
    }
    for (const guidance of profile.guidance) {
      assert.ok(guidance.textJa.length > 0 && guidance.sourceUrls.length > 0, code);
      assert.ok(guidance.sourceUrls.every((url) => sourceUrls.has(url)), code);
    }
    if (profile.status === "official_procedure") {
      assert.ok(sourceUrls.size > 0 && profile.guidance.length > 0, code);
      count.procedures++;
    }
    if (profile.status === "official_reference" || profile.status === "official_procedure") {
      assert.ok(sourceUrls.size > 0, code);
      count.references++;
    }
  }

  assert.equal(regionalCounts.get(2)?.registry, 33);
  assert.equal(regionalCounts.get(3)?.registry, 52);
  assert.equal(regionalCounts.get(4)?.registry, 57);
  assert.equal(regionalCounts.get(5)?.registry, 78);
  assert.equal(regionalCounts.get(6)?.registry, 29);
  for (const row of coverage.passes) {
    assert.equal(row.withVerifiedImportProcedures, regionalCounts.get(row.pass)?.procedures ?? 0);
    assert.equal(row.withRegionalOfficialReferences, regionalCounts.get(row.pass)?.references ?? 0);
  }
  for (const key of ["withVerifiedImportProcedures", "withRegionalOfficialReferences"] as const) {
    assert.equal(coverage.totals[key], coverage.passes.reduce((sum, row) => sum + row[key], 0));
  }
  const historical = worldDirectionCoverage(data, catalog, "2026-11-11", now);
  assert.equal(historical.totals.withStandardTariffReferenceOnDate, 86);
  for (const row of [coverage, historical]) {
    assert.equal(row.totals.distinctDirections, 61_752);
    assert.equal(row.totals.candidateDirections, 61_256);
    assert.equal(row.totals.productionVerifiedDirections, 0);
  }
});

test("a regional profile preserves the North Korea exclusion and does not suggest coverage outside the two passes", () => {
  const blocked = direction("JP", "KP");
  assert.equal(blocked.destinationProcedures?.status, "excluded");
  assert.equal(blocked.tradePolicy?.status, "blocked");
  assert.equal(blocked.tradePolicy?.shippingAuthorized, false);
  assert.equal(direction("KP", "DE").tradePolicy?.status, "blocked");
  assert.equal(direction("JP", "AQ").destinationProcedures, null);
});

test("a customs plan exposes the same destination guidance without supplying unrequested amounts", () => {
  const spec = JSON.parse(readFileSync(new URL("../docs/openapi.json", import.meta.url), "utf8"));
  const ajv = new Ajv({ strict: true, allowUnionTypes: true });
  (addFormatsModule as unknown as (instance: Ajv) => void)(ajv);
  const validate = ajv.compile(spec.components.schemas.CustomsPlan);
  for (const [originCountry, destinationCountry, currency] of [
    ["JP", "DE", "EUR"],
    ["DE", "JP", "JPY"],
  ] as const) {
    const draft = shipment({
      originCountry, destinationCountry, currency, importDate: date, taxEvidenceConfirmed: false,
    });
    const request = { shipment: { ...draft, freight: "10", insurance: "0",
      items: draft.items.map(({ hs6: _hs6, ...item }) => ({
        ...item, originCountry, unitValue: "100",
      })),
    } };
    const plan = planCustoms(request, data, catalog, now);
    assert.ok(validate(plan), JSON.stringify(validate.errors));
    assert.equal(plan.destination?.destinationCountry, destinationCountry);
    assert.equal(plan.destinationProcedures?.country, destinationCountry);
    assert.deepEqual(plan.destinationProcedures, direction(originCountry, destinationCountry).destinationProcedures);
    assert.equal(plan.baseDutyScenario.knownSubtotal, null);
    assert.equal(plan.checkout.landedCostTotal, null);
    assert.equal(plan.checkout.shippingAuthorized, false);
    assert.ok(plan.handoff.documents.some(({ code }) => code === "IMPORT_DECLARATION"));
  }
});

test("European territories with differing customs and tax treatment go to review in both directions", () => {
  for (const [territory, counterpart] of [
    ["AX", "FI"], ["MC", "FR"], ["SM", "IT"], ["GI", "ES"],
    ["GG", "GB"], ["IM", "GB"], ["JE", "GB"], ["AD", "FR"], ["CH", "LI"],
  ] as const) {
    for (const [originCountry, destinationCountry] of [[territory, counterpart], [counterpart, territory]] as const) {
      assert.equal(direction(originCountry, destinationCountry).territoryReviewRequired, true);
      const input = shipment({
        originCountry, destinationCountry, currency: "EUR", importDate: date,
        customsValue: "100", customsValueConfirmed: true,
      });
      const plan = planCustoms({
        shipment: input,
        lines: [{ itemId: "line1", tariffCode: "69120023", rateTreatment: "mfn" }],
      }, data, catalog, now);
      assert.equal(plan.handoff.status, "route_review");
      assert.equal(plan.checkout.shippingAuthorized, false);
      assert.equal(plan.baseDutyScenario.knownSubtotal, null);
      assert.deepEqual(plan.lines[0]?.dutyScenario, { status: "review_required", reason: "IMPORT_PROCEDURE_REVIEW" });
    }
  }
  assert.equal(direction("FR", "DE").territoryReviewRequired, false);
  assert.equal(direction("JP", "GB").territoryReviewRequired, false);
  assert.equal(direction("FR", "DE").standardTerritoryRoute, "eu_intra_union");
});

test("reviewed tariff references retain their dates, source and published base-rate columns", () => {
  for (const [destinationCountry, code, treatment, percent] of [
    ["JP", "610910020", "mfn", "7.4"],
    ["CN", "61091000", "mfn", "6"],
  ] as const) {
    const request = { destinationCountry, originCountry: "DE", code };
    const old = catalog.lookup({ ...request, date: "2026-11-11" });
    const current = catalog.lookup({ ...request, date });
    assert.ok(current.snapshot && old.snapshot);
    assert.notEqual(current.snapshot.id, old.snapshot.id);
    assert.equal(current.snapshot.availableFrom, date);
    assert.equal(current.snapshot.availableThrough, date);
    assert.equal(current.matches.flatMap(({ rates }) => rates)
      .find((rate) => rate.treatment === treatment)?.adValoremPercent, percent);
    assert.equal(current.applicableRate, null);
    assert.equal(catalog.lookup({ ...request, date: "2026-11-13" }).status, "date_not_covered");
  }
});

test("an eight-digit UK heading stays a candidate while a ten-digit import code can be priced", () => {
  const draft = shipment({
    originCountry: "DE", destinationCountry: "GB", currency: "GBP", importDate: date,
    transaction: "b2b_sale", customsValue: "100", customsValueConfirmed: true,
  });
  const request = { shipment: { ...draft, items: draft.items.map((item) => ({
    ...item, originCountry: "DE", hs6: "620342",
  })) } };
  const heading = planCustoms({ ...request, lines: [{
    itemId: "line1", tariffCode: "62034231", rateTreatment: "mfn",
  }] }, data, catalog, now);
  assert.equal(heading.lines[0]?.classification, "candidate");
  assert.deepEqual(heading.lines[0]?.dutyScenario,
    { status: "review_required", reason: "EXACT_TARIFF_LINE_REQUIRED" });
  assert.equal(heading.baseDutyScenario.knownSubtotal, null);
  const exact = planCustoms({ ...request, lines: [{
    itemId: "line1", tariffCode: "6203423100", rateTreatment: "mfn",
  }] }, data, catalog, now);
  assert.equal(exact.lines[0]?.classification, "confirmed");
  assert.deepEqual(exact.baseDutyScenario.knownSubtotal, { currency: "GBP", value: "12.00" });
});

test("a TARIC daily change retains its exact import date, producer conditions and origin scope", () => {
  const request = { code: "7411109010", originCountry: "CN", destinationCountry: "DE", date };
  const measureId = "eu-taric-provisional-inserts-20261112";
  const result = catalog.lookup(request);
  assert.equal(result.applicableRate, null);
  const rows = result.measures.matches.filter((match) => match.snapshotId === measureId);
  assert.ok(rows.length);
  const rates = rows.flatMap((row) => row.rates);
  assert.ok(rates.some((rate) => rate.adValoremPercent === "33.500" && rate.condition?.includes("D008")));
  assert.ok(rates.some((rate) => rate.adValoremPercent === "51.500"));
  for (const next of [{ ...request, originCountry: "JP" }, { ...request, date: "2026-11-13" }]) {
    assert.ok(!catalog.lookup(next).measures.matches.some((match) => match.snapshotId === measureId));
  }
});

test("EAEU partners go to common-territory review and external routes stay eligible for tariff references", () => {
  for (const [originCountry, destinationCountry] of [["KG", "KZ"], ["KZ", "KG"], ["AM", "KZ"]] as const) {
    assert.equal(direction(originCountry, destinationCountry).territoryReviewRequired, true);
    const input = shipment({
      originCountry, destinationCountry, currency: "USD", importDate: date,
      customsValue: "100", customsValueConfirmed: true, transaction: "b2b_sale",
    });
    const plan = planCustoms({
      shipment: input,
      lines: [{ itemId: "line1", tariffCode: "6912002300", rateTreatment: "mfn" }],
    }, data, catalog, now);
    assert.equal(plan.handoff.status, "route_review");
    assert.equal(plan.baseDutyScenario.knownSubtotal, null);
    assert.equal(plan.checkout.shippingAuthorized, false);
  }
  assert.equal(direction("JP", "KG").territoryReviewRequired, false);
  assert.equal(direction("KG", "JP").territoryReviewRequired, false);
});

test("new Asia schedules preserve native tariff codes, published treatments and observation dates", () => {
  for (const [destinationCountry, code, treatment, expression] of [
    ["MO", "69120000", "general", "0%"],
    ["SG", "22030011", "general", "SGD 16.00 per litre of alcohol"],
    ["MY", "0401109000", "general", "5%"],
    ["BN", "33030000", "general", "5%"],
    ["MM", "6109101000", "mfn", "20%"],
    ["TJ", "6109100000", "general", "17%"],
    ["UZ", "9003110000", "general", "5%"],
    ["KR", "8517130000", "general", "8%"],
  ] as const) {
    const input = { destinationCountry, originCountry: "JP", code };
    const result = catalog.lookup({ ...input, date });
    assert.equal(result.snapshot?.availableThrough, date, destinationCountry);
    assert.ok(result.matches.some((row) => row.code === code &&
      row.rates.some((rate) => rate.treatment === treatment && rate.expression === expression)), destinationCountry);
    assert.equal(result.applicableRate, null);
    assert.equal(catalog.lookup({ ...input, date: "2026-11-13" }).status, "date_not_covered", destinationCountry);
  }
});

test("the scoped Indian statutory reference is visible but cannot be used as a published duty calculation", () => {
  const input = shipment({
    destinationCountry: "IN", currency: "USD", importDate: date,
    customsValue: "100", customsValueConfirmed: true, transaction: "b2b_sale",
  });
  input.items = input.items.map((item) => ({ ...item, hs6: "841590" }));
  const result = planCustoms({ shipment: input, lines: [
    { itemId: "line1", tariffCode: "84159010", rateTreatment: "general" },
  ] }, data, catalog, now);
  assert.equal(result.tariffCoverage.status, "reference_for_date");
  assert.ok(result.lines[0]?.tariffReferences?.matches.some(({ rates }) =>
    rates.some((rate) => rate.expression === "20%")));
  assert.deepEqual(result.lines[0]?.dutyScenario,
    { status: "review_required", reason: "DATED_PUBLISHED_TARIFF_REQUIRED" });
  assert.equal(result.baseDutyScenario.knownSubtotal, null);
});

test("a published tariff contact without dated rates never implies zero duty", () => {
  const input = shipment({
    destinationCountry: "MV", currency: "USD", importDate: date,
    customsValue: "100", customsValueConfirmed: true, transaction: "b2b_sale",
  });
  const result = planCustoms({ shipment: input, lines: [
    { itemId: "line1", tariffCode: "69120000", rateTreatment: "general" },
  ] }, data, catalog, now);
  assert.ok(result.destinationProcedures?.guidance.some(({ topic }) => topic === "tariff"));
  assert.equal(result.baseDutyScenario.knownSubtotal, null);
});
