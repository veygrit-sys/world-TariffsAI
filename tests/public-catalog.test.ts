import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import type { CheckoutPreview } from "../src/checkout.ts";
import { createHandler } from "../src/http.ts";
import { TariffCatalog } from "../src/tariffs.ts";
import { data, now, shipment } from "./helpers.ts";

test("an empty tariff manifest holds undocumented import amounts between checkout and customs", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "customs-empty-catalog-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  writeFileSync(join(directory, "manifest.json"), JSON.stringify({ version: 1, snapshots: [] }));
  const tariffs = new TariffCatalog(data, [pathToFileURL(directory + "/")]);
  const apiKey = "public-catalog-test-key-not-a-secret";
  const handle = createHandler({ dataset: data, tariffs, apiKey, now: () => now });
  const context = { peer: "127.0.0.1" };
  const authorization = "Bearer " + apiKey;

  const coverage = await handle(new Request("http://localhost/v1/tariffs/coverage", {
    headers: { authorization },
  }), context);
  assert.equal(coverage.status, 200);
  const coverageBody = await coverage.json() as ReturnType<TariffCatalog["coverage"]>;
  assert.equal(coverageBody.loadedCountriesAndTerritories, 0);
  assert.equal(coverageBody.countries.find(({ country }) => country === "US")?.status, "source_not_loaded");

  const preview = await handle(new Request("http://localhost/v1/checkout/preview", {
    method: "POST",
    headers: { authorization, "content-type": "application/json" },
    body: JSON.stringify(shipment({ destinationCountry: "US", currency: "USD" })),
  }), context);
  assert.equal(preview.status, 200);
  assert.equal(preview.headers.get("cache-control"), "no-store");
  const result = await preview.json() as CheckoutPreview;
  assert.equal(result.route, "cross_border");
  assert.deepEqual(result.goodsSubtotal, { currency: "USD", value: "100.00" });
  assert.equal(result.customsAmountHold.required, true);
  assert.ok(result.customsAmountHold.reasons.includes("DATED_TARIFF_REFERENCE_REQUIRED"));
  assert.equal(result.importTaxAndDuty.knownSubtotal, null);
  assert.equal(result.landedCostTotal, null);
  assert.equal(result.checkoutReady, false);
  assert.equal(result.shippingAuthorized, false);
});
