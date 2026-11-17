# 米国の少額輸入制度の出典再確認

2026年11月18日（日本時間）に、少額免税の停止、郵便と非郵便の申告手続、特定の郵便貨物の遵守期限を登録済みの一次資料で再確認しました。4件とも本文を閲覧し、運用上の次回再確認期限を2026年11月25日に設定します。

## 確認した根拠

| 出典ID | 原本の日付・確認箇所 | 確認結果 | 次回再確認期限 |
| --- | --- | --- | --- |
| `primary-us-de-minimis` | 大統領令14388、2026年2月20日、第2節・第5節 | 少額免税停止の継続。50 U.S.C. 1702(b)の対象品を除く適用範囲と、2026年2月24日米東部標準時午前0時1分の適用時点を確認 | 2026-11-25 |
| `primary-us-nonpostal-suspension` | CBP Dec.26-12、91 FR 37789、2026年6月24日、要旨・施行日 | 非郵便で到着する800米ドル以下の貨物について無期限停止と正式・略式申告への移行を確認。施行日は6月24日 | 2026-11-25 |
| `primary-us-postal-suspension` | CBP Dec.26-13、91 FR 37801、2026年6月24日、要旨・DATES | 郵便の少額免税停止、新しいpostal informal entryを確認。免税停止の規定は6月24日、その他は7月24日に施行。原本の10月22日の遵守期限は下記の延期原本と併せて確認 | 2026-11-25 |
| `primary-us-postal-delayed-compliance` | 91 FR 66638、2026年10月22日、DATES・背景第I節 | 19 CFR 145.12(a)(2)(v)・(vi)の遵守期限を2027年1月20日へ延期。PGA所管、HTS第98・99章の税、同第98章・FTAの免税主張に該当する郵便貨物の手続を確認 | 2026-11-25 |

CBPの公開通知でも、少額免税停止の継続、郵便手続の更新、Entry Type 13の実施日延期を照合しました。`checkedOn` は既存版で記録した最初の確認日として扱い、今回の再確認日と対象は本記録に保存します。

## 実装上の扱い

- 米国向けは800米ドル以下という金額だけで免税を確定せず、品目番号、原産地、輸入日と申告方式を確認します。
- 郵便の特定申告要件の遵守期限と、少額免税停止の施行日を別々に確認します。
- 本エンジンは米国の関税額を自動計算せず、HTSUS、追加措置、通関・配送担当者の根拠へ照会を進めます。
- 登録4件の原本と上記の手続日付は確認済みです。個別取引の適用税率、追加措置の例外、当事者の適格性、運送会社の受諾は引き続き貨物単位の確認事項です。

## 公的参照先

- [White House、大統領令14388](https://www.whitehouse.gov/presidential-actions/2026/02/continuing-the-suspension-of-duty-free-de-minimis-treatment-for-all-countries/)
- [CBP、非郵便の少額免税停止、91 FR 37789](https://www.govinfo.gov/content/pkg/FR-2026-06-24/html/2026-12670.htm)
- [CBP、郵便の少額免税停止と新手続、91 FR 37801](https://www.govinfo.gov/content/pkg/FR-2026-06-24/html/2026-12669.htm)
- [CBP、郵便の遵守期限延期、91 FR 66638](https://www.govinfo.gov/content/pkg/FR-2026-10-22/html/2026-21600.htm)
- [CBP CSMS、少額免税停止継続の案内](https://content.govdelivery.com/accounts/USDHSCBP/bulletins/40b3d6e)
- [CBP CSMS、郵便手続の更新案内](https://content.govdelivery.com/accounts/USDHSCBP/bulletins/41fa7f0)
- [CBP、Entry Type 13の実施日延期案内](https://content.govdelivery.com/accounts/USDHSCBP/bulletins/42f29b6)
