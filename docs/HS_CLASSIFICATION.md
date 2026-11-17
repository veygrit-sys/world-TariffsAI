# HS分類候補と確認済みコードの自動割当

rc.25では、商品情報の構造化、根拠付き候補検索、追加質問、運用者の承認と取消、確認済み分類の再割当、一括処理、既存の通関計画への引き継ぎを追加しました。従来の `/v1/classify` は注意カテゴリと不足属性を返す既存仕様を維持します。

## 実装順とデータ範囲

1. 商品・対象国・輸出入区分・HS版を定義し、商品指紋と確認対象のダイジェストを作る。
2. 出典と分類ルールを持つカタログから候補を絞り、不足属性を質問する。
3. 確認者・証拠・適用範囲を承認記録へ保存し、後続注文で同じ商品仕様へ再利用する。
4. CSV・バッチAPIと通関計画を接続し、変更・取消・期限切れを検出する。

同梱の `data/classification-catalog.json` は、rc.28で138か国・地域・151出典・384件の国別HS6候補ルール（33種類）へ拡張しました。正式な共通品目表の適用範囲を照合した国別展開を含みます。カナダでは15商品分類を追加し、材料・用途・加工・構造・組物などの境界を属性で確認します。国内細分や税率は同梱しておらず、HS6参照だけで国内税番の承認は作れません。 [国別の範囲と根拠](HS_CLASSIFICATION_COUNTRIES.md) ・ [全仕向地と商品群の展開台帳](HS_CLASSIFICATION_ROLLOUT.md)

- [セルロース主体のろ過材：日本税関の公開事例](https://www.customs.go.jp/tetsuzuki_search/bunrui/J1/24/J12400968.htm)
- [鉱物性材料主体のろ過材：日本税関の公開事例](https://www.customs.go.jp/tetsuzuki_search/bunrui/J1/24/J12400541.htm)

カタログの適用期間と再確認期限は、この候補検索の運用範囲です。事前教示の法的有効期間や、すべての商品への分類判断を表すものではありません。候補はキーワードと確認済み属性の照合で決定し、モデルが推測した材質や確率値で分類済みに昇格させません。国別の品目表・注釈・追加事例は、利用条件と内容を確認してカタログへ追加します。

## 商品と対象条件

入力例は [classification-propose.json](../examples/classification-propose.json) です。

| 項目 | 内容 |
| --- | --- |
| `product.merchantId` / `sku` / `revision` | 加盟店、SKU、商品仕様の版。SKUはUnicode・空白・スラッシュを含められ、識別子の大小文字と空白を保持 |
| `product.description` | 商品説明。最大4,000文字 |
| `product.attributes` | 材質・組成・用途・構造など、最大50属性。属性キーは小文字の英字・数字・アンダースコア |
| `context.country` | 輸入または輸出で使う品目表の対象国 |
| `context.direction` | `import` / `export`。相互に国内細分を流用しない |
| `context.date` / `hsEdition` | 適用日とHS版。国内細分には別途 `tariffEdition` も結合 |

説明と属性はNFKCと余分な空白を正規化します。`1mW` と `1MW`、`CO` と `Co` などの違いは保持し、承認の再利用を停止します。属性条件は大小文字を保持した一致で照合します。必要な同義語はカタログの選択肢へ明示してください。

## API

| パス | 動作 |
| --- | --- |
| `POST /v1/classification/propose` | 上位3候補、分類理由、出典ID、不足属性と追加質問。常に未確認 |
| `POST /v1/classification/assign` | サーバーの保護された承認履歴を照合し、有効な分類を再割当 |
| `POST /v1/classification/batch` | 同一加盟店の最大100商品を処理し、商品別結果と状態件数を返す |
| `GET /v1/classification/rollout` | ISO249仕向地と補助XKの250件を追跡。候補・再確認・未確認・対象外を国/地域群/日付/方向/HS版/状態/ページで絞り込み |
| `GET /v1/classification/coverage` | 読み込み済みのカタログ版・件数・対象国・輸出入区分・HS版 |
| `GET /v1/classification/sources?offset=0&limit=25` | 出典IDを公式URL、確認日、適用期間へ解決。1回最大100件 |

`needs_attributes` は情報不足、`candidates` は候補提示、`unsupported` は収録なし・対象外、`review_required` は期限や仕様等の再確認、`approved` は有効な運用者承認の再利用です。候補だけでは `classificationConfirmed: true` を返しません。

国内税番の承認には、対象国・輸出入区分・HS版に一致する国内細分と税表版、適用日の一致する `tariff_schedule` 出典、必要属性の一致、別途の運用者レビューを要求します。税表の出典を持つカタログも運用者が確認するデータであり、コードの真正性や分類判断を税関に代わって保証するものではありません。

HTTPは既存のサーバー間認証・ブラウザー拒否・64KiB制限・`no-store` を使います。共有サービスキーは加盟店を識別する認証ではありません。入口の加盟店サーバーはログインと商品所有権を確認し、商品仕様を自身の台帳から取得してください。承認記録やカタログをHTTP本文へ渡すことはできません。

## カタログと承認記録

`VEYGRIT_CLASSIFICATION_CATALOG` が空なら同梱カタログを使います。指定時は検証済みの独自JSONを読み込みます。構造はSDKの `classificationCatalogSchema` と `ClassificationCatalogDocument` で定義しています。国内税番はHS6と先頭6桁が一致し、国・輸出入区分・税表版を明示します。品目表の条文や適用条件を確認して出典と属性条件を整備してください。

`VEYGRIT_CLASSIFICATION_APPROVALS` は保護された承認・取消イベントのJSON配列へのパスです。未設定なら承認なしとして動きます。設定されたファイルが欠落・破損している場合は再割当を確定しません。HTTPでは設定エラーとして扱い、ファイルの内容をエラーへ公開しません。

運用者は候補・根拠・現物の仕様を確認したうえで、`classificationApprovalInputSchema` に従うレビュー入力を用意します。必須項目は `id`、元の `request`、その `requestDigest`、採用する `ruleId`、`reviewedOn`、`reviewBy`、`validFrom`、`validThrough`、`reviewerRef`、`evidenceIds` です。

```sh
npm run classification:review -- approve /protected/review-input.json /protected/classification-reviews.json
npm run classification:review -- revoke /protected/revocation-input.json /protected/classification-reviews.json
```

取消入力は `id`、`approvalId`、`revokedOn`、`reviewerRef`、`evidenceIds`、`reason` を指定します。CLIは排他ロックと一時ファイルの置換で追記し、同一イベントの再試行は一度だけ記録します。競合する同一ID、他プロセスのロック、不正な履歴は拒否します。残存ロックは自動的に削除しません。

承認は加盟店・SKU・仕様版・商品指紋・国・輸出入区分・HS版・国内細分・税表版・カタログ全体のダイジェストに結び付きます。後続注文では承認された期間内の別の日付でも再利用できます。仕様変更・期限切れ・カタログ変更・取消・競合する承認は再確認へ戻します。

承認履歴はHTTPの割当要求ごとに読み直すため、取消は次の要求へ反映します。カタログはサーバー起動時に読み込むため、更新後に再起動してください。カタログが変わると以前の承認を再確認します。古い履歴は上書きせず保存します。

## 一括取込と既存の関税処理への接続

```sh
npm run classification:import -- examples/classification-products.csv examples/classification-context.json /tmp/classification-batch.json
npm run cli -- classification-propose examples/classification-propose.json 2026-11-18T12:00:00+09:00
npm run cli -- classification-batch /tmp/classification-batch.json 2026-11-18T12:00:00+09:00
```

CSVは `merchantId,sku,revision,description` を必須とし、JSONの `attributes` 列または `attribute.material` 等の属性列を使います。引用符・セル内改行・BOM・CRLFに対応します。重複SKU・複数加盟店・不正な列を拒否し、指定した出力ファイルを上書きしません。CSVの文字列を式として実行することはありません。

SDKの `applyClassificationAssignments(plan, input, catalog, events, data, now)` は、認証済み加盟店と注文の `veygrit.merchantId`、対象国、輸入日、商品ID、信頼できる商品仕様を照合します。`input` は `authenticatedMerchantId`、`context`、`bindings: [{itemId, product, productIdentifier?}]` です。Unicode SKUと既存の内部商品IDが異なる場合は、加盟店台帳の対応を `productIdentifier` に指定します。

有効な承認だけを `Item.hs6`・`classificationConfirmed`・申告明細の `tariffCode` へ反映します。取消・未対応・結合不足は確認フラグを解除し、既存コードとの衝突は保留します。出力の `shippingAuthorized` と `productionAuthorized` は常に `false` です。既存の許可・住所利用・税率・経路・見積もりの確認は続けて実施してください。

分類出典の再確認期限と適用終了は既存の[日次期限監視](DATA_UPDATES.md)にも含めます。承認履歴の個別期限は再割当時に確認します。追加商品群のデータ整備、画像・仕様書からの属性抽出、実ECへの商品台帳接続は、国・商品群ごとに検証を進める後続作業です。

## 分割作業の再開

`npm run classification:rollout -- --date 2026-11-18 --write` で全仕向地のJSON・Markdownと商品01〜97類の作業表を更新できます。`npm run cli -- classification-rollout 2026-11-18` は全件JSONを返します。照会リンクだけを持つ国は公式分類の確認待ちとして残し、候補がある国も商品全体を網羅したとは表示しません。
