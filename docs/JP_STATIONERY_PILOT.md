# 日本向け文房具のSKU確認と税表候補

2026年11月25日（日本時間）に日本税関の一覧と10月31日版の輸入税表第96類を照合しました。中国本土から日本本土への通常B2C輸入の試験用に、5つの9桁国内税番について、分類条件と基本・WTO欄の計10件の税率表記を用意しています。中国からの発送は品目分類、明細原産地、適用税率の個別確認と分けて扱います。[税関の版一覧](https://www.customs.go.jp/tariff/index.htm)・[確認した第96類](https://www.customs.go.jp/tariff/2026_10_31/data/j_96.htm)

| 商品範囲 | 照合する仕様 | 国内税番候補 | 合成SKU |
|---|---|---|---:|
| 筆記用マーカー | 浸透性のペン先、紙に筆記する単機能品 | 960820000 | 3 |
| 黒芯の鉛筆 | 木の硬いさやに固定した黒芯 | 960910010 | 2 |
| 黒以外の色鉛筆 | 木の硬いさやに固定した赤・青・緑芯。サンプルは赤・青 | 960910090 | 2 |
| 鉛筆の替芯 | 筆記具本体から独立した固形芯 | 960920000 | 2 |
| 手動日付印 | 書類に日付を押す手動式の単機能品 | 961100000 | 1 |

複合機能・異種品のセット、部品、対象外の材質・用途は個別に確認します。鉛筆の基本・WTO欄は親の9609.10に掲載されているため、2つの統計細分の `rateCode` に親の番号を保存しています。原表の括弧も保持しています。マーカーの他法令欄（WA）も確認対象に含めます。特恵、追加措置、税額の端数処理、手数料、輸入規制の確認は別工程です。

## 原本を照合して候補を準備する

プロジェクトルートで実行します。原本のハッシュが一致すると、既存の分類カタログに5件を追加したファイルと原本を新しいディレクトリに出力します。既存の独自カタログに追加する場合は、準備前に `VEYGRIT_CLASSIFICATION_CATALOG` にそのカタログを設定してください。カタログ変更時は既存のSKU承認も再確認が必要です。[承認記録の仕様](HS_CLASSIFICATION.md)

```sh
pilot_dir=$(mktemp -d)
curl --fail --location 'https://www.customs.go.jp/tariff/2026_10_31/data/j_96.htm' -o "$pilot_dir/j_96.htm"
node scripts/jp-stationery-intake.ts prepare "$pilot_dir/j_96.htm" "$pilot_dir/review"
npm run tariff:import -- examples/jp-stationery/tariff-source.json examples/jp-stationery/tariff-lines.json "$pilot_dir/rates"
export VEYGRIT_CLASSIFICATION_CATALOG="$pilot_dir/review/classification.json"
node scripts/jp-stationery-intake.ts intake examples/jp-stationery/skus.csv examples/jp-stationery/context.json
```

同梱のCSVは10件とも合成データです。11月25日のテストでは未承認候補が10件、確認済み割当が0件でした。税表の参照対象日は11月25日の1日、分類資料の運用上の再確認期限は12月2日です。後日サンプルを再現するには下記の固定日時を使います。実注文では輸入日の公式資料と現在の確認状況を照合します。

```sh
npm run classification:import -- examples/jp-stationery/skus.csv examples/jp-stationery/context.json "$pilot_dir/batch.json"
npm run build
npm run cli -- classification-route "$pilot_dir/batch.json" 2026-11-25T12:00:00+09:00
```

`rates` は未署名の候補、`review/evidence` は取得原本の保管場所です。実際の追加税表は適用日・対象品目と原本をレビューし、対象版を署名してから読み込みます。[税表の検証と切り替え](TARIFF_UPDATE_OPERATIONS.md)

## マーカーの見積もりを請求に照合する

統合テストは合成マーカーSKUを担当者レビューのテスト記録と結び、日本税関の3.9%のWTO欄を含む税表候補に一時的な試験鍵で署名します。単一申告明細、通常税率の選択、標準消費税、課税価格20,000円と確認済みの条件で、関税700円、国の消費税1,500円、地方消費税400円、合成の運送会社手数料550円を合わせて輸入時負担は3,150円です。独立して用意したテスト請求は一致し、手数料を575円とする場合は差額を検出します。合成承認と鍵はテスト内だけで使用します。[統合テスト](../tests/jp-stationery-pilot-cycle.test.ts)・[見積もり入力](../examples/pilot-quote-cn-jp-standard.json)

## 加盟店の仕様を取り込む

1. 加盟店・SKU・仕様版・商品説明をCSVに入力し、仕様書で確認した項目だけを `attribute.*` 列へ入れます。未確認の欄は空欄にします。[入力例](../examples/jp-stationery/skus.csv)
2. `intake` は不足項目ごとに日本語の質問と、商品説明内の対応する「用途」「構造」「芯色」「輸入時の構成」の欄を抜粋します。例として「芯色：黒色」が説明にあり、属性列が空なら、芯色を質問し、その記載を確認者に提示します。相反する複数の記載もそのまま提示します。CSV取込時の共通正規化を適用します。
3. 確認者が仕様書と抜粋を照合して属性列を更新し、再実行します。未承認候補を現物・分類根拠と照合した後、別の承認操作でSKU・仕様版に結び付けます。税関による個別の事前教示や実通関を示す記録は、加盟店や通関担当者が実際に取得した案件ごとに保存します。
4. 実証では候補提示前に確認者が選んだ国内税番を保存します。全受付件数、正解税番の候補提示件数、保留・対象外件数と確認時間を集計してください。同一色違い・サイズ違いを含む10件の合成テストの合格だけでは実商品の一致率を計算できません。

出典は財務省税関の実行関税率表です。該当する行のコード、単位、税率表記を抽出し、対象商品の例と選別条件を加えました。[税関ウェブサイトの利用規約](https://www.customs.go.jp/kyotsu/rules.htm)
