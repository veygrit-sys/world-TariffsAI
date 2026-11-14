# Veygrit Customs AI

Veygritで使う、出典付きの関税・通関判断支援エンジンです。TypeScript、Node.js、JSON Schema、Ajvで構成し、API・CLI・Next.js連携例を同梱しています。

**v1.0.0-rc.20** は、国際宅配便のDAP・DDPの精算試験を、同梱の公開税表や通常関税ゼロの制度を使える経路に拡張しました。発送国または輸入国を選び、相手先247の国・地域について、税表の適用日や審査が必要な理由を一覧で確認できます。金額を出すには、実際の輸入日に有効な費用の根拠、輸入者・通関担当の確認、配送業者の請求先受諾が必要です。 [関税の納付・精算と試験範囲](docs/IMPORT_SETTLEMENT.md) ・ [WooCommerce連携](integrations/woocommerce/README.md)

rc.15で、北朝鮮を除く248仕向地について公式原本の取得・照会結果と、WooCommerceの見積もり表示・金額保留を検証しました。試験承認した税番では、保存済み見積もりを通関明細と照合します。 [248仕向地の試験](docs/ALL_DESTINATION_CYCLE.md) ・ [既存の日中米試験](docs/PILOT_CYCLE.md) ・ [追加11仕向地の往復試験](docs/WORLDWIDE_CYCLE.md) ・ [税表更新の運用](docs/TARIFF_UPDATE_OPERATIONS.md)

**2026年11月12日に標準税表または品目別の標準税率資料を照会できるのは、世界で110仕向地です。** 資料の範囲と適用日は[品目別税率データ](docs/TARIFF_DATA.md)に記載しています。

コソボはISO正式割当と区別した補足コード `XK` として入力できます。特別地域は通常領域へ自動的にまとめず、税関・税領域の確認に進みます。

WCO加盟187件と、名簿に単独掲載されていない62件を[仕向地別の対応範囲](docs/WCO_COVERAGE.md)に収録しています。輸入日別の税表・付加税の収録状況、公式照会先、通常関税0%・原則0%の制度を確認できます。

v0.8.0では、**249仕向地の通関準備**を追加しました。品目・原産地・輸入日による税率照会、対象税率欄の基礎関税試算、通常関税0%の制度、書類の確認事項を一つのAPIで取得できます。 [世界の通関準備と基礎関税の試算](docs/WORLDWIDE_CUSTOMS_PLAN.md)

## できること

- 国内・EU域内・越境の区分と、特別な税関・税領域の確認。
- 公式税表の品目別照会。国別品目番号、HS6候補、版、出典、税率・算式、原産地条件を取得できます。
- 日本語・英語・簡体字での知識検索と、出典・確認日・再確認期限の表示。
- 英国本土、EU、シンガポール、日本、豪州、ニュージーランドの限定条件による概算。
- 中国CBECの取引枠・年間残枠・本人確認済み証拠・三単情報の確認事項整理。
- 商品の規制カテゴリの候補抽出と分類に必要な属性の案内。
- Veygritの注文版・住所版・用途限定の住所利用許可を照合する連携ポート。
- 249仕向地で通関担当への確認事項と公的照会先を取得。日付が合う税表と確認済みの明細を使い、基礎関税の参考値を試算。
- 任意のローカルOllamaモデルによる根拠の選択。モデル停止時もローカル検索を継続。

AIは既存の確認済み根拠を選択します。自由生成文やモデルの出力を税率・税額・発送許可に変換しません。初期状態の検索と税率照会はモデルやGPUなしで動きます。税率データの収録範囲は税表マニフェストに記載しています。

## すぐ動かす

Node.js 24.22以降の24系を使用します。Windows、macOS、Linuxで同じNodeコマンドを使えます。

```bash
npm ci --ignore-scripts
npm run check
npm run cli -- tariff examples/tariff-jp.json
npm run cli -- tariff examples/tariff-ca-surtax.json
npm run cli -- assess examples/gb.json
npm run cli -- destination-coverage 2026-11-11
npm run cli -- checkout-preview examples/gb.json
npm run cli -- customs-plan examples/customs-plan-us.json
npm run cli -- release-readiness
npm run cli -- worldwide-coverage 2026-11-12
npm run cli -- worldwide-direction examples/worldwide-direction-jp-de.json
npm run cli -- worldwide-direction examples/worldwide-direction-de-jp.json
npm run cli -- worldwide-quote examples/worldwide-quote-br-de.json 2026-11-12T00:00:00Z
npm run cli -- pilot-quote examples/pilot-quote-jp-us.json 2026-11-12T00:00:00Z
npm run cli -- invoice-reconcile examples/pilot-reconcile-jp-us.json
npm run cli -- ask "日本から英国へ商品を送るときの関税と書類"
```

サーバーは `.env.example` を `.env` にコピーし、`VEYGRIT_CUSTOMS_API_KEY` に32文字以上のランダムなサービス用キーを設定して起動します。

```bash
node --env-file=.env dist/server.js
```

環境変数で直接設定する場合は `npm start` でも起動できます。キーはサーバー間通信にだけ使います。ブラウザや `NEXT_PUBLIC_` 変数へ入れないでください。開発専用の認証省略モードは、ループバックに限定されています。

`npm run check` はJavaScriptと型定義のビルドも実行します。テストなしでビルドだけ行う場合は `npm run build` です。アプリへパッケージとして組み込むときは、このビルド後の `dist/` と `data/` を使います。

```bash
curl http://127.0.0.1:3008/v1/assess \
  -H "Authorization: Bearer $VEYGRIT_CUSTOMS_API_KEY" \
  -H "Content-Type: application/json" \
  --data-binary @examples/gb.json
```

上のcurl例はシェルの環境変数を使います。`.env` をNodeに読ませただけでは、シェルの変数には設定されません。

## 品目別税率

[税表の収録範囲・照会・追加方法](docs/TARIFF_DATA.md) を参照してください。`GET /v1/tariffs/coverage` は仕向地別の収録版・税種を返します。`POST /v1/tariffs/lookup` は品目番号で基本税表と付加税の候補を照会し、出典と参照日を返します。

## 税額計算と通関確認の対応範囲

以下はチェックアウトに使う手続別の概算です。通常輸入の基礎関税の参考値と世界の通関準備は `/v1/customs/plan` で取得します。

| 領域                | この版の動作                                                               | 未確定として返すもの                                      |
| ------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------- |
| 全249 ISOエントリー | 入力の認識。南極は対象外                                                   | 配送・決済・法規制の提供可否                              |
| 英国本土            | 直接B2C・通常商品・本体価格合計£135以下。確認済み標準課税の販売時VATを概算 | 北アイルランド、B2B、贈答、物品税、軽減税率、その他の手続 |
| EU27の通常領域      | €150以下の対象申告、確認済み分類と申告明細数による暫定関税                   | 国別商品別VAT、その他の通関方式、特恵・手数料             |
| シンガポール        | 空輸・郵便、非関税品確認済み。1点価格と貨物全体CIFを分離                   | 物品税品、証拠不明の重複課税、その他輸送                  |
| 日本                | 確認済み課税価格合計1万円以下かつ全明細の少額免税適格性確認済み            | 対象外商品、個人使用価格の推定、通常税率                  |
| 豪州                | 確認済み郵便貨物課税価格A$1,000以下の条件付き国境関税                      | 販売時GST・輸入GST・その他の輸送方式                      |
| ニュージーランド    | 合算確認済みNZ$1,000以下の通常商品と、登録主体による標準GST                | 例外品、手数料、未確認の徴収証拠                          |
| 中国本土            | 9610・1210の基本適格性の確認事項                                           | 品目別増値税・消費税、正式通関、高額単品特例の自動判定    |
| 米国                | 少額価格だけで免税にしない。現行HTSUS等の照合へ案内                        | 税率・追加税・郵便方式の自動計算                          |
| その他の地域        | 既存研究の出典または共通の確認事項を返す                                   | 未収録の個別税額を推定しない                              |

既存の自動計算ルールは2026年11月11日の確認を基準にしています。EUの計算ルールは11月18日、それ以外の同梱計算ルールは12月11日を再確認期限にしています。アジアと欧州の手続・税表の追加確認は11月12日です。これは運用上の期限で、法令の失効日ではありません。期限後は計算を保留します。日付を変えるだけで再承認しないでください。

既存研究から70件の出典メタデータと26件の制度要約を引き継いでいます。既存研究の要約には `inherited_research`、確認済み一次資料には `primary_rechecked` を表示します。

## API

| メソッド・パス             | 内容                             |
| -------------------------- | -------------------------------- |
| `GET /health`              | 最小のヘルスチェック             |
| `GET /v1/countries`        | 国・地域台帳                     |
| `GET /v1/coverage`         | 実装済み計算と未対応範囲         |
| `GET /v1/coverage/destinations` | 輸入日ごとの249仕向地の対応台帳 |
| `GET /v1/release-readiness` | 6方向の実注文検証状況と商用対象外 |
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
| `GET /v1/sources`          | 出典・確認日・再確認期限         |
| `GET /v1/tariffs/coverage` | 関税・付加税の収録版と対象範囲   |
| `GET /v1/tariffs/coverage/wco` | WCO加盟187件の輸入日別収録状況と照会先 |
| `GET /v1/tariffs/coverage/territories` | WCO名簿外の仕向地と通常関税0%・原則0%の制度 |
| `POST /v1/tariffs/lookup`  | 品目別の関税・付加税の照会       |
| `POST /v1/assess`          | 構造化した貨物の概算・確認事項   |
| `POST /v1/checkout/preview` | 購入時税額と輸入時の税・関税を区分した概算 |
| `POST /v1/customs/plan` | 世界の通関準備、品目別税率候補、基礎関税の参考試算 |
| `POST /v1/ask`             | 多言語の出典付き知識検索         |
| `POST /v1/classify`        | 商品属性・規制カテゴリの確認支援 |

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

## 更新と検証

```bash
npm run check
npm run data:review
npm run openapi
```

更新手順は [docs/DATA_UPDATES.md](docs/DATA_UPDATES.md)、構成は [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)、セキュリティは [SECURITY.md](SECURITY.md) を参照してください。国別ルールを追加するときは、税額計算の条件、一次出典、適用日、再確認期限、境界値テストをそろえます。

GitHubへ上げる手順は [docs/GITHUB_UPLOAD.md](docs/GITHUB_UPLOAD.md) にあります。コード・データ・テスト・設定例を含み、秘密情報、元の調査PDF、モデル重み、`node_modules` は配布物に含めません。

オープンソースの帰属は [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) と [licenses](licenses/) にあります。このプロジェクト固有コードにはOSSライセンスを自動付与していません。
