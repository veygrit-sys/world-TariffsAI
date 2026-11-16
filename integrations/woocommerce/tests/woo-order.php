<?php
declare(strict_types=1);

// Loaded only by the disposable WordPress Playground test runner.
require_once '/wordpress/wp-load.php';
require_once __DIR__ . '/render-quote.php';

use const Veygrit\Customs\WooCommerce\PREVIEW_META_KEY;
use function Veygrit\Customs\WooCommerce\attach_order_preview;
use function Veygrit\Customs\WooCommerce\render_order_preview;
use function Veygrit\Customs\WooCommerce\reload_estimate_by_id;
use function Veygrit\Customs\WooCommerce\request_quote;

function verify_order_case(array $case, WC_Product_Simple $product): array
{
    $expected = $case['expected'];
    $hasQuoteEndpoint = array_key_exists('quoteEndpoint', $case);
    $quoteEndpoint = $hasQuoteEndpoint ? $case['quoteEndpoint'] : '/v1/pilot/quote';
    if (!in_array($quoteEndpoint, ['/v1/pilot/quote', '/v1/worldwide/quote'], true)) {
        throw new RuntimeException('Invalid customs quote endpoint in test case');
    }
    $serviceOrigin = 'http://127.0.0.1:8787';
    $serviceKey = 'disposable-test-key';
    $payload = ['orderId' => $expected['orderId']];
    $replay = static function ($preempt, array $args, string $url) use ($case, $serviceOrigin, $serviceKey, $quoteEndpoint, $payload) {
        if ($url !== $serviceOrigin . $quoteEndpoint || $args['method'] !== 'POST'
            || $args['redirection'] !== 0 || $args['headers']['Authorization'] !== 'Bearer ' . $serviceKey
            || json_decode($args['body'], true, 32, JSON_THROW_ON_ERROR) !== $payload) {
            throw new RuntimeException('Unexpected WordPress HTTP quote request');
        }
        return ['response' => ['code' => 200], 'body' => json_encode($case['quote'], JSON_THROW_ON_ERROR)];
    };
    add_filter('pre_http_request', $replay, 10, 3);
    try {
        $quote = $hasQuoteEndpoint
            ? request_quote($serviceOrigin, $serviceKey, $payload, true, $quoteEndpoint)
            : request_quote($serviceOrigin, $serviceKey, $payload, true);
    } finally {
        remove_filter('pre_http_request', $replay, 10);
    }
    $now = new DateTimeImmutable($case['now']);
    $quoteStatus = $quote['status'] ?? null;
    // A rejected quote can omit the subtotal. Keep a nonzero merchant order to test the payment invariant.
    $productPrice = $quote['goodsSubtotal']['value'] ?? '100';

    $order = wc_create_order(['created_via' => 'veygrit_customs_cycle_test', 'status' => 'pending']);
    if (!$order instanceof WC_Order) {
        throw new RuntimeException('Could not create disposable WooCommerce order');
    }
    $orderCurrency = $case['orderCurrency'] ?? $expected['currency'];
    $order->set_currency($orderCurrency);
    $order->add_product($product, 1, ['subtotal' => $productPrice, 'total' => $productPrice]);
    $order->calculate_totals(false);
    $before = $order->get_total();

    $settlementReview = $case['settlementReview'] ?? null;
    $preview = attach_order_preview($order, $quote, $expected, $now, $settlementReview);
    $order->save();
    $reloaded = new WC_Order($order->get_id());
    $saved = $reloaded->get_meta(PREVIEW_META_KEY, true);
    $binding = $saved['binding'];
    $estimateId = $quote['estimateId'] ?? null;
    $storedEstimate = is_string($estimateId) ? reload_estimate_by_id($reloaded, $estimateId) : null;
    if ($saved['amounts'] !== $preview || $reloaded->get_total() !== $before
        || $reloaded->get_currency() !== $orderCurrency || $reloaded->get_status() !== 'pending'
        || $reloaded->get_date_paid() !== null) {
        throw new RuntimeException('WooCommerce order did not preserve the preview or changed payment data');
    }
    if (array_key_exists('expectedImportFeePayer', $case) && $preview['importFeePayer'] !== $case['expectedImportFeePayer']) {
        throw new RuntimeException('The displayed import fee payer did not match the test case');
    }
    if (array_key_exists('expectedReasons', $case) && $preview['reasons'] !== $case['expectedReasons']) {
        throw new RuntimeException('The reasons for holding payment did not match the test case');
    }
    foreach (['buyerAtCheckout', 'buyerAtImport'] as $field) {
        if (array_key_exists($field, $case['expectedPayments'] ?? []) && $preview[$field] !== $case['expectedPayments'][$field]) {
            throw new RuntimeException('The displayed payment did not match the test case: ' . $field);
        }
    }
    $invalidBinding = $preview['awaitingCustomsReview'] ? $binding !== null || $storedEstimate !== null
        : ($binding['orderId'] ?? null) !== $expected['orderId']
            || ($binding['estimateId'] ?? null) !== $quote['estimateId']
            || ($binding['shipmentDigest'] ?? null) !== $expected['shipmentDigest']
            || $storedEstimate !== $quote['estimate'];
    if ($invalidBinding) {
        throw new RuntimeException('WooCommerce estimate binding is missing or leaked on hold');
    }
    if (in_array($quoteStatus, ['review_required', 'blocked', 'out_of_scope'], true)) {
        if (!$preview['awaitingCustomsReview'] || $preview['importFees'] !== null || $preview['buyerTotal'] !== null
            || $preview['checkoutReady']) {
            throw new RuntimeException('A non-estimated quote exposed payable amounts');
        }
        if (empty($quote['findings']) && $preview['reasons'] !== ['CUSTOMS_QUOTE_UNAVAILABLE']) {
            throw new RuntimeException('A non-estimated quote without findings did not show the fallback reason');
        }
    }
    if (isset($case['invoice']) && ($quoteStatus !== 'estimated' || $storedEstimate === null
        || $preview['goodsSubtotal'] !== $quote['goodsSubtotal'] || $preview['importFees'] !== $quote['importChargesTotal']
        || $preview['buyerTotal'] !== $quote['buyerTotal'])) {
        throw new RuntimeException('The invoice fixture is missing its complete WooCommerce estimate');
    }
    $html = render_order_preview($preview);
    $labels = [
        'goodsSubtotal' => '商品小計',
        'buyerAtCheckout' => '今回のお支払い',
        'importFees' => '通関費用の見積もり',
        'buyerAtImport' => '輸入時のお支払い見込み',
        'buyerTotal' => '購入者負担総額の見積もり',
    ];
    foreach ($labels as $field => $label) {
        $amount = $preview[$field];
        $rendered = $amount === null ? '確認中' : $amount['currency'] . ' ' . $amount['value'];
        if ($field === 'importFees' && $amount !== null) {
            $rendered .= ['seller' => '（販売者負担）', 'buyer' => '（購入者負担）'][$preview['importFeePayer'] ?? ''] ?? '';
        }
        if (!str_contains($html, '<dt>' . esc_html($label) . '</dt><dd>' . esc_html($rendered) . '</dd>')) {
            throw new RuntimeException('WooCommerce preview is missing a displayed amount or review state');
        }
    }

    $preservedAfterHold = null;
    $conflictRejected = null;
    if ($storedEstimate !== null) {
        // A duplicate response can safely refresh the current preview.
        attach_order_preview($reloaded, $quote, $expected, $now, $settlementReview);
        $reloaded->save();

        $collision = $quote;
        $amount = $collision['estimate']['charges'][0]['amount'];
        $collision['estimate']['charges'][0]['amount'] = $amount === '1' ? '2' : '1';
        $conflictRejected = false;
        try {
            attach_order_preview($reloaded, $collision, $expected, $now, $settlementReview);
        } catch (RuntimeException $error) {
            if ($error->getMessage() !== 'Conflicting WooCommerce customs estimate ID') {
                throw $error;
            }
            $conflictRejected = true;
        }
        if (!$conflictRejected || $reloaded->get_meta(PREVIEW_META_KEY, true) !== $saved) {
            throw new RuntimeException('A conflicting estimate changed the current preview');
        }

        $heldRefresh = [
            ...$quote,
            'status' => 'review_required',
            'estimate' => null,
            'expiresAt' => null,
            'importChargesTotal' => null,
            'buyerTotal' => null,
            'findings' => [['code' => 'DATED_TARIFF_REFERENCE_REQUIRED']],
        ];
        $heldPreview = attach_order_preview($reloaded, $heldRefresh, $expected, $now, $settlementReview);
        $reloaded->save();
        $reloaded = new WC_Order($order->get_id());
        $afterHold = $reloaded->get_meta(PREVIEW_META_KEY, true);
        $preservedAfterHold = reload_estimate_by_id($reloaded, $binding['estimateId']) === $storedEstimate;
        if (!$heldPreview['awaitingCustomsReview'] || $heldPreview['importFeePayer'] !== null
            || $heldPreview['buyerAtCheckout'] !== null || $heldPreview['buyerAtImport'] !== null || $afterHold['binding'] !== null
            || $afterHold['amounts'] !== $heldPreview || !$preservedAfterHold
            || $reloaded->get_total() !== $before || $reloaded->get_date_paid() !== null) {
            throw new RuntimeException('Held refresh did not preserve the previously issued customs estimate');
        }
    }

    return [
        'id' => $case['id'] ?? $expected['orderId'],
        'quoteEndpoint' => $quoteEndpoint,
        'syntheticOrderId' => $expected['orderId'],
        'wooOrderId' => $reloaded->get_id(),
        'orderCurrency' => $reloaded->get_currency(),
        'estimateId' => $binding['estimateId'] ?? null,
        'shipmentDigest' => $binding['shipmentDigest'] ?? null,
        'storedEstimate' => $storedEstimate,
        'priorEstimatePreservedAfterHold' => $preservedAfterHold,
        'sameEstimateIdConflictRejected' => $conflictRejected,
        'quoteStatus' => $quoteStatus,
        'preview' => $preview,
        'renderedHtml' => $html,
        'orderTotalsPreserved' => true,
        'orderStatus' => $reloaded->get_status(),
    ];
}

if (!function_exists('wc_create_order')) {
    throw new RuntimeException('WooCommerce is not loaded');
}
$cases = json_decode(file_get_contents('/veygrit-test-data/cases.json'), true, 64, JSON_THROW_ON_ERROR);
if (!array_is_list($cases) || $cases === []) {
    throw new RuntimeException('Provide a nonempty array of synthetic test cases');
}
$product = new WC_Product_Simple();
$product->set_name('Veygrit synthetic customs-cycle item');
$product->set_regular_price('100');
$product->set_price('100');
$product->save();
$report = [
    'status' => 'passed',
    'runtime' => 'WordPress Playground',
    'wordpressVersion' => get_bloginfo('version'),
    'woocommerceVersion' => WC_VERSION,
    'phpVersion' => PHP_VERSION,
    'cases' => array_map(static fn (array $case): array => verify_order_case($case, $product), $cases),
];
if (file_put_contents('/veygrit-test-data/report.json', json_encode($report, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR)) === false) {
    throw new RuntimeException('Could not write WooCommerce test report');
}
