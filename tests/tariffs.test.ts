import assert from "node:assert/strict";
import test from "node:test";
import { ask } from "../src/assistant.ts";
import { loadDataset } from "../src/dataset.ts";
import { createHandler } from "../src/http.ts";
import { loadTariffCatalog } from "../src/tariffs.ts";

const dataset = loadDataset();
const catalog = loadTariffCatalog(dataset);

const officialCases = [
  ["JP", "0901.21-000", "mfn", "12"],
  ["CN", "0101.2900", "mfn", "10"],
  ["US", "0101.30.00.00", "mfn", "6.8"],
  ["CA", "0101210000", "general", "35"],
  ["DE", "01012990", "mfn", "11.5"],
  ["GB", "0901210000", "mfn", "6.00"],
  ["BR", "01013000", "mfn", "3.6"],
] as const;

for (const [country, code, treatment, expected] of officialCases) {
  test(`${country} exposes the published reference rate and preserves the product code`, () => {
    const result = catalog.lookup({ destinationCountry: country, code });
    assert.equal(result.status, "schedule_reference");
    assert.ok(result.snapshot?.sourceUrl.startsWith("https://"));
    assert.equal(result.matches[0]?.code, code.replace(/[. -]/g, ""));
    assert.equal(
      result.matches[0]?.rates.find((rate) => rate.treatment === treatment)
        ?.adValoremPercent,
      expected,
    );
    assert.equal(result.applicableRate, null);
  });
}

test("a US statistical suffix identifies its duty line and HS6 results can be paged", () => {
  const parent = catalog.lookup({
    destinationCountry: "US",
    code: "0101210010",
  });
  assert.equal(parent.matches[0]?.rateCode, "01012100");
  const first = catalog.lookup({
    destinationCountry: "US",
    code: "010121",
    limit: 1,
  });
  assert.equal(first.status, "national_line_candidates");
  assert.ok(first.nextOffset && first.totalMatches > 1);
  const next = catalog.lookup({
    destinationCountry: "US",
    code: "010121",
    limit: 1,
    offset: first.nextOffset,
  });
  assert.notEqual(first.matches[0]?.code, next.matches[0]?.code);
});

test("compound and specific tariffs retain their expressions", () => {
  const eu = catalog.lookup({ destinationCountry: "FR", code: "02023010" });
  assert.match(eu.matches[0]!.rates[0]!.expression, /221,1.*100 kg\/net/);
  assert.equal(eu.matches[0]!.rates[0]!.adValoremPercent, null);
  const nz = catalog.lookup({ destinationCountry: "NZ", code: "2105002100" });
  assert.equal(nz.status, "schedule_reference");
  assert.ok(
    nz.matches[0]?.rates.some(
      (rate) =>
        rate.expression.includes("formula 4") && rate.adValoremPercent === null,
    ),
  );
});

test("missing schedules, unresolved territories, dates and rates have different outcomes", () => {
  const missing = catalog.lookup({ destinationCountry: "ER", code: "090121" });
  assert.equal(missing.status, "source_not_loaded");
  assert.deepEqual(missing.matches, []);
  assert.equal(
    catalog.lookup({
      destinationCountry: "GB",
      zone: "special",
      code: "090121",
    }).status,
    "territory_unresolved",
  );
  assert.equal(
    catalog.lookup({
      destinationCountry: "JP",
      code: "090121000",
      date: "2027-01-01",
    }).status,
    "date_not_covered",
  );
  assert.equal(
    catalog.lookup({ destinationCountry: "GB", code: "0101000000" }).status,
    "rate_not_reported",
  );
  assert.equal(
    catalog.lookup({ destinationCountry: "JP", code: "000000000" }).status,
    "code_not_found",
  );
});

test("new tariff schedules preserve national codes and regional provenance", () => {
  for (const [destinationCountry, code, expected, territory] of [
    ["AU", "0101.21.00", "0", "AU"],
    ["TW", "01012100003", "2.5", "TW"],
    ["MX", "0101210100", "10", "MX"],
    ["BW", "090121", null, "SACU"],
    ["KE", "09012100", "35", "EAC"],
    ["KR", "0101211000", "0", "KR"],
  ] as const) {
    const result = catalog.lookup({ destinationCountry, code });
    assert.equal(result.snapshot?.jurisdiction, territory);
    assert.equal(result.matches[0]?.rates[0]?.adValoremPercent, expected);
  }
});

test("the historical compilation has a distinct scope and reference date", () => {
  const historical = catalog
    .coverage()
    .snapshots.find(
      (source) =>
        source.scope === "compiled_reference" &&
        source.countries.includes("PE"),
    );
  assert.ok(historical);
  const request = {
    destinationCountry: "PE",
    code: "0101291000",
    snapshotId: historical.id,
  };
  const result = catalog.lookup(request);
  assert.equal(result.snapshot?.scope, "compiled_reference");
  assert.equal(result.referenceDate, "2025-12-31");
  assert.equal(result.matches[0]?.rates[0]?.adValoremPercent, "6");
  assert.equal(
    catalog.lookup({ ...request, date: "2026-11-11" }).status,
    "date_not_covered",
  );
  const cambodia = catalog.lookup({
    destinationCountry: "KH",
    code: "01012100",
    date: "2025-12-31",
  });
  assert.equal(
    cambodia.measures.matches[0]?.rates.find(
      (rate) => rate.charge === "import_vat",
    )?.adValoremPercent,
    "10",
  );
});

test("the amended Peru tariff is available on the import date", () => {
  const result = catalog.lookup({
    destinationCountry: "PE",
    code: "0208.90.00.10",
    date: "2026-11-11",
  });
  assert.equal(result.status, "schedule_reference");
  assert.equal(result.snapshot?.id, "pe-sunat-nandina-2022-amended");
  assert.equal(result.matches[0]?.rates[0]?.adValoremPercent, "6");
});

test("the Central American schedule retains national exceptions", () => {
  for (const [destinationCountry, rate] of [
    ["GT", "15"],
    ["SV", "30"],
  ]) {
    const result = catalog.lookup({
      destinationCountry,
      code: "0201100000",
      date: "2026-11-11",
    });
    assert.equal(result.matches[0]?.rates[0]?.adValoremPercent, rate);
  }
});

test("Singapore keeps volume-based customs duty and excise as separate candidates", () => {
  const result = catalog.lookup({
    destinationCountry: "SG",
    code: "22030011",
    date: "2026-11-11",
  });
  assert.equal(result.snapshot?.id, "sg-customs-first-schedule-2026-10");
  assert.equal(
    result.matches[0]?.rates[0]?.expression,
    "SGD 16.00 per litre of alcohol",
  );
  assert.ok(
    result.measures.matches.some((row) =>
      row.rates.some(
        (rate) =>
          rate.charge === "excise" &&
          rate.expression === "SGD 60.00 per litre of alcohol",
      ),
    ),
  );
});

test("Norway import VAT and the Swiss–Liechtenstein customs tariff are available", () => {
  const date = "2026-11-11";
  const norwegian = catalog.lookup({
    destinationCountry: "NO",
    originCountry: "US",
    code: "61091000",
    date,
  });
  assert.equal(norwegian.matches[0]?.rates[0]?.adValoremPercent, "10.7");
  assert.ok(
    norwegian.measures.matches.some((row) =>
      row.rates.some(
        (rate) =>
          rate.charge === "import_vat" && rate.adValoremPercent === "25",
      ),
    ),
  );
  const liechtenstein = catalog.lookup({
    destinationCountry: "LI",
    originCountry: "US",
    code: "61091000",
    date,
  });
  assert.equal(liechtenstein.snapshot?.id, "ch-tares-duty-2026-10");
  assert.match(
    liechtenstein.matches[0]?.rates[0]?.expression ?? "",
    /CHF .*100 kg gross/,
  );
});

test("product GST appears alongside New Zealand duty and a German chapter rule is national", () => {
  const nz = catalog.lookup({
    destinationCountry: "NZ",
    code: "2105002100",
    date: "2026-11-11",
  });
  assert.equal(nz.status, "schedule_reference");
  assert.equal(nz.measures.status, "measure_references");
  assert.equal(nz.measures.matches[0]?.rates[0]?.charge, "import_gst");
  assert.equal(nz.measures.matches[0]?.rates[0]?.adValoremPercent, "15");
  const de = catalog.lookup({
    destinationCountry: "DE",
    customsTerritory: "EU",
    code: "09012100",
  });
  assert.equal(de.measures.matches[0]?.code, "09");
  assert.equal(de.measures.matches[0]?.matchedBy, "prefix");
  assert.equal(de.measures.matches[0]?.rates[0]?.adValoremPercent, "7");
  const fr = catalog.lookup({ destinationCountry: "FR", code: "09012100" });
  assert.ok(
    !fr.measures.matches.some((row) => row.snapshotId.startsWith("de-")),
  );
});

test("new European product VAT schedules preserve multiple conditional rates", () => {
  for (const [destinationCountry, code, rates] of [
    ["GB", "3006600000", ["0.00", "5.00", "20.00"]],
    ["PL", "09041100", ["8"]],
    ["SK", "02013000", ["5", "19"]],
  ] as const) {
    const result = catalog.lookup({
      destinationCountry,
      code,
      date: "2026-11-11",
    });
    const candidates = result.measures.matches.flatMap((row) =>
      row.rates.filter((rate) => rate.charge === "import_vat"),
    );
    for (const rate of rates)
      assert.ok(
        candidates.some((candidate) => candidate.adValoremPercent === rate),
      );
  }
});

test("India IGST and EU TARIC measures are scoped by code and origin", () => {
  const date = "2026-11-11";
  const igst = catalog.lookup({
    destinationCountry: "IN",
    code: "12119013",
    date,
  });
  assert.ok(
    igst.measures.matches.some(
      (row) =>
        row.snapshotId === "in-igst-2026-11" &&
        row.matchedBy === "exact" &&
        row.rates.some(
          (rate) =>
            rate.charge === "import_gst" && rate.adValoremPercent === "0",
        ),
    ),
  );
  const request = { destinationCountry: "FR", code: "4809900010", date };
  const china = catalog.lookup({ ...request, originCountry: "CN" });
  assert.ok(
    china.measures.matches.some(
      (row) =>
        row.snapshotId === "eu-taric-trade-measures-20261111" &&
        row.rates.some(
          (rate) =>
            rate.charge === "trade_remedy" &&
            rate.adValoremPercent === "70.500",
        ),
    ),
  );
  const japan = catalog.lookup({ ...request, originCountry: "JP" });
  assert.equal(japan.measures.totalMatches, 0);
});

test("Fiji and Côte d’Ivoire return local duty and import tax candidates", () => {
  for (const [destinationCountry, code, duty, vat] of [
    ["FJ", "09012100", "15", "12.5"],
    ["CI", "9706900000", "20", "18"],
  ]) {
    const result = catalog.lookup({
      destinationCountry,
      code,
      date: "2026-11-11",
    });
    assert.equal(result.matches[0]?.rates[0]?.adValoremPercent, duty);
    assert.ok(
      result.measures.matches.some((row) =>
        row.rates.some(
          (rate) =>
            rate.charge === "import_vat" && rate.adValoremPercent === vat,
        ),
      ),
    );
  }
});

test("UK trade remedies use published origin and French VAT uses national conditions", () => {
  const date = "2026-11-11";
  const request = { destinationCountry: "GB", code: "0301919011", date };
  const remedies = (originCountry: string) =>
    catalog
      .lookup({ ...request, originCountry })
      .measures.matches.filter(
        (row) => row.snapshotId === "gb-dbt-trade-measures-2026-11-11",
      );
  assert.ok(
    remedies("TR")[0]?.rates.some((rate) => rate.adValoremPercent === "7.6"),
  );
  assert.deepEqual(remedies("JP"), []);
  const france = catalog.lookup({
    destinationCountry: "FR",
    code: "02011000",
    date,
  });
  assert.deepEqual(
    france.measures.matches
      .flatMap((row) =>
        row.rates.filter((rate) => rate.charge === "import_vat"),
      )
      .map((rate) => rate.adValoremPercent),
    ["5.5", "10.0"],
  );
});

test("Indonesia keeps temporary and ordinary rates as separate dated candidates", () => {
  const result = catalog.lookup({
    destinationCountry: "ID",
    code: "39021030",
    date: "2026-11-11",
  });
  assert.equal(result.snapshot?.id, "id-btki-pmk68-2026");
  const rates = result.matches.flatMap((row) => row.rates);
  assert.ok(rates.some((rate) => rate.adValoremPercent === "0"));
  assert.ok(rates.some((rate) => rate.adValoremPercent === "10.00"));
});

test("Japan import consumption tax preserves food-use and liquor conditions", () => {
  const request = { destinationCountry: "JP", date: "2026-11-11" };
  const coffee = catalog.lookup({ ...request, code: "090121000" });
  assert.deepEqual(
    coffee.measures.matches.flatMap((row) =>
      row.rates.map((rate) => rate.adValoremPercent),
    ),
    ["8", "10"],
  );
  const beer = catalog.lookup({ ...request, code: "220300000" });
  assert.ok(
    beer.measures.matches.some((row) =>
      row.rates.some(
        (rate) =>
          rate.charge === "excise" && rate.expression === "JPY 155000 per kL",
      ),
    ),
  );
});

test("regional tariff references use their own observation dates", () => {
  const eaeu = catalog.lookup({
    destinationCountry: "KZ",
    code: "4408393002",
    date: "2026-11-11",
  });
  assert.equal(eaeu.snapshot?.id, "eaeu-cet-2026-11-11");
  assert.ok(
    eaeu.matches[0]?.rates.some((rate) => rate.adValoremPercent === "10"),
  );
  const mercosur = { destinationCountry: "AR", code: "01013000" };
  const reference = catalog.lookup({ ...mercosur, date: "2026-11-01" });
  assert.equal(reference.matches[0]?.rates[0]?.adValoremPercent, "3.6");
  assert.equal(
    catalog.lookup({ ...mercosur, date: "2026-11-11" }).status,
    "date_not_covered",
  );
});

test("surtax references require the published origin and reference period", () => {
  const request = {
    destinationCountry: "CA",
    originCountry: "US",
    code: "0402.10.10.00",
    date: "2026-09-08",
  };
  const result = catalog.lookup(request);
  assert.equal(result.measures.matches[0]?.matchedBy, "prefix");
  assert.match(result.measures.matches[0]?.reference ?? "", /SOR\/2026-186/);
  assert.equal(result.measures.matches[0]?.rates[0]?.adValoremPercent, "50");
  assert.equal(result.applicableRate, null);
  assert.equal(
    catalog.lookup({ ...request, originCountry: "MX" }).measures.status,
    "no_matching_measures",
  );
  const earlier = catalog.lookup({ ...request, date: "2026-09-07" });
  assert.equal(earlier.measures.status, "date_not_covered");
  assert.equal(earlier.measures.sources[0]?.referenceDate, null);
});

test("Canadian steel quota and processing surtaxes preserve different origin conditions", () => {
  const request = {
    destinationCountry: "CA",
    code: "7206.10.00.00",
    date: "2026-11-11",
  };
  const matches = (originCountry: string) =>
    catalog.lookup({ ...request, originCountry }).measures.matches;
  const quota = (originCountry: string) =>
    matches(originCountry)
      .flatMap((row) => row.rates)
      .find((rate) => rate.label.startsWith("Above-quota steel surtax"));
  assert.match(quota("JP")?.label ?? "", /Schedule 2/);
  assert.match(quota("CN")?.label ?? "", /Schedule 1/);
  assert.equal(quota("CN")?.adValoremPercent, "50");
  assert.equal(quota("US"), undefined);
  assert.ok(
    matches("CN").some((row) => row.reference.includes("SOR/2024-187")),
  );
  assert.ok(
    matches("JP").some((row) => row.reference.includes("SOR/2025-154")),
  );
  assert.ok(
    !matches("US").some((row) => row.reference.includes("SOR/2025-154")),
  );
});

test("US additive formulas and EU producer-specific remedies remain conditional", () => {
  const us = catalog.lookup({
    destinationCountry: "US",
    originCountry: "CN",
    code: "40151210",
  });
  const linked = us.measures.matches
    .flatMap((row) => row.rates)
    .find((rate) => rate.sourceCode === "99039108");
  assert.match(linked?.expression ?? "", /\+ 100%/);
  assert.equal(linked?.adValoremPercent, null);
  const eu = catalog.lookup({
    destinationCountry: "FR",
    originCountry: "CN",
    code: "87038010",
  });
  assert.equal(eu.measures.matches[0]?.code, "8703801010");
  assert.equal(eu.measures.matches[0]?.matchedBy, "more_specific");
  assert.equal(
    eu.measures.matches[0]?.rates.find((rate) => rate.label.includes("89BZ"))
      ?.adValoremPercent,
    "7.8",
  );
  assert.ok(
    eu.measures.matches[0]?.rates.some(
      (rate) => rate.expression === "Exempt" && rate.label.includes("89FZ"),
    ),
  );
});

test("US Section 232 includes both additive duties and combined-duty floors", () => {
  const request = {
    destinationCountry: "US",
    originCountry: "JP",
    date: "2026-11-11",
  };
  const metal = catalog.lookup({ ...request, code: "7206100000" });
  assert.ok(
    metal.measures.matches.some(
      (row) =>
        row.matchedBy === "prefix" &&
        row.rates.some(
          (rate) =>
            rate.sourceCode === "99038202" && rate.expression.endsWith("+ 50%"),
        ),
    ),
  );
  const pharma = catalog.lookup({ ...request, code: "2918993000" });
  const floor = pharma.measures.matches
    .flatMap((row) => row.rates)
    .find((rate) => rate.sourceCode === "99030462");
  assert.match(floor?.expression ?? "", /floor of 15%/);
  assert.equal(floor?.adValoremPercent, null);
});

test("coverage and pagination report each measure layer independently", () => {
  const request = {
    destinationCountry: "NZ",
    code: "010121",
    limit: 1,
    measureLimit: 1,
  };
  const first = catalog.lookup(request);
  assert.ok(first.measures.nextOffset && first.measures.totalMatches > 1);
  const next = catalog.lookup({
    ...request,
    measureOffset: first.measures.nextOffset,
  });
  assert.equal(first.matches[0]?.code, next.matches[0]?.code);
  assert.notEqual(
    first.measures.matches[0]?.code,
    next.measures.matches[0]?.code,
  );
  const coverage = catalog.coverage();
  assert.equal(coverage.allWorldTaxRatesComplete, false);
  assert.ok(
    coverage.countries
      .find((country) => country.country === "DE")
      ?.measureCharges.includes("import_vat"),
  );
  assert.ok(
    coverage.countries
      .find((country) => country.country === "KH")
      ?.measureCharges.includes("import_vat"),
  );
});

test("origin is context and never establishes preference eligibility", () => {
  const result = catalog.lookup({
    destinationCountry: "CN",
    originCountry: "JP",
    code: "01012900",
  });
  assert.ok(
    result.matches[0]?.rates.some(
      (rate) => rate.treatment === "preferential" && rate.origin,
    ),
  );
  assert.equal(result.applicableRate, null);
});

test("the HTTP route preserves bearer authentication and the request schema", async () => {
  const key = "synthetic-tariff-key-at-least-32-characters";
  const handler = createHandler({ dataset, tariffs: catalog, apiKey: key });
  const lookup = (headers: Record<string, string>, request: unknown) =>
    handler(
      new Request("http://localhost/v1/tariffs/lookup", {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(request),
      }),
      { peer: "127.0.0.1" },
    );
  assert.equal(
    (await lookup({}, { destinationCountry: "JP", code: "090121000" })).status,
    401,
  );
  const headers = { authorization: `Bearer ${key}` };
  const response = await lookup(headers, {
    destinationCountry: "JP",
    code: "090121000",
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, "schedule_reference");
  assert.equal(
    (
      await lookup(headers, {
        destinationCountry: "JP",
        code: "090121",
        address: "ignored",
      })
    ).status,
    400,
  );
});

test("ask attaches sourced rates independently of model evidence selection", async () => {
  const result = await ask(
    {
      question: "実行関税率を確認",
      destinationCountry: "JP",
      tariffCode: "090121000",
    },
    dataset,
    undefined,
    new Date("2026-11-11T00:00:00Z"),
    catalog,
  );
  assert.equal(result.tariffReference?.matches[0]?.code, "090121000");
  assert.equal(result.numericQuote, null);
});
