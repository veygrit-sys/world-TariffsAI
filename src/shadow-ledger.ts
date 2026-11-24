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
import { northKoreaBlockReason, PILOT_ROUTES } from "./trade-policy.ts";
import { loadDataset } from "./dataset.ts";

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
  route: string;
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
  route: string;
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
const routeCode = { type: "string", pattern: "^[A-Z]{2}-[A-Z]{2}$" };
const reasonCode = { type: "string", pattern: "^[A-Z][A-Z0-9_]{0,99}$" };
const methodMap = object(Object.fromEntries(categories.map(category => [category, { enum: methods }])));
const nested = invoiceReconciliationInputSchema.properties;
const postedSchema = nested.invoice as { type: "object"; properties: Record<string, unknown>; required: string[] };
const shadowInvoiceSchema = { ...postedSchema, required: postedSchema.required.filter(key => key !== "estimateId") };

export const shadowLedgerSchema = object({
  version: { const: 1 }, merchantRef: ref, carrierRef: ref,
  products: { type: "array", maxItems: 10000, items: object({
    sample: { enum: ["live", "synthetic"] }, route: routeCode, skuRef: ref,
    classification: { enum: ["unreviewed", "candidate", "confirmed"] },
    nationalCode: { type: "string", pattern: "^[0-9]{6,12}$" }, reviewBy: date,
  }, ["sample", "route", "skuRef", "classification"]) },
  orders: { type: "array", maxItems: 10000, items: object({
    sample: { enum: ["live", "synthetic"] }, route: routeCode, orderId: ref,
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

/** A procedure or partial tax preview cannot become a six-fee landed import offer. */
export function captureCountryPreview(preview: {
  status: "partial_estimate" | "needs_review" | "out_of_scope";
  reasons: readonly string[];
}): Extract<ShadowQuote, { status: "held" }> {
  const reasons = new Set(safeReasons(preview.reasons));
  if (preview.status === "partial_estimate") reasons.add("PARTIAL_ESTIMATE");
  if (preview.status === "out_of_scope") reasons.add("OUT_OF_SCOPE");
  if (!reasons.size) reasons.add("REVIEW_REQUIRED");
  return { status: "held", reasons: [...reasons] };
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
function summarizeRoute(entries: ReviewedOrder[], route: string) {
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
  "PARTIAL_ESTIMATE", "REGIME_EVIDENCE_REQUIRED", "CARRIER_FEE_REQUIRED",
  "RESTRICTION_REVIEW_REQUIRED", "JP_LOADING_COUNTRY_REQUIRED",
  // Shared route, evidence and source checks, including findings forwarded by the country modules.
  "COUNTRY_PROFILE_UNAVAILABLE", "CROSS_BORDER_REQUIRED", "COUNTRY_PROCEDURE_REVIEW", "DESTINATION_OUT_OF_SCOPE",
  "DIRECT_ORDINARY_B2C_SCOPE_REQUIRED", "ZONE_UNRESOLVED", "TRANSIT_CUSTOMS_REVIEW", "TRADE_BLOC_REVIEW",
  "TRANSIT_TRADE_REVIEW", "EU_INTRA_REVIEW", "AGGREGATION_REQUIRED", "TRANSPORT_REVIEW", "INVENTORY_REVIEW",
  "THRESHOLD_EXCEEDED", "CURRENCY_CONVERSION_REQUIRED", "CLASSIFICATION_REQUIRED", "NON_DUTIABLE_REQUIRED",
  "STANDARD_TAX_REQUIRED", "SELLER_TAX_REQUIRED", "TAX_EVIDENCE_REQUIRED", "REGULATED_GOODS",
  "SOURCE_REVIEW_REQUIRED", "RULE_NOT_CURRENT", "CARRIER_FEES_UNRESOLVED", "BUYER_FEE_LIABILITY_UNCONFIRMED", "TRANSACTION_REVIEW",
  "KP_COMMERCIAL_EXCLUDED", "JP_KP_ORIGIN_OR_LOADING_EXCLUDED", "KP_NEXUS_REVIEW",
  "US_IR_CU_TRADE_REVIEW", "US_JURISDICTION_REVIEW_REQUIRED", "RU_BY_TRADE_REVIEW",
  // Japan and EU
  "JP_RELIEF_EVIDENCE_REQUIRED", "JAPAN_EXCLUSION_REVIEW", "EU_DISTANCE_SALE_EVIDENCE_REQUIRED",
  "EU_DECLARATION_ITEM_COUNT_REQUIRED", "EU_HANDLING_FEE_REVIEW", "EU_VAT_UNRESOLVED",
  "EU_PRODUCT_ID_REQUIRED", "EU_PROCEDURE_REVIEW", "IOSS_REGISTRATION_REQUIRED",
  // Great Britain
  "GB_SOURCE_WINDOW_REVIEW", "GB_EVIDENCE_REQUIRED", "GB_SALE_DATE_REVIEW", "GB_DESTINATION_REGION_REVIEW",
  "GB_STOCK_AT_SALE_REVIEW", "GB_EXCISE_REVIEW", "GB_INVOICE_BASIS_REVIEW", "GB_LOW_VALUE_SCOPE_REVIEW",
  "GB_DELIVERY_CONTRACT_REVIEW", "GB_INSURANCE_TREATMENT_REVIEW", "GB_SKU_EVIDENCE_REVIEW",
  "GB_SKU_VAT_TREATMENT_REVIEW",
  // Singapore
  "SG_SOURCE_REVIEW", "SG_TRANSACTION_EVIDENCE_REQUIRED", "SG_REVIEWED_SGD_VALUES_REQUIRED",
  "SG_DIRECT_B2C_AIR_POST_REQUIRED", "SG_SEPARATE_NET_SALES_AND_DELIVERY_REQUIRED", "SG_AGGREGATED_CONSIGNMENT_REQUIRED",
  "SG_SELLER_GST_STATUS_REQUIRED", "SG_CONFIRMED_CLASSIFICATION_REQUIRED", "SG_NON_DUTIABLE_STANDARD_GOODS_REQUIRED",
  "SG_ITEM_OVER_LVG_THRESHOLD", "SG_ROUTE_OR_TREATMENT_REVIEW", "SG_CUSTOMS_FEE_REVIEW", "SG_CARRIER_FEE_REVIEW",
  "SG_DOUBLE_COLLECTION_REFUND_REVIEW", "SG_OVR_ENTRY_VALUE_METHOD_REVIEW", "SG_CHECKOUT_COLLECTION_CONFLICT",
  "SG_CHECKOUT_GST_ROUNDING_REVIEW", "SG_GST_PAID_ITEM_HANDOFF_REQUIRED", "SG_REVIEWED_CIF_REQUIRED",
  "SG_CIF_SCOPE_MISMATCH", "SG_IMPORT_LINE_SCOPE_REQUIRED", "SG_IMPORT_PERMIT_ROUNDING_REVIEW",
  // Australia and New Zealand
  "OCEANIA_MERCHANT_INVOICE_EVIDENCE_REQUIRED", "REGISTERED_DIRECT_CONSUMER_SALE_REQUIRED",
  "CONFIRMED_STANDARD_STATIONERY_LINE_REQUIRED", "CONFIRMED_AGGREGATE_CUSTOMS_VALUE_REQUIRED",
  "INVOICE_AND_AGGREGATE_CUSTOMS_VALUE_REVIEW", "NZ_GST_EVIDENCE_REQUIRED",
  "NZ_POSTAL_OPERATOR_LEVY_BUYER_SHARE_UNKNOWN", "NZ_FREIGHT_LEVY_BUYER_SHARE_UNKNOWN",
  // China
  "CN_PILOT_SOURCE_REVIEW", "CN_GENERAL_IMPORT_TARIFF_REVIEW", "CN_CBEC_INVENTORY_REGIME_REVIEW",
  "CN_DECLARATION_CNY_REQUIRED", "CN_CHANNEL_PRODUCT_AND_ORDER_EVIDENCE_REQUIRED", "CN_POSITIVE_LIST_COMMODITY_REVIEW",
  "CN_PURCHASER_VERIFICATION_OR_PAYER_MATCH_REQUIRED", "CN_QUOTA_BEFORE_ORDER_REQUIRED", "CN_QUOTA_BEFORE_ORDER_INVALID",
  "CN_ACTUAL_PRICE_FREIGHT_INSURANCE_REVIEW", "CN_ANNUAL_ALLOWANCE_EXCEEDED",
  "CN_FULL_DUTY_VAT_AND_EXCISE_REVIEW", "CN_OVER_LIMIT_SINGLE_UNIT_EXCEPTION_UNAVAILABLE",
  "CN_ITEM_VAT_EXCISE_AND_COLLECTION_REVIEW", "CN_VAT_FEN_ROUNDING_REVIEW", "CN_FEES_AND_FINAL_ASSESSMENT_REVIEW",
  // United States
  "US_STANDARD_ENTRY_REVIEW", "US_IMPORT_NETWORK_CONFIRMATION_REQUIRED", "US_PILOT_SOURCE_REVIEW",
  "US_CONFIRMED_USD_CUSTOMS_VALUE_REQUIRED", "US_LOW_VALUE_NO_AUTOMATIC_EXEMPTION",
  "US_NONPOSTAL_ENTRY_HTS_AND_ADDITIONAL_MEASURES_REVIEW", "US_POSTAL_FORMAL_ENTRY_OR_SPECIFIC_EXCEPTION_REVIEW",
  "US_POSTAL_QUOTA_AD_CVD_PGA_AND_CLAIM_SCREEN_REQUIRED", "US_POSTAL_FILER_PGA_CHAPTER_AND_ENTRY13_REVIEW",
  "US_POSTAL_HTS_FILER_AND_CHARGES_REVIEW",
]);
function safeReasons(codes: readonly string[]) {
  return [...new Set(codes.map(code => publicHoldCodes.has(code) ? code : "OTHER_HOLD"))];
}
function siteProjection(ledger: ShadowLedger, sample: Sample, entries: ReviewedOrder[], products: Map<string, ShadowProduct>) {
  // Aliases allow local joins without publishing the merchant's order/SKU identifiers.
  const alias = (type: string, ref: string) => type + "-" + createHash("sha256")
    .update(JSON.stringify([ledger.merchantRef, ledger.carrierRef, sample, type, ref])).digest("hex").slice(0, 20);
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
export function summarizeShadowLedger(input: unknown, sample: Sample = "live", includeSite = false, data = loadDataset()) {
  if (!validate(input)) throw new InputError((validate.errors ?? []).map(e => ({ path: e.instancePath, code: e.keyword })));
  if (sample !== "live" && sample !== "synthetic") fail("/sample", "INVALID_SHADOW_SAMPLE");
  const allowed = new Set([...data.countries, ...data.supplementalRegions]
    .filter(location => location.inScope).map(location => location.code));
  function checkRoute(route: string, path: string) {
    const [origin, destination] = route.split("-") as [string, string];
    if (origin === destination || !allowed.has(origin) || !allowed.has(destination) ||
        northKoreaBlockReason({ dispatchCountry: origin, destinationCountry: destination, productOriginCountries: [] }))
      fail(path, "SHADOW_ROUTE_OUT_OF_SCOPE");
  }
  const products = new Map<string, ShadowProduct>();
  for (const [index, product] of (input.products ?? []).entries()) {
    checkRoute(product.route, "/products/" + index + "/route");
    if (product.sample !== sample) continue;
    const key = product.route + "/" + product.skuRef;
    if (products.has(key)) fail("/products", "DUPLICATE_SHADOW_PRODUCT");
    if (product.classification === "confirmed" && (!product.nationalCode || !product.reviewBy))
      fail("/products", "SHADOW_CONFIRMED_CLASSIFICATION_EVIDENCE_REQUIRED");
    if (product.classification === "unreviewed" && product.nationalCode)
      fail("/products", "SHADOW_UNREVIEWED_NATIONAL_CODE");
    products.set(key, product);
  }
  const entries: ReviewedOrder[] = [];
  const byRoute = new Map<string, ReviewedOrder[]>([["CN-JP", []]]);
  for (const product of products.values()) byRoute.set(product.route, []);
  const seen = new Set<string>();
  for (const [index, order] of input.orders.entries()) {
    checkRoute(order.route, "/orders/" + index + "/route");
    if (order.sample !== sample) continue;
    if (seen.has(order.orderId)) fail("/orders/" + index + "/orderId", "DUPLICATE_SHADOW_ORDER");
    seen.add(order.orderId);
    const entry = { order, result: verifiedReconciliation(order, "/orders/" + index) };
    entries.push(entry);
    const lane = byRoute.get(order.route);
    if (lane) lane.push(entry);
    else byRoute.set(order.route, [entry]);
  }
  // Keep the order of the original six lanes, then append new lanes alphabetically.
  const legacy = new Set<string>(PILOT_ROUTES);
  const routeOrder = [...PILOT_ROUTES.filter(route => byRoute.has(route)),
    ...[...byRoute.keys()].filter(route => !legacy.has(route)).sort()];
  const routes = routeOrder.map(route => summarizeRoute(byRoute.get(route)!, route));
  const pilots = routes.map(row => ({
    route: row.route, orders: row.eligibleOrders, targetOrders: 30, skus: row.uniqueSkus, targetSkus: 10,
  }));
  const { orders, targetOrders, skus, targetSkus } = pilots.find(row => row.route === "CN-JP")!;
  return {
    version: 1, sample, productionAuthorized: false, routes, pilots,
    ...(includeSite ? { site: siteProjection(input, sample, entries, products) } : {}),
    cnJpPilot: { orders, targetOrders, skus, targetSkus },
  };
}
