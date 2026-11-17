import { Ajv } from "ajv";
import addFormatsModule from "ajv-formats";
import { todayJst } from "./dataset.ts";
import { EU_COUNTRIES, requestDigest } from "./engine.ts";
import type { ImportSettlementScope } from "./import-settlement-reconciliation.ts";
import { invoiceReconciliationInputSchema, type InvoiceEstimate } from "./invoice-reconciliation.ts";
import {
  quotePilotShipment, quoteWorldShipment, worldQuoteInputSchema, type WorldQuoteRequest,
} from "./pilot-quote.ts";
import { InputError } from "./schema.ts";
import type { TariffCatalog } from "./tariffs.ts";
import type { TradePolicyScope } from "./trade-policy.ts";
import type { Dataset } from "./types.ts";

const opaqueId = { type: "string", pattern: "^[A-Za-z0-9_.:-]{1,100}$" };
const digest = { type: "string", pattern: "^[a-f0-9]{64}$" };
const instant = { type: "string", format: "date-time", maxLength: 40 };
const country = { type: "string", pattern: "^[A-Z]{2}$", not: { const: "KP" } };
const currency = { type: "string", pattern: "^[A-Z]{3}$" };
const quoteProfile = { enum: ["pilot", "worldwide"] };
const parties = ["seller", "buyer", "recipient", "third_party"] as const;
type BillTo = { party: (typeof parties)[number]; accountRef: string };
type CostBearer = "buyer" | "seller";
type ImportSettlementBinding = Omit<ImportSettlementScope, "declarationId" | "settlementCurrency"> & {
  settlementCurrency: string;
};

const object = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({
  type: "object", additionalProperties: false, required, properties,
});
const billTo = object({ party: { enum: parties }, accountRef: opaqueId });
const importerReview = object({ importerRef: opaqueId, brokerRef: opaqueId, evidenceRef: opaqueId });
const acceptance = object({
  scopeDigest: digest, billTo, evidenceRef: opaqueId, acceptedAt: instant, expiresAt: instant,
});
const parcelSchema = object({
  parcelId: opaqueId,
  items: { type: "array", minItems: 1, maxItems: 100,
    items: object({ itemId: opaqueId, quantity: { type: "integer", minimum: 1, maximum: 1000000 } }) },
});

export const importSettlementPlanInputSchema = object({
  merchantId: opaqueId,
  shipmentId: opaqueId,
  quoteRequest: worldQuoteInputSchema,
  quoteProfile,
  carrierId: opaqueId,
  carrierService: opaqueId,
  parcelCount: { type: "integer", minimum: 1, maximum: 999 },
  parcels: { type: "array", minItems: 1, maxItems: 999, items: parcelSchema },
  direct: { type: "boolean" },
  remittanceRoute: { enum: ["carrier_advance", "postal_delegation", "direct_payment"] },
  buyerIsRecipient: { type: "boolean" },
  requestedBillTo: billTo,
  importerReview,
  carrierAcceptance: acceptance,
}, ["merchantId", "shipmentId", "quoteRequest", "carrierId", "carrierService", "parcelCount",
  "direct", "remittanceRoute", "buyerIsRecipient", "requestedBillTo"]);

export interface ImportSettlementPlanInput {
  merchantId: string;
  shipmentId: string;
  quoteRequest: WorldQuoteRequest;
  quoteProfile?: TradePolicyScope;
  carrierId: string;
  carrierService: string;
  parcelCount: number;
  /** Required for multiple parcels; allocates every quoted unit exactly once. */
  parcels?: { parcelId: string; items: { itemId: string; quantity: number }[] }[];
  direct: boolean;
  remittanceRoute: "carrier_advance" | "postal_delegation" | "direct_payment";
  buyerIsRecipient: boolean;
  requestedBillTo: BillTo;
  importerReview?: { importerRef: string; brokerRef: string; evidenceRef: string };
  carrierAcceptance?: {
    scopeDigest: string;
    billTo: BillTo;
    evidenceRef: string;
    acceptedAt: string;
    expiresAt: string;
  };
}

export const importSettlementPlanOutputSchema = object({
  status: { enum: ["ready", "review_required", "out_of_scope"] },
  orderId: opaqueId,
  estimateId: opaqueId,
  shipmentId: opaqueId,
  shipmentDigest: digest,
  quoteRequestDigest: digest,
  quoteProfile,
  ruleSetVersion: { type: "string" },
  quoteEstimate: { anyOf: [invoiceReconciliationInputSchema.properties.estimate, { type: "null" }] },
  scopeDigest: digest,
  deliveryTerms: { enum: ["DAP", "DDP", null] },
  costBearer: { enum: ["seller", "buyer", null] },
  billingParty: { enum: ["seller", "buyer", null] },
  billingBinding: { anyOf: [object({
    merchantId: opaqueId, orderId: opaqueId, shipmentId: opaqueId, estimateId: opaqueId,
    carrierId: opaqueId, carrierService: opaqueId, billingParty: { enum: ["seller", "buyer"] },
    billingAccountRef: opaqueId, originCountry: country, destinationCountry: country,
    settlementCurrency: currency,
    remittanceRoute: { const: "carrier_advance" },
  }), { type: "null" }] },
  remittanceRoute: importSettlementPlanInputSchema.properties.remittanceRoute,
  expiresAt: { anyOf: [instant, { type: "null" }] },
  findings: { type: "array", items: { type: "string" } },
  shippingAuthorized: { const: false },
  productionAuthorized: { const: false },
});

const ajv = new Ajv({ allErrors: true, strict: true });
(addFormatsModule as unknown as (instance: Ajv) => void)(ajv);
const validate = ajv.compile<ImportSettlementPlanInput>(importSettlementPlanInputSchema);

/**
 * Evaluate server-reviewed evidence for one shipment. A ready result confirms
 * the billing match. The merchant still controls the actual shipment release.
 */
export function reviewImportSettlementPlan(
  input: unknown, data: Dataset, catalog: TariffCatalog, now = new Date(),
) {
  if (!validate(input)) {
    throw new InputError((validate.errors ?? []).slice(0, 20)
      .map(({ instancePath, keyword }) => ({ path: instancePath, code: keyword })));
  }
  const { quoteRequest, quoteProfile: requestedProfile, requestedBillTo, carrierAcceptance, importerReview, ...shipping } = input;
  const { plan } = quoteRequest;
  const { shipment } = plan;
  if (shipment.veygrit && shipment.veygrit.merchantId !== shipping.merchantId)
    throw new InputError([{ path: "/merchantId", code: "SETTLEMENT_MERCHANT_MISMATCH" }]);

  const legacyRoute = shipment.originCountry === "CN" && shipment.destinationCountry === "JP";
  const legacyQuote = legacyRoute && (requestedProfile === "pilot" ||
    (requestedProfile === undefined && quoteRequest.tradeReview === undefined));
  if (legacyQuote && quoteRequest.tradeReview !== undefined)
    throw new InputError([{ path: "/quoteRequest/tradeReview", code: "WORLDWIDE_QUOTE_REQUIRED" }]);
  const profile: TradePolicyScope = legacyQuote ? "pilot" : "worldwide";
  const quote = (legacyQuote ? quotePilotShipment : quoteWorldShipment)(quoteRequest, data, catalog, now);
  const costBearer: CostBearer | null = quote.deliveryTerms === "DDP" ? "seller" :
    quote.deliveryTerms === "DAP" ? "buyer" : null;
  const scopeDigest = requestDigest({
    ...shipping, requestedBillTo, importerReview: importerReview ?? null,
    quoteRequestDigest: quote.requestDigest, shipmentDigest: quote.shipmentDigest,
    issuedEstimate: quote.estimate, ruleSetVersion: quote.ruleSetVersion,
    orderVersion: shipment.veygrit ?? null,
    ...(profile === "worldwide" ? { quoteProfile: profile } : {}),
  });
  const result = {
    status: "review_required" as "ready" | "review_required" | "out_of_scope",
    orderId: quote.orderId, estimateId: quote.estimateId, shipmentId: shipping.shipmentId,
    shipmentDigest: quote.shipmentDigest, quoteRequestDigest: quote.requestDigest, quoteProfile: profile, scopeDigest,
    ruleSetVersion: quote.ruleSetVersion, quoteEstimate: null as InvoiceEstimate | null,
    deliveryTerms: quote.deliveryTerms, costBearer, billingParty: null as CostBearer | null,
    billingBinding: null as ImportSettlementBinding | null,
    remittanceRoute: shipping.remittanceRoute, expiresAt: null as string | null,
    findings: [] as string[], shippingAuthorized: false as const, productionAuthorized: false as const,
  };
  if (shipment.originCountry === shipment.destinationCountry ||
      (EU_COUNTRIES.has(shipment.originCountry) && EU_COUNTRIES.has(shipment.destinationCountry)) ||
      shipment.originZone !== "standard" || shipment.destinationZone !== "standard" ||
      plan.customsTerritory || plan.originCustomsTerritory ||
      (quoteRequest.loadingCountry ?? shipment.loadingCountry) !== shipment.originCountry ||
      !shipping.direct || (shipment.transitRoute &&
        (shipment.transitRoute.completeness !== "confirmed" || shipment.transitRoute.stops.length > 0)) ||
      !["air", "courier_unspecified"].includes(shipment.transport) ||
      shipment.transaction !== "b2c_sale" || shipment.regime !== "standard" ||
      shipment.items.some(({ goodsType }) => goodsType !== "ordinary") ||
      shipping.remittanceRoute !== "carrier_advance") {
    result.status = "out_of_scope";
    result.findings.push("SETTLEMENT_ROUTE_OUT_OF_SCOPE");
    return result;
  }
  if (shipping.parcelCount > 1 && !shipping.parcels)
    result.findings.push("PARCEL_ALLOCATION_REQUIRED");
  if (shipping.parcels) {
    const allocated = new Map<string, number>();
    const ids = new Set<string>();
    let invalid = shipping.parcels.length !== shipping.parcelCount;
    for (const parcel of shipping.parcels) {
      if (ids.has(parcel.parcelId)) invalid = true;
      ids.add(parcel.parcelId);
      const itemIds = new Set<string>();
      for (const item of parcel.items) {
        if (itemIds.has(item.itemId) || !shipment.items.some(({ id }) => id === item.itemId)) invalid = true;
        itemIds.add(item.itemId);
        allocated.set(item.itemId, (allocated.get(item.itemId) ?? 0) + item.quantity);
      }
    }
    if (shipment.items.some(({ id, quantity }) => allocated.get(id) !== quantity)) invalid = true;
    if (invalid) result.findings.push("PARCEL_ALLOCATION_MISMATCH");
  }
  if (!legacyRoute && requestedProfile === "pilot") {
    result.status = "out_of_scope";
    result.findings.push("WORLDWIDE_QUOTE_REQUIRED");
    return result;
  }
  if (quote.status === "blocked" || quote.status === "out_of_scope") {
    result.status = "out_of_scope";
    result.findings.push("SETTLEMENT_ROUTE_OUT_OF_SCOPE", quote.tradePolicy.reasonCode);
    return result;
  }

  if (quote.status !== "estimated" || quote.expiresAt === null || Date.parse(quote.expiresAt) <= now.getTime())
    result.findings.push("CURRENT_ESTIMATE_REQUIRED");
  if (profile === "worldwide") {
    if (quote.tradePolicy.status === "review_required") result.findings.push(quote.tradePolicy.reasonCode);
    result.findings.push(...new Set(quote.findings.map(({ code }) => code)));
  }
  if (costBearer === null) result.findings.push("DELIVERY_TERMS_REQUIRED");
  if (!importerReview) result.findings.push("IMPORTER_REVIEW_REQUIRED");
  if (costBearer === "buyer" && !shipping.buyerIsRecipient) result.findings.push("RECIPIENT_BILLING_REVIEW_REQUIRED");
  if (requestedBillTo.party !== costBearer) result.findings.push("REQUESTED_BILL_TO_MISMATCH");
  if (!carrierAcceptance) result.findings.push("CARRIER_ACCEPTANCE_REQUIRED");
  if (carrierAcceptance) {
    if (carrierAcceptance.scopeDigest !== scopeDigest)
      result.findings.push("CARRIER_ACCEPTANCE_SCOPE_MISMATCH");
    if (carrierAcceptance.billTo.party !== requestedBillTo.party ||
        carrierAcceptance.billTo.accountRef !== requestedBillTo.accountRef)
      result.findings.push("CARRIER_BILL_TO_MISMATCH");
    const acceptedAt = Date.parse(carrierAcceptance.acceptedAt);
    const expiresAt = Date.parse(carrierAcceptance.expiresAt);
    if (!(acceptedAt <= now.getTime() && expiresAt > now.getTime()) ||
        todayJst(new Date(acceptedAt)) < quote.issuedOn)
      result.findings.push("CARRIER_ACCEPTANCE_DATE_INVALID");
  }
  if (result.findings.length === 0 && carrierAcceptance && quote.expiresAt && quote.estimate && costBearer) {
    result.status = "ready";
    result.billingParty = costBearer;
    result.quoteEstimate = quote.estimate;
    result.billingBinding = {
      merchantId: shipping.merchantId, orderId: quote.orderId, shipmentId: shipping.shipmentId,
      estimateId: quote.estimateId, carrierId: shipping.carrierId, carrierService: shipping.carrierService,
      billingParty: costBearer, billingAccountRef: requestedBillTo.accountRef,
      originCountry: shipment.originCountry, destinationCountry: shipment.destinationCountry,
      settlementCurrency: quote.currency, remittanceRoute: "carrier_advance",
    };
    result.expiresAt = new Date(Math.min(Date.parse(quote.expiresAt), Date.parse(carrierAcceptance.expiresAt))).toISOString();
  }
  return result;
}
