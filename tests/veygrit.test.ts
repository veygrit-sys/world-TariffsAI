import test from "node:test";
import assert from "node:assert/strict";
import { assessVeygritOrder } from "../src/veygrit.ts";
import { previewVeygritCheckout } from "../src/checkout.ts";
import type {
  VeygritPorts,
  GrantDecision,
  OrderSnapshot,
} from "../src/veygrit.ts";
import { data, now, shipment } from "./helpers.ts";
const input = {
  authenticatedMerchantId: "shop",
  orderId: "order",
  expectedCartVersion: "1",
};
function ports(change: Partial<GrantDecision> = {}): VeygritPorts {
  const order: OrderSnapshot = {
    merchantId: "shop",
    orderId: "order",
    cartVersion: "1",
    addressTokenRef: "ref",
    addressVersion: "1",
    grantRef: "grant",
    shipment: shipment(),
  };
  return {
    loadOrder: async () => order,
    verifyGrant: async () => ({
      allowed: true,
      revoked: false,
      purpose: "shipment",
      expiresAt: "2026-11-12T00:00:00Z",
      merchantId: "shop",
      orderId: "order",
      addressTokenRef: "ref",
      addressVersion: "1",
      ...change,
    }),
    resolveCustomsScope: async () => ({ country: "GB", zone: "standard" }),
    snapshotIsCurrent: async () => true,
  };
}
test("Veygrit integration consumes references and minimum customs scope", async () => {
  const r = await assessVeygritOrder(input, ports(), data, now);
  assert.equal(r.status, "partial_estimate");
  assert.equal(r.shippingAuthorized, false);
});
test("quote lifetime is capped by the address grant expiry", async () => {
  const r = await assessVeygritOrder(
    input,
    ports({ expiresAt: "2026-11-11T00:01:00Z" }),
    data,
    now,
  );
  assert.equal(r.expiresAt, "2026-11-11T00:01:00.000Z");
});
for (const change of [
  { revoked: true },
  { allowed: false },
  { purpose: "other" },
  { merchantId: "other" },
  { orderId: "other" },
  { addressVersion: "2" },
  { addressTokenRef: "other" },
  { expiresAt: "2026-11-10T00:00:00Z" },
  { expiresAt: "invalid" },
] as Partial<GrantDecision>[])
  test("invalid grant is rejected: " + JSON.stringify(change), async () =>
    assert.rejects(
      () => assessVeygritOrder(input, ports(change), data, now),
      /ADDRESS_GRANT_INVALID/,
    ),
  );
test("stale carts, changed destinations and concurrent updates require a new quote", async () => {
  await assert.rejects(
    () =>
      assessVeygritOrder(
        { ...input, expectedCartVersion: "old" },
        ports(),
        data,
        now,
      ),
    /ORDER_VERSION_MISMATCH/,
  );
  await assert.rejects(
    () =>
      assessVeygritOrder(
        input,
        {
          ...ports(),
          resolveCustomsScope: async () => ({
            country: "FR",
            zone: "standard",
          }),
        },
        data,
        now,
      ),
    /DESTINATION_CHANGED/,
  );
  await assert.rejects(
    () =>
      assessVeygritOrder(
        input,
        { ...ports(), snapshotIsCurrent: async () => false },
        data,
        now,
      ),
    /ORDER_CHANGED/,
  );
});

test("checkout preview binds the order, caps expiry and rejects a changed snapshot", async () => {
  const preview = await previewVeygritCheckout(
    input, ports({ expiresAt: "2026-11-11T00:01:00Z" }), data, now,
  );
  assert.equal(preview.context, "verified_order_preview");
  assert.equal(preview.expiresAt, "2026-11-11T00:01:00.000Z");
  assert.equal(preview.checkoutReady, false);
  assert.deepEqual(preview.checkoutTax.knownSubtotal, { currency: "GBP", value: "22.00" });
  await assert.rejects(
    () => previewVeygritCheckout(input, { ...ports(), snapshotIsCurrent: async () => false }, data, now),
    /ORDER_CHANGED_REQUOTE_REQUIRED/,
  );
});

test("verified checkout uses the order's scoped tariff code and holds after the reference date", async () => {
  const base = ports();
  const verifiedPorts: VeygritPorts = {
    ...base,
    loadOrder: async (request) => {
      const order = (await base.loadOrder(request))!;
      return {
        ...order,
        shipment: { ...order.shipment, destinationCountry: "US", currency: "USD" },
        customs: { lines: [{ itemId: "line1", tariffCode: "6912.00.10.00" }] },
      };
    },
    resolveCustomsScope: async () => ({ country: "US", zone: "standard" }),
  };
  const current = await previewVeygritCheckout(input, verifiedPorts, data, now);
  assert.ok(!current.customsAmountHold.reasons.includes("DATED_TARIFF_REFERENCE_REQUIRED"));
  assert.ok(current.customsAmountHold.reasons.includes("IMPORT_CHARGES_UNRESOLVED"));
  const uncovered = await previewVeygritCheckout(input, {
    ...verifiedPorts,
    loadOrder: async (request) => {
      const order = (await verifiedPorts.loadOrder(request))!;
      return { ...order, shipment: { ...order.shipment, importDate: "2026-11-13" } };
    },
  }, data, now);
  assert.ok(uncovered.customsAmountHold.reasons.includes("DATED_TARIFF_REFERENCE_REQUIRED"));
  assert.equal(uncovered.importTaxAndDuty.knownSubtotal, null);
  assert.deepEqual(uncovered.goodsSubtotal, current.goodsSubtotal);
});
