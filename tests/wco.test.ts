import test from "node:test";
import assert from "node:assert/strict";
import { loadTariffCatalog } from "../src/tariffs.ts";
import { createHandler } from "../src/http.ts";
import { data } from "./helpers.ts";

const tariffs = loadTariffCatalog(data);
const date = "2026-11-11";

test("WCO crosswalk has 187 unique members and records the EU separately", () => {
  const report = tariffs.wcoCoverage(date);
  const ids = new Set(report.members.map(({ memberId }) => memberId));
  assert.equal(ids.size, 187);
  assert.equal(report.memberCount, 187);
  assert.equal(report.membersWithOfficialSources, 187);
  for (const code of ["BM", "CW", "HK", "MO", "XK"]) assert.ok(ids.has(code));
  for (const code of ["EU", "PR", "TW", "LI"]) assert.ok(!ids.has(code));
  assert.equal(report.members.find(({ memberId }) => memberId === "XK")?.iso2, null);
  assert.equal(report.affiliates[0]?.memberId, "EU");
  assert.equal(report.affiliates[0]?.lookupDestinations.length, 27);
  assert.equal(report.affiliates[0]?.countsAsMember, false);
  assert.equal(report.affiliates[0]?.membershipStatus, "akin_to_wco_membership");
  assert.equal(report.members.find(({ memberId }) => memberId === "FR")?.status,
    "tariff_reference_on_date");
});

test("WCO date metrics partition the roster and leave uncovered rates unresolved", () => {
  const report = tariffs.wcoCoverage(date);
  assert.equal(report.membersWithTariffReferencesOnDate +
    report.membersWithTariffReferencesOtherDatesOnly +
    report.membersWithOfficialSourcesOnly + report.membersWithMembershipOnly, 187);
  assert.equal(report.allMemberTaxRatesComplete, false);
  const later = tariffs.wcoCoverage("2100-01-01");
  assert.equal(later.membersWithTariffReferencesOnDate, 0);
  assert.equal(later.membersWithImportMeasuresOnDate, 0);
  assert.equal(later.membersWithTariffReferences, report.membersWithTariffReferences);
  assert.throws(() => tariffs.wcoCoverage("2026-02-29"), { message: "INVALID_INPUT" });
  const pending = report.members.find((member) => member.status === "official_sources_only");
  assert.ok(pending);
  const result = tariffs.lookup({ destinationCountry: pending.memberId, code: "090121", date });
  assert.equal(result.status, "source_not_loaded");
  assert.equal(result.applicableRate, null);
  assert.ok(pending.officialSources.some(({ url }) => result.sourceLinks.includes(url)));
});

test("WCO coverage endpoint applies auth and validates the import date", async () => {
  const key = "synthetic-service-key-minimum-32-characters";
  const handler = createHandler({
    dataset: data,
    tariffs,
    apiKey: key,
    now: () => new Date("2026-11-10T16:00:00Z"),
  });
  const path = "http://localhost/v1/tariffs/coverage/wco";
  const peer = { peer: "127.0.0.1" };
  const headers = { authorization: "Bearer " + key };
  assert.equal((await handler(new Request(path), peer)).status, 401);
  const response = await handler(new Request(path, { headers }), peer);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal((await response.json()).referenceDate, date);
  for (const query of ["?date=2026-02-31", "?date=", "?date=2026-11-11&date=2026-11-12"]) {
    assert.equal((await handler(new Request(path + query, { headers }), peer)).status, 400);
  }
});

test("All 62 destinations outside the WCO roster have scoped sources", () => {
  const report = tariffs.territoryCoverage(date);
  const ids = new Set(report.nonMemberDestinations.map(({ destinationCountry }) => destinationCountry));
  assert.equal(ids.size, 62);
  assert.equal(report.nonMemberDestinationsWithOfficialSources, 62);
  assert.equal(report.allNonMemberTaxRatesComplete, false);
  for (const code of ["BQ", "NC", "PR", "SX", "TW", "VA"]) assert.ok(ids.has(code));
  for (const code of ["AQ", "EU", "HK", "MO", "XK"]) assert.ok(!ids.has(code));
  assert.equal(report.nonMemberDestinations.find(({ destinationCountry }) => destinationCountry === "NC")?.status,
    "tariff_reference_on_date");
  const pr = tariffs.lookup({ destinationCountry: "PR", code: "090121", date });
  const us = tariffs.lookup({ destinationCountry: "US", code: "090121", date });
  assert.equal(pr.snapshot?.id, "us-hts-2026-r23");
  assert.ok(pr.totalMatches > 0);
  assert.deepEqual(pr.matches, us.matches);
  assert.equal(tariffs.lookup({ destinationCountry: "VI", code: "090121", date }).snapshot, null);
});

test("General duty policies preserve tax and customs boundaries", () => {
  const report = tariffs.territoryCoverage(date);
  assert.ok(report.generalDutyPolicies.some(({ destinationCountry, treatment }) =>
    destinationCountry === "SG" && treatment === "most_goods_zero"));
  const bq = tariffs.lookup({ destinationCountry: "BQ", code: "090121", date });
  assert.equal(bq.status, "source_not_loaded");
  assert.equal(bq.generalDutyPolicy?.treatment, "general_zero");
  assert.match(bq.generalDutyPolicy?.otherChargesAndControls ?? "", /ABB/);
  assert.equal(bq.applicableRate, null);
  assert.deepEqual(bq.matches, []);
  assert.equal(tariffs.lookup({ destinationCountry: "SJ", code: "090121", date }).generalDutyPolicy, null);
  assert.equal(tariffs.lookup({
    destinationCountry: "SJ", code: "090121", date, zone: "special", customsTerritory: "SVALBARD",
  }).generalDutyPolicy?.customsTerritory, "SVALBARD");
  assert.equal(tariffs.lookup({
    destinationCountry: "HK", code: "090121", date: "2100-01-01",
  }).generalDutyPolicy, null);
  const hongKong = tariffs.lookup({ destinationCountry: "HK", code: "01012100", date });
  assert.equal(hongKong.matches[0]?.rates[0]?.adValoremPercent, "0");
});

test("Customs assistant returns non-member evidence without a tariff code", async () => {
  const key = "synthetic-service-key-minimum-32-characters";
  const handler = createHandler({ dataset: data, tariffs, apiKey: key });
  const peer = { peer: "127.0.0.1" };
  const headers = { authorization: "Bearer " + key, "content-type": "application/json" };
  const list = await handler(new Request("http://localhost/v1/tariffs/coverage/territories?date=" + date, { headers }), peer);
  assert.equal(list.status, 200);
  assert.equal((await list.json()).nonMemberDestinationCount, 62);
  const response = await handler(new Request("http://localhost/v1/ask", {
    method: "POST",
    headers,
    body: JSON.stringify({ question: "輸入関税や通関手続を知りたい", destinationCountry: "BQ", importDate: date }),
  }), peer);
  assert.equal(response.status, 200);
  const answer = await response.json();
  assert.equal(answer.destinationCustomsProfile?.membershipStatus, "outside_wco_roster");
  assert.equal(answer.destinationCustomsProfile?.generalDutyPolicy?.treatment, "general_zero");
  assert.ok(answer.destinationCustomsProfile?.officialSources.length);
  assert.equal(answer.numericQuote, null);
});
