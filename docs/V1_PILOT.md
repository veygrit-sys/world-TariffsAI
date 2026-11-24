# v1の実証手順

以下はデータ同梱配布物の初期試験手順です。GitHub公開版の確認手順は [README](../README.md#ローカル実行) にあります。

v1.0.0-rc.1には、日本・中国本土・米国を結ぶ6方向のB2C見積もり、通関準備、請求照合が含まれます。同梱の6方向の検証には合成注文を使います。実注文の検証状況は `GET /v1/release-readiness` で確認します。

| 段階 | 呼び出し | 確認する結果 |
| --- | --- | --- |
| 購入前 | `POST /v1/pilot/quote` | `estimated` なら費目、根拠、負担者、支払時点、見積もりの期限が揃う |
| 通関準備 | `POST /v1/customs/plan` | 同じ注文の品目・原産地・税関領域・書類・照会先を通関担当が確認する |
| 通関後 | `POST /v1/pilot/reconcile` | 保存済みの見積もりと実請求の差を費目別に照合する |

## 見積もりを作る

1. ECサーバーから、発送元、お届け先、船積地域、明細ごとの品目番号と原産地、課税価格、輸入日、配送料・保険料を確定します。日本向けは船積地域の確認が必要です。通関準備にも同じ船積地域を `shipment.loadingCountry` に渡します。
2. 各費目について、注文に対応する通関担当・官庁・配送会社等の根拠を登録します。輸入関税、輸入VAT・GST、追加関税、物品税、税関手数料、配送会社手数料、購入時税の7費目が対象です。根拠には出典ID、参照URL、適用期間、確認日、再確認期限、通貨を入れます。
3. `pilotQuoteShipmentDigest(plan, orderId, loadingCountry, usJurisdictionApplies)` を使い、確認した注文と貨物情報を `reviewedShipmentDigest` に結び付けます。金額、課税価格、品目、数量、原産地、届け先の税関領域、米国規制の適用判断等が変わったら、根拠を再確認します。
4. 税額・手数料が確定している費目は `confirmed_amount`、百分率と課税標準が確認済みの従価費目は `ad_valorem`、適用外が確認済みの費目は `not_applicable` を使います。従価試算は、通貨の最小単位で四捨五入することが根拠で確認できる場合に使います。切捨て、従量、複合、税目間の依存がある費目は、通関担当が確認した金額を渡します。
5. 配送条件に合わせて購入時の支払いと輸入時の支払いを表示します。今回のパイロットは通常輸入の一般B2C商品を対象に、DAPでは購入者、DDPでは販売者の輸入時負担を確認します。輸入時費用の照合用スナップショットは負担者にかかわらず、輸入費用6費目を記録します。 [ICCのIncoterms資料](https://library.iccwbo.org/content/clp/Others/incoterms_2020_checklist_2024-update.pdf)

証拠が不足・期限切れ・通貨不一致の場合は `review_required` とし、購入者合計と照合用見積もりは `null` になります。通関用為替で確認した課税価格・金額を、見積もりの単一通貨にそろえてください。換算の出典、適用日、レートは証拠台帳に保持します。

適用条件を確認した貨物全体の関税・輸入税と、外部から渡した同じ費目の金額が矛盾する場合も保留します。例えば免税条件を満たして関税0と判定した貨物へ正の関税額を指定すると、`CHARGE_CONFLICTS_WITH_APPLICABLE_RULE` を返します。条件が未確認の免税や明細単位の参考税率から、貨物全体の確定額を推定することはありません。

商品価格は税抜とし、別記した配送料・保険料の重複を確認します。`checkout_tax` は購入時の販売にかかる税の費目です。輸入時税を購入時に徴収する制度は、徴収と申告の関係を別途確認します。

| 輸入先 | 根拠を取得するときに確認する項目 |
| --- | --- |
| 日本 | 関税・消費税の課税標準、品目別の適用、端数処理を確認する。 [日本税関の計算方法](https://www.customs.go.jp/tetsuzuki/c-answer/imtsukan/1111_jr.htm) |
| 中国本土 | 通常輸入の関税評価額・関税・消費税・増値税を確認し、越境EC特例の利用は手続担当に照会する。 [増値税法](https://gss.mof.gov.cn/gszhs/falvlagui/202603/t20260313_3985256.htm) ・ [海関総署令第272号](https://www.mofcom.gov.cn/zcfb/zgdwjjmywg/art/2025/art_68923263bddd4e95b6b5d98a93987be2.html) |
| 米国 | 申告価格、HTSUSの適用欄、追加措置、通関方式別の手数料を確認する。 [CBPの申告価格案内](https://www.help.cbp.gov/s/article/Article-1162?language=en_US) ・ [米国国際貿易委員会の税表](https://hts.usitc.gov/) ・ [CBPの手数料告示](https://public-inspection.federalregister.gov/2026-15530.pdf) |

## 中国本土から日本への1明細の税額計算

既存の `POST /v1/pilot/quote`、`pilot-quote` CLIとSDKで、関税と輸入消費税の2行の `method` を `japan_single_line_standard` にすると、購入前に確認した課税価格と税表から両費目を計算します。その他の5費目には従来どおり各費目の根拠を用意します。

| 項目 | 確認して渡す値 |
| --- | --- |
| 貨物 | 中国本土製造・発送・船積、日本の通常領域に直接到着する通常輸入B2Cの航空貨物・宅配。一般商品1明細、合算範囲確認済み。実際の申告単位が1申告1明細であることを確認して `shipment.japanDeclaration.singleLineConfirmed` を設定。 |
| 課税価格・分類 | 通関用に確認した円建ての課税価格を `shipment.customsValue` に指定。`taxEvidenceConfirmed` と商品 `standardTaxConfirmed` は日本の標準課税を確認した場合に設定。確認したHS6と一致する日本の9桁輸入統計品目番号、`rateTreatment: "mfn"` を明細に指定。 |
| 税表 | 実行環境に読み込んだ税表で、輸入日に有効な当該国内細分・原産地・WTO税率欄の従価税率を特定。`customs_duty` の根拠には当該商品にこの税率を使うことを確認した記録を添付。署名承認した税表の設定は[更新手順](TARIFF_UPDATE_OPERATIONS.md)参照。 |
| 関税・輸入消費税 | 両行にそれぞれ `method: "japan_single_line_standard"`、`timing: "import"`、負担者、確認期限付きの `evidence` を指定。`shipment.japanDeclaration.dutySchedule` に `"ordinary"` を指定。申告全体について輸入者が一般の関税率を選択したと確認できた場合は `"ordinary_elected"` を使用。両行の `amount` や `ratePercent` の入力は不要。 |
| 保留条件 | 課税価格1万円以下はこの計算経路を保留。1万円超20万円以下で一般税率を希望する確認がない場合、軽減税率、郵便、特恵、従量・複合税、複数明細も対象外。追加関税と物品税は現行根拠付きの `not_applicable` が両方必要。運送会社手数料は独立した費目。基本税率欄がWTO欄より低い場合、暫定税率・数量枠、同順位の重複税表、輸入時の別税目・追加措置の候補がある場合は担当者確認へ戻します。 |

根拠は日本税関の[計算図（1111）](https://www.customs.go.jp/tetsuzuki/c-answer/pdf/FAX1111.pdf)、[簡易税率と一般税率選択（1001）](https://www.customs.go.jp/tetsuzuki/c-answer/imtsukan/1001_jr.htm)、[少額免税の対象範囲（1006）](https://www.customs.go.jp/tetsuzuki/c-answer/imtsukan/1006_jr.htm)です。[税率決定の順序](https://www.customs.go.jp/tariff/mikata/mikata2_ex.htm)と、輸入消費税の課税標準に関税額・他の個別消費税を含める[国税庁の説明](https://www.nta.go.jp/taxes/shiraberu/taxanswer/shohi/6563.htm)を参照します。各根拠の再確認期限を超えた見積もりは保留します。

この計算は課税価格の千円未満を切り捨て、従価税率を掛けて関税額の百円未満を切り捨てます。元の課税価格にこの関税を加え、千円未満を切り捨てて国税消費税の課税標準とします。7.8%の国税消費税を百円単位で切り捨て、その国税額の22/78を百円単位で切り捨てて地方消費税を算出します。応答には2つの課税標準、税表ID、計算根拠URL、国・地方の内訳を含みます。例えば税関の計算例Aを1明細だけで申告する試験では、課税価格534,795円・税率14%に対し、関税74,700円、国税47,500円、地方税13,300円です。税関の原例の末尾はAとBを合算しており、この1明細試験とは集計単位が異なります。

`node --test tests/japan-import-tax.test.ts` で合成税表と注文を使って境界と内訳を検証できます。[中国→日本の入力例](../examples/pilot-quote-cn-jp-standard.json)は、一般税率の選択、申告明細、料金の根拠がそろったと仮定した合成注文です。輸入日に有効な国内税番・税率を含む試験税表を設定した状態で `npm run cli -- pilot-quote examples/pilot-quote-cn-jp-standard.json 2026-11-25T00:00:00Z` を実行します。税表を追加していない公開構成では金額を保留します。購入前計算の控えと、後日受領した実請求は別々に保管してください。

## ECに接続する

`quoteVeygritOrder` は既存の注文・住所利用許可ポートを使います。 `loadOrder` が返す `PilotOrderSnapshot.pilotQuote` に見積もりID、根拠、確認済みの貨物ダイジェストを登録します。注文版・住所版・許可期限を照合し、同じ注文状態から得た通関準備結果を通関担当へ引き継ぎます。

```ts
import {
  loadDataset, loadTariffCatalog, quoteVeygritOrder, reconcileVeygritInvoice,
} from "@veygrit/customs-ai";

const data = loadDataset();
const tariffCatalog = loadTariffCatalog(data);
const quote = await quoteVeygritOrder(
  { authenticatedMerchantId, orderId, expectedCartVersion },
  orderPorts,
  data,
  tariffCatalog,
);
// Persist quote and its estimate as a merchant-scoped, immutable snapshot.

const result = await reconcileVeygritInvoice(
  { authenticatedMerchantId, orderId, estimateId, invoiceId },
  invoicePorts,
);
```

請求は加盟店・注文・見積もりID・通貨を照合します。請求書に記載のない費目は未確定として扱います。差額の理由が確認できた場合は `explanation` の理由コードと証拠IDに、税率・課税価格・為替・手数料等の記録をひも付けます。 [請求照合仕様](INVOICE_RECONCILIATION.md)

外部見積もりと請求のURL・IDは、権限のあるサーバー側で登録します。見積もりレスポンスには証拠IDと公開参照用のURLを返します。通関業者などの非公開記録は、レスポンス上の証拠IDでサーバー側の元記録と照合します。個人情報、住所原文、認証トークン、決済情報の保管と閲覧権限は、元のEC・住所管理・通関システムで管理します。 [商用対象判定](TRADE_POLICY.md) ・ [OpenAPI](openapi.json)

## 再現と商用公開

```bash
npm ci --ignore-scripts
npm run check
npm run cli -- release-readiness
npm run cli -- pilot-quote examples/pilot-quote-jp-us.json 2026-11-12T00:00:00Z
npm run cli -- invoice-reconcile examples/pilot-reconcile-jp-us.json
```

日時指定はCLIで合成事例を再現するために使います。HTTPではサーバーの現在日時で根拠と有効期限を確認します。

各ルートでECの実注文、通関担当への書類引き継ぎ、通関後の請求額との照合を記録します。差額の根拠、適用した税表の版、通関日、配送条件、通貨を確認し、商用公開の判断に使います。収録時点の実注文での検証は0方向です。

税表や根拠の更新時は、版と適用日を持つ新しいデータで再検証し、旧版を保存します。すでに保存した見積もりには元の根拠と版を保持します。期限が切れた見積もりや根拠が変わった注文は再見積もりへ戻します。更新に失敗した場合は、照合済みのパッケージとデータを同じ版へ戻し、起動後に検証を行います。 [出典と税制データの更新](DATA_UPDATES.md)
