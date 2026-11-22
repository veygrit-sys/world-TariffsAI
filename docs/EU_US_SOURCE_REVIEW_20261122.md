# EU・米国の根拠再確認と修正案

確認日：2026年11月22日（日本時間）。対象はIssue #8のEU一次資料4件、米国一次資料4件、`EU_TEMP_LOW_VALUE`。この記録は差分案の根拠で、運用上の承認・本番適用・監視Issueの解消を意味しません。

## GitHubの照合基準

- main：`eb8ca68f67f5d74b960880e608eddad93d393ceb`、アプリrc.31、データ`2026-11-18.v11`。
- [Issue #8](https://github.com/veygrit-sys/world-TariffsAI/issues/8)：open、最終更新2026-11-22T06:58:17Z、コメントなし。監視は`upcoming`、8資料と1ルールの期限は11月25日。
- [PR #2](https://github.com/veygrit-sys/world-TariffsAI/pull/2)：merged。11月18日の再確認記録は`EU_SOURCE_REVIEW_20261118.md`と`US_SOURCE_REVIEW_20261118.md`に存在する。今回の確認開始時点でopenのPRはなかった。
- 過去記録と監視Issueだけでは11月22日の再確認完了とは判定せず、下記の一次資料を読み直した。全世界の追加措置、裁判・個別処分、運送会社の運用まで確認したとはしない。

## 対象8資料と現行ルール

全行の確認日は2026-11-22。元のURLと、閲覧に使った代替URLは機械可読の[確認台帳](EU_US_SOURCE_REVIEW_20261122.json)にも記録する。

| 出典ID | 閲覧した根拠・箇所 | 確認結果・現行との差 | 判断 |
| --- | --- | --- | --- |
| `primary-eu-law` | [規則2026/382官報PDF](https://eur-lex.europa.eu/eli/reg/2026/382/oj/eng/pdf)、第2～4条 | 本体価格合計150ユーロ以下、申告itemごと3ユーロ。2026-07-01以上・2028-07-01未満。法令自体の失効日と暫定措置の終了を混同しない。IOSSまたは改正後のpostal consignmentの定義と併読する | 金額・閾値・適用期間を維持 |
| `primary-eu-guidance` | [登録ニュース](https://taxation-customs.ec.europa.eu/news/guidance-and-legal-text-temporary-flat-fee-low-value-imports-which-will-apply-until-1-july-2028-2026-06-08_en)、[10月5日版公式ガイダンス](https://taxation-customs.ec.europa.eu/document/download/053e5b4e-f0be-4f20-9a23-3e3b659a6676_en?filename=Customs+Guidance+on+EUR+3+customs+duty.pdf) 3.1～3.2、5.2～5.4、6.3、8.2節 | ニュースには取扱手数料が提案段階という旧説明が残る。現行法とガイダンスを優先。計算単位は申告行で、物理的な個数でも荷物数でもない | living guidanceのURLを独立出典として追加 |
| `primary-eu-declaration-item` | [規則2026/1022官報PDF](https://eur-lex.europa.eu/eli/reg_del/2026/1022/oj/eng/pdf)、[訂正後統合本文](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?qid=1791612888734&uri=CELEX%3A02026R1022-20260701) 第1条(1)(a)・(b)、第2条、[訂正2026/90556](https://eur-lex.europa.eu/eli/reg_del/2026/1022/corrigendum/2026-07-03/oj/eng) | postal consignmentの新定義は運送者を郵便業者に限定せず、距離販売と特恵除外を含む。定義は7月1日適用。11月1日の境界はPIDデータ。官報の採択日June 30は訂正でApril 30になっており、税率変更ではない | 通常申告の7～10月の輸送方式による推定を修正 |
| `primary-eu-union-handling-fee` | [規則2026/2152](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=OJ%3AL_202602152) 第1・2条、[現行改革ページ](https://taxation-customs.ec.europa.eu/customs/eu-customs-reform_en)、[実施規則2026/2403官報PDF](https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=OJ%3AL_202602403) 第2条・附属書 | 11月1日から2ユーロ/item。F00は関税A00と別。対象距離販売では150ユーロ超も対象となり得る。3ユーロの暫定終了日を手数料の終了日にしない | 金額の自動加算はせず、既存の独立確認を維持 |
| `primary-us-de-minimis` | [大統領令14388](https://www.whitehouse.gov/presidential-actions/2026/02/continuing-the-suspension-of-duty-free-de-minimis-treatment-for-all-countries/) 第2・3・5節 | 2月24日00:01 EST適用。50 USC 1702(b)の対象外を含む範囲確認が必要。郵便の暫定税率は恒久税率ではなく、新郵便手続等の到来で終わる条件付き | 知識カードの適用開始を発出日2月20日から2月24日に訂正。暫定税率を計算に採用しない |
| `primary-us-nonpostal-suspension` | [91 FR 37789](https://www.govinfo.gov/content/pkg/FR-2026-06-24/html/2026-12670.htm) SUMMARY、DATES | 非郵便の800ドル以下の免税を独立したCBP権限で無期限停止、6月24日施行。正式・略式申告を照合する | 米国税額の保留を維持。非郵便手続データに施行済み原本を追加 |
| `primary-us-postal-suspension` | [91 FR 37801](https://www.govinfo.gov/content/pkg/FR-2026-06-24/html/2026-12669.htm) SUMMARY、DATES、19 CFR 145.12改正文 | 免税停止は6月24日、その他の新郵便手続は7月24日。2,500ドル以下でも無条件の略式申告ではない。AD/CVD、割当、規制品等を別途確認 | 800ドル免税や2,500ドル一律免税の計算は追加しない |
| `primary-us-postal-delayed-compliance` | [91 FR 66638](https://www.govinfo.gov/content/pkg/FR-2026-10-22/html/2026-21600.htm) DATES、背景I節 | 19 CFR 145.12(a)(2)(v)・(vi)の遵守期限だけを2027-01-20に延期。PGA、98/99章の税、98章・FTA免税主張の特定ケース。免税停止の取消や全面延期ではない | 過渡期間の知識カードを追加。1月20日以降へ自動外挿しない |

EUR-Lexの登録HTML URLはbot確認になる場合があった。本文を得られた官報PDFと公式統合本文を併用し、1022は訂正原本も確認した。検索抜粋だけを新しい税率の承認根拠にはしていない。統合版は読解補助で、官報原本が優先する。

## 追加照合と適用しない提案

- [91 FR 66707、2026-21570](https://www.govinfo.gov/content/pkg/FR-2026-10-22/html/2026-21570.htm)：10月22日施行のEntry Type 13試行変更。未完備の電子PGAデータを伴わない送信を暫定受理し、その受理終了は将来のFederal Register通知に委ねる。PGAの実体規制の免除や税率変更はこの通知から導けない、という判断で実装する。
- [91 FR 38007、2026-12668](https://www.govinfo.gov/content/pkg/FR-2026-06-24/html/2026-12668.htm)：Entry Type 13試行開始は9月22日。1月20日まで試行そのものが始まらない、とは扱わない。
- [91 FR 64532、2026-20650](https://www.govinfo.gov/content/pkg/FR-2026-10-08/html/2026-20650.htm)：10月8日のLow-Value ShipmentsはNPRM。12月7日は意見提出期限で、施行日ではない。既存の手続データの曖昧な出典名を訂正し、提案内容は計算・義務へ昇格させない。
- eCFRの現行表示も確認した。[19 CFR 10.151(b)](https://www.ecfr.gov/current/title-19/chapter-I/part-10/section-10.151)は非郵便の停止、[145.12](https://www.ecfr.gov/current/title-19/chapter-I/part-145/section-145.12)は郵便の正式・略式申告要件を収録している。表示上の収録基準日は11月19日で、11月22日までの無変更を保証するものではない。遵守日の延期は条文表示だけで判断せず、10月22日のFederal Register原本を併読する。
- [19 CFR 145.31(b)](https://www.ecfr.gov/current/title-19/chapter-I/part-145/section-145.31)でも国際郵便の免税停止を確認した（同じく収録基準日11月19日）。条文名の「800ドル以下」や旧免税を記した(a)項だけで判定しない。
- EUの登録ニュースだけでは手数料の現況を判断できない。10月5日ガイダンス自身も当時の予定を含むため、最終法令2152・2403と併読する。新たな税率変更や、1月20日以降の米国手続を確定する追加改正は、この照合では確認できていない。存在しないとは断定しない。

## コード・データ差分の理由

1. `src/engine.ts`：通常申告の分岐から11月前後と`transport === post`の推定を除く。7月1日以降すべて、既存の`flatDutyTreatmentConfirmed === true`を要する。通関担当者は距離販売、特恵除外、申告経路等の実体条件を確認してこのフラグを設定する。輸送業者名や国だけでは設定しない。IOSS登録・確認済み分類・申告行数の検査を維持する。
2. `data/knowledge.json`：EUの7月からの定義と11月PID境界、米国の免税停止と限定的な遵守期限を区別する。米国過渡期間カードは`validTo: 2027-01-20`を排他的境界にし、それ以降の扱いを回答根拠として自動延長しない。
3. `data/sources.json`：今回本文確認した10月5日版EUガイダンスとEntry Type 13試行変更を追加する。新規2資料だけ`checkedOn: 2026-11-22`、`reviewBy: 2026-11-25`。既存8資料の`checkedOn`・`reviewBy`、EUルールの金額・期間・期限は保持する。既存資料の今回の再閲覧日は本記録とJSON台帳に保存する。
4. `data/special-procedures.json`：米国非郵便の施行済み規則を参照し、NPRMを提案と表示。郵便の延期と試行変更の意味を追記。対象2記録の調査参照範囲は実際の再確認日11月22日までとする。
5. データ版を`2026-11-22.v12`へ変更し、マニフェストを再計算する。旧データ版に結び付いた運用者の実注文レビュー記録は新しい版で再確認が必要になる。
6. 保存済みrc.24精算承認の互換性テストは、入力のデータ版を当時の`2026-11-18.v11`に固定する。版に結び付いたハッシュの期待値を新しい版で再生成せず、既存のゴールデンファイルは保持する。現在版の切替で古い運用記録が無効になる検査も維持する。

これは適用条件を確認した修正案であり、新しい関税額や取扱手数料の徴収計算を追加する案ではない。既存の通常申告API利用者は7～10月の過去日照会でも明示的な適用確認が必要になる。

## 期限と保留事項

既存8資料および`EU_TEMP_LOW_VALUE`の運用上の再確認期限は**2026-11-25のまま**。新しい2資料も同じ期限までとし、監視は合計10資料・1ルールの予告になる。Issue #8を手動で閉じず、期限延長を承認したことにしない。

- 本番のEU通常申告では、特恵適用、実際の申告方式・行分けとPID各種の適格性は貨物単位で確認する。単一の`productIdentifier`がすべての法定PIDデータを満たすとは判定しない。
- UHF、VAT、追加措置・規制品・特殊地域と支払総額は保留のまま。米国でもHTSUS・原産地・追加税・PGA・申告者資格・運送会社受諾を個別確認する。
- 米国郵便の2027-01-20直前には、後続のFederal Register通知、試行の終了・変更、当局ガイダンスを再確認する。今回の11月25日という内部期限をそこまで飛ばさない。

## 回帰テストと検証

`tests/eu-us-review.test.ts`を公開CIの対象に追加する。

- 7月1日・10月31日・11月1日・11月22日の郵便/宅配で、適用確認なし・falseでは保留、trueでのみ定額試算。
- 150ユーロ一致/超過、申告行数と物品数量、PIDと取扱手数料の11月境界。
- 8資料の初回確認日・11月25日期限の保持、監視予告の継続。
- 11月25日23:59:59 JSTまでの試算と翌日00:00 JSTの停止。輸入日を戻しても回避不能。
- 合成の再確認済みフィクスチャで、EU暫定期間の終了と米国過渡期間の終了を、内部レビュー期限とは独立して検査する。合成の期限変更を実データへ適用しない。
- 米国の郵便/非郵便で799.99・800・800.01・2,500・2,500.01ドルでも税額を推測しない。郵便の延期出典と非郵便の出典を混同しない。
- 新規資料の確認日前・再確認期限後には知識回答の有効根拠にしない。

実施結果：`npm run check:public`成功。型検査、公開テスト1,078件（失敗0）、出典・データ整合性検査を完了。追加のEU・米国回帰テストは24件。11月22日の監視レポートは10出典・1ルールの`upcoming`で、11月26日は`due`かつ終了コード2になることを確認した。

公開テストは同梱の公開参照と合成データの検証であり、実申告・実請求・実配送の成功を示さない。非公開の税表パックを要する`test:full`は実行していない。
