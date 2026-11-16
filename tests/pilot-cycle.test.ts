import assert from "node:assert/strict";
import test from "node:test";
import { runPilotCycle } from "../scripts/pilot-cycle.ts";
import { PILOT_ROUTES } from "../src/trade-policy.ts";
import { worldwideRoutes } from "../scripts/worldwide-cycle-lines.ts";

test("the tariff acquisition, signed update, quote and invoice cycle is repeatable offline", async () => {
  const { report, checkoutCases } = await runPilotCycle();
  assert.equal(report.evidenceMode, "synthetic_acquisition");
  assert.deepEqual(report.lanes.map(({ route }) => route), [...PILOT_ROUTES]);
  assert.ok(report.lanes.every(({ reconciliation }) => reconciliation.status === "matched"));
  assert.equal(report.review.verification, "verified");
  assert.equal(report.unsignedOverlayRejected, true);
  assert.equal(report.rollbackHeld, true);
  assert.equal(report.invoiceDifference, "0.50");
  assert.equal(report.productionVerifiedRouteCount, 0);
  assert.equal(checkoutCases.length, 7);
  assert.equal(checkoutCases.at(-1)?.invoice, null);
});

test("the worldwide profile tests each additional destination in both directions", async () => {
  const { report, checkoutCases } = await runPilotCycle(undefined, "worldwide");
  assert.equal(report.profile, "worldwide");
  assert.deepEqual(report.lanes.map(({ route }) => route), worldwideRoutes);
  assert.ok(report.lanes.every(({ reconciliation }) => reconciliation.status === "matched"));
  assert.equal(report.missingTradeReviewHeld, true);
  assert.equal(report.rollbackHeld, true);
  assert.equal(report.productionVerifiedRouteCount, 0);
  assert.equal(checkoutCases.length, worldwideRoutes.length + 1);
  assert.ok(checkoutCases.every(({ quoteEndpoint }) => quoteEndpoint === "/v1/worldwide/quote"));
  assert.equal(checkoutCases.at(-1)?.invoice, null);
});

test("the all-destination cycle covers each import destination and holds unapproved orders", async () => {
  const { report, checkoutCases } = await runPilotCycle(undefined, "all-destinations");
  assert.equal(report.evidenceMode, "synthetic_acquisition");
  const destinations = report.destinations!;
  assert.equal(destinations.length, 248);
  assert.equal(new Set(destinations.map(({ country }) => country)).size, 248);
  assert.ok(!destinations.some(({ country }) => country === "KP" || country === "AQ"));
  assert.equal(report.northKoreaExclusion?.status, "blocked");
  assert.equal(destinations.find(({ country }) => country === "JP")?.route, "CN-JP");
  assert.equal(destinations.filter(({ signedTestLine }) => signedTestLine).length, report.lanes.length);
  assert.ok(report.lanes.length > 14 && report.lanes.length < 248);
  assert.equal(checkoutCases.length, 249);
  for (const entry of checkoutCases) {
    assert.equal(entry.quoteEndpoint, "/v1/worldwide/quote");
    assert.equal(entry.quote.productionAuthorized, false);
    if (entry.invoice === null) assert.deepEqual([entry.quote.estimate, entry.quote.buyerTotal], [null, null]);
  }
});
