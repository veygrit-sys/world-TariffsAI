import { Ajv } from "ajv";
import addFormatsModule from "ajv-formats";
import { planCustoms } from "./customs-plan.ts";
import { todayJst } from "./dataset.ts";
import { requestDigest } from "./engine.ts";
import {
  invoiceEstimateChargeCategories,
  type InvoiceEstimate,
  type InvoiceEstimateChargeCategory,
} from "./invoice-reconciliation.ts";
import { minor, money, roundRatio } from "./money.ts";
import { customsPlanSchema, InputError, shipmentSchema } from "./schema.ts";
import type { TariffCatalog } from "./tariffs.ts";
import { assessTradePolicy, type TradePolicyDecision, type TradePolicyScope } from "./trade-policy.ts";
import type { Amount, CustomsPlanRequest, Dataset } from "./types.ts";

export const pilotChargeCategories = [...invoiceEstimateChargeCategories, "checkout_tax"] as const;
export type PilotChargeCategory = (typeof pilotChargeCategories)[number];

const sourceTypes = ["authority", "customs_broker", "carrier", "merchant"] as const;
export interface PilotChargeEvidence {
  id: string;
  sourceUrl: string;
  sourceType: (typeof sourceTypes)[number];
  destinationCountry: string;
  currency: string;
  reviewedOn: string;
  effectiveFrom: string;
  effectiveThrough: string;
  reviewBy: string;
}

type ChargeTiming = "checkout" | "import";
type ChargePayer = "buyer" | "seller";
type ChargeBase = { category: PilotChargeCategory; evidence: PilotChargeEvidence };
type PayableCharge = ChargeBase & { timing: ChargeTiming; payer: ChargePayer };
export type PilotQuoteCharge =
  | (ChargeBase & { method: "not_applicable" })
  | (PayableCharge & { method: "confirmed_amount"; amount: string })
  | (PayableCharge & {
      method: "ad_valorem";
      ratePercent: string;
      taxBase: string;
      rounding: "half_up_minor_unit";
    });

export interface PilotQuoteRequest {
  plan: CustomsPlanRequest;
  orderId: string;
  estimateId: string;
  loadingCountry?: string;
  usJurisdictionApplies?: boolean;
  reviewedShipmentDigest?: string;
  charges: PilotQuoteCharge[];
}

export type WorldTradeReview =
  | { status: "review_required" }
  | {
      status: "confirmed";
      evidence: Omit<PilotChargeEvidence, "currency" | "sourceType"> & {
        sourceType: "authority" | "customs_broker";
        dispatchCountry: string;
        transitReviewShipmentDigest?: string;
      };
    };

export interface WorldQuoteRequest extends PilotQuoteRequest {
  tradeReview?: WorldTradeReview;
}

export interface PilotQuoteLine {
  category: PilotChargeCategory;
  status: "confirmed" | "not_applicable" | "review_required";
  amount: Amount | null;
  timing: ChargeTiming | null;
  payer: ChargePayer | null;
  evidence: PilotChargeEvidence | null;
  calculation: {
    method: PilotQuoteCharge["method"];
    taxBase?: Amount;
    ratePercent?: string;
    rounding?: "half_up_minor_unit";
  } | null;
}

export interface PilotQuote {
  schemaVersion: "1.0";
  orderId: string;
  estimateId: string;
  requestDigest: string;
  shipmentDigest: string;
  ruleSetVersion: string;
  status: "blocked" | "review_required" | "out_of_scope" | "estimated";
  issuedOn: string;
  importDate: string;
  expiresAt: string | null;
  currency: string;
  tradePolicy: TradePolicyDecision;
  deliveryTerms: "DAP" | "DDP" | null;
  goodsSubtotal: Amount | null;
  freight: Amount | null;
  insurance: Amount | null;
  charges: PilotQuoteLine[];
  buyerAtCheckout: Amount | null;
  buyerAtImport: Amount | null;
  buyerTotal: Amount | null;
  importChargesTotal: Amount | null;
  estimate: InvoiceEstimate | null;
  findings: { code: string; category?: PilotChargeCategory }[];
  checkoutReady: false;
  shippingAuthorized: false;
  productionAuthorized: false;
}

const opaque = { type: "string", pattern: "^[A-Za-z0-9_.:-]{1,100}$" };
const country = { type: "string", pattern: "^[A-Z]{2}$" };
const currency = { type: "string", pattern: "^[A-Z]{3}$" };
const date = { type: "string", format: "date" };
const decimalAmountPattern = /^(0|[1-9]\d{0,11})(\.\d{1,4})?$/;
const decimalAmount = { type: "string", pattern: decimalAmountPattern.source };
const percentage = { type: "string", pattern: "^(0|[1-9]\\d{0,3})(\\.\\d{1,4})?$" };
const object = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({
  type: "object",
  additionalProperties: false,
  properties,
  required,
});
const referenceEvidence = {
  id: opaque,
  sourceUrl: { type: "string", format: "uri", pattern: "^https://", maxLength: 2048 },
  destinationCountry: country,
  reviewedOn: date,
  effectiveFrom: date,
  effectiveThrough: date,
  reviewBy: date,
};
const evidence = object({
  ...referenceEvidence,
  sourceType: { enum: sourceTypes },
  currency,
});
const chargeBase = { category: { enum: pilotChargeCategories }, evidence };
const payableCharge = {
  ...chargeBase,
  timing: { enum: ["checkout", "import"] },
  payer: { enum: ["buyer", "seller"] },
};
const { $id: _shipmentId, ...embeddedShipment } = shipmentSchema;

export const pilotQuoteInputSchema = object({
  plan: {
    ...customsPlanSchema,
    properties: { ...customsPlanSchema.properties, shipment: embeddedShipment },
  },
  orderId: opaque,
  estimateId: opaque,
  loadingCountry: country,
  usJurisdictionApplies: { type: "boolean" },
  reviewedShipmentDigest: { type: "string", pattern: "^[0-9a-f]{64}$" },
  charges: {
    type: "array",
    maxItems: pilotChargeCategories.length,
    items: {
      oneOf: [
        object({ ...chargeBase, method: { const: "not_applicable" } }),
        object({ ...payableCharge, method: { const: "confirmed_amount" }, amount: decimalAmount }),
        object({
          ...payableCharge,
          method: { const: "ad_valorem" },
          ratePercent: percentage,
          taxBase: decimalAmount,
          rounding: { const: "half_up_minor_unit" },
        }),
      ],
    },
  },
}, ["plan", "orderId", "estimateId", "charges"]);

export const worldQuoteInputSchema = object({
  ...pilotQuoteInputSchema.properties,
  tradeReview: {
    oneOf: [
      object({ status: { const: "review_required" } }),
      object({
        status: { const: "confirmed" },
        evidence: object({
          ...referenceEvidence,
          dispatchCountry: country,
          sourceType: { enum: ["authority", "customs_broker"] },
          transitReviewShipmentDigest: { type: "string", pattern: "^[a-f0-9]{64}$" },
        }, [...Object.keys(referenceEvidence), "dispatchCountry", "sourceType"]),
      }),
    ],
  },
}, pilotQuoteInputSchema.required);

const ajv = new Ajv({ allErrors: true, strict: true });
const addFormats = addFormatsModule as unknown as (instance: Ajv) => void;
addFormats(ajv);
const validateQuote = ajv.compile<PilotQuoteRequest>(pilotQuoteInputSchema);
const validateWorldQuote = ajv.compile<WorldQuoteRequest>(worldQuoteInputSchema);

/** Bind a review to the order and shipment inputs, leaving access tokens and presentation settings outside its digest. */
export function pilotQuoteShipmentDigest(
  plan: CustomsPlanRequest,
  orderId: string,
  loadingCountry?: string,
  usJurisdictionApplies?: boolean,
): string {
  const { veygrit: _grant, locale: _locale, ...shipment } = plan.shipment;
  return requestDigest({
    orderId,
    shipment: { ...shipment, loadingCountry: loadingCountry ?? shipment.loadingCountry ?? null },
    customsTerritory: plan.customsTerritory ?? null,
    ...(plan.originCustomsTerritory === undefined ? {} : { originCustomsTerritory: plan.originCustomsTerritory }),
    lines: plan.lines ?? [],
    ...(usJurisdictionApplies !== undefined ? { usJurisdictionApplies } : {}),
  });
}

function validateAmount(value: string, currency: string, path: string): bigint {
  try {
    return minor(value, currency);
  } catch {
    throw new InputError([{ path, code: "INVALID_AMOUNT_OR_CURRENCY" }]);
  }
}

function chargeAmount(charge: PilotQuoteCharge, chargeCurrency: string, index: number): bigint {
  if (charge.method === "not_applicable") return 0n;
  const path = "/charges/" + index;
  if (charge.method === "confirmed_amount") return validateAmount(charge.amount, chargeCurrency, path + "/amount");
  const [whole, fraction = ""] = charge.ratePercent.split(".");
  return roundRatio(
    validateAmount(charge.taxBase, chargeCurrency, path + "/taxBase"),
    BigInt(whole! + fraction),
    100n * 10n ** BigInt(fraction.length),
  );
}

function permitsSource(category: PilotChargeCategory, source: PilotChargeEvidence["sourceType"]): boolean {
  if (category === "carrier_fee") return source === "carrier" || source === "customs_broker";
  if (category === "checkout_tax") return source === "merchant" || source === "authority" || source === "customs_broker";
  return source === "authority" || source === "customs_broker";
}

type EvidenceDates = Pick<PilotChargeEvidence, "reviewedOn" | "reviewBy" | "effectiveFrom" | "effectiveThrough">;
function currentEvidence(proof: EvidenceDates, issuedOn: string, eventOn: string): boolean {
  return proof.reviewedOn <= issuedOn && proof.reviewBy >= issuedOn && proof.reviewBy >= eventOn &&
    proof.effectiveFrom <= eventOn && proof.effectiveThrough >= eventOn;
}

function evidenceReference(
  charge: PilotQuoteCharge,
  shipment: CustomsPlanRequest["shipment"],
  issuedOn: string,
): { issue: string } | { evidence: PilotChargeEvidence } {
  const { evidence: proof, category } = charge;
  if (proof.destinationCountry !== shipment.destinationCountry || proof.currency !== shipment.currency)
    return { issue: "EVIDENCE_SCOPE_MISMATCH" };
  if (!permitsSource(category, proof.sourceType)) return { issue: "EVIDENCE_SOURCE_REVIEW_REQUIRED" };
  const url = URL.parse(proof.sourceUrl);
  if (!url || url.protocol !== "https:") return { issue: "EVIDENCE_URL_INVALID" };
  if (url.username || url.password) return { issue: "EVIDENCE_URL_CREDENTIALS" };
  const eventOn = category === "checkout_tax" ? issuedOn : shipment.importDate;
  if (!currentEvidence(proof, issuedOn, eventOn)) return { issue: "EVIDENCE_DATE_REVIEW_REQUIRED" };
  const sourceUrl = proof.sourceType === "authority" ? url.origin + url.pathname : url.origin;
  return { evidence: { ...proof, sourceUrl } };
}

const endOfDay = (value: string) => Date.parse(value + "T23:59:59.999+09:00") + 1;
const settlementCategory = (category: PilotChargeCategory): category is InvoiceEstimateChargeCategory =>
  category !== "checkout_tax";

export function quotePilotShipment(
  input: unknown,
  data: Dataset,
  catalog: TariffCatalog,
  now = new Date(),
): PilotQuote {
  return quoteShipment(input, data, catalog, "pilot", now);
}

export function quoteWorldShipment(
  input: unknown,
  data: Dataset,
  catalog: TariffCatalog,
  now = new Date(),
): PilotQuote {
  return quoteShipment(input, data, catalog, "worldwide", now);
}

function tradeReviewIssue(
  review: WorldTradeReview | undefined,
  shipment: CustomsPlanRequest["shipment"],
  issuedOn: string,
  shipmentDigest: string,
): string | null {
  if (review?.status !== "confirmed") return "WORLDWIDE_TRADE_REVIEW_REQUIRED";
  const { evidence: proof } = review;
  if (shipment.transitRoute?.stops.length && proof.transitReviewShipmentDigest !== shipmentDigest)
    return "TRANSIT_EVIDENCE_SHIPMENT_MISMATCH";
  if (proof.dispatchCountry !== shipment.originCountry || proof.destinationCountry !== shipment.destinationCountry)
    return "TRADE_EVIDENCE_SCOPE_MISMATCH";
  const url = URL.parse(proof.sourceUrl);
  if (!url || url.protocol !== "https:") return "TRADE_EVIDENCE_URL_INVALID";
  if (url.username || url.password) return "TRADE_EVIDENCE_URL_CREDENTIALS";
  if (!currentEvidence(proof, issuedOn, issuedOn) || !currentEvidence(proof, issuedOn, shipment.importDate))
    return "TRADE_EVIDENCE_DATE_REVIEW_REQUIRED";
  return null;
}

function quoteShipment(
  input: unknown,
  data: Dataset,
  catalog: TariffCatalog,
  scope: TradePolicyScope,
  now: Date,
): PilotQuote {
  const validate = scope === "worldwide" ? validateWorldQuote : validateQuote;
  if (!validate(input))
    throw new InputError((validate.errors ?? []).slice(0, 20)
      .map(({ instancePath, keyword }) => ({ path: instancePath, code: keyword })));

  const request: WorldQuoteRequest = input;
  const { plan, orderId, estimateId, tradeReview } = request;
  const { shipment } = plan;
  if (input.loadingCountry && shipment.loadingCountry && input.loadingCountry !== shipment.loadingCountry)
    throw new InputError([{ path: "/loadingCountry", code: "LOADING_COUNTRY_MISMATCH" }]);
  if (shipment.veygrit && shipment.veygrit.orderId !== orderId)
    throw new InputError([{ path: "/orderId", code: "ORDER_ID_MISMATCH" }]);
  const loadingCountry = input.loadingCountry ?? shipment.loadingCountry;
  const countries = new Map([...data.countries, ...data.supplementalRegions].map(({ code, inScope }) => [code, inScope]));
  const productOriginCountries = shipment.items.map(({ originCountry }) => originCountry);
  const transitCountries = shipment.transitRoute?.stops.map(({ country }) => country) ?? [];
  const tradeCountries = [shipment.originCountry, shipment.destinationCountry, ...transitCountries, ...productOriginCountries];
  if (loadingCountry && !countries.has(loadingCountry))
    throw new InputError([{ path: "/loadingCountry", code: "UNKNOWN_COUNTRY" }]);
  if (tradeCountries.some((countryCode) => !countries.has(countryCode)))
    throw new InputError([{ path: "/plan/shipment", code: "UNKNOWN_COUNTRY" }]);
  let policy = assessTradePolicy({
    dispatchCountry: shipment.originCountry,
    destinationCountry: shipment.destinationCountry,
    productOriginCountries, transitCountries,
    ...(loadingCountry ? { loadingCountry } : {}),
    ...(input.usJurisdictionApplies !== undefined ? { usJurisdictionApplies: input.usJurisdictionApplies } : {}),
  }, scope);
  if ((scope === "worldwide" || transitCountries.length > 0) && (policy.status === "pilot" || policy.status === "eligible_for_review") &&
      [...tradeCountries, ...(loadingCountry ? [loadingCountry] : [])].some((countryCode) => !countries.get(countryCode)))
    policy = { ...policy, status: "out_of_scope", reasonCode: "ROUTE_OUT_OF_SCOPE" };
  const policyStatus = policy.status;
  const quoteEligible = policyStatus === "pilot" || policyStatus === "eligible_for_review";
  const issuedOn = todayJst(now);
  const shipmentDigest = pilotQuoteShipmentDigest(plan, orderId, loadingCountry, input.usJurisdictionApplies);
  const deliveryTerms = shipment.incoterm === "DAP" || shipment.incoterm === "DDP" ? shipment.incoterm : null;
  const result: PilotQuote = {
    schemaVersion: "1.0", orderId, estimateId,
    requestDigest: requestDigest({ ...input, plan: shipmentDigest }),
    shipmentDigest, ruleSetVersion: data.version,
    status: quoteEligible ? "review_required" : policyStatus,
    issuedOn, importDate: shipment.importDate, expiresAt: null, currency: shipment.currency,
    tradePolicy: policy, deliveryTerms,
    goodsSubtotal: null, freight: null, insurance: null, charges: [],
    buyerAtCheckout: null, buyerAtImport: null, buyerTotal: null, importChargesTotal: null, estimate: null,
    findings: [], checkoutReady: false, shippingAuthorized: false, productionAuthorized: false,
  };
  if (!quoteEligible) return result;

  const customs = planCustoms(
    loadingCountry && loadingCountry !== shipment.loadingCountry ? { ...plan, shipment: { ...shipment, loadingCountry } } : plan,
    data, catalog, now,
  );
  const seen = new Map<PilotChargeCategory, { charge: PilotQuoteCharge; index: number }>();
  for (const [index, charge] of input.charges.entries()) {
    if (seen.has(charge.category))
      throw new InputError([{ path: "/charges/" + index + "/category", code: "DUPLICATE_CHARGE_CATEGORY" }]);
    seen.set(charge.category, { charge, index });
  }
  const goods = shipment.items.reduce(
    (sum, item) => sum + minor(item.unitValue, shipment.currency) * BigInt(item.quantity), 0n,
  );
  const freight = minor(shipment.freight, shipment.currency);
  const insurance = minor(shipment.insurance, shipment.currency);
  result.goodsSubtotal = money(goods, shipment.currency);
  result.freight = money(freight, shipment.currency);
  result.insurance = money(insurance, shipment.currency);
  for (const code of customs.handoff.missingInputs)
    if (code !== "GATHER_CORE_DOCUMENTS") result.findings.push({ code });
  if (
    customs.checkout.route !== "cross_border" || shipment.transaction !== "b2c_sale" ||
    shipment.regime !== "standard" || shipment.items.some(({ goodsType }) => goodsType !== "ordinary") ||
    customs.lines.some(({ restrictionHints }) => restrictionHints.length > 0)
  ) result.findings.push({ code: scope === "worldwide" ? "WORLDWIDE_PROCEDURE_REVIEW_REQUIRED" : "PILOT_PROCEDURE_REVIEW_REQUIRED" });
  if (shipment.importDate < issuedOn) result.findings.push({ code: "IMPORT_DATE_ALREADY_PASSED" });
  if (customs.checkout.customsAmountHold.reasons.includes("DATED_TARIFF_REFERENCE_REQUIRED"))
    result.findings.push({ code: "DATED_TARIFF_REFERENCE_REQUIRED" });
  else if (customs.checkout.requiresRequote) result.findings.push({ code: "REQUOTE_REQUIRED" });
  if (input.charges.length && input.reviewedShipmentDigest !== shipmentDigest)
    result.findings.push({ code: "REVIEWED_SHIPMENT_MISMATCH" });
  const tradeIssue = scope === "worldwide" ? tradeReviewIssue(tradeReview, shipment, issuedOn, shipmentDigest)
    : transitCountries.length ? "WORLDWIDE_TRANSIT_REVIEW_REQUIRED" : null;
  if (tradeIssue) result.findings.push({ code: tradeIssue });
  const scopedEvidence = result.findings.length === 0 && input.reviewedShipmentDigest === shipmentDigest;
  let checkout = goods + freight + insurance;
  let atImport = 0n;
  let importCharges = 0n;
  let expiresAt = Date.parse(customs.checkout.expiresAt);
  // These current assessed amounts apply to the full confirmed consignment.
  // Line-level tariff references remain separate and are not summed or promoted
  // into a consignment assessment by this evidence-consistency check.
  const applicableImportCharges = customs.checkout.importTaxAndDuty.charges;
  if (scope === "worldwide" && !tradeIssue && tradeReview?.status === "confirmed")
    expiresAt = Math.min(expiresAt, endOfDay(tradeReview.evidence.effectiveThrough), endOfDay(tradeReview.evidence.reviewBy));
  const fullZeroDutyPolicy = customs.lines.every(({ dutyScenario }) =>
    dutyScenario.status === "calculated" && dutyScenario.basis === "confirmed_zero_duty_policy");
  const heldCharge = (category: PilotChargeCategory): PilotQuoteLine => ({
    category, status: "review_required", amount: null, timing: null, payer: null,
    evidence: null, calculation: null,
  });
  for (const category of pilotChargeCategories) {
    const found = seen.get(category);
    const charge = found?.charge;
    const line = heldCharge(category);
    result.charges.push(line);
    if (!charge || !found) {
      result.findings.push({ code: "CHARGE_EVIDENCE_REQUIRED", category });
      continue;
    }
    const reference = evidenceReference(charge, shipment, issuedOn);
    if ("issue" in reference) {
      result.findings.push({ code: reference.issue, category });
      continue;
    }
    if (!scopedEvidence) continue;
    line.evidence = reference.evidence;
    const value = chargeAmount(charge, shipment.currency, found.index);
    const applicableImportCharge = applicableImportCharges.find(({ kind }) => kind === category);
    if ((applicableImportCharge && value !== minor(applicableImportCharge.amount.value, shipment.currency)) ||
        (category === "customs_duty" && fullZeroDutyPolicy && value !== 0n)) {
      result.findings.push({ code: "CHARGE_CONFLICTS_WITH_APPLICABLE_RULE", category });
      continue;
    }
    const formatted = money(value, shipment.currency);
    if (!decimalAmountPattern.test(formatted.value)) {
      result.findings.push({ code: "CHARGE_AMOUNT_OUT_OF_RANGE", category });
      continue;
    }
    const isImport = settlementCategory(category);
    if (charge.method !== "not_applicable") {
      const expectedTiming = isImport ? "import" : "checkout";
      const expectedImportPayer = deliveryTerms === "DDP" ? "seller" : "buyer";
      if (charge.timing !== expectedTiming || (value !== 0n && isImport && charge.payer !== expectedImportPayer)) {
        result.findings.push({ code: "CHARGE_PAYMENT_SCOPE_REVIEW_REQUIRED", category });
        continue;
      }
      line.timing = charge.timing;
      line.payer = charge.payer;
      if (charge.payer === "buyer") {
        if (charge.timing === "checkout") checkout += value;
        else atImport += value;
      }
    }
    if (isImport) importCharges += value;
    expiresAt = Math.min(expiresAt, endOfDay(charge.evidence.effectiveThrough), endOfDay(charge.evidence.reviewBy));
    line.status = charge.method === "not_applicable" ? "not_applicable" : "confirmed";
    line.amount = formatted;
    line.calculation = charge.method === "ad_valorem"
      ? { method: charge.method, taxBase: money(minor(charge.taxBase, shipment.currency), shipment.currency),
          ratePercent: charge.ratePercent, rounding: charge.rounding }
      : { method: charge.method };
  }

  if (result.findings.length) {
    result.charges = pilotChargeCategories.map(heldCharge);
    return result;
  }
  result.status = "estimated";
  result.expiresAt = new Date(expiresAt).toISOString();
  result.buyerAtCheckout = money(checkout, shipment.currency);
  result.buyerAtImport = money(atImport, shipment.currency);
  result.buyerTotal = money(checkout + atImport, shipment.currency);
  result.importChargesTotal = money(importCharges, shipment.currency);
  result.estimate = {
    estimateId, orderId, issuedOn, currency: shipment.currency,
    charges: result.charges.flatMap(({ category, amount }) =>
      settlementCategory(category) ? [{ category, amount: amount!.value }] : []),
  };
  return result;
}
