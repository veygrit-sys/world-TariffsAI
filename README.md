# Veygrit Customs AI

Veygrit向けの関税・通関判断支援エンジンです。TypeScript・Node.jsのAPIとCLIに、通関準備、根拠付きの見積もり、DAP・DDPの請求照合、Next.js・WooCommerce連携例を収録しています。

**v1.0.0-rc.28** は、HS分類候補を138か国・地域、151出典、384件の国別ルール、33種類のHS6へ拡張しました。今回の追加は84か国・地域と253ルールで、公式の共通品目表の適用範囲を確認した国別展開も含みます。カナダ向けには衣料・寝具・書籍・筆記具・音響機器など15商品分類を追加しました。ISO249仕向地と補助地域コソボを含む250件の進捗API・CLIと、01〜97類の分割作業台帳を備えます。限定した商品の参照候補であり、国内税番・税率・承認を確定するものではありません。 [全体の展開台帳](docs/HS_CLASSIFICATION_ROLLOUT.md) ・ [国別の範囲と出典](docs/HS_CLASSIFICATION_COUNTRIES.md) ・ [分類と自動割当](docs/HS_CLASSIFICATION.md)

## 公開リポジトリの対応範囲

WCO加盟187件と名簿に単独掲載されていない62件、計249仕向地の公的照会先と通関準備を収録しています。原産地、発送元、船積国、経由地と、お届け先の税関領域を区別します。北朝鮮（KP）は照会台帳に含まれ、商用受付では対象外です。 [仕向地別の対応](docs/WCO_COVERAGE.md) ・ [経由貨物の確認](docs/TRADE_BLOCS_AND_TRANSIT.md)

公開版の [品目別税表マニフェスト](data/tariffs/manifest.json) は空です。一般輸入の品目別関税は、指定日に適用できる税表が不足していれば保留します。公的照会先、書類の確認事項、仕向地別の制度案内と、条件がそろった場合の少額貨物などの計算ルールは利用できます。 [税表の追加と署名承認](docs/TARIFF_UPDATE_OPERATIONS.md)

公的出典を日本語・英語・簡体字で検索できます。商品分類では候補の絞り込みに必要な属性を案内します。追加のモデルを用意すると既存の出典選択に使用でき、税額は適用条件を確認した計算ルールで処理します。

## ローカル実行

Node.js 24.22以降の24系が必要です。

```bash
git clone https://github.com/veygrit-sys/world-TariffsAI.git
cd world-TariffsAI
npm ci --ignore-scripts
npm run check:public
npm run cli -- worldwide-direction examples/worldwide-direction-jp-de.json
npm run cli -- customs-plan examples/customs-plan-us.json
npm run cli -- tariff examples/tariff-jp.json
```

`check:public` は型検査、ビルド、公開データで実行できるテスト、出典台帳の整合性検査を行います。方向照会では公的資料を、通関計画では書類と税額の保留理由を確認できます。品目照会は参照候補を返し、個別取引の適用税率は `applicableRate: null` と表示します。

### HTTP API

`.env.example` を `.env` にコピーし、`VEYGRIT_CUSTOMS_API_KEY` に32文字以上のランダムなサービス用キーを設定します。キーはサーバー間通信で使用します。

```bash
node --env-file=.env dist/server.js
```

別の端末でヘルスチェックを実行します。通関計画の例を試す場合は、同じサービスキーを別端末の環境変数 `VEYGRIT_CUSTOMS_API_KEY` に設定します。

```bash
curl http://127.0.0.1:3008/health
curl http://127.0.0.1:3008/v1/customs/plan \
  -H "Authorization: Bearer ${VEYGRIT_CUSTOMS_API_KEY}" \
  -H "Content-Type: application/json" \
  --data-binary @examples/customs-plan-us.json
```

## 税額計算と通関確認の対応範囲

以下はチェックアウトに使う手続別の概算です。通常輸入の基礎関税の参考値と世界の通関準備は `/v1/customs/plan` で取得します。

| 領域                | この版の動作                                                               | 未確定として返すもの                                      |
| ------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------- |
| 249仕向地の台帳 | 公的照会先と通関準備。南極は商用対象外 | 配送・決済・法規制の提供可否 |
| 英国本土            | 直接B2C・通常商品・本体価格合計£135以下。確認済み標準課税の販売時VATを概算 | 北アイルランド、B2B、贈答、物品税、軽減税率、その他の手続 |
| EU27の通常領域      | €150以下の対象申告、確認済み分類と申告明細数による暫定関税                   | 国別商品別VAT、その他の通関方式、特恵・手数料             |
| シンガポール        | 空輸・郵便、非関税品確認済み。1点価格と貨物全体CIFを分離                   | 物品税品、証拠不明の重複課税、その他輸送                  |
| 日本                | 確認済み課税価格合計1万円以下かつ全明細の少額免税適格性確認済み            | 対象外商品、個人使用価格の推定、通常税率                  |
| 豪州                | 確認済み郵便貨物課税価格A$1,000以下の条件付き国境関税                      | 販売時GST・輸入GST・その他の輸送方式                      |
| ニュージーランド    | 合算確認済みNZ$1,000以下の通常商品と、登録主体による標準GST                | 例外品、手数料、未確認の徴収証拠                          |
| 中国本土            | 9610・1210の基本適格性の確認事項                                           | 品目別増値税・消費税、正式通関、高額単品特例の自動判定    |
| 米国                | 少額価格だけで免税にしない。現行HTSUS等の照合へ案内                        | 税率・追加税・郵便方式の自動計算                          |
| その他の地域        | 既存研究の出典または共通の確認事項を返す                                   | 未収録の個別税額を推定しない                              |

自動計算ルールの初回確認は2026年11月11日です。EUの関連資料は11月18日に再確認し、計算ルールと対象出典4件の次回再確認期限を11月25日に設定しました。それ以外の同梱計算ルールの再確認期限は12月11日です。アジアと欧州の手続・税表の追加確認は11月12日です。運用上の再確認期限を過ぎた根拠による計算は保留します。資料の再照合と判断は更新記録に残します。

既存研究から70件の出典メタデータと26件の制度要約を引き継いでいます。既存研究の要約には `inherited_research`、確認済み一次資料には `primary_rechecked` を表示します。

## API

| メソッド・パス             | 内容                             |
| -------------------------- | -------------------------------- |
| `GET /health`              | 最小のヘルスチェック             |
| `GET /v1/countries`        | 国・地域台帳                     |
| `GET /v1/coverage`         | 実装済み計算と未対応範囲         |
| `GET /v1/coverage/destinations` | 輸入日ごとの249仕向地の対応台帳 |
| `GET /v1/release-readiness` | 6方向の運用者レビュー記録による検証状況 |
| `GET /v1/worldwide/coverage` | 世界の方向数、地域別の手続調査・指定日の税表収録状況 |
| `GET /v1/worldwide/direction` | 発送元からお届け先への方向、取引判定、公的照会先、輸入手続 |
| `POST /v1/worldwide/quote` | 取引確認と費用根拠がそろった通常B2C輸入の見積もり |
| `POST /v1/worldwide/reconcile` | 通関後の請求と保存した見積もりを照合 |
| `POST /v1/pilot/quote` | 根拠を照合した通常B2Cの見積もり |
| `POST /v1/pilot/reconcile` | 注文に紐づく通関請求と保存済み見積もりの照合 |
| `GET /v1/import-settlement/coverage` | 発送国・輸入国・輸入日別の宅配便精算の事前確認 |
| `GET /v1/import-settlement/destinations` | 発送国または輸入国を基準に、往路・復路の相手先と保留理由を一覧で確認 |
| `POST /v1/import-settlement/plan` | DAP・DDPの費用負担と配送業者の受諾済み請求先を方向別に照合 |
| `POST /v1/import-settlement/reconcile` | 税関への納付・配送業者の請求と支払いを、保存済み見積もりと照合 |
| `POST /v1/import-settlement/ledger` | 複数個口・複数申告、返金・追徴、確認済み為替による注文単位の精算照合 |
| `GET /v1/sources`          | 出典・確認日・再確認期限         |
| `GET /v1/tariffs/coverage` | 関税・付加税の収録版と対象範囲 |
| `GET /v1/tariffs/evidence` | 仕向地の税表原本、公式照会先と追加で必要な根拠 |
| `GET /v1/tariffs/coverage/wco` | WCO加盟187件の輸入日別収録状況と照会先 |
| `GET /v1/tariffs/coverage/territories` | WCO名簿外の仕向地と通常関税0%・原則0%の制度 |
| `POST /v1/tariffs/lookup`  | 品目別の関税・付加税の照会       |
| `POST /v1/assess`          | 構造化した貨物の概算・確認事項   |
| `POST /v1/checkout/preview` | 購入時税額と輸入時の税・関税を区分した概算 |
| `POST /v1/customs/plan` | 世界の通関準備、品目別税率候補、基礎関税の参考試算 |
| `POST /v1/ask`             | 多言語の出典付き知識検索         |
| `POST /v1/classify`        | 商品属性・規制カテゴリの確認支援 |
| `POST /v1/classification/propose` | 根拠付きHS候補と追加質問 |
| `POST /v1/classification/assign` | サーバーの確認済み分類を商品へ再割当 |
| `POST /v1/classification/batch` | 同一加盟店の商品を一括処理 |
| `GET /v1/classification/coverage` | 分類カタログの収録範囲 |
| `GET /v1/classification/rollout` | 全250仕向地の分類調査・商品例・未確認項目を分割表示 |
| `GET /v1/classification/sources` | 分類出典のURL・確認日・適用期間 |

`/health` 以外はサービスキーが必要です。仕様は [OpenAPI](docs/openapi.json) にあります。入力に未定義のプロパティがある場合は拒否します。

金額は税抜・同一通貨の文字列です。`quantity` を掛ける前の単価を `unitValue` に設定します。`freight` と `insurance` は別記された、価格に重複して含まれない費用です。販売時課税の概算では同じ標準税率に従う付随サービスを想定しています。

計算結果には `charges`、`unknownCharges`、`estimatedTaxSubtotal`、出典、期限、入力ハッシュを返します。`estimatedTaxSubtotal` は分かっている税だけの小計です。`landedCostTotal` は未確定のため `null`。不明を0として合算しません。

`shippingAuthorized` と `checkoutReady` は常に `false` です。このサービスだけで決済・配送・輸出入の実行を許可しません。ECが注文確定額を管理し、配送・申告担当が受け付ける条件を照合します。

## Veygritへ組み込む

```ts
import { assessVeygritOrder, loadDataset } from "@veygrit/customs-ai";

const result = await assessVeygritOrder(
  { authenticatedMerchantId, orderId, expectedCartVersion },
  veygritPorts,
  loadDataset(),
);
```

`veygritPorts` は既存の注文DB・住所保管・許可管理へ接続する4つの関数です。実装は [src/veygrit.ts](src/veygrit.ts)、連携手順は [docs/INTEGRATION.md](docs/INTEGRATION.md) にあります。実サービスのDBや認証への接続は利用側で設定してください。同梱のテストは合成データです。

住所原文・氏名・電話・個人通関番号・カード情報はこのAPIの項目にしません。AIへの送信内容は、固定の質問意図・画面言語・出典カードのみです。自由入力の質問もモデルには送りません。ECの画面言語を `locale` に使い、登録住所の内部翻訳結果を購入者へ表示する必要はありません。

Next.jsのRoute Handler例は [integrations/nextjs/route.ts.example](integrations/nextjs/route.ts.example) です。Nodeサーバーで動きます。Cloudflareは入口の保護に使えますが、この版はWorkersのEdge Runtime専用実装ではありません。

## Ollamaを任意で接続する

利用環境にOllamaと適切なライセンスのモデルを用意し、次を設定します。

```dotenv
VEYGRIT_AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=利用環境にインストールしたモデル名
```

モデルは自動ダウンロードしません。モデルが返せる値は候補内の根拠IDだけです。新しい税率、本文、URL、発送許可は受け入れません。応答失敗・不正なID・余分な項目はローカル検索へ戻します。実モデルでの精度評価は未実施で、通信契約と失敗処理をモックで検証しています。

## 税表の追加と全体検証

正式な運用で追加税表を読み込むには、利用条件を確認した税表をリポジトリの外に置き、`VEYGRIT_TARIFF_DIR`、`VEYGRIT_TARIFF_APPROVAL`、`VEYGRIT_TARIFF_TRUSTED_KEYS` を設定します。承認手順と切り戻しの方法を運用文書に記載しています。 [税表の取得と切り替え](docs/TARIFF_UPDATE_OPERATIONS.md)

`npm run check` は、税表を用意した検証用コピーで全体を検証するコマンドです。過去の検証結果は対象日・品目・サンプルデータを明示した記録です。 [公開版と追加データの管理](docs/GITHUB_UPLOAD.md) ・ [データの更新手順](docs/DATA_UPDATES.md) ・ [構成](docs/ARCHITECTURE.md) ・ [セキュリティ](SECURITY.md)

公開CIは合成の税表と請求を使う取得・署名承認・精算サイクル、知識検索、HTTP API、実注文レビュー記録を検証します。実際の申告・請求の確認後、運用者管理のJSONを `VEYGRIT_LIVE_VALIDATION_FILE` に設定すると、同じ注文と現在のデータ版・税表構成に対応する確認済み段階を準備状況APIへ反映します。記録のない方向と旧版・旧構成の記録は検証待ちになります。 [実注文記録の設定](docs/PILOT_LIVE_VALIDATION.md)

## ライセンス

独自コードと独自文書にはオープンソースライセンスを付与していません。第三者ライブラリとデータには、それぞれのライセンスと利用条件が適用されます。 [LICENSE](LICENSE) ・ [第三者の利用条件](THIRD_PARTY_NOTICES.md) ・ [ライセンス原文](licenses/)
