# 日中米6方向の実注文検証

対象は日本（JP）、中国本土（CN）、米国（US）の双方向です。運用者の記録がないとき、`GET /v1/release-readiness` の検証済み件数は0方向、各段階は `pending_live_validation` です。実際の申告・請求を確認した運用者が、その証跡への参照と判断を方向ごとに記録します。

初回は、予定する提供範囲に入る一般品の通常輸入B2C注文で、発送・船積・到着と料金を追跡できる取引を選びます。輸送方式、申告方式、配送条件、品目、特恵申告の範囲は、実際に通関担当が確認した条件を検証記録に残します。

## 方向別に確認する項目

| 方向 | 通関担当と照合する事項 |
| --- | --- |
| 日本→中国本土 | 中国での輸入申告番号、品目番号、完税価格、輸入増値税・消費税の扱い、徴税に用いた換算根拠。RCEPの特恵を申告する場合は中国側の申告内容、証憑、積送条件を照合します。 [中国海関の征税管理办法](https://www.mofcom.gov.cn/zcfb/zgdwjjmywg/art/2025/art_68923263bddd4e95b6b5d98a93987be2.html) |
| 中国本土→日本 | 日本向け貨物の船積地域と明細原産地、日本の品目番号、課税価格、輸入消費税、端数処理。RCEPを申告する場合は、協定上の原産国、原産地証明、積送要件と適用税率欄を照合します。 [日本税関の税額計算](https://www.customs.go.jp/tetsuzuki/c-answer/imtsukan/1111_jr.htm) ・ [日本税関のRCEP資料](https://www.customs.go.jp/kyotsu/kokusai/news/rcep/shiryou.pdf) |
| 日本→米国 | 米国の輸入者と申告方式、HTSUS品目番号、明細原産地、通常税率欄と追加措置、税関手数料と配送会社手数料。少額・郵便は当該申告方式の条件を照合します。 [USITCの税表](https://hts.usitc.gov/) ・ [CBPの郵便手続](https://www.govinfo.gov/content/pkg/FR-2026-10-22/html/2026-21600.htm) |
| 米国→日本 | 日本向け貨物の船積地域、明細原産地、日本の品目番号と課税価格、輸入消費税と端数処理。日米貿易協定の申告がある場合は、品目・原産地・税率欄を当局資料と照合します。 [日本税関の税額計算](https://www.customs.go.jp/tetsuzuki/c-answer/imtsukan/1111_jr.htm) ・ [日本税関の日米貿易協定資料](https://www.customs.go.jp/roo/origin/epa.pdf) |
| 中国本土→米国 | 米国の申告方式、HTSUS品目番号、明細原産地と輸入日に対応する追加措置、例外の根拠、税関・運送会社の費目。第三国から発送した場合も原産地と積送情報を別々に記録します。 [USITCの税表](https://hts.usitc.gov/) ・ [CBPの郵便手続](https://www.govinfo.gov/content/pkg/FR-2026-10-22/html/2026-21600.htm) |
| 米国→中国本土 | 中国での申告方式、明細原産地、関税と追加措置、完税価格、輸入増値税・消費税の扱い、徴税に用いた換算根拠を照合します。 [中国海関の征税管理办法](https://www.mofcom.gov.cn/zcfb/zgdwjjmywg/art/2025/art_68923263bddd4e95b6b5d98a93987be2.html) |

- 航空貨物、クーリエ、郵便、海上貨物は、運送書類・申告種別・料金表をそれぞれ確認します。積み替え、一時蔵置、複数の経由国がある場合は、発着順、船積港、通し運送書類、税関管理中の取扱いを通関担当へ渡します。
- 特恵申告は協定・品目・輸入日・協定上の原産地・積送条件で確認します。特恵を使用した検証ケースでは、適用した税率欄と原産地証憑の識別子を申告記録に結び付けます。
- 中国本土向けの直送 `9610`、保税 `1210`、米国向け国際郵便、日本向け少額制度、贈答、返品、B2B、特殊税関領域は、それぞれの手続条件を確認する別ケースにします。現行の `pilot/quote` は一般品の通常輸入B2Cを対象にします。 [特別税関領域と輸入特例](SPECIAL_CUSTOMS_PROCEDURES.md)

## 仮名化した検証記録

事業者の管理下で注文を検証用IDにひも付けます。APIへ渡す証拠参照は、推測困難な内部IDと公開参照用のHTTPS URLを使います。住所原文、氏名、電話番号、決済情報、非公開文書原本は権限のある既存システムに保管します。

| 証跡 | 記録する内容 |
| --- | --- |
| 注文と貨物 | 仮名の `orderId`、注文版、輸入予定日と実輸入日、発送国、船積地域、経由の順序、仕向国・税関領域。明細ごとの品目番号、原産地、数量、税抜価格、配賦した課税価格、別記した送料・保険料を記録します。 |
| 書類の引き継ぎ | `availableDocuments` に記録した書類種別、原本を参照する内部ID、提出・受領日時、通関担当者の承認記録、必要に応じて原産地証明・通過書類・許可書。 |
| 通貨と根拠 | 注文通貨と見積通貨、申告・請求で用いた通貨、換算に用いた当局または通関担当の根拠、適用日、レート、端数処理。見積もりと照合の金額は同一通貨へ正規化し、原通貨と換算根拠を別途保持します。 |
| 見積もり | `estimateId`、`reviewedShipmentDigest`、費目別根拠ID、適用期間、データ版・税表版、確認日、期限、配送条件、負担者・支払時点。 |
| 通関後の請求 | 仮名の `invoiceId`、同じ `estimateId` と `orderId`、請求日、正規化した通貨、実請求の費目、差額理由と `evidenceId`。 |

見積もりには関税、輸入VAT・GST、追加関税、物品税、税関手数料、運送会社の輸入時手数料、購入時税の7費目を使います。費目の根拠に応じて `confirmed_amount`、`ad_valorem`、または根拠付きの `not_applicable` を選びます。DAP・DDPの輸入時負担を実際の契約と照合し、購入時税と輸入時税、基本送料と輸入時手数料を区別します。 [パイロット見積もり仕様](V1_PILOT.md)

## APIと受入判定

| 実施順 | 操作 | 証跡と判定 |
| --- | --- | --- |
| 1 | `POST /v1/pilot/quote` | `pilotQuoteShipmentDigest` に注文と貨物を結び付け、各費目の根拠と見積もりを保存します。試験ECの購入画面と `estimated`、購入時・輸入時の金額、負担者、見積期限を照合します。金額・課税価格・船積や経路・輸入日・品目等が変わった場合は根拠を再確認し、改めて見積もります。 |
| 2 | `POST /v1/customs/plan` | 見積もりと同じ注文状態を使い、日本向けなどの船積地域は `shipment.loadingCountry` に入れます。明細原産地、品目、税関領域、書類、輸入手続を通関担当の受領記録および実際の申告と照合します。`available_for_review` の後に、担当者の確認と申告結果を記録します。 |
| 3 | `POST /v1/pilot/reconcile` | 手順1の応答に保存した `estimate` と実請求の `invoice` を使い、輸入時の6費目を最小通貨単位で比較します。確認済みの0と欠落を分け、同じ請求内の同一費目を集約します。 `matched` は一致、`differences` は理由と証拠のレビュー対象、`needs_review` は欠落等の確認待ちです。 [請求照合仕様](INVOICE_RECONCILIATION.md) |
| 4 | 担当者による方向単位のレビュー | 手順1〜3の結果、元の証拠、同じ入力での再現性を照合し、差額を費目ごとに説明します。未解決の差額、申告結果、追加費用、期限切れ、経路変更、住所利用許可の変更は保留または再見積もりにします。公開範囲は検証して承認した方向・輸送方式・申告条件に限定します。 |

APIの構造とエラー処理は [OpenAPI](openapi.json) に記載しています。実注文の原本、承認記録、差額の対応は運用側が保存します。現行APIの `productionAuthorized`、`checkoutReady`、`shippingAuthorized` は `false` を返します。

## 運用者が確認した記録の設定

rc.23では、運用者が管理するJSONファイルへの絶対パスを `VEYGRIT_LIVE_VALIDATION_FILE` に設定できます。サーバーとNext.js連携例は起動時に読み込み、`release-readiness` CLIは実行時に読み込みます。更新したファイルをサーバーへ反映するときは再起動します。

記録は最大6方向、方向ごとに同じ注文1件へ結び付けます。`datasetVersion` は現在の `/v1/release-readiness` 応答で確認します。`tariffManifestSha256` は使用した税表構成のマニフェストハッシュを読込順に記録します。実際の注文を確認してから、完了した段階に `status: "validated"`、証拠の内部参照、確認担当者の内部参照、確認日を記録します。未確認の段階は省略します。

次のJSONは合成例です。実際の設定では自社の不透明な参照IDへ置き換えます。参照は英字開始・16〜100字の英数字と `_ . : -` に対応します。氏名、住所、電話番号、証拠原本はアクセス制御された既存システムに保存します。

```json
[
  {
    "route": "JP-US",
    "orderId": "synthetic-order-reference-0001",
    "datasetVersion": "2026-11-18.v11",
    "tariffManifestSha256": ["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],
    "checkout": {
      "status": "validated",
      "evidenceId": "synthetic-checkout-reference-0001",
      "reviewerRef": "synthetic-reviewer-reference-0001",
      "reviewedOn": "2026-11-18"
    }
  }
]
```

上記のハッシュは合成値です。稼働構成の実際の値は、署名付き税表の読込設定を使って次のコマンドで取得できます。

```bash
node --input-type=module -e 'import {loadDataset, loadOperationalTariffCatalog} from "./dist/index.js"; console.log(JSON.stringify(loadOperationalTariffCatalog(loadDataset()).manifestSha256()));'
```

購入画面は `checkout`、通関引き継ぎは `customsHandoff`、請求照合は `invoiceReconciliation` に同じ形で記録します。3段階がそろい、現在のデータ版と順序付き税表構成に対応する方向を `productionVerifiedRouteCount` に集計します。この件数は運用者がレビューしたサンプル注文のある方向数です。運用上の提供範囲は、実際に確認した品目・輸送方式・申告条件の記録で管理します。

未来の確認日、同じ方向の重複、未定義の項目、不正な日付、証拠項目の不足はエラーになります。古いデータ版、税表の差し替えや読込順の変更に対応する記録は、再確認するまで検証待ちとして表示します。API応答は段階の状態と件数を返します。注文・証拠・確認担当者の内部参照は運用者の管理下に保持します。

SDKから直接呼ぶ場合は、`releaseReadiness(data, now, records, tariffs.manifestSha256())` の4引数で使用します。税表構成を省略した呼出しは検証待ちになります。

このファイルは運用者の申告記録として扱います。証拠の真正性、通関当局の受理、費用の確定は担当者が照合します。`productionAuthorized` は `false` を返します。

```bash
export VEYGRIT_LIVE_VALIDATION_FILE=/secure/veygrit/live-validation.json
npm run cli -- release-readiness
```

## 同梱サンプルの再現

以下は、仮名ID、合成の金額、サンプル出典で構成した日本→米国の動作確認です。見積もりは費目ごとの根拠、照合入力は同じ注文・見積もりに紐付く請求と手数料差額を示します。実注文の検証は、上の手順に沿って実際の申告・請求の証跡を登録します。

```bash
npm run cli -- pilot-quote examples/pilot-quote-jp-us.json 2026-11-12T00:00:00Z
npm run cli -- customs-plan examples/customs-plan-us.json
npm run cli -- invoice-reconcile examples/pilot-reconcile-jp-us.json
npm run cli -- release-readiness
```

`customs-plan-us.json` は通関計画の入力形状を示す別の合成例です。同一注文の照合では、見積もりに使った `plan` と請求に対応する `estimate` を保存します。 [見積もり入力例](../examples/pilot-quote-jp-us.json) ・ [通関計画入力例](../examples/customs-plan-us.json) ・ [請求照合入力例](../examples/pilot-reconcile-jp-us.json)
