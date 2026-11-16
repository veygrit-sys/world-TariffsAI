import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { acquireTariffSources } from "../scripts/acquire-tariff-sources.ts";

const now = new Date("2026-11-12T08:00:00Z");
const html = (body: string) => new Response("<!doctype html><html>" + body + "</html>", {
  headers: { "content-type": "text/html" },
});
const pdf = () => new Response("%PDF-1.6\nbody\n%%EOF", { headers: { "content-type": "application/octet-stream" } });
const json = () => Response.json(Array.from({ length: 1000 }, () => ({ htsno: "0101.29.0010", general: "Free" })));
const rawUrl = (input: Parameters<typeof fetch>[0]) => new URL(String(input));
const archive = '<a href="/sites/default/files/tata/hts/hts_2026_revision_23_json.json">JSON</a>';
const chapter = "https://hts.usitc.gov/reststop/file?release=2026HTSRev23&filename=Chapter%2099";

test("US originals are content-addressed and repeated observations produce new receipts", async () => {
  const output = await mkdtemp(join(tmpdir(), "official-us-"));
  const visited: string[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    assert.equal(init?.redirect, "manual");
    const url = rawUrl(input);
    visited.push(url.href);
    if (url.pathname.endsWith("/archive/list"))
      return html(archive + '<a href="https://www.usitc.gov.invalid/sites/default/files/tata/hts/hts_2026_revision_99_json.json">JSON</a>');
    if (url.href === chapter) return pdf();
    return json();
  };
  try {
    const run = () => acquireTariffSources({ output, countries: ["US"], timeoutMs: 1000, fetchImpl, now });
    const first = await run();
    const again = await run();
    assert.equal(first.status, "acquired_for_review");
    assert.equal(first.tariffEffectiveDateVerified, false);
    assert.equal(first.approvalGranted, false);
    assert.equal(first.results[0]?.edition, "2026-revision-23");
    assert.equal(first.results[0]?.assets.length, 3);
    assert.ok(again.results[0]?.assets.every(({ disposition }) => disposition === "already_present"));
    assert.notEqual(first.receiptPath, again.receiptPath);
    assert.equal(visited.length, 6);
    const source = first.results[0]!.assets.find(({ kind }) => kind === "base_schedule")!;
    assert.ok((await readFile(join(output, source.sha256))).byteLength === source.byteLength);
    await writeFile(join(output, source.sha256), "changed");
    const invalid = await run();
    assert.equal(invalid.status, "incomplete");
    assert.ok(invalid.results[0]?.failures.some(({ reason }) => reason === "EXISTING_EVIDENCE_HASH_MISMATCH"));
    assert.equal(await readFile(join(output, source.sha256), "utf8"), "changed");
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});

test("Japan selects the observed release and verifies all 96 chapter links", async () => {
  const output = await mkdtemp(join(tmpdir(), "official-jp-"));
  const expected = Array.from({ length: 97 }, (_, i) => i + 1).filter((n) => n !== 77);
  const fetchImpl: typeof fetch = async (input) => {
    const url = rawUrl(input);
    if (url.pathname === "/tariff/index.htm")
      return html('<a href="2026_11_14/index.htm">planned</a><a href="2026_10_31/index.htm">current</a>');
    if (url.pathname.endsWith("/index.htm"))
      return html(expected.map((n) => `<a href="data/j_${String(n).padStart(2, "0")}.htm">table</a>`).join(""));
    assert.match(url.pathname, /^\/tariff\/2026_10_31\/data\/j_\d{2}\.htm$/);
    return html("<table>" + url.pathname + "</table>");
  };
  try {
    const run = await acquireTariffSources({ output, countries: ["JP"], timeoutMs: 1000, fetchImpl, now });
    assert.equal(run.status, "acquired_for_review");
    assert.equal(run.results[0]?.edition, "2026-10-31");
    assert.equal(run.results[0]?.assets.filter(({ kind }) => kind === "chapter").length, 96);
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});

test("China finds annual edition from the official directory without fetching its HTTP link directly", async () => {
  const output = await mkdtemp(join(tmpdir(), "official-cn-"));
  const fetchImpl: typeof fetch = async (input) => {
    const url = rawUrl(input);
    assert.equal(url.protocol, "https:");
    if (url.pathname.endsWith("/zhengcefabu/"))
      return html('<a href="./202701/t20270102_12345.htm">关于调整关税的公告</a>');
    if (url.pathname.includes("/falvlagui/"))
      return html("<p>关于发布《中华人民共和国进出口税则（2027）》的公告</p>" +
        "<p>http://gss.mof.gov.cn/gzdt/zhengcefabu/202612/t20261231_12345.htm</p>");
    if (url.pathname.endsWith("t20261231_12345.htm"))
      return html('<a href="./P0202612310000001.pdf">中华人民共和国进出口税则（2027）.pdf</a>');
    if (url.pathname.endsWith(".pdf")) return pdf();
    return html("<p>policy notice</p>");
  };
  try {
    const run = await acquireTariffSources({
      output, countries: ["CN"], timeoutMs: 1000, fetchImpl, now: new Date("2027-01-03T00:00:00Z"),
    });
    assert.equal(run.status, "acquired_for_review");
    assert.equal(run.results[0]?.edition, "2027");
    assert.ok(run.results[0]?.assets.some(({ kind }) => kind === "policy_notice"));
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});

test("redirects and invalid original formats never publish an evidence object", async () => {
  const output = await mkdtemp(join(tmpdir(), "official-reject-"));
  let calls = 0;
  const fetchImpl: typeof fetch = async () => {
    calls++;
    return new Response(null, { status: 302, headers: { location: "https://www.usitc.gov.invalid/archive" } });
  };
  try {
    const run = await acquireTariffSources({ output, countries: ["US"], timeoutMs: 1000, fetchImpl, now });
    assert.equal(run.status, "incomplete");
    assert.equal(calls, 1);
    assert.equal(run.results[0]?.failures[0]?.reason, "UNEXPECTED_SOURCE_REDIRECT");
    const badPdf: typeof fetch = async (input) => rawUrl(input).pathname.endsWith("/archive/list") ? html(archive)
      : rawUrl(input).hostname === "hts.usitc.gov" ? new Response("invalid PDF", { headers: { "content-type": "application/pdf" } }) : json();
    const rejected = await acquireTariffSources({ output, countries: ["US"], timeoutMs: 1000, fetchImpl: badPdf, now });
    assert.equal(rejected.status, "incomplete");
    assert.equal(rejected.results[0]?.failures[0]?.reason, "INVALID_PDF_ORIGINAL");
    assert.equal((await readdir(output)).length, 3);
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});

test("a customs-union original is downloaded once for multiple selected destinations", async () => {
  const output = await mkdtemp(join(tmpdir(), "official-shared-"));
  const visited: string[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    assert.equal(init?.redirect, "manual");
    visited.push(rawUrl(input).href);
    return pdf();
  };
  try {
    const report = await acquireTariffSources({ output, countries: ["AG", "DM", "AG"], timeoutMs: 1000, fetchImpl, now });
    assert.equal(report.status, "acquired_for_review");
    assert.equal(report.approvalGranted, false);
    assert.equal(report.tariffEffectiveDateVerified, false);
    assert.deepEqual(visited, ["https://caricom.org/wp-content/uploads/CET-based-on-HS2022-Final.pdf"]);
    assert.deepEqual(report.results.map(({ country }) => country), ["AG", "DM"]);
    for (const result of report.results) {
      assert.equal(result.assets[0]?.sourceScope, "customs_union");
      assert.equal(result.assets[0]?.sourceId, "caricom_hs2022_cet");
    }
    assert.equal(report.results[0]!.assets[0]?.sha256, report.results[1]!.assets[0]?.sha256);
    const receipt = JSON.parse(await readFile(report.receiptPath, "utf8"));
    assert.equal(receipt.schemaVersion, 2);
    assert.equal(receipt.approvalGranted, false);
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});

test("registered acquisition can pin a subset of official assets for an in-scope destination", async () => {
  const output = await mkdtemp(join(tmpdir(), "official-selected-"));
  const visited: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    visited.push(String(input));
    return html("<table><tr><td>6912.00.00</td><td>5%</td></tr></table>");
  };
  const options = { output, countries: ["AU"], timeoutMs: 1000, fetchImpl, now };
  const sourceId = "au_abf_schedule_3_ch69";
  try {
    const report = await acquireTariffSources({ ...options, sourceIds: [sourceId] });
    assert.equal(report.status, "acquired_for_review");
    assert.deepEqual(report.selectedSourceIds, [sourceId]);
    assert.deepEqual(report.results[0]?.assets.map(({ sourceId }) => sourceId), [sourceId]);
    assert.deepEqual(visited.map((url) => new URL(url).pathname.split("/").at(-1)), ["chapter-69"]);
    for (const sourceIds of [[], [sourceId, sourceId], ["ca_cbsa_tariff_t2026_2"], ["https://example.com/"]])
      await assert.rejects(acquireTariffSources({ ...options, sourceIds }), /INVALID_REGISTERED_SOURCE_SELECTION/);
    await assert.rejects(acquireTariffSources({ ...options, countries: ["AU", "JP"], sourceIds: [sourceId] }),
      /INVALID_REGISTERED_SOURCE_SELECTION/);
    assert.equal(visited.length, 1);
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});

test("a reference-only destination yields official links without fetching or publishing any originals", async () => {
  const output = await mkdtemp(join(tmpdir(), "official-reference-"));
  const fetchImpl: typeof fetch = async () => { assert.fail("manual references must never be fetched"); };
  try {
    const report = await acquireTariffSources({ output, countries: ["BA"], timeoutMs: 1000, fetchImpl, now });
    assert.equal(report.status, "incomplete");
    assert.equal(report.results[0]?.status, "reference_only");
    assert.ok(report.results[0]?.references?.some(({ url }) => url.startsWith("https://")));
    assert.equal(report.results[0]?.assets.length, 0);
    assert.deepEqual(await readdir(output), ["runs"]);
    await assert.rejects(acquireTariffSources({ output, countries: ["KP"], timeoutMs: 1000, fetchImpl, now }), /INVALID_ACQUISITION_OPTIONS/);
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});

test("an archive MIME type cannot make an HTML response an original", async () => {
  const output = await mkdtemp(join(tmpdir(), "official-archive-"));
  const fetchImpl: typeof fetch = async () => new Response("<html>Access denied</html>", {
    headers: { "content-type": "application/octet-stream" },
  });
  try {
    const report = await acquireTariffSources({ output, countries: ["NZ"], timeoutMs: 1000, fetchImpl, now });
    assert.equal(report.status, "incomplete");
    assert.equal(report.results[0]?.failures[0]?.reason, "INVALID_OFFICIAL_ARCHIVE");
    assert.deepEqual(await readdir(output), ["runs"]);
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});

function pdfRangeFixture(mode: "valid" | "changed" | "wrong_offset" | "weak") {
  const original = new Uint8Array(540_000);
  original.set(new TextEncoder().encode("%PDF-1.6\n"));
  original.set(new TextEncoder().encode("%%EOF"), original.length - 5);
  const requests: { start: number; ifRange: string | null }[] = [];
  const fetchImpl: typeof fetch = async (_input, init) => {
    const headers = new Headers(init?.headers);
    assert.equal(init?.redirect, "manual");
    const range = headers.get("range");
    if (!range) return new Response(null, { status: 503 });
    assert.equal(headers.get("accept-encoding"), "identity");
    const match = /^bytes=(\d+)-(\d+)$/.exec(range)!;
    const start = Number(match[1]);
    const end = Math.min(Number(match[2]), original.length - 1);
    requests.push({ start, ifRange: headers.get("if-range") });
    const etag = mode === "weak" ? 'W/"edition-a"' : mode === "changed" && start > 0 ? '"edition-b"' : '"edition-a"';
    return new Response(original.slice(start, end + 1), { status: 206, headers: {
      "content-type": "application/pdf",
      "content-range": `bytes ${mode === "wrong_offset" && start > 0 ? start - 1 : start}-${end}/${original.length}`,
      "content-length": String(end - start + 1),
      etag,
    } });
  };
  return { original, requests, fetchImpl };
}

test("an interrupted registered PDF can be recovered and published as one verified representation", async () => {
  const output = await mkdtemp(join(tmpdir(), "official-range-"));
  const { original, requests, fetchImpl } = pdfRangeFixture("valid");
  try {
    const run = await acquireTariffSources({ output, countries: ["MU"], timeoutMs: 1000, fetchImpl, now });
    assert.equal(run.status, "acquired_for_review");
    assert.equal(run.approvalGranted, false);
    const asset = run.results[0]!.assets[0]!;
    assert.equal(asset.transfer, "verified_http_ranges");
    assert.deepEqual(requests, [{ start: 0, ifRange: null }, { start: 524288, ifRange: '"edition-a"' }]);
    assert.deepEqual(await readFile(join(output, asset.sha256)), Buffer.from(original));
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});

test("range fallback discards weak, changed or misplaced source bytes", async () => {
  const output = await mkdtemp(join(tmpdir(), "official-range-reject-"));
  try {
    for (const [mode, reason] of [
      ["weak", "SOURCE_RANGE_STRONG_ETAG_REQUIRED"],
      ["changed", "SOURCE_RANGE_REPRESENTATION_CHANGED"],
      ["wrong_offset", "SOURCE_RANGE_INVALID_CONTENT_RANGE"],
    ] as const) {
      const { fetchImpl } = pdfRangeFixture(mode);
      const run = await acquireTariffSources({ output, countries: ["MU"], timeoutMs: 1000, fetchImpl, now });
      assert.equal(run.status, "incomplete");
      assert.equal(run.results[0]?.failures[0]?.reason, reason);
      assert.deepEqual(await readdir(output), ["runs"]);
    }
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});
