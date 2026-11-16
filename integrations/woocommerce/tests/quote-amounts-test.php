<?php
declare(strict_types=1);

require_once __DIR__ . '/render-quote.php';

use function Veygrit\Customs\WooCommerce\request_quote;
use function Veygrit\Customs\WooCommerce\render_order_preview;

if (!function_exists('esc_html')) {
    function esc_html(string $text): string
    {
        return htmlspecialchars($text, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }
}

function verify_preview(bool $condition, string $label): void
{
    if (!$condition) {
        throw new RuntimeException($label);
    }
}

$expected = [
    'orderId' => 'synthetic-woo-smoke',
    'shipmentDigest' => 'synthetic-digest',
    'shipmentId' => 'synthetic-shipment',
    'settlementScopeDigest' => 'synthetic-settlement-scope-digest',
    'importDate' => '2026-11-13',
    'currency' => 'JPY',
];
$case = [
    'quote' => [
        ...$expected,
        'schemaVersion' => '1.0',
        'estimateId' => 'synthetic-estimate',
        'requestDigest' => 'synthetic-quote-request-digest',
        'ruleSetVersion' => 'synthetic-rules',
        'issuedOn' => '2026-11-13',
        'estimate' => [
            'orderId' => $expected['orderId'], 'estimateId' => 'synthetic-estimate',
            'issuedOn' => '2026-11-13', 'currency' => $expected['currency'],
            'charges' => array_map(
                static fn (string $category): array => [
                    'category' => $category, 'amount' => $category === 'customs_duty' ? '100' : '0',
                ],
                ['customs_duty', 'import_vat_gst', 'additional_duty', 'excise', 'customs_fee', 'carrier_fee'],
            ),
        ],
        'status' => 'estimated',
        'expiresAt' => '2026-11-13T12:00:00.000Z',
        'goodsSubtotal' => ['currency' => 'JPY', 'value' => '1000'],
        'importChargesTotal' => ['currency' => 'JPY', 'value' => '100'],
        'buyerTotal' => ['currency' => 'JPY', 'value' => '1100'],
        'checkoutReady' => false,
    ],
    'expected' => $expected,
    'now' => '2026-11-13T11:30:00Z',
];
$estimated = render_quote_case($case);
verify_preview($estimated['buyerTotal']['value'] === '1100' && $estimated['importFees']['value'] === '100'
    && $estimated['importFeePayer'] === null && !$estimated['awaitingCustomsReview'] && !$estimated['checkoutReady'],
    'A legacy estimate was not projected as read-only without a payer');

$sellerCase = [
    ...$case,
    'quote' => [
        ...$case['quote'], 'deliveryTerms' => 'DDP',
        'buyerAtImport' => ['currency' => 'JPY', 'value' => '0.0000'],
        'buyerTotal' => ['currency' => 'JPY', 'value' => '1000'],
    ],
];
$seller = render_quote_case($sellerCase);
verify_preview($seller['importFeePayer'] === 'seller'
    && str_contains(render_order_preview($seller), '<dd>JPY 100（販売者負担）</dd>'),
    'Seller-paid import fees did not show the seller label');

$sellerCase['quote']['buyerAtCheckout'] = ['currency' => 'JPY', 'value' => '1000'];
$sellerReview = [
    'status' => 'ready',
    'orderId' => $expected['orderId'],
    'estimateId' => $sellerCase['quote']['estimateId'],
    'shipmentDigest' => $expected['shipmentDigest'],
    'shipmentId' => $expected['shipmentId'],
    'scopeDigest' => $expected['settlementScopeDigest'],
    'quoteRequestDigest' => $sellerCase['quote']['requestDigest'],
    'ruleSetVersion' => $sellerCase['quote']['ruleSetVersion'],
    'quoteEstimate' => $sellerCase['quote']['estimate'],
    'deliveryTerms' => 'DDP',
    'costBearer' => 'seller',
    'remittanceRoute' => 'carrier_advance',
    'billingParty' => 'seller',
    'expiresAt' => '2026-11-13T11:45:00.000Z',
];
$beforeConfirmation = render_quote_case($sellerCase);
verify_preview($beforeConfirmation['buyerAtCheckout']['value'] === '1000' && $beforeConfirmation['buyerAtImport'] === null
    && str_contains(render_order_preview($beforeConfirmation), '<dt>輸入時のお支払い見込み</dt><dd>確認中</dd>'),
    'Unconfirmed seller billing was displayed as zero import payment');
$sellerConfirmed = render_quote_case([...$sellerCase, 'settlementReview' => $sellerReview]);
verify_preview($sellerConfirmed['buyerAtImport'] === ['currency' => 'JPY', 'value' => '0.0000']
    && str_contains(render_order_preview($sellerConfirmed), '<dt>今回のお支払い</dt><dd>JPY 1000</dd>')
    && str_contains(render_order_preview($sellerConfirmed), '<dt>輸入時のお支払い見込み</dt><dd>JPY 0.0000</dd>'),
    'Confirmed seller billing did not show the buyer\'s split payment');

foreach ([
    'status' => 'review_required', 'orderId' => 'other-order', 'estimateId' => 'other-estimate',
    'shipmentDigest' => 'other-shipment', 'shipmentId' => 'other-shipment-id',
    'scopeDigest' => 'other-scope', 'quoteRequestDigest' => 'other-request',
    'ruleSetVersion' => 'other-rules',
    'quoteEstimate' => [...$sellerReview['quoteEstimate'], 'issuedOn' => '2026-11-12'],
    'deliveryTerms' => 'DAP', 'costBearer' => 'buyer',
    'remittanceRoute' => 'direct_payment', 'billingParty' => 'buyer',
    'expiresAt' => '2026-11-13T11:30:00.000Z',
] as $field => $invalidValue) {
    $invalidReview = render_quote_case([
        ...$sellerCase, 'settlementReview' => [...$sellerReview, $field => $invalidValue],
    ]);
    verify_preview($invalidReview['buyerAtImport'] === null && $invalidReview['buyerTotal']['value'] === '1000',
        'Invalid settlement review exposed an import payment or changed the original estimate: ' . $field);
}

$missingSettlementScope = render_quote_case([
    ...$sellerCase, 'expected' => array_diff_key($expected, ['settlementScopeDigest' => true]),
    'settlementReview' => $sellerReview,
]);
verify_preview($missingSettlementScope['buyerAtImport'] === null && $missingSettlementScope['buyerAtCheckout']['value'] === '1000',
    'A review displayed an import payment without the current settlement scope');

$expiredWithReview = render_quote_case([
    ...$sellerCase, 'now' => '2026-11-13T12:00:00Z',
    'settlementReview' => [...$sellerReview, 'expiresAt' => '2026-11-13T12:01:00.000Z'],
]);
verify_preview($expiredWithReview['buyerAtCheckout'] === null && $expiredWithReview['buyerAtImport'] === null,
    'A settlement review made an expired quote displayable');
$wrongShipmentWithReview = render_quote_case([
    ...$sellerCase, 'expected' => [...$expected, 'shipmentDigest' => 'other-shipment'],
    'settlementReview' => $sellerReview,
]);
verify_preview($wrongShipmentWithReview['buyerAtCheckout'] === null && $wrongShipmentWithReview['buyerAtImport'] === null,
    'A settlement review made a different shipment\'s quote displayable');
$wrongAmountWithReview = render_quote_case([
    ...$sellerCase,
    'quote' => [...$sellerCase['quote'],
        'buyerAtCheckout' => ['currency' => 'USD', 'value' => '1000'],
        'buyerAtImport' => ['currency' => 'JPY', 'value' => '100'],
    ],
    'settlementReview' => $sellerReview,
]);
verify_preview($wrongAmountWithReview['buyerAtCheckout'] === null && $wrongAmountWithReview['buyerAtImport'] === null,
    'Invalid currency or contradictory import payment was displayed');

$buyerCase = [
    ...$case,
    'quote' => [
        ...$case['quote'], 'deliveryTerms' => 'DAP',
        'buyerAtCheckout' => ['currency' => 'JPY', 'value' => '1000'],
        'buyerAtImport' => ['currency' => 'JPY', 'value' => '100.0000'],
    ],
];
$buyer = render_quote_case($buyerCase);
verify_preview($buyer['importFeePayer'] === 'buyer'
    && $buyer['buyerAtImport'] === null && str_contains(render_order_preview($buyer), '<dd>JPY 100（購入者負担）</dd>'),
    'Buyer-paid import fees did not show the buyer label');
$buyerConfirmed = render_quote_case([
    ...$buyerCase,
    'settlementReview' => [...$sellerReview, 'deliveryTerms' => 'DAP', 'costBearer' => 'buyer', 'billingParty' => 'buyer'],
]);
verify_preview($buyerConfirmed['buyerAtCheckout']['value'] === '1000' && $buyerConfirmed['buyerAtImport']['value'] === '100.0000',
    'Confirmed buyer billing did not show the buyer\'s split payment');

foreach ([
    ['CNY', 'DAP', '1000.45', '10.05', '10.05', '1010.50'],
    ['USD', 'DDP', '1000.45', '10.05', '0.00', '1000.45'],
    ['KWD', 'DAP', '10.200', '0.125', '0.125', '10.325'],
    ['KRW', 'DDP', '12000', '1035', '0', '12000'],
] as [$currency, $terms, $checkout, $fees, $atImport, $total]) {
    $amount = static fn (string $value): array => ['currency' => $currency, 'value' => $value];
    $currencyEstimate = [...$case['quote']['estimate'], 'currency' => $currency, 'charges' => array_map(
        static fn (array $charge): array => [
            ...$charge, 'amount' => $charge['category'] === 'customs_duty' ? $fees : '0',
        ],
        $case['quote']['estimate']['charges'],
    )];
    $payer = $terms === 'DAP' ? 'buyer' : 'seller';
    $worldReview = [
        ...$sellerReview, 'quoteProfile' => 'worldwide', 'quoteEstimate' => $currencyEstimate,
        'billingBinding' => ['settlementCurrency' => $currency],
        'deliveryTerms' => $terms, 'billingParty' => $payer, 'costBearer' => $payer,
    ];
    $worldCase = [
        ...$case,
        'quote' => [
            ...$case['quote'], 'currency' => $currency, 'estimate' => $currencyEstimate, 'deliveryTerms' => $terms,
            'goodsSubtotal' => $amount($checkout), 'importChargesTotal' => $amount($fees),
            'buyerAtCheckout' => $amount($checkout), 'buyerAtImport' => $amount($atImport), 'buyerTotal' => $amount($total),
        ],
        'expected' => [...$expected, 'currency' => $currency, 'quoteProfile' => 'worldwide'],
        'settlementReview' => $worldReview,
    ];
    $worldPreview = render_quote_case($worldCase);
    verify_preview($worldPreview['buyerAtCheckout'] === $amount($checkout)
        && $worldPreview['buyerAtImport'] === $amount($atImport) && $worldPreview['buyerTotal'] === $amount($total)
        && $worldPreview['importFeePayer'] === $payer
        && str_contains(render_order_preview($worldPreview), '<dd>' . $currency . ' ' . $atImport . '</dd>'),
        'World quote did not preserve the original amounts: ' . $currency);

    foreach ([
        [...$worldReview, 'quoteProfile' => 'pilot'],
        [...$worldReview, 'billingBinding' => ['settlementCurrency' => 'JPY']],
        array_diff_key($worldReview, ['billingBinding' => true]),
    ] as $mismatchedReview) {
        $heldWorldPreview = render_quote_case([...$worldCase, 'settlementReview' => $mismatchedReview]);
        verify_preview($heldWorldPreview['buyerAtCheckout'] === $amount($checkout)
            && $heldWorldPreview['buyerAtImport'] === null, 'Mismatched settlement remained displayable: ' . $currency);
    }
}

$oldPreview = $seller;
unset($oldPreview['importFeePayer'], $oldPreview['buyerAtCheckout'], $oldPreview['buyerAtImport']);
verify_preview(str_contains(render_order_preview($oldPreview), '<dd>JPY 100</dd>')
    && str_contains(render_order_preview($oldPreview), '<dt>輸入時のお支払い見込み</dt><dd>確認中</dd>'),
    'Previously saved preview metadata did not render without a payer');

$zero = render_quote_case([
    ...$sellerCase,
    'quote' => [
        ...$sellerCase['quote'], 'importChargesTotal' => ['currency' => 'JPY', 'value' => '0.00'],
        'estimate' => [
            ...$sellerCase['quote']['estimate'],
            'charges' => array_map(
                static fn (array $charge): array => [...$charge, 'amount' => '0'],
                $sellerCase['quote']['estimate']['charges'],
            ),
        ],
    ],
]);
verify_preview($zero['importFeePayer'] === null
    && str_contains(render_order_preview($zero), '<dd>JPY 0.00</dd>'), 'Zero import fees received a payer label');

foreach ([
    ['DDP', null],
    ['DDP', ['currency' => 'JPY', 'value' => '100']],
    ['DDP', ['currency' => 'USD', 'value' => '0']],
    ['DAP', ['currency' => 'JPY', 'value' => '50']],
    ['DAP', ['currency' => 'JPY', 'value' => '0']],
    ['DAP', ['currency' => 'JPY', 'value' => '1e2']],
    [null, ['currency' => 'JPY', 'value' => '100']],
] as [$terms, $buyerAtImport]) {
    $unconfirmed = render_quote_case([
        ...$case,
        'quote' => [...$case['quote'], 'deliveryTerms' => $terms, 'buyerAtImport' => $buyerAtImport],
    ]);
    verify_preview($unconfirmed['importFeePayer'] === null
        && str_contains(render_order_preview($unconfirmed), '<dd>JPY 100</dd>'),
        'Missing or contradictory payer data produced a payer label');
}

$held = render_quote_case([
    ...$sellerCase,
    'quote' => [...$sellerCase['quote'], 'status' => 'review_required', 'findings' => [
        ['code' => 'DATED_TARIFF_REFERENCE_REQUIRED'],
    ]],
]);
verify_preview($held['goodsSubtotal']['value'] === '1000' && $held['importFees'] === null && $held['buyerTotal'] === null
    && $held['importFeePayer'] === null
    && $held['awaitingCustomsReview'] && $held['reasons'] === ['DATED_TARIFF_REFERENCE_REQUIRED']
    && str_contains(render_order_preview($held), '<dt>通関費用の見積もり</dt><dd>確認中</dd>'), 'Hold leaked amounts');

$expired = render_quote_case([...$sellerCase, 'now' => '2026-11-13T12:00:00Z']);
verify_preview($expired['goodsSubtotal']['value'] === '1000' && $expired['buyerTotal'] === null
    && $expired['importFeePayer'] === null
    && $expired['reasons'] === ['REQUOTE_REQUIRED'], 'An expired quote remained displayable');

foreach (['orderId', 'shipmentDigest', 'importDate', 'currency'] as $field) {
    $mismatch = render_quote_case([...$case, 'expected' => [...$expected, $field => 'mismatch']]);
    verify_preview($mismatch['goodsSubtotal'] === null && $mismatch['buyerTotal'] === null
        && $mismatch['reasons'] === ['CUSTOMS_QUOTE_SCOPE_MISMATCH'], 'Mismatched ' . $field . ' remained displayable');
}

foreach ([['currency' => 'USD', 'value' => '100'], ['currency' => 'JPY', 'value' => '1e2']] as $amount) {
    $invalid = render_quote_case([...$case, 'quote' => [...$case['quote'], 'importChargesTotal' => $amount]]);
    verify_preview($invalid['importFees'] === null && $invalid['buyerTotal'] === null
        && $invalid['reasons'] === ['CUSTOMS_QUOTE_AMOUNTS_UNAVAILABLE'], 'Invalid money remained displayable');
}

$wrongEstimate = render_quote_case([
    ...$case,
    'quote' => [...$case['quote'], 'estimate' => [...$case['quote']['estimate'], 'orderId' => 'other-order']],
]);
verify_preview($wrongEstimate['buyerTotal'] === null
    && $wrongEstimate['reasons'] === ['CUSTOMS_QUOTE_ESTIMATE_UNAVAILABLE'], 'A foreign invoice estimate remained displayable');

foreach (['//example.com/quote', '/v1/worldwide/quote?x=1', '/v1/pilot/../worldwide/quote'] as $endpoint) {
    try {
        request_quote('https://example.com', 'synthetic-key', [], quoteEndpoint: $endpoint);
        throw new RuntimeException('An unrecognized endpoint was allowed');
    } catch (RuntimeException $error) {
        verify_preview($error->getMessage() === 'Invalid customs quote endpoint', 'An unrecognized endpoint was allowed');
    }
}

echo "WooCommerce PHP quote projection passed\n";
