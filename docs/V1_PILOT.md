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
