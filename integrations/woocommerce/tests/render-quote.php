<?php
declare(strict_types=1);

require_once __DIR__ . '/../veygrit-customs-order.php';

use function Veygrit\Customs\WooCommerce\quote_amounts;

function render_quote_case(array $case): array
{
    return quote_amounts($case['quote'], $case['expected'], new DateTimeImmutable($case['now']),
        $case['settlementReview'] ?? null);
}

if (PHP_SAPI === 'cli' && realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    $input = json_decode(stream_get_contents(STDIN), true, 64, JSON_THROW_ON_ERROR);
    $result = array_is_list($input) ? array_map('render_quote_case', $input) : render_quote_case($input);
    echo json_encode($result, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR) . "\n";
}
