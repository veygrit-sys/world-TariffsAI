import { createHash, timingSafeEqual, randomUUID } from "node:crypto";
import type { Dataset, EvidenceSelector } from "./types.ts";
import { assess } from "./engine.ts";
import { previewCheckout } from "./checkout.ts";
import { planCustoms } from "./customs-plan.ts";
import { quotePilotShipment, quoteWorldShipment } from "./pilot-quote.ts";
import { reconcileInvoice } from "./invoice-reconciliation.ts";
import { importSettlementCoverage } from "./import-settlement-coverage.ts";
import { importSettlementDestinations } from "./import-settlement-destinations.ts";
import { reviewImportSettlementPlan } from "./import-settlement-plan.ts";
import { reconcileImportSettlement } from "./import-settlement-reconciliation.ts";
import { reconcileImportSettlementLedger } from "./import-settlement-ledger.ts";
import { releaseReadiness } from "./release-readiness.ts";
import { VERSION } from "./version.ts";
import { worldDirection, worldDirectionCoverage } from "./world-directions.ts";
import { coverageLedger } from "./coverage-ledger.ts";
import { tariffEvidence } from "./tariff-evidence.ts";
import { ask, classify } from "./assistant.ts";
import { InputError } from "./schema.ts";
import { todayJst } from "./dataset.ts";
import { loadTariffCatalog, type TariffCatalog } from "./tariffs.ts";
import { ClassificationCatalog, loadClassificationCatalog } from "./classification-catalog.ts";
import { proposeClassification } from "./classification.ts";
import { assignClassification, parseClassificationEvents, type ClassificationEvent } from "./classification-approvals.ts";
import { loadClassificationEvents } from "./classification-store.ts";
import { assignClassificationBatch } from "./classification-batch.ts";
import { classificationRollout } from "./classification-rollout.ts";

const LIMIT = 65536;
export class WindowRateLimiter {
  #entries = new Map<string, { start: number; count: number }>();
  allow(peer: string, now: number, limit = 60): boolean {
    let entry = this.#entries.get(peer);
    if (!entry || now - entry.start >= 60000) {
      if (this.#entries.size >= 5000) {
        for (const [key, v] of this.#entries)
          if (now - v.start >= 60000) this.#entries.delete(key);
      }
      if (this.#entries.size >= 5000 && !entry) return false;
      entry = { start: now, count: 0 };
      this.#entries.set(peer, entry);
    }
    return ++entry.count <= limit;
  }
}
export function authenticated(header: string | null, key: string): boolean {
  if (!key || !header?.startsWith("Bearer ") || header.length > 2048)
    return false;
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(digest(header.slice(7)), digest(key));
}
function reply(status: number, body: unknown, requestId: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "x-request-id": requestId,
      "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
    },
  });
}
async function body(request: Request): Promise<unknown> {
  if (
    request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !==
    "application/json"
  )
    throw new HttpError(415, "JSON_REQUIRED");
  if (
    request.headers.has("content-encoding") &&
    request.headers.get("content-encoding") !== "identity"
  )
    throw new HttpError(415, "ENCODING_NOT_SUPPORTED");
  if (Number(request.headers.get("content-length") ?? 0) > LIMIT)
    throw new HttpError(413, "BODY_TOO_LARGE");
  if (!request.body) throw new HttpError(400, "INVALID_JSON");
  const reader = request.body.getReader();
  let total = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > LIMIT) throw new HttpError(413, "BODY_TOO_LARGE");
      chunks.push(next.value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "INVALID_JSON");
  }
}
class HttpError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}
export interface HandlerOptions {
  dataset: Dataset;
  tariffs?: TariffCatalog;
  apiKey: string;
  allowUnauthenticatedLoopback?: boolean;
  selector?: EvidenceSelector;
  now?: () => Date;
  rateLimiter?: WindowRateLimiter;
  liveValidationRecords?: unknown;
  classificationCatalog?: ClassificationCatalog;
  /** Server-managed records; never populated from the HTTP request body. */
  classificationEvents?: readonly ClassificationEvent[];
}
export function createHandler(options: HandlerOptions) {
  if (!options.apiKey && !options.allowUnauthenticatedLoopback)
    throw new Error("API_KEY_REQUIRED");
  if (options.apiKey && options.apiKey.length < 32)
    throw new Error("API_KEY_TOO_SHORT");
  const limiter = options.rateLimiter ?? new WindowRateLimiter();
  const tariffs = options.tariffs ?? loadTariffCatalog(options.dataset);
  const classificationCatalog = options.classificationCatalog ?? loadClassificationCatalog(process.env, options.dataset);
  return async (
    request: Request,
    context: { peer: string },
  ): Promise<Response> => {
    const id = randomUUID();
    try {
      const url = new URL(request.url);
      const path = url.pathname;
      const now = options.now?.() ?? new Date();
      if (path === "/health" && request.method === "GET")
        return reply(200, { status: "ok", version: VERSION }, id);
      const loopback = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
        context.peer,
      );
      const localDevelopment = options.allowUnauthenticatedLoopback && loopback;
      if (
        !authenticated(request.headers.get("authorization"), options.apiKey) &&
        !localDevelopment
      )
        throw new HttpError(401, "UNAUTHORIZED");
      if (request.headers.has("origin"))
        throw new HttpError(403, "SERVER_TO_SERVER_ONLY");
      if (!limiter.allow(context.peer, now.getTime()))
        throw new HttpError(429, "RATE_LIMITED");
      if (path === "/v1/countries" && request.method === "GET")
        return reply(
          200,
          {
            countries: options.dataset.countries,
            supplementalRegions: options.dataset.supplementalRegions,
          },
          id,
        );
      if (path === "/v1/coverage" && request.method === "GET")
        return reply(
          200,
          {
            recognisedIsoEntries: options.dataset.countries.length,
            inScopeEntries: options.dataset.countries.filter((c) => c.inScope)
              .length,
            recognisedSupplementalRegions:
              options.dataset.supplementalRegions.length,
            primaryEvidenceCards: options.dataset.cards.filter(
              (c) => c.verification === "primary_rechecked",
            ).length,
            inheritedResearchCards: options.dataset.cards.filter(
              (c) => c.verification === "inherited_research",
            ).length,
            calculationRuleIds: options.dataset.rules.map((r) => r.id),
            commerciallyAuthorisedRoutes: 0,
            allWorldTaxRatesComplete: false,
            tariffCoveragePath: "/v1/tariffs/coverage",
            tariffEvidencePath: "/v1/tariffs/evidence",
            destinationCoveragePath: "/v1/coverage/destinations",
            checkoutPreviewPath: "/v1/checkout/preview",
            customsPlanPath: "/v1/customs/plan",
            pilotQuotePath: "/v1/pilot/quote",
            worldwideQuotePath: "/v1/worldwide/quote",
            worldwideDirectionPath: "/v1/worldwide/direction",
            worldwideCoveragePath: "/v1/worldwide/coverage",
            worldwideReconciliationPath: "/v1/worldwide/reconcile",
            importSettlementCoveragePath: "/v1/import-settlement/coverage",
            importSettlementDestinationsPath: "/v1/import-settlement/destinations",
            invoiceReconciliationPath: "/v1/pilot/reconcile",
            releaseReadinessPath: "/v1/release-readiness",
            wcoCoveragePath: "/v1/tariffs/coverage/wco",
            territoryCoveragePath: "/v1/tariffs/coverage/territories",
            ruleSetVersion: options.dataset.version,
          },
          id,
        );
      if (path === "/v1/sources" && request.method === "GET")
        return reply(200, { sources: options.dataset.sources }, id);
      if (path === "/v1/tariffs/coverage" && request.method === "GET")
        return reply(200, tariffs.coverage(), id);
      if ([
        "/v1/tariffs/coverage/wco",
        "/v1/tariffs/coverage/territories",
        "/v1/coverage/destinations",
      ].includes(path)) {
        if (request.method !== "GET")
          throw new HttpError(405, "METHOD_NOT_ALLOWED");
        const dates = url.searchParams.getAll("date");
        if (dates.length > 1)
          throw new InputError([{ path: "/date", code: "DUPLICATE_QUERY_PARAMETER" }]);
        const date = dates[0] ?? todayJst(now);
        const result = path.endsWith("/wco")
          ? tariffs.wcoCoverage(date)
          : path.endsWith("/territories")
            ? tariffs.territoryCoverage(date)
            : coverageLedger(options.dataset, tariffs, date, now);
        return reply(200, result, id);
      }
      if (path === "/v1/tariffs/evidence") {
        if (request.method !== "GET") throw new HttpError(405, "METHOD_NOT_ALLOWED");
        for (const name of new Set(url.searchParams.keys())) {
          if (name !== "country" && name !== "date")
            throw new InputError([{ path: "/query", code: "UNKNOWN_QUERY_PARAMETER" }]);
          if (url.searchParams.getAll(name).length !== 1)
            throw new InputError([{ path: "/" + name, code: "DUPLICATE_QUERY_PARAMETER" }]);
        }
        return reply(200, tariffEvidence(url.searchParams.get("country") ?? "",
          url.searchParams.get("date") ?? undefined, options.dataset, tariffs, now), id);
      }
      if (path === "/v1/tariffs/lookup") {
        if (request.method !== "POST")
          throw new HttpError(405, "METHOD_NOT_ALLOWED");
        return reply(200, tariffs.lookup(await body(request)), id);
      }
      if (path === "/v1/checkout/preview") {
        if (request.method !== "POST")
          throw new HttpError(405, "METHOD_NOT_ALLOWED");
        return reply(200, previewCheckout(await body(request), options.dataset, now, tariffs), id);
      }
      if (path === "/v1/customs/plan") {
        if (request.method !== "POST")
          throw new HttpError(405, "METHOD_NOT_ALLOWED");
        return reply(200, planCustoms(await body(request), options.dataset, tariffs, now), id);
      }
      if (path === "/v1/release-readiness") {
        if (request.method !== "GET") throw new HttpError(405, "METHOD_NOT_ALLOWED");
        return reply(200, releaseReadiness(options.dataset, now,
          options.liveValidationRecords ?? [], tariffs.manifestSha256()), id);
      }
      if (path === "/v1/pilot/quote") {
        if (request.method !== "POST") throw new HttpError(405, "METHOD_NOT_ALLOWED");
        return reply(200, quotePilotShipment(await body(request), options.dataset, tariffs, now), id);
      }
      if (["/v1/worldwide/direction", "/v1/worldwide/coverage", "/v1/import-settlement/coverage",
        "/v1/import-settlement/destinations"].includes(path)) {
        if (request.method !== "GET") throw new HttpError(405, "METHOD_NOT_ALLOWED");
        const query = Object.fromEntries(url.searchParams);
        for (const name of Object.keys(query))
          if (url.searchParams.getAll(name).length !== 1)
            throw new InputError([{ path: "/" + name, code: "DUPLICATE_QUERY_PARAMETER" }]);
        if (path === "/v1/worldwide/direction")
          return reply(200, worldDirection(query, options.dataset, tariffs, now), id);
        if (path === "/v1/import-settlement/coverage")
          return reply(200, importSettlementCoverage(query, options.dataset, tariffs, now), id);
        if (path === "/v1/import-settlement/destinations")
          return reply(200, importSettlementDestinations(query, options.dataset, tariffs, now), id);
        if (Object.keys(query).some((name) => name !== "date"))
          throw new InputError([{ path: "/query", code: "UNKNOWN_QUERY_PARAMETER" }]);
        return reply(200, worldDirectionCoverage(options.dataset, tariffs, query.date, now), id);
      }
      if (path === "/v1/worldwide/quote") {
        if (request.method !== "POST") throw new HttpError(405, "METHOD_NOT_ALLOWED");
        return reply(200, quoteWorldShipment(await body(request), options.dataset, tariffs, now), id);
      }
      if (path === "/v1/pilot/reconcile" || path === "/v1/worldwide/reconcile") {
        if (request.method !== "POST") throw new HttpError(405, "METHOD_NOT_ALLOWED");
        return reply(200, reconcileInvoice(await body(request)), id);
      }
      if (path === "/v1/import-settlement/ledger") {
        if (request.method !== "POST") throw new HttpError(405, "METHOD_NOT_ALLOWED");
        return reply(200, reconcileImportSettlementLedger(await body(request), now, options.dataset), id);
      }
      if (path === "/v1/classification/rollout") {
        if (request.method !== "GET") throw new HttpError(405, "METHOD_NOT_ALLOWED");
        const query: Record<string, unknown> = Object.fromEntries(url.searchParams);
        for (const name of url.searchParams.keys()) {
          if (url.searchParams.getAll(name).length !== 1)
            throw new InputError([{ path: "/" + name, code: "DUPLICATE_QUERY_PARAMETER" }]);
          if (name === "offset" || name === "limit") {
            const value = url.searchParams.get(name)!;
            if (!/^(0|[1-9]\d{0,5})$/.test(value))
              throw new InputError([{ path: "/" + name, code: "INVALID_CLASSIFICATION_PAGINATION" }]);
            query[name] = Number(value);
          }
        }
        return reply(200, classificationRollout(query, classificationCatalog, options.dataset, now), id);
      }
      if (path === "/v1/classification/coverage") {
        if (request.method !== "GET") throw new HttpError(405, "METHOD_NOT_ALLOWED");
        if (url.searchParams.size) throw new InputError([{ path: "/query", code: "UNKNOWN_QUERY_PARAMETER" }]);
        return reply(200, {
          catalogVersion: classificationCatalog.version, catalogDigest: classificationCatalog.digest,
          sourceCount: classificationCatalog.sources.length, ruleCount: classificationCatalog.rules.length,
          nationalCodeRuleCount: classificationCatalog.rules.filter((rule) => rule.nationalCode !== undefined).length,
          countries: [...new Set(classificationCatalog.rules.map((rule) => rule.country))].sort(),
          directions: [...new Set(classificationCatalog.rules.map((rule) => rule.direction))].sort(),
          hsEditions: [...new Set(classificationCatalog.rules.map((rule) => rule.hsEdition))].sort(),
          assignmentRequiresRecordedReview: true, shippingAuthorized: false, productionAuthorized: false,
        }, id);
      }
      if (path === "/v1/classification/sources") {
        if (request.method !== "GET") throw new HttpError(405, "METHOD_NOT_ALLOWED");
        for (const name of url.searchParams.keys())
          if (!["offset", "limit"].includes(name) || url.searchParams.getAll(name).length !== 1)
            throw new InputError([{ path: "/query", code: "INVALID_QUERY_PARAMETER" }]);
        const offsetText = url.searchParams.get("offset") ?? "0";
        const limitText = url.searchParams.get("limit") ?? "25";
        if (!/^(0|[1-9]\d{0,5})$/.test(offsetText) || !/^[1-9]\d{0,2}$/.test(limitText) || Number(limitText) > 100)
          throw new InputError([{ path: "/query", code: "INVALID_CLASSIFICATION_PAGINATION" }]);
        const offset = Number(offsetText), limit = Number(limitText);
        const sources = classificationCatalog.sources.slice(offset, offset + limit);
        return reply(200, { catalogVersion: classificationCatalog.version, catalogDigest: classificationCatalog.digest,
          sources, total: classificationCatalog.sources.length,
          nextOffset: offset + sources.length < classificationCatalog.sources.length ? offset + sources.length : null }, id);
      }
      if (["/v1/classification/propose", "/v1/classification/assign", "/v1/classification/batch"].includes(path)) {
        if (request.method !== "POST") throw new HttpError(405, "METHOD_NOT_ALLOWED");
        const input = await body(request);
        if (path.endsWith("/propose"))
          return reply(200, proposeClassification(input, classificationCatalog, options.dataset, now), id);
        // Re-read the protected registry so revocations apply on the next request.
        let events: ClassificationEvent[];
        try {
          events = parseClassificationEvents(options.classificationEvents ?? loadClassificationEvents(process.env, now), now);
        } catch {
          throw new Error("CLASSIFICATION_CONFIGURATION_INVALID");
        }
        return reply(200, path.endsWith("/batch")
          ? assignClassificationBatch(input, classificationCatalog, events, options.dataset, now)
          : assignClassification(input, classificationCatalog, events, options.dataset, now), id);
      }
      if (path === "/v1/import-settlement/plan" || path === "/v1/import-settlement/reconcile") {
        if (request.method !== "POST") throw new HttpError(405, "METHOD_NOT_ALLOWED");
        const input = await body(request);
        return reply(200, path.endsWith("/plan")
          ? reviewImportSettlementPlan(input, options.dataset, tariffs, now)
          : reconcileImportSettlement(input, now, options.dataset), id);
      }
      if (["/v1/assess", "/v1/ask", "/v1/classify"].includes(path)) {
        if (request.method !== "POST")
          throw new HttpError(405, "METHOD_NOT_ALLOWED");
        const payload = await body(request);
        const result =
          path === "/v1/assess"
            ? assess(payload, options.dataset, now)
            : path === "/v1/classify"
              ? classify(payload)
              : await ask(
                  payload,
                  options.dataset,
                  options.selector,
                  now,
                  tariffs,
                );
        return reply(200, result, id);
      }
      throw new HttpError(404, "NOT_FOUND");
    } catch (error) {
      if (error instanceof InputError)
        return reply(400, { error: "INVALID_INPUT", issues: error.issues }, id);
      if (error instanceof HttpError)
        return reply(error.status, { error: error.code }, id);
      // Do not return or log request content, provider responses, tokens or stack traces.
      return reply(500, { error: "INTERNAL_ERROR" }, id);
    }
  };
}
