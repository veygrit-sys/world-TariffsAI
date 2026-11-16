import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  openSettlementFixture, prepareSettlementCase, reconcileEndpoint,
} from '../../../tests/fixtures/import-settlement-worldwide.ts';

const [casesFile, ...reportFiles] = process.argv.slice(2);
if (!casesFile || reportFiles.length === 0) {
  throw new Error('Usage: node reconcile-worldwide-orders.mjs CASES_JSON WOO_REPORT_JSON [WOO_REPORT_JSON ...]');
}
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const expectedCases = readJson(casesFile);
const reports = reportFiles.map(readJson);
const { runtime, wordpressVersion, woocommerceVersion, phpVersion } = reports[0];
const orders = new Map();
for (const report of reports) {
  assert.deepEqual([report.runtime, report.wordpressVersion, report.woocommerceVersion, report.phpVersion, report.status],
    [runtime, wordpressVersion, woocommerceVersion, phpVersion, 'passed']);
  for (const order of report.cases) {
    assert.ok(!orders.has(order.id), `Duplicate WooCommerce case: ${order.id}`);
    orders.set(order.id, order);
  }
}
assert.equal(orders.size, expectedCases.length);

const fixture = openSettlementFixture();
const postClearance = [];
const held = [];
try {
  for (const testCase of expectedCases) {
    const order = orders.get(testCase.id);
    assert.ok(order, `Missing WooCommerce case: ${testCase.id}`);
    assert.equal(order.orderStatus, 'pending');
    assert.equal(order.orderTotalsPreserved, true);
    assert.equal(order.quoteEndpoint, '/v1/worldwide/quote');
    assert.deepEqual(order.preview.buyerAtCheckout, testCase.expectedPayments.buyerAtCheckout);
    assert.deepEqual(order.preview.buyerAtImport, testCase.expectedPayments.buyerAtImport);
    if (testCase.expectedPayments.buyerAtImport === null) {
      assert.match(order.renderedHtml, /輸入時のお支払い見込み<\/dt><dd>確認中<\/dd>/);
      held.push({
        id: order.id, quoteStatus: order.quoteStatus,
        previewFindings: order.preview.reasons,
        settlementFindings: testCase.settlementReview?.findings ?? [],
        issuedEstimatePreserved: order.priorEstimatePreservedAfterHold,
      });
      continue;
    }
    const [origin, destination, terms] = testCase.id.split('-');
    const route = `${origin}-${destination}`;
    const prepared = await prepareSettlementCase(fixture.api, route, terms);
    assert.equal(prepared.status, 'ready');
    assert.equal(order.priorEstimatePreservedAfterHold, true);
    assert.equal(order.sameEstimateIdConflictRejected, true);
    assert.deepEqual(order.storedEstimate, prepared.evidence.estimate);
    const input = { ...prepared.evidence, estimate: order.storedEstimate };
    const pending = await fixture.api(reconcileEndpoint, { ...input, carrierPayments: [] });
    assert.deepEqual([pending.status, pending.customsRemittance.status, pending.carrierSettlement.status],
      ['pending', 'confirmed', 'missing']);
    const reconciled = await fixture.api(reconcileEndpoint, {
      ...input, carrierPayments: [...input.carrierPayments, ...input.carrierPayments],
    });
    assert.equal(reconciled.status, 'reconciled');
    assert.deepEqual(reconciled.totals, {
      customsTax: prepared.draft.customsTax, carrierFees: prepared.draft.carrierFees, importCost: prepared.draft.importTotal,
    });
    assert.equal(reconciled.carrierSettlement.paidAmount, prepared.draft.importTotal);
    assert.equal(reconciled.carrierSettlement.receiptIds.length, 1);
    postClearance.push({
      id: order.id, route, terms, currency: order.orderCurrency, estimateId: order.estimateId,
      buyerAtCheckout: order.preview.buyerAtCheckout.value, buyerAtImport: order.preview.buyerAtImport.value,
      beforeCarrierPayment: pending.status, customsRemittance: reconciled.customsRemittance.status,
      afterCarrierPayment: reconciled.status, distinctCarrierReceipts: reconciled.carrierSettlement.receiptIds.length,
      ...reconciled.totals,
    });
  }
} finally {
  fixture.close();
}

const confirmedRoutes = [...new Set(postClearance.map(({ route }) => route))].sort();
const confirmedMarkets = [...new Set(confirmedRoutes.flatMap((route) => route.split('-')))].sort();
const confirmedCurrencies = [...new Set(postClearance.map(({ currency }) => currency))].sort();
process.stdout.write(JSON.stringify({
  status: 'passed', synthetic: true, source: 'woocommerce-pending-order-metadata',
  runtime, wordpressVersion, woocommerceVersion, phpVersion,
  counts: {
    orders: orders.size, confirmedOrders: postClearance.length, heldOrders: held.length,
    confirmedRoutes: confirmedRoutes.length, confirmedMarkets: confirmedMarkets.length,
    confirmedCurrencies: confirmedCurrencies.length,
  },
  confirmedRoutes, confirmedMarkets, confirmedCurrencies, held, postClearance,
}, null, 2) + '\n');
