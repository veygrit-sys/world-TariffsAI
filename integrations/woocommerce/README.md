# WooCommerceのテスト注文で通関費用を表示する

WooCommerceのサーバーから署名承認済みの税表を読み込んだ通関サービスに照会します。返された見積もりは、加盟店側で管理する注文ID、配送内容のダイジェスト、輸入日、通貨と照合します。有効な見積もりでは、商品小計、今回のお支払い、通関費用、購入者負担総額の見積もりを表示します。通関費用が正の金額で、見積もり上の負担者を確認できる場合は、費用の横に「販売者負担」または「購入者負担」を表示します。見積もりが確認中または期限切れなら、支払いと通関費用を「確認中」にします。注文と結びつかない応答では、加盟店側のカートから商品小計を表示してください。

- `request_quote()` は加盟店が構成した固定のサービスURLとサーバー専用の鍵を使って、既定で `POST /v1/pilot/quote` を呼びます。世界向けのリクエストは、サーバー側で `quoteEndpoint: '/v1/worldwide/quote'` を指定し、同じリクエストを `quoteProfile: 'worldwide'` で請求先の確認APIに渡します。商品・配送・レビュー根拠を含む注文内容は加盟店のサーバーで組み立てます。
- `attach_order_preview()` は表示用データを注文メタデータに記録します。有効な見積もりには通関明細との照合に使う `orderId` と `estimateId`、配送内容のダイジェスト、輸入日と期限、および照合に使う費目別の見積もり明細を保存します。
- 有効な見積もりの購入時支払額は「今回のお支払い」に表示します。「輸入時のお支払い見込み」は、加盟店サーバーが取得した `settlementReview` を第5引数に渡し、その注文・見積もり・配送内容・配送条件に対する配送会社の請求先が確認済みの場合に表示します。第3引数の注文情報には現在の出荷の `shipmentId` と `settlementScopeDigest` を指定します。世界向けの見積もりでは `quoteProfile: 'worldwide'` も指定します。配送会社や請求先、費用の根拠や金額が変わったら、現在の出荷について確認結果を取り直してください。DDPの購入者の輸入時支払いは販売者側への請求が確認できたときに0円になります。DAPの購入者負担は確認済みの請求条件に基づく見込み額です。請求先が未確認・不一致・期限切れの場合は「確認中」を表示します。
- 通貨がWooCommerceの注文と一致するときに、見積もりの通貨と小数桁を表示します。注文通貨と見積もり通貨が異なる場合は、通関サービスの金額を保留します。請求先確認の通貨が見積もりと異なる場合は、輸入時の支払いを保留します。
- `render_order_preview()` は負担者と確認中の状態を含む表示用HTMLを生成します。負担者の項目がない保存済み表示は、同じ注文の見積もりを再取得すると負担者を表示できます。見積もりを表示するたびに、現在の注文内容、配送サービス、請求先に対する最新の確認結果と期限を確認し、表示用データを作り直してください。照合用の発行済み見積もりは見積もりIDごとに保持します。現在の表示が確認中になっても、`reload_estimate_by_id()` から発行済み明細を取得できます。同じ見積もりIDで明細や注文の関連付けが変わった応答はエラーになります。

```php
use function Veygrit\Customs\WooCommerce\attach_order_preview;
use function Veygrit\Customs\WooCommerce\render_order_preview;
use function Veygrit\Customs\WooCommerce\request_quote;

$quote = request_quote($trustedCustomsOrigin, $privateServiceKey, $reviewedOrderPayload, quoteEndpoint: '/v1/worldwide/quote');
$currentOrderBinding['shipmentId'] = $currentShipmentId;
$currentOrderBinding['settlementScopeDigest'] = $currentSettlementScopeDigest;
$currentOrderBinding['quoteProfile'] = 'worldwide';
$preview = attach_order_preview($wooOrder, $quote, $currentOrderBinding, new DateTimeImmutable(), $trustedSettlementReview);
$wooOrder->save();
echo render_order_preview($preview);
```

WooCommerceの決済、出荷、購入総額の確定は加盟店側の承認と運用に従います。この例が保存するのは見積もり表示と照合用の情報です。クラシックチェックアウトやCheckout Blockへの画面組み込みは加盟店側で実装してください。

## テスト

国際宅配便の請求先確認、表示と照合の接続手順は [関税の納付・精算](../../docs/IMPORT_SETTLEMENT.md) を参照してください。

PHP 8.1以上が使える場合は、表示の分岐を単独で検証できます。

```sh
php integrations/woocommerce/tests/quote-amounts-test.php
php integrations/woocommerce/tests/render-quote.php < checkout-cases.json
```

`checkout-cases.json` は `{id, quote, expected, now}` の配列です。`quote` は通関サービスのJSON応答、`expected` は現在の注文に対応する `orderId`、`shipmentDigest`、`importDate`、`currency`、`now` はテスト時刻のRFC 3339表現です。省略可能な `quoteEndpoint` に `/v1/worldwide/quote` を指定すると、そのパスへのHTTP呼び出しを検証します。既定のパスは `/v1/pilot/quote` です。`settlementReview` を使うテストでは `expected` に現在の `shipmentId`、`settlementScopeDigest`、`quoteProfile`、`expectedPayments` に `buyerAtCheckout` と `buyerAtImport` の期待値を指定できます。`orderCurrency` にはテスト注文に設定する通貨を指定でき、`expectedReasons` で保留理由を確認できます。照合用の `invoice` がある注文では、表示金額と保存した見積もりがAPI応答に一致することも検証します。

WordPress Playgroundを使うと、独立した一時データベースでWooCommerceのテスト商品・注文を作り、注文メタデータを保存して読み戻せます。通関サービスの応答は上記のファイルをWordPressのHTTP呼び出しに再生します。結果の `storedEstimate` には再読込した見積もり明細が入るので、同じ注文の通関明細との照合に使えます。同じ見積もりIDの異なる明細が拒否され、確認中への更新後も発行済みの見積もりが保持されることを検証します。審査待ち、取引停止、見積もり対象外の応答では、通関費用と購入者負担総額に「確認中」を表示し、発行済み明細を作成しないことを確認します。すべてのケースで注文が未払い（`pending`）のまま、WooCommerceの注文金額が変わらないことを確認します。

```sh
node integrations/woocommerce/tests/worldwide-checkout-cases.mjs --expanded > checkout-cases.json
veygrit_test_dir=$(mktemp -d)
npm install --prefix "$veygrit_test_dir" --ignore-scripts @wp-playground/cli@3.1.64
curl --fail --silent --show-error https://downloads.wordpress.org/plugin/woocommerce.10.5.0.zip \
  -o "$veygrit_test_dir/woocommerce.10.5.0.zip"
node --input-type=module - "$veygrit_test_dir" <<'JS'
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const cases = JSON.parse(readFileSync('checkout-cases.json', 'utf8'));
for (let start = 0; start < cases.length; start += 88) {
  writeFileSync(join(process.argv[2], `cases-${start}.json`), JSON.stringify(cases.slice(start, start + 88)));
}
JS
for cases in "$veygrit_test_dir"/cases-*.json; do
  node integrations/woocommerce/tests/run-playground.mjs \
    "$veygrit_test_dir" "$veygrit_test_dir/woocommerce.10.5.0.zip" "$cases" > "${cases%.json}-report.json" || break
done
node integrations/woocommerce/tests/reconcile-worldwide-orders.mjs checkout-cases.json \
  "$veygrit_test_dir"/cases-*-report.json
```

`--expanded` は日本と試験用税表がある仕向地の往復と、選定した第三国間をDAP・DDPで試します。確認済み注文は保存済み見積もりを使って納付と精算を照合します。試験を複数のJSON配列に分けて実行する場合、最後の照合コマンドに全ての試験結果ファイルを順に渡せます。引数なしの生成では従来の34方向を試します。

関連資料は[WooCommerceの注文API](https://woocommerce.github.io/code-reference/classes/WC-Order.html)、[WordPressのHTTP API](https://developer.wordpress.org/reference/functions/wp_remote_post/)、[WordPress Playgroundのプログラム実行](https://developer.wordpress.org/playground/handbook/guides/programmatic-playground-cli/)を参照してください。
