import assert from 'node:assert/strict';
import {
  openSettlementFixture, prepareSettlementCase, settlementCases, settlementNow, settlementRoutes,
  settlementTariffCountries, worldQuoteEndpoint,
} from '../../../tests/fixtures/import-settlement-worldwide.ts';

async function expandedCases() {
  const fixture = openSettlementFixture();
  const partners = settlementTariffCountries.filter((country) => country !== 'JP');
  const heldRoutes = new Set(['DE-FR', 'FR-DE', 'AE-SA', 'SA-AE', 'JP-KP', 'KP-JP']);
  const routes = [...new Set([
    ...partners.flatMap((country) => [`JP-${country}`, `${country}-JP`]),
    ...settlementRoutes,
    'CA-MX', 'MX-CA', 'AU-NZ', 'NZ-AU', ...heldRoutes,
  ])];
  try {
    const toCheckoutCase = (id, prepared) => {
      const { draft, quote, review } = prepared;
      const ready = prepared.status === 'ready';
      const estimated = quote.status === 'estimated';
      return {
        id,
        quoteEndpoint: worldQuoteEndpoint,
        quote,
        expected: {
          orderId: quote.orderId, shipmentDigest: quote.shipmentDigest, importDate: quote.importDate,
          currency: quote.currency, quoteProfile: 'worldwide', shipmentId: draft.input.shipmentId,
          settlementScopeDigest: review.scopeDigest,
        },
        now: settlementNow,
        settlementReview: review,
        expectedImportFeePayer: estimated && !/^0(?:\.0+)?$/.test(draft.importTotal) ? draft.party : null,
        expectedPayments: {
          buyerAtCheckout: estimated ? { currency: quote.currency, value: draft.buyerAtCheckout } : null,
          buyerAtImport: ready ? { currency: quote.currency, value: draft.buyerAtImport } : null,
        },
        ...(ready ? { invoice: prepared.evidence.carrierInvoices[0].invoice } : {}),
      };
    };
    const output = [];
    for (const route of routes) {
      for (const terms of ['DAP', 'DDP']) {
        const prepared = await prepareSettlementCase(fixture.api, route, terms);
        if (heldRoutes.has(route)) assert.equal(prepared.status, 'held', route);
        output.push(toCheckoutCase(`${route}-${terms}`, prepared));
      }
    }
    const missingTariff = await prepareSettlementCase(fixture.baseline, 'JP-CN', 'DAP');
    assert.equal(missingTariff.status, 'held');
    assert.ok(missingTariff.quote.findings.some(({ code }) => code === 'DATED_TARIFF_REFERENCE_REQUIRED'));
    output.push(toCheckoutCase('JP-CN-missing-dated-tariff', missingTariff));
    return output;
  } finally {
    fixture.close();
  }
}

const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== '--expanded')) {
  throw new Error('Usage: node worldwide-checkout-cases.mjs [--expanded]');
}
const cases = await (args.length === 1 ? expandedCases() : settlementCases());
const base = cases.find(({ id }) => id === 'JP-CN-DAP');
assert.ok(base);
const { invoice, ...withoutInvoice } = base;
const noImportPayment = { ...base.expectedPayments, buyerAtImport: null };

const currencyMismatch = {
  ...withoutInvoice,
  id: 'JP-CN-Woo-order-currency-mismatch',
  orderCurrency: 'JPY',
  expectedImportFeePayer: null,
  expectedPayments: { buyerAtCheckout: null, buyerAtImport: null },
  expectedReasons: ['CUSTOMS_QUOTE_SCOPE_MISMATCH'],
};
const billingCurrencyMismatch = {
  ...base,
  id: 'JP-CN-billing-currency-mismatch',
  settlementReview: {
    ...base.settlementReview,
    billingBinding: { ...base.settlementReview.billingBinding, settlementCurrency: 'JPY' },
  },
  expectedPayments: noImportPayment,
};
const profileMismatch = {
  ...base,
  id: 'JP-CN-quote-profile-mismatch',
  settlementReview: { ...base.settlementReview, quoteProfile: 'pilot' },
  expectedPayments: noImportPayment,
};
const noAcceptance = {
  ...base,
  id: 'JP-CN-carrier-acceptance-missing',
  settlementReview: null,
  expectedPayments: noImportPayment,
};

const output = [...cases, currencyMismatch, billingCurrencyMismatch, profileMismatch, noAcceptance];
process.stdout.write(JSON.stringify(output) + '\n');
