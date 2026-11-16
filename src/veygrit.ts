import type { Shipment, Dataset, Assessment, CustomsPlanRequest } from "./types.ts";
import { assess } from "./engine.ts";

export interface OrderSnapshot {
  merchantId: string;
  orderId: string;
  cartVersion: string;
  addressTokenRef: string;
  addressVersion: string;
  grantRef: string;
  /** Constructed by the merchant from its trusted catalogue, shipping and customs valuation records. */
  shipment: Omit<Shipment, "veygrit">;
  customs?: Omit<CustomsPlanRequest, "shipment" | "customsTerritory">;
}
interface CustomsScope {
  country: string;
  zone: Shipment["destinationZone"];
  customsTerritory?: string;
}
export interface GrantDecision {
  allowed: boolean;
  revoked: boolean;
  purpose: "shipment" | "other";
  expiresAt: string;
  merchantId: string;
  orderId: string;
  addressTokenRef: string;
  addressVersion: string;
}
export interface VeygritPorts<Order extends OrderSnapshot = OrderSnapshot> {
  loadOrder(input: {
    authenticatedMerchantId: string;
    orderId: string;
  }): Promise<Order | null>;
  verifyGrant(input: {
    merchantId: string;
    orderId: string;
    grantRef: string;
    addressTokenRef: string;
    addressVersion: string;
  }): Promise<GrantDecision>;
  /** Resolve only customs scope; no raw address, name, telephone or identity document leaves the address vault. */
  resolveCustomsScope(input: {
    addressTokenRef: string;
    addressVersion: string;
    grantRef: string;
  }): Promise<CustomsScope>;
  snapshotIsCurrent(input: {
    merchantId: string;
    orderId: string;
    cartVersion: string;
    addressVersion: string;
  }): Promise<boolean>;
}
export interface VeygritOrderRequest {
  authenticatedMerchantId: string;
  orderId: string;
  expectedCartVersion: string;
}
export async function assessVeygritOrder(
  input: VeygritOrderRequest,
  ports: VeygritPorts,
  data: Dataset,
  now = new Date(),
): Promise<Assessment> {
  return withVerifiedOrder(input, ports, now, (shipment, _order, _scope, grantExpiry) => {
    const result = assess(shipment, data, now);
    result.expiresAt = capAtGrantExpiry(result.expiresAt, grantExpiry);
    return result;
  });
}

export function capAtGrantExpiry(expiresAt: string, grantExpiry: number): string {
  return new Date(Math.min(Date.parse(expiresAt), grantExpiry)).toISOString();
}

export async function withVerifiedOrder<T, Order extends OrderSnapshot = OrderSnapshot>(
  input: VeygritOrderRequest,
  ports: VeygritPorts<Order>,
  now: Date,
  evaluate: (shipment: Shipment, order: Order, scope: CustomsScope, grantExpiry: number) => T,
): Promise<T> {
  const order = await ports.loadOrder({
    authenticatedMerchantId: input.authenticatedMerchantId,
    orderId: input.orderId,
  });
  if (
    !order ||
    order.merchantId !== input.authenticatedMerchantId ||
    order.orderId !== input.orderId
  )
    throw new Error("ORDER_NOT_FOUND");
  if (order.cartVersion !== input.expectedCartVersion)
    throw new Error("ORDER_VERSION_MISMATCH");
  const grant = await ports.verifyGrant({
    merchantId: order.merchantId,
    orderId: order.orderId,
    grantRef: order.grantRef,
    addressTokenRef: order.addressTokenRef,
    addressVersion: order.addressVersion,
  });
  const grantExpiry = Date.parse(grant.expiresAt);
  if (
    !grant.allowed ||
    grant.revoked ||
    grant.purpose !== "shipment" ||
    !Number.isFinite(grantExpiry) ||
    grantExpiry <= now.getTime() ||
    grant.merchantId !== order.merchantId ||
    grant.orderId !== order.orderId ||
    grant.addressTokenRef !== order.addressTokenRef ||
    grant.addressVersion !== order.addressVersion
  )
    throw new Error("ADDRESS_GRANT_INVALID");
  const scope = await ports.resolveCustomsScope({
    addressTokenRef: order.addressTokenRef,
    addressVersion: order.addressVersion,
    grantRef: order.grantRef,
  });
  if (
    scope.country !== order.shipment.destinationCountry ||
    scope.zone !== order.shipment.destinationZone
  )
    throw new Error("DESTINATION_CHANGED_REQUOTE_REQUIRED");
  const result = evaluate(
    {
      ...order.shipment,
      veygrit: {
        merchantId: order.merchantId,
        orderId: order.orderId,
        cartVersion: order.cartVersion,
        addressTokenRef: order.addressTokenRef,
        addressVersion: order.addressVersion,
        grantRef: order.grantRef,
      },
    },
    order,
    scope,
    grantExpiry,
  );
  if (
    !(await ports.snapshotIsCurrent({
      merchantId: order.merchantId,
      orderId: order.orderId,
      cartVersion: order.cartVersion,
      addressVersion: order.addressVersion,
    }))
  )
    throw new Error("ORDER_CHANGED_REQUOTE_REQUIRED");
  return result;
}
