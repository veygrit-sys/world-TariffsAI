import { reconcileInvoice, type InvoiceEstimate, type InvoiceReconciliation, type InvoiceReconciliationInput } from "./invoice-reconciliation.ts";
import { quotePilotShipment, quoteWorldShipment, type PilotQuote, type PilotQuoteRequest, type WorldQuoteRequest } from "./pilot-quote.ts";
import type { TariffCatalog } from "./tariffs.ts";
import type { Dataset } from "./types.ts";
import { capAtGrantExpiry, withVerifiedOrder, type OrderSnapshot, type VeygritOrderRequest, type VeygritPorts } from "./veygrit.ts";

export interface PilotOrderSnapshot extends OrderSnapshot {
  /** Reviewed and bound to the current order by the merchant or customs evidence service. */
  pilotQuote: Omit<PilotQuoteRequest, "plan" | "orderId">;
}
export interface WorldOrderSnapshot extends OrderSnapshot {
  /** Worldwide shipment evidence and trade review bound to the current order. */
  worldQuote: Omit<WorldQuoteRequest, "plan" | "orderId">;
}

export async function quoteVeygritOrder(
  input: VeygritOrderRequest,
  ports: VeygritPorts<PilotOrderSnapshot>,
  data: Dataset,
  catalog: TariffCatalog,
  now = new Date(),
): Promise<PilotQuote & { context: "verified_order_pilot"; cartVersion: string }> {
  return quoteVerifiedOrder(
    input, ports, data, catalog, now, "verified_order_pilot", (order) => order.pilotQuote, quotePilotShipment,
  );
}

export async function quoteVeygritWorldOrder(
  input: VeygritOrderRequest,
  ports: VeygritPorts<WorldOrderSnapshot>,
  data: Dataset,
  catalog: TariffCatalog,
  now = new Date(),
): Promise<PilotQuote & { context: "verified_order_worldwide"; cartVersion: string }> {
  return quoteVerifiedOrder(
    input, ports, data, catalog, now, "verified_order_worldwide", (order) => order.worldQuote, quoteWorldShipment,
  );
}

function quoteVerifiedOrder<Order extends OrderSnapshot, Context extends "verified_order_pilot" | "verified_order_worldwide">(
  input: VeygritOrderRequest,
  ports: VeygritPorts<Order>,
  data: Dataset,
  catalog: TariffCatalog,
  now: Date,
  context: Context,
  storedQuote: (order: Order) => Omit<WorldQuoteRequest, "plan" | "orderId">,
  quote: typeof quotePilotShipment,
) {
  return withVerifiedOrder(input, ports, now, (shipment, order, scope, grantExpiry) => {
    const { lines, availableDocuments, originCustomsTerritory } = order.customs ?? {};
    const result = quote({
      ...storedQuote(order),
      orderId: order.orderId,
      plan: {
        shipment,
        ...(lines === undefined ? {} : { lines }),
        ...(availableDocuments === undefined ? {} : { availableDocuments }),
        ...(originCustomsTerritory === undefined ? {} : { originCustomsTerritory }),
        ...(scope.zone === "special" && scope.customsTerritory ? { customsTerritory: scope.customsTerritory } : {}),
      },
    }, data, catalog, now);
    return {
      ...result,
      expiresAt: result.expiresAt ? capAtGrantExpiry(result.expiresAt, grantExpiry) : result.expiresAt,
      context,
      cartVersion: order.cartVersion,
    };
  });
}

export interface VeygritInvoiceRequest {
  authenticatedMerchantId: string;
  orderId: string;
  estimateId: string;
  invoiceId: string;
}

export interface VeygritInvoicePorts {
  loadEstimate(input: Omit<VeygritInvoiceRequest, "invoiceId">): Promise<{ merchantId: string; estimate: InvoiceEstimate } | null>;
  loadInvoice(input: Omit<VeygritInvoiceRequest, "estimateId">): Promise<{
    merchantId: string;
    invoice: InvoiceReconciliationInput["invoice"];
  } | null>;
}

export async function reconcileVeygritInvoice(
  input: VeygritInvoiceRequest,
  ports: VeygritInvoicePorts,
): Promise<InvoiceReconciliation> {
  const { authenticatedMerchantId, orderId, estimateId, invoiceId } = input;
  const [savedEstimate, savedInvoice] = await Promise.all([
    ports.loadEstimate({ authenticatedMerchantId, orderId, estimateId }),
    ports.loadInvoice({ authenticatedMerchantId, orderId, invoiceId }),
  ]);
  if (!savedEstimate || !savedInvoice ||
      savedEstimate.merchantId !== authenticatedMerchantId || savedInvoice.merchantId !== authenticatedMerchantId)
    throw new Error("ORDER_SETTLEMENT_RECORD_NOT_FOUND");
  const { estimate } = savedEstimate;
  const { invoice } = savedInvoice;
  if (estimate.orderId !== orderId || estimate.estimateId !== estimateId ||
      invoice.orderId !== orderId || invoice.invoiceId !== invoiceId)
    throw new Error("ORDER_SETTLEMENT_RECORD_NOT_FOUND");
  return reconcileInvoice({ estimate, invoice });
}
