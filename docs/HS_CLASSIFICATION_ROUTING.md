# HS分類の自動振り分け

rc.31の自動振り分けは、商品を確認済み割当・単一候補・属性不足・複数候補・再確認・未対応の6キューへ分けます。キューごとのSKU、件数、HSコード別グループ、商品ごとの理由と追加質問を返すため、同じバッチから次に処理する商品を選べます。

検索に使う属性は、加盟店の商品台帳や仕様書で確認した値を渡します。商品説明から材質・組成・加工状態を推測して埋める処理はありません。国内税番の自動確定には、従来どおり対象商品と条件が一致する有効な運用者承認が必要です。

## 振り分けの状態

| `status` | 判定と返す情報 | 次の作業 |
| --- | --- | --- |
| `assigned` | 有効な保護された承認を再利用し、`assignment`に確認済みコードを返す | 既存の通関計画への結合条件を照合する |
| `candidate_selected` | 全適合候補を調べ、唯一のコード候補に必要な属性がそろう場合に`selectedCandidate`を事前選択。未確認のまま返す | 出典・実物・国内細分を確認し、必要な承認手順へ進む |
| `needs_attributes` | 属性が足りない、又は属性充足候補のほかに別コードの未解決候補が残る | `questions`に答え、確認した属性で再実行する |
| `ambiguous` | 異なるコードの属性充足候補が複数ある | 出典と商品の境界を人が確認する |
| `review_required` | 該当する出典の期限・対象範囲、又は既存承認の取消・失効・仕様変更等の再確認が必要 | `decisionReasons`と`assignment`内の出典・承認情報を確認する |
| `unsupported` | 対象外の国・地域、又は指定した国・方向・版・商品に一致する参照がない | 公式分類資料と商品条件を整備する |

有効な承認の再利用を先に判定します。再確認が必要な出典や既存承認を無視して候補を事前選択しません。表示用の上位3候補だけで判断せず、内部では全適合候補を評価します。同じHS6でも、国内細分又は税表版が異なれば別のコード候補です。同じコードに複数の根拠ルールがある場合は、属性がそろった根拠ルールの有無を確認します。

用途・税関領域・歴史的統計に限定した参照も、その必須属性を要求します。条件が不一致なら候補から外し、未入力なら確認待ちにします。国別公表版や旧HS版をHS2022へ変換せず、`context.hsEdition`に実際の収録版を指定します。

## 入力

HTTPとCLIは、既存の一括処理と同じ`{ context, products }`を受け取ります。[実行できる入力例](../examples/classification-routing.json)は、米国向け真空ボトルの属性充足・属性不足と、未収録商品を分けた3SKUです。

| 項目 | 条件 |
| --- | --- |
| `context` | 国、輸出入方向、適用日、分類版をバッチ内で共有 |
| `products` | 1〜100商品。同一加盟店、重複しないSKU |
| `products[].attributes` | 確認した商品条件。商品あたり最大50属性 |
| 承認履歴 | サーバー側の保護された設定から読む。入力本文では受け付けない |

HTTPでは既存の64KiB本文制限も適用されます。100商品以内でも本文が上限を超える場合はバッチを分割してください。共有サービスキーは加盟店本人の認証を代替しません。入口の加盟店サーバーでログイン・商品所有権を確認し、自身の台帳から商品仕様を取得します。

## 実行

```sh
npm run build
npm run cli -- classification-route examples/classification-routing.json 2026-11-19T12:00:00+09:00
```

サーバーを起動し、サービスキーを設定した端末から実行します。

```sh
curl http://127.0.0.1:3008/v1/classification/route \
  -H "Authorization: Bearer ${VEYGRIT_CUSTOMS_API_KEY}" \
  -H "Content-Type: application/json" \
  --data-binary @examples/classification-routing.json
```

同梱カタログと承認履歴なしで、上の基準日時に実行した場合のキューは次のとおりです。

```json
{
  "assigned": [],
  "candidate_selected": ["routing-flask-complete"],
  "needs_attributes": ["routing-flask-missing-insulation"],
  "ambiguous": [],
  "review_required": [],
  "unsupported": ["routing-unlisted-wristwatch"]
}
```

これは応答の`queues`部分です。単一候補の真空ボトルは`selectedCandidate.hs6 = "961700"`となり、`assignment.hs6`と`assignment.nationalCode`は`null`、`classificationConfirmed`は`false`です。断熱構造が未入力の商品では、真空二重構造であるかの追加質問を返します。例の腕時計は同梱カタログに参照がないため`unsupported`となり、税率0%や輸入可能という意味は持ちません。

CLIの基準日時を省略すると実行時の日時を使います。カタログ出典の再確認期限を過ぎると結果が変わるため、例の結果を再現するときは日時を指定してください。例の日付は資料や承認の効力期間を延長しません。

## 応答の読み方

| 項目 | 内容 |
| --- | --- |
| `counts` / `queues` | 6状態ごとの件数とSKU一覧。全商品はいずれか1キューに入る |
| `groups` | `assigned`又は`candidate_selected`になった商品のHS6・国内コード・税表版・状態ごとのグループ。確認済みと未確認を分離する |
| `results` | 入力順の商品別判定。SKU、選択候補、従来の割当結果、理由を保持 |
| `results[].matchingIdentityCount` | 表示件数によらない、全適合候補の異なるコード候補数 |
| `results[].completeIdentityCount` | 必須属性がそろうコード候補数 |
| `results[].selectedCandidate` | `candidate_selected`の場合だけ事前選択した未確認候補。それ以外は`null` |
| `results[].assignment` | 従来の照会・承認照合結果。確定コードは有効な承認がある場合だけ入る |
| `results[].questions` | `needs_attributes`の場合に、表示候補の外も含めて不足条件を集約。最大50属性、各属性の表示用ルールIDは最大3件 |
| `results[].questionsTruncated` | 不足属性の質問が50件を超えて応答に収まらなかった場合に`true`。回答を反映して再実行する |
| `results[].decisionReasons` | 振り分け理由のコード |

`groups`は最初に現れたグループの順序、各グループのSKUと`results`は入力順を維持します。`assigned`の確認済みグループと`candidate_selected`の未確認グループを、同じHS6という理由だけで結合しません。振り分けには商品別の`status`を使い、従来の照会結果を保つ`assignment.status`と区別してください。

`classificationConfirmed`が`true`になるのは、有効な承認を再利用した商品だけです。バッチ全体では全商品が`assigned`の場合だけ`true`になります。`shippingAuthorized`と`productionAuthorized`は常に`false`です。返すキューは今回の応答内のSKU一覧で、API自体は加盟店の商品DBや作業キューDBを書き換えません。

## SDK・CSV・既存の通関計画

```ts
import {
  loadDataset, loadClassificationCatalog, loadClassificationEvents,
  routeClassificationBatch,
} from "@veygrit/customs-ai";

const data = loadDataset();
const now = new Date("2026-11-19T12:00:00+09:00");
const catalog = loadClassificationCatalog(process.env, data);
const events = loadClassificationEvents(process.env, now);
const routed = routeClassificationBatch(input, catalog, events, data, now);
```

単一商品には`routeClassification({ product, context }, catalog, events, data, now)`を使います。SDKの入力型と応答スキーマを公開しているため、加盟店側で結果を検証・保存できます。

CSVは既存の検証付きインポートから振り分けへつなげられます。

```sh
npm run classification:import -- examples/classification-products.csv examples/classification-context.json /tmp/classification-batch.json
npm run cli -- classification-route /tmp/classification-batch.json 2026-11-19T12:00:00+09:00
```

`candidate_selected`をそのまま申告明細や税率計算へ渡しません。運用者が国内細分と出典をレビューして承認した後に再実行し、`assigned`を確認します。既存の[`applyClassificationAssignments`](HS_CLASSIFICATION.md)は、有効な承認と注文への結合を確認してから通関計画へ反映します。HTTPでは承認履歴を要求ごとに読み直すため、取消は次の振り分けにも反映されます。

承認作成・再割当も全適合候補を照合します。表示用の上位3件から外れた属性充足ルールでも、運用者がその`ruleId`を明示してレビューできます。国内細分・税表版・商品条件・適用出典と記録された承認の要件は維持され、候補の事前選択だけで承認には進みません。
