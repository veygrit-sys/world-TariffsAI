import test from "node:test";
import assert from "node:assert/strict";
import { createHandler, WindowRateLimiter } from "../src/http.ts";
import { data, now, shipment } from "./helpers.ts";
const key = "synthetic-service-key-minimum-32-characters";
const peer = { peer: "127.0.0.1" };
function handler() {
  return createHandler({ dataset: data, apiKey: key, now: () => now });
}
function request(
  path: string,
  payload: unknown = shipment(),
  headers: Record<string, string> = {},
) {
  return new Request("http://localhost" + path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer " + key,
      ...headers,
    },
    body: JSON.stringify(payload),
  });
}
test("API is authenticated and returns no-store JSON", async () => {
  const h = handler();
  assert.equal(
    (
      await h(
        request("/v1/assess", shipment(), { authorization: "Bearer wrong" }),
        peer,
      )
    ).status,
    401,
  );
  const res = await h(request("/v1/assess"), peer);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.equal((await res.json()).shippingAuthorized, false);
});
test("malformed, unknown and personal fields fail strict validation", async () => {
  const res = await handler()(
    request("/v1/assess", {
      ...shipment(),
      recipientName: "private-name",
      address: "private-address",
    }),
    peer,
  );
  assert.equal(res.status, 400);
  assert.ok(!(await res.text()).includes("private-name"));
});
test("content type and compressed request bodies are bounded", async () => {
  assert.equal(
    (
      await handler()(
        request("/v1/assess", shipment(), { "content-type": "text/plain" }),
        peer,
      )
    ).status,
    415,
  );
  assert.equal(
    (
      await handler()(
        request("/v1/assess", shipment(), { "content-encoding": "gzip" }),
        peer,
      )
    ).status,
    415,
  );
  assert.equal(
    (await handler()(request("/v1/ask", { question: "x".repeat(70000) }), peer))
      .status,
    413,
  );
});
test("CORS is not exposed to browser clients", async () => {
  const res = await handler()(
    request("/v1/assess", shipment(), { origin: "https://untrusted.example" }),
    peer,
  );
  assert.equal(res.status, 403);
  assert.equal(res.headers.get("access-control-allow-origin"), null);
});
test("health is minimal; countries and coverage remain authenticated", async () => {
  const h = handler();
  assert.equal(
    (await h(new Request("http://localhost/health"), peer)).status,
    200,
  );
  assert.equal(
    (await h(new Request("http://localhost/v1/countries"), peer)).status,
    401,
  );
  const r = await h(
    new Request("http://localhost/v1/coverage", {
      headers: { authorization: "Bearer " + key },
    }),
    peer,
  );
  const v = await r.json();
  assert.equal(v.recognisedIsoEntries, 249);
  assert.equal(v.inScopeEntries, 248);
  assert.equal(v.commerciallyAuthorisedRoutes, 0);
});
test("local unauthenticated mode cannot be used by non-loopback peers", async () => {
  const h = createHandler({
    dataset: data,
    apiKey: "",
    allowUnauthenticatedLoopback: true,
    now: () => now,
  });
  assert.equal(
    (
      await h(request("/v1/assess", shipment(), { authorization: "" }), {
        peer: "203.0.113.1",
      })
    ).status,
    401,
  );
  assert.equal(
    (await h(request("/v1/assess", shipment(), { authorization: "" }), peer))
      .status,
    200,
  );
});
test("missing and short service credentials fail at construction", () => {
  assert.throws(() => createHandler({ dataset: data, apiKey: "" }));
  assert.throws(() => createHandler({ dataset: data, apiKey: "short" }));
});
test("limiter is bounded and fixed-window resets", () => {
  const r = new WindowRateLimiter();
  for (let i = 0; i < 60; i++) assert.equal(r.allow("peer", 100), true);
  assert.equal(r.allow("peer", 100), false);
  assert.equal(r.allow("peer", 60100), true);
});
test("API endpoint contracts include ask and product triage", async () => {
  assert.equal(
    (
      await handler()(
        request("/v1/ask", { question: "日本から英国への関税" }),
        peer,
      )
    ).status,
    200,
  );
  assert.equal(
    (await handler()(request("/v1/classify", { description: "battery" }), peer))
      .status,
    200,
  );
  assert.equal((await handler()(request("/not-found"), peer)).status, 404);
});

test("checkout preview is authenticated, validates inputs, and cannot bind a supplied reference", async () => {
  const h = handler();
  const path = "/v1/checkout/preview";
  assert.equal((await h(request(path, shipment(), { authorization: "Bearer wrong" }), peer)).status, 401);
  assert.equal((await h(request(path, { ...shipment(), rawAddress: "private" }), peer)).status, 400);
  const res = await h(request(path, shipment({
    veygrit: {
      merchantId: "shop", orderId: "order", cartVersion: "1",
      addressTokenRef: "token", addressVersion: "1", grantRef: "grant",
    },
  })), peer);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "no-store");
  const output = await res.json();
  assert.equal(output.context, "shipment_preview");
  assert.equal(output.checkoutReady, false);
  assert.deepEqual(output.checkoutTax.knownSubtotal, { currency: "GBP", value: "22.00" });
});

test("destination ledger accepts only a valid, singular import date and requires auth", async () => {
  const h = handler();
  const path = "http://localhost/v1/coverage/destinations";
  const headers = { authorization: "Bearer " + key };
  assert.equal((await h(new Request(path), peer)).status, 401);
  for (const query of ["?date=2026-02-30", "?date=2026-11-11&date=2026-11-12"]) {
    assert.equal((await h(new Request(path + query, { headers }), peer)).status, 400);
  }
  const response = await h(new Request(path, { headers }), peer);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.referenceDate, "2026-11-11");
  assert.equal(body.destinations.length, 249);
});
