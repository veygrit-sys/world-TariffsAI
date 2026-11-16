import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { todayJst } from "../src/dataset.ts";
import { acquireTariffSources } from "./acquire-tariff-sources.ts";
import { additionalCycleLines } from "./all-destination-cycle-lines.ts";
import { officialTariffSources } from "./tariff-source-registry.ts";
import { worldwideBaseLines, worldwideCountries, type WorldwideLine } from "./worldwide-cycle-lines.ts";

export const cycleDate = "2026-11-13";
export const cycleNow = "2026-11-13T02:00:00+09:00";
export const pilotCountries = ["JP", "CN", "US"] as const;
export type PilotCountry = (typeof pilotCountries)[number];

const jpChapter = "https://www.customs.go.jp/tariff/2026_10_31/data/j_69.htm";
const cnBase = "https://gss.mof.gov.cn/gzdt/zhengcefabu/202512/P020251231607833453633.pdf";
const cnNotice = "/gzdt/zhengcefabu/202512/t20251231_3981044.htm";
const usBase = "https://www.usitc.gov/sites/default/files/tata/hts/hts_2026_revision_23_json.json";

export const pilotBaseLines = {
  JP: {
    code: "691390000", hs6: "691390", currency: "JPY", treatment: "mfn",
    authority: "Japan Customs", termsUrl: "https://www.customs.go.jp/kiyaku.htm", edition: "2026-10-31, Chapter 69, 6913.90-000",
    url: jpChapter, sha256: "37d08b86794b5acc5ed3232e36136573c6976e5a48e4fcc8cce9681746ef4814",
    observedRate: "2.3", syntheticRate: "4",
    scope: "Decorative ceramic statuette other than porcelain or china. WTO column for the scenario.",
  },
  CN: {
    code: "69120010", hs6: "691200", currency: "CNY", treatment: "mfn",
    authority: "Customs Tariff Commission of the State Council of China",
    termsUrl: "https://www.ncac.gov.cn/xxfb/flfg/flfg_532/202103/t20210309_50530.html",
    edition: "2026 tariff, PDF page 856, row 5216",
    url: cnBase, sha256: "76af4db0b3af966ef4f95f4ffc6b4b2e34f1a95ef47f68e7299670a18b337d57",
    observedRate: "7", syntheticRate: "8",
    scope: "Non-porcelain ceramic tableware. MFN column for the scenario. Origin-specific measures are separate.",
  },
  US: {
    code: "6912001000", hs6: "691200", currency: "USD", treatment: "general",
    authority: "United States International Trade Commission", termsUrl: "https://uscode.house.gov/us/usc/119-124/t17/s105/", edition: "2026 HTS Revision 23",
    url: usBase, sha256: "532e0c00ff4300e1e0844b7e4e46d38769f5e66575ad552964d73a12ceabd709",
    observedRate: "0.7", syntheticRate: "6.25",
    scope: "6912.00.10.00, qualifying coarse-grained earthenware or stoneware for this scenario. Column 1 General only.",
  },
} as const;

type Receipt = Awaited<ReturnType<typeof acquireTariffSources>>;
const html = (body: string) => new Response("<html><body>" + body + "</body></html>", {
  headers: { "content-type": "text/html" },
});
const pdf = (text: string) => new Response("%PDF-1.4\n" + text + "\n%%EOF", {
  headers: { "content-type": "application/pdf" },
});
const mockTariffFetch: typeof fetch = async (input) => {
  const url = new URL(String(input));
  if (url.href === jpChapter)
    return html("<table><tr><td>SYNTHETIC TEST</td><td>691390000</td><td>4%</td></tr></table>");
  if (url.hostname === "www.customs.go.jp") {
    if (url.pathname === "/tariff/index.htm")
      return html('<a href="2026_10_31/index.htm">test edition</a>');
    if (url.pathname.endsWith("/index.htm"))
      return html(Array.from({ length: 97 }, (_, i) => i + 1).filter((i) => i !== 77).map((i) =>
        '<a href="data/j_' + String(i).padStart(2, "0") + '.htm">test chapter</a>').join(""));
    return html("<table>SYNTHETIC TEST CHAPTER</table>");
  }
  if (url.href === cnBase) return pdf("SYNTHETIC_TEST|69120010|8%");
  if (url.hostname === "gss.mof.gov.cn") {
    if (url.pathname === cnNotice)
      return html('<a href="' + cnBase + '">中华人民共和国进出口税则</a>');
    return html('<a href="' + cnNotice + '">中华人民共和国进出口税则（2026）</a>');
  }
  if (url.hostname === "hts.usitc.gov") return pdf("SYNTHETIC TEST CHAPTER 99");
  if (url.href === usBase)
    return Response.json([{ htsno: "6912.00.10.00", general: "6.25%", description: "SYNTHETIC TEST" },
      ...Array.from({ length: 999 }, () => ({ htsno: "", general: "" }))]);
  assert.equal(url.pathname, "/harmonized_tariff_information/hts/archive/list");
  return html('<a href="' + usBase + '">test archive</a>');
};

export type CycleProfile = "pilot" | "worldwide" | "all-destinations";
export const allCycleLines = { ...worldwideBaseLines, ...additionalCycleLines } as Readonly<Record<string, WorldwideLine>>;
export const allReviewedDestinations = [...pilotCountries, ...Object.keys(allCycleLines)];

function registeredInputs(country: string, line: WorldwideLine) {
  return Object.entries(line.originals).map(([id, sha256]) => {
    const source = officialTariffSources.find((entry) => entry.id === id);
    assert.ok(source?.access === "download" && source.countries.includes(country), id);
    return { source, line, sourceId: id, url: new URL(source.url).href, sha256 };
  });
}

const registeredCycleInputs = Object.entries(worldwideBaseLines).flatMap(([country, line]) => registeredInputs(country, line));
export const worldwideSourceIds = [...new Set(registeredCycleInputs.map(({ sourceId }) => sourceId))];

function mockRegisteredSource(format: string, row: string, expected?: string): Response {
  const reply = (body: BodyInit, mediaType: string) => new Response(body, { headers: { "content-type": mediaType } });
  switch (format) {
    case "html": return html(`<table>${row}</table>${expected ?? ""}`);
    case "pdf": return pdf(row);
    case "csv": return reply("tariff,rate\n" + row + "\n", "text/csv");
    case "json": return Response.json({ row });
    case "xml": return reply("<tariff>" + row + "</tariff>", "application/xml");
    case "gzip": return reply(new Uint8Array(gzipSync(row)), "application/gzip");
    case "zip":
    case "xlsx":
      // Synthetic framing for the acquisition validator. These bytes are never passed to a workbook parser.
      return reply(new Uint8Array(Buffer.from(`PK\x03\x04[Content_Types].xml xl/workbook.xml ${row} PK\x05\x06`)),
        "application/octet-stream");
    default: throw new Error("UNSUPPORTED_CYCLE_FIXTURE_FORMAT: " + format);
  }
}

export async function cycleEvidence(evidence: string, observed: boolean, profile: CycleProfile) {
  const receipts: Receipt[] = [];
  const countries = profile === "pilot" ? pilotCountries :
    profile === "worldwide" ? ["JP", ...worldwideCountries] : allReviewedDestinations;
  const registered = countries.filter((country) => Object.hasOwn(allCycleLines, country));
  const inputs = new Map(registered.map((country) => [country, registeredInputs(country, allCycleLines[country]!)]));
  if (observed) {
    const runs = join(evidence, "runs");
    for (const file of (await readdir(runs)).filter((name) => name.endsWith(".json")).sort())
      receipts.push(JSON.parse(await readFile(join(runs, file), "utf8")) as Receipt);
  } else {
    receipts.push(await acquireTariffSources({
      output: evidence, countries: countries.filter((country) => !inputs.has(country)), fetchImpl: mockTariffFetch,
      timeoutMs: 3000, now: new Date(cycleNow),
    }));
    if (registered.length) {
      const documents = [...inputs.values()].flat();
      const sourceIds = [...new Set(documents.map(({ sourceId }) => sourceId))];
      receipts.push(await acquireTariffSources({
        output: evidence, countries: registered, sourceIds, timeoutMs: 3000, now: new Date(cycleNow),
        fetchImpl: async (input) => {
          const entry = documents.find(({ url }) => url === String(input));
          assert.ok(entry, String(input));
          return mockRegisteredSource(entry.source.format,
            `${entry.line.code},${entry.line.syntheticRate}% SYNTHETIC TEST ${entry.sourceId}`, entry.source.expected);
        },
      }));
    }
  }

  const assets = [];
  const byteLengths = new Map<string, number>();
  for (const country of countries) {
    const original = pilotBaseLines[country as PilotCountry];
    const originals: { url: string; sha256: string; sourceId?: string }[] = original ? [original] : inputs.get(country)!;
    const matches = (asset: Receipt["results"][number]["assets"][number], source: typeof originals[number]) =>
      asset.url === source.url && (source.sourceId === undefined || asset.sourceId === source.sourceId) &&
      (!observed || asset.sha256 === source.sha256) && todayJst(new Date(asset.observedAt)) === cycleDate;
    const receipt = receipts.find((run) => run.schemaVersion === 2 && run.referenceDate === cycleDate &&
      run.approvalGranted === false && run.tariffEffectiveDateVerified === false &&
      run.results.some((result) => result.country === country && result.status === "acquired_for_review" &&
        originals.every((source) => result.assets.some((asset) => matches(asset, source)))));
    assert.ok(receipt, "Missing complete acquisition receipt for " + country);
    const result = receipt.results.find(({ country: code }) => code === country)!;
    for (const source of originals) {
      const asset = result.assets.find((entry) => matches(entry, source))!;
      assert.match(asset.sha256, /^[a-f0-9]{64}$/);
      if (!byteLengths.has(asset.sha256)) {
        const bytes = await readFile(join(evidence, asset.sha256));
        assert.equal(createHash("sha256").update(bytes).digest("hex"), asset.sha256);
        byteLengths.set(asset.sha256, bytes.byteLength);
        if (!observed && original) {
          const content = bytes.toString("utf8");
          const code = country === "US" ? "6912.00.10.00" : original.code;
          assert.ok(content.includes(code) && content.includes(original.syntheticRate + "%"),
            "Fixture line or rate missing for " + country);
        }
      }
      assert.equal(byteLengths.get(asset.sha256), asset.byteLength);
      assets.push({ country, url: asset.url, sha256: asset.sha256, bytes: asset.byteLength, documentCount: result.assets.length,
        ...(asset.sourceId ? { sourceId: asset.sourceId } : {}) });
    }
  }
  return assets;
}
