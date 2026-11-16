# Veygritへの接続

## 連携ポート

`assessVeygritOrder` は、ログイン済みの事業者を既存の認証基盤で特定した後に呼びます。

| 関数                  | 接続先・必要な確認                                                       |
| --------------------- | ------------------------------------------------------------------------ |
| `loadOrder`           | 事業者に所属する注文。価格・商品分類・税区分は信頼できる商品台帳から取得 |
| `verifyGrant`         | 住所所有者による配送目的の許可。注文・事業者・住所版・期限・取消を照合   |
| `resolveCustomsScope` | 許可を確認した住所から国・税関税領域だけを取得                           |
| `snapshotIsCurrent`   | 計算後も注文版・住所版が変わっていないことを照合                         |

Firestore、Cloud Functions、Alibaba Cloud RDS等のSDKはこのパッケージへ固定していません。接続先ごとに上記ポートを実装することで、グローバル環境と中国本土環境の住所・鍵・監査を別々に保てます。国・税領域等の情報を環境間で移す場合も、本人同意と提供先・目的の管理はVeygrit側で実施します。

友達関係、住所を閲覧する許可、配送に利用する許可を独立して管理してください。友達に登録されているだけでは `verifyGrant` を成功にしません。住所変更後は新しい住所版と有効な許可で再見積します。

## 値の由来

| 入力                                             | 信頼する取得元                                         |
| ------------------------------------------------ | ------------------------------------------------------ |
| `locale`                                         | 提携ECの画面言語                                       |
| `originCountry`, `originZone`                    | 実際の出荷拠点と在庫区分                               |
| `destinationCountry`, `destinationZone`          | 住所保管側が解決した通関領域                           |
| `items[].originCountry`                          | 商品の原産国。発送国で代用しない                       |
| `classificationConfirmed`, `hs6`                 | 商品分類の確認記録。AIの候補をそのまま確認済みにしない |
| `standardTaxConfirmed`                           | 現地の商品別税区分を確認した台帳                       |
| `nonDutiableConfirmed`, `japanReliefEligibility` | 目的国の免税・対象外品の確認記録                       |
| `customsValue`, `customsValueConfirmed`          | 適用する税関評価方式で確認した値                       |
| `sellerTaxRegistration`                          | 当該制度の責任主体の税務登録。一般の事業者登録と区別   |
| `taxEvidenceConfirmed`                           | 販売時徴収と通関への証拠引継ぎの確認                   |
| `china` の真偽値                                 | 通関・本人確認担当による照合結果。番号原文は送らない   |

これらのフラグは外部の事実に基づく前提です。エンジンが真正性を自動証明するものではありません。チェックアウトのブラウザから受け取った値を、そのまま確認済みフラグに使わないでください。

## チェックアウト税額プレビュー

注文に連動する表示では、Veygritのサーバーから `previewVeygritCheckout` を呼びます。事業者IDはサーバーで認証した事業者のIDを使います。住所保管側から取得するのは通関領域のみです。

```ts
import { loadDataset, previewVeygritCheckout } from "@veygrit/customs-ai";

const preview = await previewVeygritCheckout(
  { authenticatedMerchantId, orderId, expectedCartVersion },
  veygritPorts,
  loadDataset(),
);
```

| レスポンス | EC画面での扱い |
| --- | --- |
| `checkoutTax` | 計算できた購入時VAT・GSTの概算。 |
| `importTaxAndDuty` | 計算できた輸入時の関税・輸入税の概算。実際の負担者と支払方法は注文・配送契約で確認。 |
| `knownSubtotal` | 金額が分かる明細だけの小計。計算できる明細がなければ `null`。0円の明細は免税等の根拠を確認できた税目に限る。 |
| `status` | `estimate_available` は該当区分の概算あり、`partial_estimate` は未確定税目を含む概算、`review_required` は金額の確認が必要。 |
| `otherUnresolvedCharges` | 通関業者費用・取扱手数料など。別途見積もりが必要。 |
| `taxHandoff` | `evidence_required` は販売時課税の証拠引継ぎが未確認。輸入VAT・GSTは未確定として表示。 |
| `expiresAt` と `requiresRequote` | 注文版、住所版、許可、税務根拠を再確認する期限と、期限切れ時の再見積指示。 |

購入者には、たとえば「購入時VAT概算 £22.00」「輸入時の費用は確認中」と表示できます。0円の関税明細があっても、追加関税、物品税、賦課金、手数料に未確定項目がある間は、輸入費用全体を0円と表示しないでください。

`POST /v1/checkout/preview` と `checkout-preview` CLIは、開発やサーバー間連携で貨物の試算を検証する入口です。`context` は `shipment_preview` になります。連携ポートで注文・住所利用許可を照合した場合は `verified_order_preview` になります。決済・出荷を行う際は、ECと通関・物流担当がそれぞれの確定条件を検証してください。

販売時課税と通関側への情報引継ぎを確認する際は、仕向地の公的資料を参照します。

- 英国本土の直接販売における低額貨物の販売時VAT。 [英国歳入関税庁](https://www.gov.uk/guidance/vat-and-overseas-goods-sold-directly-to-customers-in-the-uk)
- シンガポールの低額貨物の販売時GSTと輸入時GST。 [シンガポール税関](https://www.customs.gov.sg/personal-shipment/buying-from-overseas/gst-on-low-value-goods/)
- ニュージーランドの領収書要件と配送・通関担当者への情報引継ぎ。 [ニュージーランド内国歳入庁](https://www.ird.govt.nz/gst/gst-for-overseas-businesses/gst-on-low-value-imported-goods/requirements-after-registration)

## 本番の接続点

### 世界の通関準備

サーバー側で事業者、注文版、住所利用許可を確認してから `planVeygritOrder` を呼びます。配送先の国・領域と特別領域コードは `resolveCustomsScope` で取得します。 `OrderSnapshot.customs` に、商品台帳で確認した品目コード、原産地に対応する税率欄、課税価格の配分、用意済みの書類種別を載せます。

```ts
import { loadDataset, loadTariffCatalog, planVeygritOrder } from "@veygrit/customs-ai";

const data = loadDataset();
const tariffs = loadTariffCatalog(data);
const result = await planVeygritOrder(
  { authenticatedMerchantId, orderId, expectedCartVersion },
  veygritPorts,
  data,
  tariffs,
);
```

結果は `checkout.context: "verified_order_preview"` です。住所利用許可の期限で `checkout.expiresAt` を制限し、計算後に注文版・住所版を再確認します。受取人情報は配送・通関に必要な範囲で権限を持つ担当者が取り扱います。 [入力と出力の詳細](WORLDWIDE_CUSTOMS_PLAN.md)

同梱のNext.js例では、サーバー間の `/api/internal/customs/plan` が同じHTTP APIに接続します。注文・住所利用許可を照合する場合は上のSDKを使います。

Next.js例はNode Runtime向けです。データは `import.meta.url` を基準に読みます。バンドル後も `data/` のJSON群を参照可能にするため、Next.jsの `outputFileTracingIncludes` 等を利用し、配布成果物の中身を確認してください。例のパッケージ名はローカルパッケージをインストールした場合の名前です。

複数台でAPIを動かす場合は、プロセス内の簡易レート制限を入口の共通制限に置き換えてください。アプリの会員認証・事業者権限・署名付きAPI認証は既存のVeygrit側で実施します。サンプルの共通サービスキーは会員や事業者を識別する仕組みではありません。

Cloudflareの入口、Firebase等の認証、住所保管サービス、Nodeのこのエンジンを組み合わせられます。実際のFirebase/Auth、実EC、実運送・通関サービスへの接続は同梱していません。

このサービスの判断は出荷許可ではありません。注文確定や出荷直前に、金額・ルール版・住所利用許可・運送受付の最新状態を再確認してください。
