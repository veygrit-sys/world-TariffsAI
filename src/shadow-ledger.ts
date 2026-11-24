import { createHash } from "node:crypto";
import { Ajv } from "ajv";
import addFormatsModule from "ajv-formats";
import {
  invoiceEstimateChargeCategories as categories, invoiceReconciliationInputSchema, reconcileInvoice,
  type InvoiceEstimate, type InvoiceEstimateChargeCategory as Category, type InvoiceReconciliationInput,
} from "./invoice-reconciliation.ts";
import { currencyDigits, minor, money } from "./money.ts";
import type { PilotQuote } from "./pilot-quote.ts";
import { InputError } from "./schema.ts";
import { PILOT_ROUTES, type PilotRoute } from "./trade-policy.ts";

type Sample = "live" | "synthetic";
const methods = ["ad_valorem", "japan_single_line_standard", "confirmed_amount", "not_applicable"] as const;
type Method = typeof methods[number];
type PostedInvoice = InvoiceReconciliationInput["invoice"];
type ShadowInvoice = Omit<PostedInvoice, "estimateId"> & { estimateId?: string };
type ShadowQuote =
  | { status: "held"; reasons: string[] }
  | { status: "offered"; estimate: InvoiceEstimate; methods: Record<Category, Method>; reviewBy?: string };

export interface ShadowOrder {
  sample: Sample;
  route: PilotRoute;
  orderId: string;
  skuRefs: string[];
  datasetVersion: string;
  capturedOn: string;
  quote: ShadowQuote;
  reviewMinutes?: number;
  observation?: { declarationRef: string; invoice: ShadowInvoice };
}

interface ShadowProduct {
  sample: Sample;
  route: PilotRoute;
  skuRef: string;
  classification: "candidate" | "confirmed" | "unreviewed";
  nationalCode?: string;
  reviewBy?: string;
}
interface ShadowLedger {
  version: 1;
  merchantRef: string;
  carrierRef: string;
  orders: ShadowOrder[];
  products?: ShadowProduct[];
}
const date = { type: "string", format: "date" };
const object = (properties: Record<string, unknown>, required = Object.keys(properties)) =>
  ({ type: "object", additionalProperties: false, properties, required });
const ref = { type: "string", pattern: "^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$" };
const reasonCode = { type: "string", pattern: "^[A-Z][A-Z0-9_]{0,99}$" };
const methodMap = object(Object.fromEntries(categories.map(category => [category, { enum: methods }])));
const nested = invoiceReconciliationInputSchema.properties;
const postedSchema = nested.invoice as { type: "object"; properties: Record<string, unknown>; required: string[] };
const shadowInvoiceSchema = { ...postedSchema, required: postedSchema.required.filter(key => key !== "estimateId") };

export const shadowLedgerSchema = object({
  version: { const: 1 }, merchantRef: ref, carrierRef: ref,
  products: { type: "array", maxItems: 10000, items: object({
    sample: { enum: ["live", "synthetic"] }, route: { enum: PILOT_ROUTES }, skuRef: ref,
    classification: { enum: ["unreviewed", "candidate", "confirmed"] },
    nationalCode: { type: "string", pattern: "^[0-9]{6,12}$" }, reviewBy: date,
  }, ["sample", "route", "skuRef", "classification"]) },
  orders: { type: "array", maxItems: 10000, items: object({
    sample: { enum: ["live", "synthetic"] }, route: { enum: PILOT_ROUTES }, orderId: ref,
    datasetVersion: ref, capturedOn: date,
    skuRefs: { type: "array", minItems: 1, maxItems: 100, uniqueItems: true, items: ref },
    reviewMinutes: { type: "integer", minimum: 0, maximum: 1000000 },
    quote: { oneOf: [
      object({ status: { const: "held" }, reasons: { type: "array", minItems: 1, maxItems: 100, uniqueItems: true, items: reasonCode } }),
      object({ status: { const: "offered" }, estimate: nested.estimate, methods: methodMap, reviewBy: date }, ["status", "estimate", "methods"]),
    ] },
    observation: object({ declarationRef: ref, invoice: shadowInvoiceSchema }),
  }, ["sample", "route", "orderId", "datasetVersion", "capturedOn", "skuRefs", "quote"]) },
}, ["version", "merchantRef", "carrierRef", "orders"]);
const ajv = new Ajv({ strict: true });
(addFormatsModule as unknown as (instance: Ajv) => void)(ajv);
const validate = ajv.compile<ShadowLedger>(shadowLedgerSchema);
const fail = (path: string, code: string): never => { throw new InputError([{ path, code }]); };

function knownMethod(name: string | undefined): name is Method {
  return methods.some(method => method === name);
}

/** Persist this projection at quote time, before the declaration or invoice is seen. */
export function captureShadowQuote(quote: PilotQuote): ShadowQuote {
  if (quote.status !== "estimated") {
    const reasons = [...new Set(quote.findings.map(finding => finding.code))];
    return { status: "held", reasons: reasons.length ? reasons : [quote.status.toUpperCase()] };
  }
  if (!quote.estimate) throw new Error("SHADOW_ESTIMATE_REQUIRED");
  const provenance = {} as Record<Category, Method>;
  for (const category of categories) {
    const method = quote.charges.find(charge => charge.category === category)?.calculation?.method;
    if (!knownMethod(method)) throw new Error("SHADOW_CHARGE_METHOD_REQUIRED");
    provenance[category] = method;
  }
  const reviewBy = quote.charges.flatMap(charge => charge.evidence ? [charge.evidence.reviewBy] : []).sort()[0];
  return { status: "offered", estimate: structuredClone(quote.estimate), methods: provenance, ...(reviewBy ? { reviewBy } : {}) };
}

function verifiedReconciliation(order: ShadowOrder, path: string) {
  const invoice = order.observation?.invoice;
  if (invoice && invoice.orderId !== order.orderId) fail(path + "/observation/invoice/orderId", "ORDER_ID_MISMATCH");
  if (order.quote.status === "held") {
    if (invoice) {
      if (invoice.estimateId !== undefined) fail(path + "/observation", "SHADOW_HELD_WITHOUT_ESTIMATE");
      if (invoice.issuedOn < order.capturedOn) fail(path + "/observation", "INVOICE_PREDATES_HOLD");
      const seen = new Set<string>();
      try {
        currencyDigits(invoice.currency);
        for (const charge of invoice.charges) {
          if (seen.has(charge.category)) fail(path + "/observation", "DUPLICATE_CHARGE_CATEGORY");
          seen.add(charge.category);
          minor(charge.amount, invoice.currency);
        }
      } catch (error) {
        if (!(error instanceof RangeError)) throw error;
        fail(path + "/observation", error.message);
      }
    }
    return null;
  }
  const { estimate, methods: chargeMethods } = order.quote;
  if (estimate.issuedOn !== order.capturedOn) fail(path + "/capturedOn", "SHADOW_ESTIMATE_DATE_MISMATCH");
  if (estimate.orderId !== order.orderId) fail(path + "/quote/estimate/orderId", "ORDER_ID_MISMATCH");
  try {
    currencyDigits(estimate.currency);
    const seen = new Set<Category>();
    for (const [i, charge] of estimate.charges.entries()) {
      const linePath = path + "/quote/estimate/charges/" + i;
      if (seen.has(charge.category)) fail(linePath, "DUPLICATE_CHARGE_CATEGORY");
      seen.add(charge.category);
      if (charge.amount === null) return fail(linePath, "SHADOW_OFFER_AMOUNT_REQUIRED");
      const amount = minor(charge.amount, estimate.currency);
      const method = chargeMethods[charge.category];
      if (method === "not_applicable" && amount !== 0n) fail(linePath, "SHADOW_NONZERO_NOT_APPLICABLE");
      if (method === "japan_single_line_standard" &&
          (order.route !== "CN-JP" || estimate.currency !== "JPY" ||
           !["customs_duty", "import_vat_gst"].includes(charge.category))) {
        fail(linePath, "SHADOW_JAPAN_METHOD_SCOPE");
      }
    }
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    fail(path + "/quote/estimate", error.message);
  }
  return invoice ? reconcileInvoice({ estimate, invoice }) : null;
}

function share(numerator: number, denominator: number) {
  return denominator ? numerator / denominator : null;
}

interface ReviewedOrder { order: ShadowOrder; result: ReturnType<typeof verifiedReconciliation> }
function summarizeRoute(entries: ReviewedOrder[], route: PilotRoute) {
  const skus = new Set<string>();
  const holdReasons = new Map<string, number>();
  const counts = Object.fromEntries(categories.map(category =>
    [category, { independentlyQuoted: 0, compared: 0, matched: 0, confirmedAmount: 0, notApplicable: 0 }])) as
    Record<Category, { independentlyQuoted: number; compared: number; matched: number; confirmedAmount: number; notApplicable: number }>;
  const maximum = new Map<string, { comparedOrders: number; amount: bigint }>();
  let offered = 0, withInvoice = 0, zeroDutyWithPositiveActual = 0, minutes = 0, timedReviews = 0;
  for (const { order, result } of entries) {
    for (const sku of order.skuRefs) skus.add(sku);
    if (order.reviewMinutes !== undefined) { minutes += order.reviewMinutes; timedReviews++; }
    if (order.quote.status === "held") {
      for (const code of safeReasons(order.quote.reasons)) holdReasons.set(code, (holdReasons.get(code) ?? 0) + 1);
      continue;
    }
    offered++;
    if (result) withInvoice++;
    for (const charge of order.quote.estimate.charges) {
      const method = order.quote.methods[charge.category];
      const byCategory = counts[charge.category];
      const comparison = result?.lines.find(line => line.category === charge.category);
      if (charge.category === "customs_duty" && comparison?.actual != null &&
          minor(charge.amount!, result!.currency) === 0n && minor(comparison.actual, result!.currency) > 0n) {
        zeroDutyWithPositiveActual++;
      }
      if (method === "confirmed_amount") { byCategory.confirmedAmount++; continue; }
      if (method === "not_applicable") { byCategory.notApplicable++; continue; }
      byCategory.independentlyQuoted++;
      if (comparison?.actual == null) continue;
      byCategory.compared++;
      if (comparison.status === "matched") byCategory.matched++;
    }
    // All six posted categories must be known; include any extra posted fee in the actual total.
    if (result?.actualTotal != null && order.observation) {
      const { currency, charges } = order.quote.estimate;
      const sum = (items: { amount: string | null }[]) =>
        items.reduce((total, item) => total + minor(item.amount!, currency), 0n);
      const delta = sum(order.observation.invoice.charges) - sum(charges);
      const current = maximum.get(currency) ?? { comparedOrders: 0, amount: 0n };
      current.comparedOrders++;
      if (delta > current.amount) current.amount = delta;
      maximum.set(currency, current);
    }
  }
  return {
    route, eligibleOrders: entries.length, uniqueSkus: skus.size, offered, held: entries.length - offered,
    offerRate: share(offered, entries.length), offeredWithInvoice: withInvoice, zeroDutyWithPositiveActual,
    holdReasons: Object.fromEntries([...holdReasons].sort()),
    reviewTime: { measuredOrders: timedReviews, totalMinutes: minutes, meanMinutes: share(minutes, timedReviews) },
    charges: categories.map(category => ({
      category, ...counts[category], matchRate: share(counts[category].matched, counts[category].compared),
    })),
    maximumUnderstatementByCurrency: [...maximum].sort(([a], [b]) => a.localeCompare(b)).map(([currency, v]) => ({
      currency, comparedOrders: v.comparedOrders, value: money(v.amount, currency).value,
    })),
  };
}

// Only documented operational codes can leave the file; unknown codes share a neutral label.
const publicHoldCodes = new Set([
  "BLOCKED", "REVIEW_REQUIRED", "OUT_OF_SCOPE", "ROUTE_OUT_OF_SCOPE", "CHARGE_EVIDENCE_REQUIRED",
  "DATED_TARIFF_REFERENCE_REQUIRED", "REQUOTE_REQUIRED", "CHARGE_CONFLICTS_WITH_APPLICABLE_RULE",
  "CHARGE_PAYMENT_SCOPE_REVIEW_REQUIRED", "EVIDENCE_DATE_REVIEW_REQUIRED", "EVIDENCE_SCOPE_MISMATCH",
  "CLASSIFICATION_REVIEW_REQUIRED", "NATIONAL_CLASSIFICATION_REQUIRED", "ORIGIN_REQUIRED",
  "IMPORT_DATE_ALREADY_PASSED", "REVIEWED_SHIPMENT_MISMATCH", "PILOT_PROCEDURE_REVIEW_REQUIRED",
  "EVIDENCE_SOURCE_REVIEW_REQUIRED", "CHARGE_AMOUNT_OUT_OF_RANGE", "CUSTOMS_VALUE_REQUIRED",
  "RESTRICTION_REVIEW_REQUIRED", "JP_LOADING_COUNTRY_REQUIRED",
]);
function safeReasons(codes: string[]) {
  return [...new Set(codes.map(code => publicHoldCodes.has(code) ? code : "OTHER_HOLD"))];
}
function siteProjection(ledger: ShadowLedger, sample: Sample, entries: ReviewedOrder[]) {
  // Aliases allow local joins without publishing the merchant's order/SKU identifiers.
  const alias = (type: string, ref: string) => type + "-" + createHash("sha256")
    .update(JSON.stringify([ledger.merchantRef, ledger.carrierRef, sample, type, ref])).digest("hex").slice(0, 20);
  const products = new Map<string, ShadowProduct>();
  for (const product of ledger.products ?? []) {
    if (product.sample !== sample) continue;
    const key = product.route + "/" + product.skuRef;
    if (products.has(key)) fail("/products", "DUPLICATE_SHADOW_PRODUCT");
    if (product.classification === "confirmed" && (!product.nationalCode || !product.reviewBy))
      fail("/products", "SHADOW_CONFIRMED_CLASSIFICATION_EVIDENCE_REQUIRED");
    if (product.classification === "unreviewed" && product.nationalCode)
      fail("/products", "SHADOW_UNREVIEWED_NATIONAL_CODE");
    products.set(key, product);
  }
  const orders = entries.map(({order, result}) => {
    const { quote, route } = order;
    for (const skuRef of order.skuRefs) {
      const key = route + "/" + skuRef;
      if (!products.has(key)) products.set(key, { sample, route, skuRef, classification: "unreviewed" });
    }
    const actuals = order.observation?.invoice.charges ?? [];
    const charges: {category: string; estimate: string | null; actual: string | null; method: string}[] =
      quote.status === "offered" ? quote.estimate.charges.map(charge => ({
        category: charge.category, estimate: charge.amount,
        actual: result?.lines.find(line => line.category === charge.category)?.actual ?? null,
        method: quote.methods[charge.category],
      })) : [];
    for (const charge of actuals) {
      if (!charges.some(line => line.category === charge.category))
        charges.push({category: charge.category, estimate: null, actual: charge.amount, method: "unestimated"});
    }
    return {
      orderKey: alias("order", order.orderId), route, capturedOn: order.capturedOn,
      skuKeys: order.skuRefs.map(ref => alias("sku", ref)), status: quote.status,
      holdReasons: quote.status === "held" ? safeReasons(quote.reasons) : [],
      currency: quote.status === "offered" ? quote.estimate.currency : order.observation?.invoice.currency ?? null,
      reviewMinutes: order.reviewMinutes ?? null, reviewBy: quote.status === "offered" ? quote.reviewBy ?? null : null,
      charges,
    };
  });
  return {
    version: 1, orders, products: [...products.values()].map(product => ({
      route: product.route, skuKey: alias("sku", product.skuRef), classification: product.classification,
      nationalCode: product.nationalCode ?? null, reviewBy: product.reviewBy ?? null,
    })),
  };
}
/** Return aggregates by default. Opt-in site output uses pseudonymous keys and excludes private references. */
export function summarizeShadowLedger(input: unknown, sample: Sample = "live", includeSite = false) {
  if (!validate(input)) throw new InputError((validate.errors ?? []).map(e => ({ path: e.instancePath, code: e.keyword })));
  if (sample !== "live" && sample !== "synthetic") fail("/sample", "INVALID_SHADOW_SAMPLE");
  const entries: ReviewedOrder[] = [];
  const seen = new Set<string>();
  for (const [index, order] of input.orders.entries()) {
    if (order.sample !== sample) continue;
    if (seen.has(order.orderId)) fail("/orders/" + index + "/orderId", "DUPLICATE_SHADOW_ORDER");
    seen.add(order.orderId);
    entries.push({ order, result: verifiedReconciliation(order, "/orders/" + index) });
  }
  const routes = PILOT_ROUTES.filter(route => route === "CN-JP" || entries.some(({order}) => order.route === route))
    .map(route => summarizeRoute(entries.filter(({order}) => order.route === route), route));
  const pilot = routes.find(report => report.route === "CN-JP")!;
  return {
    version: 1, sample, productionAuthorized: false, routes,
    ...(includeSite ? { site: siteProjection(input, sample, entries) } : {}),
    cnJpPilot: { orders: pilot.eligibleOrders, targetOrders: 30, skus: pilot.uniqueSkus, targetSkus: 10 },
  };
}
