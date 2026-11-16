# 248仕向地の税表取得、試験承認、EC表示と明細照合

過去版のデータ同梱配布物を使用した検証記録です。以下の取得記録と証跡のパスは、当時の配布物内の位置を示します。

2026年11月13日（日本時間）を基準日として、北朝鮮を除く248仕向地を、仕向地ごとに1件検証します。日本着の1件は中国からの直接配送、残りは日本からの直接配送です。商品、注文、通関明細は隔離環境用のデータです。

| 工程 | 確認内容 |
| --- | --- |
| 公式原本の取得・照会 | 登録先への取得結果と原本のSHA-256を記録。手動照会先は公式URL、失敗は理由を仕向地別に記録 |
| 試験承認 | 対象日に有効な原本と照合した通常関税1税番を、一時鍵で署名した試験用候補に読み込む |
| EC表示 | 全248仕向地の見積もり応答をWooCommerceの未払い試験注文で再生。未承認、書類や通関領域の確認が必要、取引審査待ちの場合は通関費用と支払総額を保留 |
| 通関明細の照合 | WooCommerceから読み戻した見積もりを、注文・見積もりID・通貨・費目・金額で独立した試験明細と照合。保留の注文では発行済み見積もりが保存されないことを確認 |

別の試験注文で対象日外の保留を再確認します。北朝鮮はEC試験注文の対象外とし、APIでは金額を提示せずにブロックすることを検証します。

## 結果の確認

- 248仕向地の工程別台帳（配布物の `qa/all-destination-ledger-2026-11-13.json`） に、原本取得、試験承認、WooCommerce表示、照合の結果と保留理由を記録しています。
- 公式原本の取得結果（配布物の `qa/all-destination-acquisition-2026-11-13.json`） には、取得日時、登録先、確認できた原本のSHA-256、取得失敗の理由と手動照会先があります。
- 署名承認とAPIの試験結果（配布物の `qa/all-destination-signed-cycle-2026-11-13.json`） には、試験した税番、税率、根拠となる原本、切り戻しの結果があります。
- WooCommerceから読み戻した明細の照合結果（配布物の `qa/all-destination-woocommerce-reconciliation-2026-11-13.json`） では、発行済み見積もりとの一致と保留状態を確認できます。

税表の取得成功は、税率の適用日や取引の承認とは別に記録します。試験承認は対象日、税番、標準通関領域、通常関税の範囲です。EU共通税表を使う試験は標準EU関税領域、SACU共通税表を使う試験は各加盟国の標準輸入を対象にします。追加費用、原産地特恵の適用、輸入許可、実際の通関明細は取引ごとに確認が必要です。本番承認済みの経路は0件です。

## 再実行

```sh
npm ci
npm run tariff:acquire -- --sources in-scope --output ./all-evidence
npm run tariff:pilot-cycle -- --all-destinations --report ./cycle.json --checkout-cases ./orders.json
```

1行目は依存を導入し、2行目は248仕向地の公式取得・照会を試行します。3行目はオフラインの試験原本で、署名承認、見積もり、保留、照合を再現します。手動照会先や取得失敗を含む場合、取得コマンドは終了コード2を返し、対象ごとの結果を保存します。

実際の原本で再実行する場合は、`--official-evidence ./all-evidence` を加え、選定原本の取得記録（配布物の `qa/all-destination-receipts-2026-11-13/index.json`） の各JSONを `all-evidence/runs/` に置きます。選定原本は同じSHA-256をファイル名にして `all-evidence/` に配置します。原本の取得日と対象日の異なる試験には、税番と適用期間の再確認が必要です。

[WooCommerce隔離実行](../integrations/woocommerce/README.md) で `orders.json` を使い、`woo-report.json` を出力します。読み戻した見積もりは次のコマンドで照合します。

```sh
npm run tariff:pilot-cycle -- --all-destinations --checkout-cases ./orders.json \
  --reconcile-woocommerce ./woo-report.json --report ./reconciled.json
```
