# 追加11仕向地の税表更新から通関明細照合まで

以下は過去版のデータ同梱配布物を使用した検証記録です。再現には該当する原本または試験データが必要です。

全仕向地の最新の検証範囲は [248仕向地の試験](ALL_DESTINATION_CYCLE.md) を参照してください。

日中米の6方向に加え、日本と以下の11仕向地との直接配送を、両方向で隔離試験しました。試験の輸入日は2026年11月13日です。日本発は各仕向地の表にある1税番、日本着は装飾用陶磁器の `691390000` を使用しました。対象は標準制度の越境B2Cで、原産地特恵を申請しない通常関税の計算例です。DAPとDDPを含みます。

| 日本発の仕向地 | 試験用税番 | 原本で確認した通常関税と参照先 |
| --- | --- | --- |
| 英国（グレートブリテン） | 6912002310 | 4% [UK Trade Tariff](https://www.gov.uk/government/publications/reference-document-for-the-customs-tariff-establishment-eu-exit-regulations-2020) |
| カナダ | 6912009010 | 7% [CBSA T2026-2 第69類](https://www.cbsa-asfc.gc.ca/trade-commerce/tariff-tarif/2026/html/02/ch69-eng.html) |
| オーストラリア | 69120000 | 5% [ABF 第69類](https://www.abf.gov.au/importing-exporting-and-manufacturing/tariff-classification/current-tariff/schedule-3/section-xiii/chapter-69) |
| ニュージーランド | 6912000102 | 5% [New Zealand Customs](https://www.customs.govt.nz/business/tariffs/working-tariff-document) |
| 台湾 | 69120090006 | 7.5% [台湾税関の輸入税則](https://opendata.customs.gov.tw/data/80871/csv.csv) |
| スイス | 69120000 | 100 kgあたりCHF 0 [Tares](https://www.bazg.admin.ch/bazg/en/home/services/services-companies/services-firmen_einfuhr-ausfuhr-durchfuhr/zolltarif-tares.html) |
| 南アフリカ | 691200 | 30% [SARSのSACU共通税表](https://www.sars.gov.za/wp-content/uploads/Legal/SCEA1964/Legal-LPrim-CE-Sch1P1Chpt1-to-99-Schedule-No-1-Part-1-Chapters-1-to-99.pdf) |
| メキシコ | 6912009901 | 15% [SNICE LIGIE／NICO](https://www.snice.gob.mx/~oracle/SNICE_DOCS/FRACCIONESARANCELARIAS-LIGIE_20261014-20261014.xlsx) |
| チリ | 69120010 | 6% [チリ税関の税表](https://www.aduana.cl/arancel-aduanero-vigente/aduana/2016-12-30/090118.html) |
| ドイツ | 69120023 | 5.5% [EU年次CN共通税表](https://eur-lex.europa.eu/eli/reg_impl/2025/1926/oj) |
| シンガポール | 69120000 | 0% [Singapore Customs](https://www.customs.gov.sg/doing-business/import-operations/import-procedures/import-procedures-overview/) |

日本着11方向では [日本税関の2026年10月31日版第69類](https://www.customs.go.jp/tariff/2026_10_31/data/j_69.htm) のWTO欄2.3%を使用しました。ドイツのコードは年次CNの8桁です。実申告にはTARICの10桁と輸入日の措置を確認します。カナダの試験候補は8桁の税率を公式原本の統計細分10に対応づけた1行です。南アフリカの税率はSACU共通表のGeneral欄を使用し、南アフリカの経路で試験しました。シンガポールの対象品は関税が0%で、GSTは別の費目です。

## 隔離環境で確認したこと

1. 登録済み公式URLから原本を取得し、取得記録、SHA-256、試験用税番を照合する。
2. 輸入日だけに有効な候補税表を一時鍵で試験承認し、署名済み候補の読込を検証する。未署名候補は読込を拒否する。
3. 世界向け見積もりAPIで発行した結果をWooCommerceの未払い試験注文に表示する。対象日の根拠がなければ、商品小計を表示し、通関費用と支払総額は「確認中」とする。
4. WooCommerceから見積もりを読み戻し、別に作成した合成通関明細と注文ID、見積もりID、通貨、費目、金額を照合する。差額、明細の欠落、別の見積もりIDも試験する。

対象日外、貿易審査の不足、切り戻し後は金額を保留します。見積もりの表示が保留に変わった注文からも発行済みの見積もりを読み戻せます。注文、通常関税以外の費用、貿易審査記録と通関明細には合成データを使用しました。公式原本で照合した範囲は表にある通常関税です。本番の承認済み経路は0件です。

## 再実行

`npm ci` 後、次のコマンドでオフラインの取得、試験承認、見積もりと明細照合を再実行できます。

```sh
npm run tariff:pilot-cycle -- --worldwide --report ./world-report.json --checkout-cases ./world-orders.json
```

公式原本を使う場合は、上のコマンドに `--official-evidence ./cycle-evidence` を追加します。2026年11月13日（日本時間）の取得記録と同じSHA-256の原本を、ハッシュをファイル名にして配置します。取得記録の索引（配布物の `qa/worldwide-cycle-acquisition-2026-11-13.json`） にある `receiptFiles` を `cycle-evidence/runs/` に配置します。索引には取得に使う登録IDも含まれます。再取得で原本のSHA-256が変わった場合は、対象日と税率を審査してから試験の参照値を更新します。公式原本の取得は [税表更新の運用](TARIFF_UPDATE_OPERATIONS.md) を参照してください。

[WooCommerceの隔離実行手順](../integrations/woocommerce/README.md) で `world-orders.json` を渡して `woo-report.json` を出力し、実際の試験注文から読み戻した見積もりを照合します。

```sh
npm run tariff:pilot-cycle -- --worldwide --checkout-cases ./world-orders.json \
  --reconcile-woocommerce ./woo-report.json --report ./world-reconciled.json
```
