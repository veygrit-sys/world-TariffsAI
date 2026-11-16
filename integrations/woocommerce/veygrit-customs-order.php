<?php
declare(strict_types=1);

namespace Veygrit\Customs\WooCommerce;

use DateTimeImmutable;
use DateTimeZone;
use RuntimeException;
use WC_Order;

const PREVIEW_META_KEY = '_veygrit_customs_quote_preview';
const ESTIMATE_META_PREFIX = '_veygrit_customs_issued_estimate_';

/** Only amounts for the expected currency and decimal representation reach the display. */
function quote_money(mixed $amount, string $currency): ?array
{
    if (!is_array($amount) || ($amount['currency'] ?? null) !== $currency) {
        return null;
    }
    $value = $amount['value'] ?? null;
    if (!is_string($value) || !preg_match('/\A(?:0|[1-9][0-9]{0,11})(?:\.[0-9]{1,4})?\z/', $value)) {
        return null;
    }
    return ['currency' => $currency, 'value' => $value];
}

function quote_expiry(mixed $value): ?DateTimeImmutable
{
    if (!is_string($value)) {
        return null;
    }
    $format = 'Y-m-d\TH:i:s.v\Z';
    $expiry = DateTimeImmutable::createFromFormat('!' . $format, $value, new DateTimeZone('UTC'));
    return $expiry !== false && $expiry->format($format) === $value ? $expiry : null;
}

/** Validate the exact reconciliation input before a quote is displayable. */
function quote_estimate(array $quote, string $currency): ?array
{
    $estimate = $quote['estimate'] ?? null;
    if (!is_array($estimate) || count($estimate) !== 5) {
        return null;
    }
    foreach (['orderId', 'estimateId', 'issuedOn', 'currency'] as $field) {
        $value = $quote[$field] ?? null;
        if (!is_string($value) || $value === '' || ($estimate[$field] ?? null) !== $value) {
            return null;
        }
    }
    $categories = ['customs_duty', 'import_vat_gst', 'additional_duty', 'excise', 'customs_fee', 'carrier_fee'];
    $charges = $estimate['charges'] ?? null;
    if (!is_array($charges) || !array_is_list($charges) || count($charges) !== count($categories)) {
        return null;
    }
    $seen = [];
    foreach ($charges as $charge) {
        if (!is_array($charge) || count($charge) !== 2 || !in_array($charge['category'] ?? null, $categories, true)
            || quote_money(['currency' => $currency, 'value' => $charge['amount'] ?? null], $currency) === null
            || isset($seen[$charge['category']])) {
            return null;
        }
        $seen[$charge['category']] = true;
    }
    return $estimate;
}

/** Use the quote's import payment and delivery terms to attribute a nonzero fee. */
function import_fee_payer(array $quote, array $import): ?string
{
    $importValue = normalize_quote_decimal($import['value']);
    $buyerAtImport = quote_money($quote['buyerAtImport'] ?? null, $import['currency']);
    if ($buyerAtImport === null || $importValue === '0') {
        return null;
    }
    $buyerValue = normalize_quote_decimal($buyerAtImport['value']);
    return match ($quote['deliveryTerms'] ?? null) {
        'DDP' => $buyerValue === '0' ? 'seller' : null,
        'DAP' => $buyerValue === $importValue ? 'buyer' : null,
        default => null,
    };
}

function normalize_quote_decimal(string $value): string
{
    return str_contains($value, '.') ? rtrim(rtrim($value, '0'), '.') : $value;
}

/** The caller supplies the shipment-bound settlement review from the trusted server. */
function confirmed_buyer_import_payment(
    array $quote,
    array $import,
    array $expected,
    ?array $settlementReview,
    DateTimeImmutable $now,
): ?array {
    $terms = $quote['deliveryTerms'] ?? null;
    $payer = match ($terms) {
        'DDP' => 'seller',
        'DAP' => 'buyer',
        default => null,
    };
    if ($payer === null || ($settlementReview['status'] ?? null) !== 'ready'
        || ($settlementReview['deliveryTerms'] ?? null) !== $terms
        || ($settlementReview['costBearer'] ?? null) !== $payer
        || ($settlementReview['billingParty'] ?? null) !== $payer
        || ($settlementReview['remittanceRoute'] ?? null) !== 'carrier_advance') {
        return null;
    }
    $profile = $settlementReview['quoteProfile'] ?? null;
    if (($profile !== null && !in_array($profile, ['pilot', 'worldwide'], true))
        || (array_key_exists('quoteProfile', $expected) && $expected['quoteProfile'] !== $profile)) {
        return null;
    }
    // Current reviews bind the settlement currency; older pilot reviews omit it.
    $settlementCurrency = $settlementReview['billingBinding']['settlementCurrency'] ?? null;
    if (($profile !== null || $settlementCurrency !== null) && $settlementCurrency !== $import['currency']) {
        return null;
    }
    $requestDigest = $quote['requestDigest'] ?? null;
    if (!is_string($requestDigest) || $requestDigest === '' || ($settlementReview['quoteRequestDigest'] ?? null) !== $requestDigest) {
        return null;
    }
    $ruleSetVersion = $quote['ruleSetVersion'] ?? null;
    if (!is_string($ruleSetVersion) || $ruleSetVersion === '' || ($settlementReview['ruleSetVersion'] ?? null) !== $ruleSetVersion
        || ($settlementReview['quoteEstimate'] ?? null) !== $quote['estimate']) {
        return null;
    }
    $shipmentId = $expected['shipmentId'] ?? null;
    $scopeDigest = $expected['settlementScopeDigest'] ?? null;
    if (!is_string($shipmentId) || $shipmentId === '' || ($settlementReview['shipmentId'] ?? null) !== $shipmentId
        || !is_string($scopeDigest) || $scopeDigest === '' || ($settlementReview['scopeDigest'] ?? null) !== $scopeDigest) {
        return null;
    }
    foreach (['orderId', 'estimateId', 'shipmentDigest'] as $field) {
        if (($settlementReview[$field] ?? null) !== $quote[$field]) {
            return null;
        }
    }
    $expiry = quote_expiry($settlementReview['expiresAt'] ?? null);
    if ($expiry === null || $expiry <= $now) {
        return null;
    }
    $amount = quote_money($quote['buyerAtImport'] ?? null, $import['currency']);
    $expectedAmount = $terms === 'DDP' ? '0' : normalize_quote_decimal($import['value']);
    return $amount !== null && normalize_quote_decimal($amount['value']) === $expectedAmount ? $amount : null;
}

/** Project a trusted service reply for one expected merchant order and shipment. */
function quote_amounts(array $quote, array $expected, DateTimeImmutable $now, ?array $settlementReview = null): array
{
    $currency = $expected['currency'] ?? '';
    $matches = ($quote['schemaVersion'] ?? null) === '1.0' && is_string($currency)
        && preg_match('/\A[A-Z]{3}\z/', $currency) === 1;
    foreach (['orderId', 'shipmentDigest', 'importDate', 'currency'] as $field) {
        $value = $expected[$field] ?? null;
        if (!is_string($value) || $value === '' || ($quote[$field] ?? null) !== $value) {
            $matches = false;
        }
    }

    $goods = $matches ? quote_money($quote['goodsSubtotal'] ?? null, $currency) : null;
    $import = null;
    $total = null;
    $reasons = [];
    if (!$matches) {
        $reasons[] = 'CUSTOMS_QUOTE_SCOPE_MISMATCH';
    } else {
        $status = $quote['status'] ?? null;
        if ($status === 'estimated') {
            $expiry = quote_expiry($quote['expiresAt'] ?? null);
            if ($expiry === null || $expiry <= $now) {
                $reasons[] = 'REQUOTE_REQUIRED';
            } else {
                $import = quote_money($quote['importChargesTotal'] ?? null, $currency);
                $total = quote_money($quote['buyerTotal'] ?? null, $currency);
                if ($goods === null || $import === null || $total === null) {
                    $import = $total = null;
                    $reasons[] = 'CUSTOMS_QUOTE_AMOUNTS_UNAVAILABLE';
                } elseif (quote_estimate($quote, $currency) === null) {
                    $import = $total = null;
                    $reasons[] = 'CUSTOMS_QUOTE_ESTIMATE_UNAVAILABLE';
                }
            }
        } else {
            $findings = $quote['findings'] ?? null;
            if (is_array($findings)) {
                foreach ($findings as $finding) {
                    $code = is_array($finding) ? ($finding['code'] ?? null) : null;
                    if (is_string($code) && preg_match('/\A[A-Z][A-Z0-9_]{1,79}\z/', $code)) {
                        $reasons[] = $code;
                    }
                }
            }
            if ($reasons === []) {
                $reasons[] = 'CUSTOMS_QUOTE_UNAVAILABLE';
            }
        }
    }

    return [
        'goodsSubtotal' => $goods,
        'importFees' => $import,
        'importFeePayer' => $import === null ? null : import_fee_payer($quote, $import),
        'buyerAtCheckout' => $total === null ? null : quote_money($quote['buyerAtCheckout'] ?? null, $currency),
        'buyerAtImport' => $import === null ? null : confirmed_buyer_import_payment($quote, $import, $expected, $settlementReview, $now),
        'buyerTotal' => $total,
        'awaitingCustomsReview' => $total === null,
        'reasons' => array_values(array_unique($reasons)),
        'checkoutReady' => false,
    ];
}

/**
 * Read a quote from the configured customs origin. Invoke server-side with a
 * reviewed payload built by the merchant, never directly from browser input.
 */
function request_quote(
    string $origin,
    string $serviceKey,
    array $payload,
    bool $allowTestLoopback = false,
    string $quoteEndpoint = '/v1/pilot/quote',
): array {
    if (!in_array($quoteEndpoint, ['/v1/pilot/quote', '/v1/worldwide/quote'], true)) {
        throw new RuntimeException('Invalid customs quote endpoint');
    }
    $parts = parse_url($origin);
    if ($parts === false) {
        throw new RuntimeException('Invalid customs service configuration');
    }
    $scheme = $parts['scheme'] ?? null;
    $host = $parts['host'] ?? '';
    $permitted = $scheme === 'https' || ($allowTestLoopback && $scheme === 'http' && $host === '127.0.0.1');
    if (!$permitted || $host === '' || isset($parts['user']) || isset($parts['pass'])
        || isset($parts['query']) || isset($parts['fragment']) || !in_array($parts['path'] ?? '', ['', '/'], true)
        || $serviceKey === '' || preg_match('/[\r\n]/', $serviceKey)) {
        throw new RuntimeException('Invalid customs service configuration');
    }

    $reply = \wp_remote_post(rtrim($origin, '/') . $quoteEndpoint, [
        'headers' => [
            'Authorization' => 'Bearer ' . $serviceKey,
            'Content-Type' => 'application/json',
            'Accept' => 'application/json',
        ],
        'body' => json_encode($payload, JSON_THROW_ON_ERROR),
        'timeout' => 5,
        'redirection' => 0,
        'limit_response_size' => 131072,
    ]);
    if (\is_wp_error($reply) || \wp_remote_retrieve_response_code($reply) !== 200) {
        throw new RuntimeException('Customs quote unavailable');
    }
    $decoded = json_decode(\wp_remote_retrieve_body($reply), true, 32, JSON_THROW_ON_ERROR);
    if (!is_array($decoded)) {
        throw new RuntimeException('Invalid customs quote response');
    }
    return $decoded;
}

/** Read all rows so conflicting writes cannot yield an ambiguous reconciliation input. */
function stored_estimate_record(WC_Order $order, string $estimateId): ?array
{
    $key = ESTIMATE_META_PREFIX . hash('sha256', $estimateId);
    $record = null;
    foreach ($order->get_meta($key, false, 'edit') as $meta) {
        $candidate = $meta->value;
        if (!is_array($candidate) || !is_array($candidate['estimate'] ?? null)
            || ($candidate['estimate']['estimateId'] ?? null) !== $estimateId
            || ($record !== null && $record !== $candidate)) {
            throw new RuntimeException('Conflicting WooCommerce customs estimate record');
        }
        $record = $candidate;
    }
    return $record;
}

/** Retrieve the original estimate for invoice reconciliation, even after the preview changes. */
function reload_estimate_by_id(WC_Order $order, string $estimateId): ?array
{
    return stored_estimate_record($order, $estimateId)['estimate'] ?? null;
}

/**
 * Save the display snapshot on an existing WooCommerce order object. The
 * caller controls persistence with WC_Order::save() and owns the order binding.
 */
function attach_order_preview(
    WC_Order $order,
    array $quote,
    array $expected,
    DateTimeImmutable $now,
    ?array $settlementReview = null,
): array {
    $preview = quote_amounts($quote, [...$expected, 'currency' => $order->get_currency()], $now, $settlementReview);
    $binding = $preview['awaitingCustomsReview'] ? null : array_intersect_key(
        $quote,
        array_flip(['orderId', 'estimateId', 'shipmentDigest', 'importDate', 'expiresAt']),
    );
    if ($binding !== null) {
        $estimateId = $binding['estimateId'];
        $record = ['binding' => $binding, 'estimate' => $quote['estimate']];
        $existing = stored_estimate_record($order, $estimateId);
        if ($existing !== null && $existing !== $record) {
            throw new RuntimeException('Conflicting WooCommerce customs estimate ID');
        }
        if ($existing === null) {
            // Append only. If concurrent writes differ, readers reject the conflicting rows.
            $order->add_meta_data(ESTIMATE_META_PREFIX . hash('sha256', $estimateId), $record);
        }
    }
    $order->update_meta_data(PREVIEW_META_KEY, ['amounts' => $preview, 'binding' => $binding]);
    return $preview;
}

/** Display an estimate separately from WooCommerce order and payment totals. */
function render_order_preview(array $preview): string
{
    $labels = [
        'goodsSubtotal' => '商品小計',
        'buyerAtCheckout' => '今回のお支払い',
        'importFees' => '通関費用の見積もり',
        'buyerAtImport' => '輸入時のお支払い見込み',
        'buyerTotal' => '購入者負担総額の見積もり',
    ];
    $html = '<dl class="veygrit-customs-preview">';
    foreach ($labels as $key => $label) {
        $amount = $preview[$key] ?? null;
        $display = $amount === null ? '確認中' : $amount['currency'] . ' ' . $amount['value'];
        if ($key === 'importFees' && $amount !== null) {
            $display .= match ($preview['importFeePayer'] ?? null) {
                'seller' => '（販売者負担）',
                'buyer' => '（購入者負担）',
                default => '',
            };
        }
        $html .= '<dt>' . \esc_html($label) . '</dt><dd>' . \esc_html($display) . '</dd>';
    }
    return $html . '</dl>';
}
