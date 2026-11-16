import assert from "node:assert/strict";
import test from "node:test";
import { rolloutMarket } from "../src/rollout-market.ts";
import { data } from "./helpers.ts";

test("assigns every in-scope registry destination to a regional rollout pass", () => {
  const registry = [...data.countries, ...data.supplementalRegions];
  const counts: Record<string, number> = {};
  for (const destination of registry) {
    const market = rolloutMarket(destination.code);
    if (!destination.inScope) {
      assert.equal(market, null, destination.code);
      continue;
    }
    assert.ok(market, destination.code);
    counts[market.pass] = (counts[market.pass] ?? 0) + 1;
  }
  assert.deepEqual(counts, { 2: 33, 3: 52, 4: 57, 5: 78, 6: 29 });
});

test("keeps statistical assignments and explicit registry overrides separate from policy", () => {
  assert.deepEqual(rolloutMarket("TW"), { pass: 2, group: "asia" });
  assert.deepEqual(rolloutMarket("XK"), { pass: 3, group: "europe" });
  assert.deepEqual(rolloutMarket("KP"), { pass: 2, group: "asia" });
  assert.deepEqual(rolloutMarket("IR"), { pass: 2, group: "asia" });
  assert.deepEqual(rolloutMarket("CY"), { pass: 5, group: "western_asia_africa" });
  assert.deepEqual(rolloutMarket("GF"), { pass: 4, group: "americas" });
  assert.deepEqual(rolloutMarket("NC"), { pass: 6, group: "oceania_remote" });
  assert.equal(rolloutMarket("AQ"), null);
  assert.equal(rolloutMarket("ZZ"), null);
});
