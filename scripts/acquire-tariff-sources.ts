import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { link, lstat, mkdir, open, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { createGunzip } from "node:zlib";

import {
  acquisitionCountries, discoveryCountries, inScopeCountries, isDiscoveryCountry, isSupportedDestination, officialTariffSources,
} from "./tariff-source-registry.ts";
import type { DiscoveryCountry, DocumentFormat, DownloadSource } from "./tariff-source-registry.ts";
import { readSourceBody, recoverOfficialPdf, sourceMediaType } from "./tariff-range-recovery.ts";
import { listOfficialTariffReferences } from "./tariff-source-coverage.ts";

type Format = DocumentFormat | "us_hts_json";
const MiB = 1024 * 1024;
const formats: Record<Format, { limit: number; accept: readonly string[] }> = {
  html: { limit: 8 * MiB, accept: ["text/html", "application/xhtml+xml"] },
  pdf: { limit: 100 * MiB, accept: ["application/pdf", "application/octet-stream"] },
  us_hts_json: { limit: 32 * MiB, accept: ["application/json", "application/octet-stream"] },
  json: { limit: 64 * MiB, accept: ["application/json", "text/json", "application/octet-stream"] },
  csv: { limit: 64 * MiB, accept: ["text/csv", "text/plain", "text/tab-separated-values", "application/csv",
    "application/vnd.ms-excel", "application/octet-stream"] },
  zip: { limit: 100 * MiB, accept: ["application/zip", "application/x-zip", "application/x-zip-compressed", "application/octet-stream"] },
  xlsx: { limit: 64 * MiB, accept: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel", "application/zip", "application/octet-stream"] },
  xml: { limit: 64 * MiB, accept: ["application/xml", "text/xml", "application/octet-stream"] },
  gzip: { limit: 100 * MiB, accept: ["application/gzip", "application/x-gzip", "application/octet-stream"] },
};
const jpIndex = "https://www.customs.go.jp/tariff/index.htm";
const usIndex = "https://www.usitc.gov/harmonized_tariff_information/hts/archive/list";
const cnIndex = "https://gss.mof.gov.cn/gzdt/zhengcefabu/";
const cnAnnualIndex = "https://gss.mof.gov.cn/gszhs/falvlagui/202105/t20210519_3704655.htm";
const cnSeed2026 = "https://gss.mof.gov.cn/gzdt/zhengcefabu/202512/t20251231_3981044.htm";
const jpReleasePath = /^\/tariff\/(20\d{2}_\d{2}_\d{2})\/index\.htm$/;
const jpChapterPath = /^\/tariff\/(20\d{2}_\d{2}_\d{2})\/data\/j_(\d{2})\.htm$/;
const usTariffPath = /^\/sites\/default\/files\/tata\/hts\/hts_(20\d{2})_(?:(?:revision_(\d+)|basic_edition)_)?json\.json$/;
const cnNoticePath = /^\/gzdt\/zhengcefabu\/20\d{4}\/t(20\d{6})_\d+\.htm$/;
const cnPdfPath = /^\/gzdt\/zhengcefabu\/20\d{4}\/P0?20\d+\.pdf$/i;
const jpChapters = Array.from({ length: 97 }, (_, i) => i + 1).filter((chapter) => chapter !== 77);

interface Asset {
  kind: "index" | "edition" | "chapter" | "base_schedule" | "policy_notice" | "policy_attachment";
  url: string;
  sha256: string;
  byteLength: number;
  mediaType: string;
  observedAt: string;
  disposition: "acquired" | "already_present";
  sourceId?: string;
  sourceScope?: DownloadSource["scope"];
  sourceGroup?: string;
  transfer?: "verified_http_ranges";
}
interface CountryAcquisition {
  country: string;
  status: "acquired_for_review" | "incomplete" | "reference_only" | "no_source_configured";
  edition: string | null;
  assets: Asset[];
  failures: { url: string; reason: string; sourceId?: string }[];
  references?: ReturnType<typeof listOfficialTariffReferences>;
}
interface Options {
  output: string;
  countries: readonly string[];
  sourceIds?: readonly string[];
  timeoutMs: number;
  fetchImpl?: typeof fetch;
  now?: Date;
}
const statusCode = (error: unknown) => (error as NodeJS.ErrnoException | undefined)?.code;
const exactHost: Record<DiscoveryCountry, string> = { JP: "www.customs.go.jp", CN: "gss.mof.gov.cn", US: "www.usitc.gov" };

function trustedUrl(country: DiscoveryCountry, input: string): URL {
  const url = new URL(input);
  const usChapter99 = country === "US" && url.host === "hts.usitc.gov" && url.pathname === "/reststop/file" &&
    [...url.searchParams].length === 2 && /^20\d{2}HTSRev[1-9]\d*$/.test(url.searchParams.get("release") ?? "") &&
    url.searchParams.get("filename") === "Chapter 99";
  if (url.protocol !== "https:" || url.username || url.password || url.hash ||
      (!usChapter99 && (url.host !== exactHost[country] || url.search)))
    throw new Error("SOURCE_URL_NOT_PERMITTED");
  return url;
}

function permittedPath(country: DiscoveryCountry, kind: Asset["kind"], path: string): boolean {
  if (country === "JP") {
    if (kind === "index") return path === "/tariff/index.htm";
    if (kind === "edition") return jpReleasePath.test(path);
    return kind === "chapter" && jpChapterPath.test(path);
  }
  if (country === "US") {
    if (kind === "index") return path === new URL(usIndex).pathname;
    if (kind === "policy_attachment") return path === "/reststop/file";
    return kind === "base_schedule" && usTariffPath.test(path);
  }
  if (kind === "index") return path === new URL(cnAnnualIndex).pathname || /^\/gzdt\/zhengcefabu\/(?:index(?:_[1-9]\d?)?\.htm)?$/.test(path);
  if (kind === "base_schedule") return cnPdfPath.test(path);
  return (kind === "edition" || kind === "policy_notice") && cnNoticePath.test(path);
}

function links(body: string, base: string, country: DiscoveryCountry) {
  return [...body.matchAll(/<a\b[^>]*\bhref\s*=\s*(?:"([^"]+)"|'([^']+)')[^>]*>([\s\S]*?)<\/a\s*>/gi)]
    .flatMap(([, double, single, content]) => {
      try {
        const href = (double ?? single ?? "").replaceAll("&amp;", "&");
        const url = trustedUrl(country, new URL(href, base).href);
        const label = (content ?? "").replace(/<[^>]*>/g, "").replace(/&nbsp;|\s+/g, " ").trim();
        return [{ url, label }];
      } catch {
        return [];
      }
    });
}

async function digestFile(file: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

async function publishOriginal(temp: string, output: string, digest: string): Promise<Asset["disposition"]> {
  const destination = resolve(output, digest);
  try {
    await link(temp, destination);
    return "acquired";
  } catch (error) {
    if (statusCode(error) !== "EEXIST") throw error;
    if (!(await lstat(destination)).isFile() || await digestFile(destination) !== digest)
      throw new Error("EXISTING_EVIDENCE_HASH_MISMATCH");
    return "already_present";
  }
}

async function validateBytes(path: string, format: Format, kind: Asset["kind"], byteLength: number, country?: DiscoveryCountry, expected?: string) {
  if (!byteLength) throw new Error("EMPTY_OFFICIAL_DOCUMENT");
  if (format === "pdf") {
    const file = await open(path, "r");
    try {
      const head = Buffer.alloc(Math.min(1024, byteLength));
      const tail = Buffer.alloc(Math.min(4096, byteLength));
      await file.read(head, 0, head.length, 0);
      await file.read(tail, 0, tail.length, byteLength - tail.length);
      if (!head.includes("%PDF-") || !tail.includes("%%EOF")) throw new Error("INVALID_PDF_ORIGINAL");
    } finally {
      await file.close();
    }
    return null;
  }
  const bytes = await readFile(path);
  if (format === "us_hts_json") {
    const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!Array.isArray(value) || value.length < 1000 || !value.some((row) =>
      row && typeof row.htsno === "string" && /^\d{4}(?:\.|$)/.test(row.htsno) && typeof row.general === "string"))
      throw new Error("INVALID_USITC_TARIFF_JSON");
    return null;
  }
  if (format === "zip" || format === "xlsx") {
    const zipHeader = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
    const zipEnd = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
    if (!bytes.subarray(0, 4).equals(zipHeader) || !bytes.subarray(-65557).includes(zipEnd) ||
        (format === "xlsx" && (!bytes.includes("[Content_Types].xml") || !bytes.includes("xl/workbook.xml"))))
      throw new Error("INVALID_OFFICIAL_ARCHIVE");
    return null;
  }
  if (format === "gzip") {
    if (byteLength < 18 || !bytes.subarray(0, 3).equals(Buffer.from([0x1f, 0x8b, 0x08])))
      throw new Error("INVALID_OFFICIAL_ARCHIVE");
    const input = createReadStream(path);
    const gunzip = createGunzip();
    input.on("error", (error) => gunzip.destroy(error));
    let decodedBytes = 0;
    try {
      for await (const chunk of input.pipe(gunzip)) {
        decodedBytes += (chunk as Buffer).length;
        if (decodedBytes > 256 * MiB) throw new Error("SOURCE_EXPANDED_SIZE_LIMIT");
      }
    } catch (error) {
      if (error instanceof Error && error.message === "SOURCE_EXPANDED_SIZE_LIMIT") throw error;
      throw new Error("INVALID_OFFICIAL_ARCHIVE");
    } finally {
      input.destroy();
      gunzip.destroy();
    }
    if (!decodedBytes) throw new Error("INVALID_OFFICIAL_ARCHIVE");
    return null;
  }
  const body = new TextDecoder(country === "JP" ? "shift_jis" : "utf-8").decode(bytes);
  if (format === "json") {
    const value: unknown = JSON.parse(body);
    if (value === null || typeof value !== "object" || !Object.keys(value).length)
      throw new Error("INVALID_OFFICIAL_JSON");
    return null;
  }
  if (format === "csv") {
    const lines = body.trim().split(/\r?\n/, 4);
    if (body.includes("\0") || /^\s*</.test(body) ||
        ![",", ";", "\t"].some((separator) => lines.filter((line) => line.includes(separator)).length >= 2))
      throw new Error("INVALID_OFFICIAL_CSV");
    return null;
  }
  if (format === "xml") {
    if (/^\s*(?:<!doctype\s+html|<html\b)/i.test(body) ||
        !/^\s*(?:<\?xml[^>]+>\s*)?<(?:[a-z_][a-z0-9_.:-]*)(?:\s|[/>])/i.test(body))
      throw new Error("INVALID_OFFICIAL_XML");
    return null;
  }
  const tableExpected = kind === "chapter" || (!country && expected === undefined);
  if (!/<html(?:\s|>)/i.test(body) || !/<\/html\s*>/i.test(body) ||
      (tableExpected && !/<table(?:\s|>)/i.test(body)) ||
      (expected && !body.toLowerCase().includes(expected.toLowerCase())))
    throw new Error("INVALID_OFFICIAL_HTML");
  return body;
}

async function requestOfficial(url: URL, options: Options, headers: Record<string, string>) {
  try {
    return await (options.fetchImpl ?? fetch)(url, {
      redirect: "manual", signal: AbortSignal.timeout(options.timeoutMs), headers,
    });
  } catch (error) {
    throw new Error(error instanceof Error && error.name === "TimeoutError" ? "SOURCE_TIMEOUT" : "SOURCE_TRANSPORT_FAILED");
  }
}

async function fullSource(request: (headers: Record<string, string>) => Promise<Response>,
  limit: number, accept: readonly string[]) {
  const response = await request({});
  const mediaType = sourceMediaType(response);
  const length = response.headers.get("content-length");
  if (response.status !== 200 || response.headers.has("content-range") || !accept.includes(mediaType) || !response.body ||
      (length && Number(length) > limit)) {
    await response.body?.cancel().catch(() => {});
    if (response.status >= 300 && response.status <= 399) throw new Error("UNEXPECTED_SOURCE_REDIRECT");
    if (response.status === 206 || response.headers.has("content-range")) throw new Error("PARTIAL_SOURCE_RESPONSE");
    if (response.status !== 200) throw new Error("SOURCE_HTTP_" + response.status);
    if (length && Number(length) > limit) throw new Error("SOURCE_SIZE_LIMIT");
    throw new Error("UNEXPECTED_SOURCE_MEDIA");
  }
  return { chunks: readSourceBody(response.body), mediaType,
    expectedLength: length && !response.headers.get("content-encoding") ? Number(length) : null };
}

async function acquireDocument(url: URL, format: Format, kind: Asset["kind"], options: Options,
  country?: DiscoveryCountry, expected?: string, ranged = false) {
  const { limit, accept } = formats[format];
  const request = (headers: Record<string, string>) =>
    requestOfficial(url, options, { accept: accept.join(", "), ...headers });
  const temp = resolve(options.output, ".acquire-" + randomUUID());
  const file = await open(temp, "wx", 0o600);
  let byteLength = 0;
  const hash = createHash("sha256");
  try {
    const { chunks, mediaType, expectedLength } = await (ranged
      ? recoverOfficialPdf(request, limit, accept)
      : fullSource(request, limit, accept));
    for await (const value of chunks) {
      byteLength += value.byteLength;
      if (byteLength > limit) throw new Error("SOURCE_SIZE_LIMIT");
      hash.update(value);
      await file.writeFile(value);
    }
    await file.sync();
    if (expectedLength !== null && expectedLength !== byteLength) throw new Error("SOURCE_LENGTH_MISMATCH");
    const body = await validateBytes(temp, format, kind, byteLength, country, expected);
    const sha256 = hash.digest("hex");
    const disposition = await publishOriginal(temp, options.output, sha256);
    const observedAt = (options.now ?? new Date()).toISOString();
    return { body, asset: {
      kind, url: url.href, sha256, byteLength, mediaType, observedAt, disposition,
      ...(ranged ? { transfer: "verified_http_ranges" as const } : {}),
    } satisfies Asset };
  } finally {
    await file.close().finally(() => rm(temp, { force: true }));
  }
}

function acquireOne(country: DiscoveryCountry, urlString: string, format: Format, kind: Asset["kind"], options: Options) {
  const url = trustedUrl(country, urlString);
  if (!permittedPath(country, kind, url.pathname)) throw new Error("SOURCE_PATH_NOT_PERMITTED");
  return acquireDocument(url, format, kind, options, country);
}

function failureReason(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return /^[A-Z0-9_]+$/.test(message) ? message : "SOURCE_READ_OR_VALIDATION_FAILED";
}

async function retryDocument<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (!/^SOURCE_(?:TIMEOUT|TRANSPORT_FAILED|BODY_READ_FAILED|HTTP_5[0-9]{2})$/.test(failureReason(error))) throw error;
    await new Promise((resolve) => setTimeout(resolve, 700));
    return run();
  }
}

function civilDate(value: string) {
  const iso = value.replaceAll("_", "-");
  const date = new Date(iso + "T00:00:00Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === iso ? iso : null;
}

function annualNoticeFromDirectory(body: string, year: string): string | null {
  const paragraphs = [...body.matchAll(/<p(?:\s[^>]*)?>([\s\S]*?)<\/p\s*>/gi)].map(([, text]) =>
    (text ?? "").replace(/<[^>]*>/g, "").replace(/&nbsp;|\s+/g, " ").trim());
  for (const [index, paragraph] of paragraphs.entries()) {
    if (!paragraph.includes("中华人民共和国进出口税则") || !paragraph.includes(year)) continue;
    const candidate = paragraphs[index + 1]?.match(/^https?:\/\/gss\.mof\.gov\.cn\/[^\s]+$/)?.[0];
    if (!candidate) continue;
    const url = trustedUrl("CN", candidate.replace(/^http:/, "https:"));
    if (cnNoticePath.test(url.pathname)) return url.href;
  }
  return null;
}

async function acquireCountry(country: DiscoveryCountry, options: Options, date: string): Promise<CountryAcquisition> {
  const result: CountryAcquisition = { country, status: "incomplete", edition: null, assets: [], failures: [] };
  const get = async (url: string, format: Format, kind: Asset["kind"]) => {
    try {
      const { body, asset } = await retryDocument(() => acquireOne(country, url, format, kind, options));
      result.assets.push(asset);
      return body;
    } catch (error) {
      result.failures.push({ url, reason: failureReason(error) });
      return null;
    }
  };
  const missing = (url: string, reason: string) => result.failures.push({ url, reason });

  if (country === "JP") {
    const root = await get(jpIndex, "html", "index");
    if (root) {
      const release = links(root, jpIndex, country).flatMap(({ url }) => {
        const match = jpReleasePath.exec(url.pathname);
        const day = match?.[1] ? civilDate(match[1]) : null;
        return day && day <= date ? [{ url, day, key: match![1]! }] : [];
      }).sort((a, b) => b.day.localeCompare(a.day))[0];
      if (!release) missing(jpIndex, "JP_RELEASE_NOT_FOUND");
      else {
        result.edition = release.day;
        const index = await get(release.url.href, "html", "edition");
        if (index) {
          const chapters = new Map(links(index, release.url.href, country).flatMap(({ url }) => {
            const match = jpChapterPath.exec(url.pathname);
            return match?.[1] === release.key ? [[Number(match[2]), url.href] as const] : [];
          }));
          for (let offset = 0; offset < jpChapters.length; offset += 5) {
            await Promise.all(jpChapters.slice(offset, offset + 5).map(async (chapter) => {
              const url = chapters.get(chapter);
              if (url) await get(url, "html", "chapter");
              else missing(release.url.href, "JP_CHAPTER_MISSING_" + chapter);
            }));
          }
        }
      }
    }
  } else if (country === "US") {
    const root = await get(usIndex, "html", "index");
    if (root) {
      const edition = links(root, usIndex, country).flatMap(({ url }) => {
        const match = usTariffPath.exec(url.pathname);
        const year = Number(match?.[1]);
        const revision = Number(match?.[2] ?? 0);
        return year === Number(date.slice(0, 4)) ? [{ url, year, revision }] : [];
      }).sort((a, b) => b.year - a.year || b.revision - a.revision)[0];
      if (!edition) missing(usIndex, "US_ARCHIVE_JSON_NOT_FOUND");
      else {
        result.edition = `${edition.year}-revision-${edition.revision}`;
        await get(edition.url.href, "us_hts_json", "base_schedule");
        if (edition.revision > 0)
          await get(`https://hts.usitc.gov/reststop/file?release=${edition.year}HTSRev${edition.revision}&filename=Chapter%2099`,
            "pdf", "policy_attachment");
      }
    }
  } else {
    const root = await get(cnIndex, "html", "index");
    if (root) {
      const year = date.slice(0, 4);
      const entries = links(root, cnIndex, country).filter(({ url }) => cnNoticePath.test(url.pathname));
      const listedAnnual = entries.find(({ label }) => label.includes(year) && label.includes("进出口税则"));
      const curated = await get(cnAnnualIndex, "html", "index");
      const annualUrl = listedAnnual?.url.href ?? (curated ? annualNoticeFromDirectory(curated, year) : null) ??
        (year === "2026" ? cnSeed2026 : null);
      if (!annualUrl) missing(cnIndex, "CN_CURRENT_ANNUAL_NOTICE_NOT_DISCOVERED");
      else {
        result.edition = year;
        const notice = await get(annualUrl, "html", "edition");
        if (notice) {
          const pdf = links(notice, annualUrl, country).find(({ url, label }) =>
            cnPdfPath.test(url.pathname) && label.includes("进出口税则"));
          if (pdf) await get(pdf.url.href, "pdf", "base_schedule");
          else missing(annualUrl, "CN_ANNUAL_PDF_NOT_FOUND");
        }
      }
      const policyUrls = [...new Set(entries.filter(({ label, url }) =>
        label.includes("关税") && url.href !== annualUrl).map(({ url }) => url.href))].slice(0, 10);
      for (let offset = 0; offset < policyUrls.length; offset += 3) {
        await Promise.all(policyUrls.slice(offset, offset + 3).map((url) => get(url, "html", "policy_notice")));
      }
    }
  }
  result.assets.sort((a, b) => a.url.localeCompare(b.url));
  result.failures.sort((a, b) => a.url.localeCompare(b.url) || a.reason.localeCompare(b.reason));
  if (!result.failures.length && result.edition) result.status = "acquired_for_review";
  return result;
}

async function acquireRegisteredDocument(url: URL, source: DownloadSource, options: Options) {
  const kind = source.role ?? "base_schedule";
  if (!source.rangeRecovery)
    return retryDocument(() => acquireDocument(url, source.format, kind, options, undefined, source.expected));
  try {
    return await acquireDocument(url, source.format, kind, options, undefined, source.expected);
  } catch (error) {
    if (!/^SOURCE_(?:TIMEOUT|TRANSPORT_FAILED|BODY_READ_FAILED|LENGTH_MISMATCH|HTTP_50[234])$/.test(failureReason(error)))
      throw error;
    return acquireDocument(url, "pdf", kind, options, undefined, undefined, true);
  }
}

async function acquireRegisteredSources(selected: string[], options: Options) {
  const results = new Map<string, CountryAcquisition>();
  for (const country of selected) {
    const references = listOfficialTariffReferences(country);
    results.set(country, {
      country, status: references.length ? "reference_only" : "no_source_configured",
      edition: null, assets: [], failures: [], references,
    });
  }

  const byUrl = new Map<string, DownloadSource[]>();
  for (const source of officialTariffSources) {
    if (source.access !== "download" || !source.countries.some((country) => results.has(country)) ||
        (options.sourceIds && !options.sourceIds.includes(source.id))) continue;
    const href = new URL(source.url).href;
    const entries = byUrl.get(href) ?? [];
    entries.push(source);
    byUrl.set(href, entries);
  }

  const pending = [...byUrl.entries()].entries();
  const fetchNext = async () => {
    for (const [, [url, sources]] of pending) {
      const source = sources[0]!;
      const observation = await acquireRegisteredDocument(new URL(url), source, options)
        .then(({ asset }) => ({ asset, reason: null }), (error: unknown) => ({ asset: null, reason: failureReason(error) }));
      for (const entry of sources) {
        for (const country of entry.countries) {
          const result = results.get(country);
          if (!result) continue;
          if (observation.asset) {
            result.assets.push({
              ...observation.asset, kind: entry.role ?? "base_schedule", sourceId: entry.id, sourceScope: entry.scope,
              ...(entry.group ? { sourceGroup: entry.group } : {}),
            });
          } else {
            result.failures.push({ url, reason: observation.reason, sourceId: entry.id });
          }
        }
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(5, byUrl.size) }, fetchNext));
  for (const result of results.values()) {
    result.assets.sort((a, b) => a.url.localeCompare(b.url) || (a.sourceId ?? "").localeCompare(b.sourceId ?? ""));
    result.failures.sort((a, b) => a.url.localeCompare(b.url) || (a.sourceId ?? "").localeCompare(b.sourceId ?? ""));
    if (result.failures.length) result.status = "incomplete";
    else if (result.assets.length) result.status = "acquired_for_review";
  }
  return results;
}

export async function acquireTariffSources(options: Options) {
  if (!options.countries.length || options.countries.some((country) => !isSupportedDestination(country) || country === "KP") ||
      !Number.isInteger(options.timeoutMs) || options.timeoutMs < 1 || options.timeoutMs > 180_000)
    throw new Error("INVALID_ACQUISITION_OPTIONS");
  if (options.sourceIds) {
    const selectedSources = officialTariffSources.filter(({ id }) => options.sourceIds?.includes(id));
    if (!selectedSources.length || selectedSources.length !== options.sourceIds.length ||
        selectedSources.some((source) => source.access !== "download" ||
          !source.countries.some((country) => options.countries.includes(country))) ||
        options.countries.some((country) => isDiscoveryCountry(country) ||
          !selectedSources.some((source) => source.countries.includes(country))))
      throw new Error("INVALID_REGISTERED_SOURCE_SELECTION");
  }
  const now = options.now ?? new Date();
  const referenceDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", dateStyle: "short" }).format(now);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(referenceDate)) throw new Error("INVALID_ACQUISITION_DATE");
  const output = resolve(options.output);
  const runs = resolve(output, "runs");
  await mkdir(runs, { recursive: true, mode: 0o700 });
  const selected = [...new Set(options.countries)];
  const acquisitionOptions = { ...options, output };
  const registered = await acquireRegisteredSources(selected.filter((country) => !isDiscoveryCountry(country)), acquisitionOptions);
  const results = await Promise.all(selected.map((country) => isDiscoveryCountry(country)
    ? acquireCountry(country, acquisitionOptions, referenceDate) : registered.get(country)!));
  const receiptPath = resolve(runs, now.toISOString().replaceAll(":", "-") + "-" + randomUUID() + ".json");
  const report = {
    schemaVersion: 2,
    status: results.every(({ status }) => status === "acquired_for_review") ? "acquired_for_review" : "incomplete",
    referenceDate, startedAt: now.toISOString(), tariffEffectiveDateVerified: false,
    approvalGranted: false, results,
    ...(options.sourceIds ? { selectedSourceIds: [...options.sourceIds].sort() } : {}),
  };
  const temp = receiptPath + ".tmp";
  try {
    await writeFile(temp, JSON.stringify(report, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    await link(temp, receiptPath);
  } finally {
    await rm(temp, { force: true });
  }
  return { ...report, receiptPath };
}

async function main() {
  const { values } = parseArgs({ options: {
    output: { type: "string" }, sources: { type: "string", default: discoveryCountries.join(",") },
    "timeout-ms": { type: "string", default: "45000" }, "source-ids": { type: "string" },
  }, strict: true });
  if (!values.output) throw new Error("OUTPUT_DIRECTORY_REQUIRED");
  const scope = values.sources.trim().toLowerCase();
  const selected = scope === "in-scope" ? inScopeCountries.filter((country) => country !== "KP")
    : scope === "all" ? acquisitionCountries : values.sources.split(",").map((source) => source.trim().toUpperCase());
  if (selected.includes("KP")) throw new Error("EXCLUDED_ACQUISITION_DESTINATION");
  if (!selected.every(isSupportedDestination)) throw new Error("UNSUPPORTED_ACQUISITION_COUNTRY");
  const report = await acquireTariffSources({
    ...(values["source-ids"] === undefined ? {} : { sourceIds: values["source-ids"].split(",").map((id) => id.trim()) }),
    output: values.output, countries: selected, timeoutMs: Number(values["timeout-ms"]),
  });
  console.log(JSON.stringify(report, null, 2));
  if (report.status === "incomplete") process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "OFFICIAL_ACQUISITION_FAILED");
    process.exitCode = 1;
  });
