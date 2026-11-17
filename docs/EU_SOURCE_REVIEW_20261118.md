# EU暫定関税の出典再確認

2026年11月18日（日本時間）に、`EU_TEMP_LOW_VALUE` の適用範囲、申告明細による計算、商品識別情報を公的資料と照合しました。通常商品のB2C貨物に対する既存の部分試算について、次回の運用上の再確認期限を2026年11月25日に設定します。

## 根拠と確認結果

| 出典ID | 確認した資料・箇所 | 確認結果 | 次回再確認期限 |
| --- | --- | --- | --- |
| `primary-eu-law` | 規則2026/382第2条・第4条 | 2026年7月1日から2028年7月1日まで、本体価格合計150ユーロ以下の対象貨物にitemごと3ユーロを適用。IOSSと法令上のpostal consignmentの適用条件を確認 | 2026-11-25 |
| `primary-eu-guidance` | 欧州委員会の2026年7月20日更新記事と2026年10月5日版ガイダンス第4節・第5.2節 | 距離販売、標準VAT等の通関方式、申告明細行による計算を確認 | 2026-11-25 |
| `primary-eu-declaration-item` | 規則2026/1022の前文第4項・第6項、第2条第3項、欧州委員会ガイダンス第5.2節・第8.2節 | 同一品でも別行に申告すればそれぞれ課税。申告方式と商品識別情報の適用日を確認 | 2026-11-25 |
| `primary-eu-union-handling-fee` | 規則2026/2152第1条・第2条と欧州委員会の現行Customs Reformページ | 1itemごと2ユーロ、2026年11月1日適用と有効状態を法令本文で確認 | 2026-11-25 |

規則2026/382の原文では有効状態と第2条を閲覧しました。規則2026/1022の登録済み原文URLはbot確認画面となりましたが、EUR-Lexの公式検索本文と統合版の検索本文、および欧州委員会の10月5日版ガイダンスでitemの定義と11月1日の適用条件を照合しました。規則2026/2152は欧州委員会のCustoms ReformページからEUR-Lexへ進んで有効状態と第1条・第2条を閲覧しました。

`checkedOn` は既存版で記録した最初の確認日を表します。今回の再確認日は本記録で管理し、過去時点の再現では当初確認済みだった根拠を照会できます。`reviewBy` は運用上の再確認期限として管理します。規則に定める適用期間は `validFrom` と `validTo` に記録します。

## 実装への反映

- 貨物の本体価格合計で150ユーロ以下かを確認します。
- IOSSでは登録済みの条件を確認します。通常手続では、2026年11月以降に `flatDutyTreatmentConfirmed` を要します。11月より前の通常手続では郵便貨物に限定する実装です。
- 分類確認済みのHS6と、通関担当が確認した `euDeclaration.itemCount` を使います。最低限、異なるHS6の数を下回る申告明細数を保留します。
- 同じHS6でも申告行が分かれている場合は、それぞれを明細として数えます。明細内の物品数量は計算の乗数にしません。
- 2026年11月以降は商品識別情報を確認します。Union handling feeは `EU_HANDLING_FEE_REVIEW` で別途確認に回し、輸入VATや手数料を含む支払総額は保留します。

## 公的参照先

- [Council Regulation (EU) 2026/382](https://eur-lex.europa.eu/eli/reg/2026/382/oj/eng)
- [欧州委員会の暫定関税案内、2026年7月20日更新](https://taxation-customs.ec.europa.eu/news/guidance-and-legal-text-temporary-flat-fee-low-value-imports-which-will-apply-until-1-july-2028-2026-06-08_en)
- [Commission Delegated Regulation (EU) 2026/1022](https://eur-lex.europa.eu/eli/reg_del/2026/1022/oj/eng)
- [EUR-Lexの規則2026/1022統合版](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A02026R1022-20260701)
- [欧州委員会の関税・Union handling feeガイダンス、2026年10月5日版](https://taxation-customs.ec.europa.eu/document/download/053e5b4e-f0be-4f20-9a23-3e3b659a6676_en?filename=Customs+Guidance+on+EUR+3+customs+duty.pdf)
- [欧州委員会の現行Customs Reformページ](https://taxation-customs.ec.europa.eu/customs/eu-customs-reform_en)
- [登録済みのUnion handling fee法令原文](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=OJ%3AL_202602152)
