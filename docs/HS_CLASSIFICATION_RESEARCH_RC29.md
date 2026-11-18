# rc.29 公式資料の調査記録

2026年11月18日JST確認。版、出典の用途、取得制限、見送り理由を保存します。以下は資料統合前の地域別記録で、出典ID・適用先の統合後の正本はdata/classification-catalog.jsonです。WTO変更添付は原典に実在する品目だけを扱い、国際HS版・国別公表版・協定附属書を現在の適用税表と区別します。

---

## americas

# 米州 HS6 参照候補の追加確認（2026-11-18）

20法域・60ルール・23資料・60商品ケースを `hs29-americas.json` と `hs29-americas-cases.json` に出力した。共有リポジトリは変更していない。採用法域は AG AI AW BB BM BQ BS CU CW DM GD GY HT KN LC MS PM SR SX TT。

これは20法域すべての現行税率表・申告受理・輸入許可を確認したものではない。HS2022は4法域（BM HT LC PM）、HS2017は12法域（AI BB BQ CU CW DM GY KN MS SR SX TT）、HS2012は3法域（AW BS GD）、HS2007は1法域（AG）。旧版をHS2022と表記していない。

12法域の政府・税関・議会公開表、5法域のWTO譲許品目表HS2017変更添付、3法域の政府による版採用明示と同版国際HS本文の組合せを含む。後二者を現行国内税表と取り違えないよう `referenceBasis`・資料terms・rule rationaleに区別を記録した。各日付は2026-11-18～2026-12-18の内部確認期間であり法令の効力期間ではない。

## 商品範囲

- コーヒー45候補（15法域×3）：粒状・他原料なしの豆のみ。焙煎済み未除去090121、焙煎済みカフェイン除去090122、未焙煎未除去090111。抽出物・代用品・混合品・粉末・殻を対象にしない。
- 柑橘15候補（BB KN SR TT CU ×3）：生鮮・丸ごと・単一種類に限定したオレンジ080510、マンダリン（タンジェリン・サツマを含む）080521、クレメンタイン080522。乾燥・冷凍・果汁・皮のみ・調製品・混合品を対象にしない。
- 国内桁、税率、優遇、法的効力、承認レコードは追加していない。すべて import のHS6候補である。

## 公式公開の国別本文

頁はPDF先頭を1頁とする。表に税率が含まれていても今回の成果物には同梱・判定していない。

| 法域 | 版・本文確認 | 公式URL・限定 |
|---|---|---|
| AG | HS2007。PDF5–6頁にFourth Edition 2007、103頁に090111/090121/090122と親項目。 | https://customs.gov.ag/resources/pdf/The_Customs_Duties_%28Amendment%29_Act_2011.pdf 。2011年法に添付の基礎参照。最新改正・国内細分・税率は未確認。 |
| AI | HS2017。PDF2頁に版、52頁に3コードと親項目。 | https://customs.gov.ai/wp-content/uploads/2020/01/Anguilla-HS2017-Tariff-Final.pdf 。税関が公開・案内する2019年表。最新改正は未確認。 |
| AW | HS2012（GS2012）。PDF34頁に3コードと親項目。 | https://asycuda.douane.aw/documents/Tarief%20van%20invoerrechten_versie%201%20augustus%202023%20%28GS%202012%29.pdf 。公式公開ページ https://asycuda.douane.aw/portal/content.jsf?c=tariff が2023年8月1日版をGS2012と明示。両sourceIdsを要求。 |
| BM | HS2022。2026年First Schedule PDF44頁に3コードと親項目。 | https://www.gov.bm/files/media-library/20260413/e1311751-2026_customs_tariff_act_1970_first_schedule_final_2026.03.31v1r0.pdf 。政府の年次説明リーフレットではなくFirst Scheduleの本文。版根拠は議会公式Hansard https://parliament.bm/admin/uploads/hansards/bef22754b366d90b4bf47ac3cac654df.pdf の58–59頁（印刷223–224頁）：2022年改正でFirst ScheduleをHS2022へ置換する説明。両sourceIdsを要求。 |
| CW | HS2017。Versie 2017表PDF57頁に3コードと親項目。 | https://douane.cw/wp-content/uploads/2026/10/Tarief-van-Invoerrechten-versie-2017.pdf 。税関掲載ページ https://douane.cw/tarief-van-invoerrechten/ から案内。政府条約記録013786にCuraçaoのHS2017改正適用日も明示され、両sourceIdsを要求。 |
| DM | HS2017。PDF1頁に版、84頁に3コードと親項目。 | https://customs.gov.dm/uploads/HS_2017_new_a8f4ed247b.pdf 。当該国の公式税関公開物に限定。CARICOM加盟のみの流用ではない。 |
| GD | HS2012。PDF2頁に版、53頁に3コードと親項目。 | https://grenadaparliament.gd/wp-content/uploads/2021/08/S.R.O.-13-of-2014-Caricom-Common-External-Tariff.pdf 。グレナダ議会のSRO 13/2014附属書。現行税表未確認。 |
| GY | HS2017。PDF1頁に版、75頁に3コードと親項目。 | https://www.gra.gov.gy/wp-content/uploads/2020/12/HS-2017-version.pdf 。案内元 https://www.gra.gov.gy/hs-2017-harmonized-system-hs/ 。添付する2018年命令の表紙は番号が空欄なので、公布済み・現行法令の確認根拠にせずGRA公開のHS2017品目記述参照に限定した。 |
| HT | HS2022。PDF1頁に版、56頁に3コードと親項目。 | https://www.douane.gouv.ht/wp-content/uploads/2025/01/Tarif-NDP-SH-2022.pdf 。税関公式NDP。585頁全文取得に成功し照合。 |
| LC | HS2022。PDF1頁が2025年SI151によるSchedule4のHS2022置換、96頁に3コードと親項目。 | https://exportsaintlucia.org/wp-content/uploads/2026/07/HS-2022-TARIFF.pdf 。公式輸出振興機関の案内 https://exportsaintlucia.org/harmonized-system-tariff-schedule/ 。2025年11月1日施行との文面を確認したが、今回の候補期間を法的効力期間にはしていない。 |
| MS | HS2017。PDF1頁に分類構造2017との明示、55頁に3コードと親項目。 | https://mcrs.gov.ms/wp-content/uploads/2022/08/Customs-2021-Tariff-Using-2017-HS-Code-SRO-27-of-2021.pdf 。当該地域の公式歳入関税庁公開物に限定。現行税表未確認。 |
| PM | HS2022。PDF1頁に版、47頁に3コードと親項目。 | https://www.douane975.fr/wp-content/uploads/2023/01/Annexe-deliberation-301-2022-tarif_douane-2022-.pdf 。当該地域税関の附属書。採用説明 https://www.douane975.fr/bibliotheque-textes/tarif-des-douanes-2022/ と法令一覧 https://www.douane975.fr/bibliotheque-textes/textes-tarif-des-douanes/ も確認。本土/EUの表を流用していない。 |

## 政府の個別適用・採用明示と国際本文を組み合わせた法域

すべて2 sourceIdsを要求し、`referenceBasis: national_edition_reference` を付与した。各地域の現在の国内細分・現行税率・申告受理を確認したという意味ではない。

| 法域 | 個別根拠 | 同版の商品本文 |
|---|---|---|
| BQ（Bonaire・Sint Eustatius・Saba） | オランダ政府条約記録 https://treatydatabase.overheid.nl/nl/Verdrag/Details/013786 が2014年6月27日の改正・2017年1月1日の発効と3島それぞれへの適用日を明記。 | 政府官報 https://zoek.officielebekendmakingen.nl/trb-2020-121.html の2018年1月1日統合HS2017附属書第9類。090111/090121/090122を親項目を含め照合。国際共通HS6の歴史的版参照。 |
| SX（Sint Maarten） | 同じ政府条約記録がSint Maartenを個別に列挙し2017年1月1日の適用日を明記。 | 同じ政府官報の条約附属書本文。オランダ・キュラソー等の国内関税表を流用していない。 |
| BS | 政府統計局2017年貿易年報 https://cdn.bahamas.gov.bs/tenant/tenantbnsi/documents/All%20Documents/AnnualForeignTradeReport2017forwebsite-20240607020714.pdf のPDF2頁がHS2012を2013年7月実施し2017年統計に使用したことを明示。 | WCO公式HS2012第9類 https://www.wcoomd.org/-/media/wco/public/global/pdf/topics/nomenclature/instruments-and-tools/hs-nomenclature-2012/hs-2012/0209_2012e.pdf?la=en のPDF1頁で3コードと親項目を確認。現在のバハマ採用版は未確認なのでHS2012の歴史的基礎参照に限定。 |

オランダ官報冒頭は2014年改正（2017年版）と2015年補完改正（2018年）による2018年1月1日統合文であると説明する。HS2022に読み替えていない。WCOは2018年補完改正をHS2017版の補完改正として案内する： https://www.wcoomd.org/en/topics/nomenclature/instrument-and-tools/hs_nomenclature_previous_editions/ 。

## WTO公式の国別HS2017譲許品目記述参照

5法域とも `referenceBasis: wto_bound_nomenclature`。現行適用税表・現在の国内採用版は未確認。認証されたHS2017変更添付を開き、PDF1頁の国名、PDF2頁のHS2017/SA2017表記、柑橘親項目と080510/080521/080522を実際に照合した。文書の譲許税率やその他税は成果物に同梱せず、法的効力も判定しない。譲許表自体が一律に非拘束という主張はしていない。

| 法域 | 認証変更添付 | 確認した範囲 |
|---|---|---|
| BB | https://goods-schedules.wto.org/system/files/2021-04/1536-02.pdf | WT/Let/1536、Schedule XCIX Barbados、PDF2頁の柑橘3品目。 |
| KN | https://goods-schedules.wto.org/system/files/procedure/2023-07/1620-02-EN.pdf | WT/Let/1620、Schedule CXXVIII Saint Kitts and Nevis、PDF2頁の柑橘3品目。 |
| SR | https://goods-schedules.wto.org/system/files/procedure/2023-07/1621-02-EN.pdf | WT/Let/1621、Schedule LXXIV Suriname、PDF2頁の柑橘3品目。 |
| TT | https://goods-schedules.wto.org/system/files/procedure/2023-12/1642-02-EN.pdf | WT/Let/1642、Schedule LXVII Trinidad and Tobago、PDF2頁の柑橘3品目。 |
| CU | https://goods-schedules.wto.org/system/files/procedure/2023-02/1599-02-ES.pdf | WT/Let/1599、Lista IX Cuba、PDF2頁のSA2017柑橘3品目。 |

WTOのmemberページはそれぞれ `/member/barbados`, `/member/saint-kitts-and-nevis`, `/member/suriname`, `/member/trinidad-and-tobago`, `/member/cuba`。HS2017行の認証WT/Let番号を読み、`browse/{id}/file_browser` のHTMLから空アンカー `a.arrow` の公開PDF URLを抽出する。短い証明書`-01`ではなく品目添付`-02`を使った。web表示だけでは空アンカーが省略されるが、公式HTMLのhrefには公開URLがある。ドラフトRS文書も取得したが最終成果物は上記認証添付を参照する。

## 今回含めなかった担当法域

| 法域 | 現時点の確認と未収録理由 |
|---|---|
| KY | 政府Customs Tariff Act 2026 Revisionを取得したが、コーヒーは09010000の集約項目で3つのHS6を国別本文から直接確認できず、明示的なHS版も確証できなかった。 https://gov.ky/documents/35692/0/Customs%2BTariff%2BAct%2B%282026%2BRevision%29%2C.pdf/31bf00bb-42e2-e2b6-b4f3-8783076bfcc1?t=1770147513057 |
| TC | 公式関税検索・案内は存在するが、版付きの国別HS6本文を固定できていない。 https://www.revenue.gov.tc/trade/portal/imports 、旧公式サイト https://customs.gov.tc/acv は2011年表などを案内しており追加調査候補。 |
| VE | WTO memberページにHS2017/2022認証済み行がなく、HS96変更はongoing。UR1994をHS2017/2022として使わなかった。SENIAT最新表の版付き本文の検証が残る。 |
| VG | 太陽光機器等の改正項目を示す資料はあるが、その表全体のHS版と商品の親項目を揃えて確認できていない。 |
| GL | 公式統計はEU Combined Nomenclatureを使用すると明示するが、今回の確認では特定HS版の明示まで固定できていない。 https://stat.gl/publ/da/IE/202605/metoder/Metode%20og%20kilder.htm 。一般的なCN採用から版を推定せず未収録。 |
| FK | 公式2025/26 duty and charges資料は主に税率・4桁商品コードで、版付きHS6本文になっていない。 https://www.gov.fk/customs/wp-content/uploads/sites/8/2025/10/CI_Duty_and_Charges_FY_2025-26.pdf 。英国との関係のみで英国税表を流用しない。 |
| BL BV GS VI | 当該地域を個別に列挙した特定版の採用根拠とHS6商品の本文の両方が今回の調査では未固定。宗主国や関連国の国内表を根拠なく流用しない。追加調査対象であり、HS分類が存在しないと判断したものではない。 |

バハマについて2023年公式関税表 https://www.bahamascustoms.gov.bs/wp-content/uploads/2023/06/2023-Tariff-Schedule.pdf も940頁取得しコーヒーの3HS6本文を確認したが、表内にHS版の明示を見つけられないため、この資料をHS2012/2017/2022と断定して成果物に追加しなかった。

## 検証

既存カタログと追加分をメモリ上で結合し、実際の `ClassificationCatalog` と `proposeClassification` を実行してPASS。60ルールについて正例、全必須属性の個別欠落、全条件属性の矛盾、追加の矛盾ケース、国・方向・版・期限の不一致を検証した（960検証グループ）。各sourceIdsの国・版の一致、nationalCode=null、eligibleForApproval=false、classificationConfirmed=falseも確認。結果は `hs29-americas-validation.json`。共有repoを編集したり既存テストファイルへケースを追加したりせず、統合は親担当に委ねる。

---

## africa-west

# HS29 アフリカ西・中・北：追加分類参照

確認日 2026-11-18。割当メッセージの国コード列は15件で、14か国を採用、EHを見送った。12 sources / 42 rules / 42 fixtures。すべて輸入、6桁候補のみ。国内細分、税率、特恵、輸入許可、申告承認は含めない。

- `hs29-africa-west.json`: sources / rules の断片。共有リポジトリは編集していない。
- `hs29-africa-west-cases.json`: 各例に hsEdition を持つ正例・反例。
- `hs29-africa-west-verify.mjs`: 実際の ClassificationCatalog / proposeClassification による検証スクリプト。

内部確認期間は checkedOn/effectiveFrom = 2026-11-18、reviewBy/effectiveThrough = 2026-12-18。この日付は資料の法的有効期間を表さない。

## 採用範囲

|国|参照版識別子|例|当該国への根拠|
|---|---|---|---|
|CF、CG、CM、GA、GQ、TD|HS2007|090111、090121、090122|公式CEMAC2009表の表紙が6国を列挙し、導入で6国共通輸入分類とHS2007を明示|
|AO|HS2022|090111、090121、090122|2024年官報1/24がHS2022対応を明示、同官報本文のコーヒー3区分|
|LY|HS2022|090111、090121、090122|税関公式PDF表紙が2022年HS改正対応を明示、本文のコーヒー3区分|
|GM|HS2022|090111、090121、090122|GRAがHS2022採用を直接説明、WCOの具体的HS2022第9章と併用|
|MR|MR-TARIFF-2021|090111、090121、090122|モーリタニア税関が2021年税表として公開する実際の国内本文。国際HS版は確定しない|
|GH|HS2017|080510、080521、080522|当該国のWTO認証済みHS2017譲許表改正添付に実在する柑橘3区分|
|SL|HS2017|080510、080521、080522|当該国のWTO認証済みHS2017譲許表改正添付に実在する柑橘3区分|
|DZ|HS2017|080390、080430、081050|2017年財政法の実在する生鮮果実、税関のHS2017採用説明、WCO公式HS2017親項目を併用|
|ST|ST-TARIFF-2023|090111、090121、090122|税関ポータルが公開する2023年11月30日官報No60の第9章。国際HS版へ読み替えない|

コーヒーは、他原料を加えていない粒状豆だけに限定し、未焙煎/焙煎・カフェイン未除去/除去の属性を必須化した。果実は単一種類・他原料なし・丸ごと・生鮮の属性を必須化し、バナナはプランテン以外の品種に限定した。

## CEMAC6：HS2007の歴史的基礎分類

公式URL: https://douanes.ga/med/pdf/tarif-des-douanes-de-la-cemac-version-originale-pdf-210608020644.pdf

- ローカル原本: `hs29-cemac2009.pdf`、551頁。
- PDF第1頁（index0）: 対象6国を列挙。
- PDF第2頁（index1）: Janvier 2009。
- PDF第9頁（index8、本文p8）: 共通税表の制定・採用根拠と、6国共通の輸入分類がHS2007に基づく旨を明記。この本文を使っており、現在の地域加盟から流用していない。
- PDF第102頁（index101、本文p101）: 09.01の親項目、未焙煎・非脱カフェインの0901.11下位区分。
- PDF第104頁（index103、本文p103）: 0901.21/0901.22と焙煎・脱カフェイン区分。
- 最新のCEMAC共通表、HS2017以降への更新、各国例外・後続改正は確認していない。**2026年適用税表としては使用しない**。2009年公式基礎分類の履歴参照として収録する。
- Gabonの現在の共通表説明 https://www.douanes.ga/medias/documents/15/ は補足確認したが、ここからHS版や税率を推定していない。
- SHA256: `eb8bf1347f35a4b2fe524eb76e5f6616c237acee0e04c361ce615db250d9cade`

## Angola：HS2022

公式URL: https://www.ucm.minfin.gov.ao/cs/groups/public/documents/document/aw4z/nzcw/~edisp/minfin3770211.pdf

- ローカル原本: `hs29-ao2024.pdf`、345頁、画像PDF。
- PDF第1頁（index0）: 2024-01-03官報I Série No2、大統領立法令1/24の概要にHS2022対応と旧令10/19の廃止を明記。年号だけからHS版を推定していない。
- PDF第92頁（index91、官報p196）を画像で確認: 09.01親項目、未焙煎/焙煎の親区分、0901.11.00、0901.21.00、0901.22.00の状態を照合。
- 検証画像: `hs29-ao-p0.png`、`hs29-ao-p91.png`。
- 2024年の制定表として参照する。現在税率や後続改正は未確認。
- SHA256: `cc432fc213790c7d1d8d0a5134d366d6b2dec0157bd661c54fdbea125961b470`

## Libya：HS2022

公式URL: https://customs.gov.ly/wp-content/uploads/2023/12/%D8%A7%D9%84%D8%AA%D8%B9%D8%B1%D9%8A%D9%81%D8%A9-%D8%A7%D9%84%D8%AC%D9%85%D8%B1%D9%83%D9%8A%D8%A9-%D9%84%D8%B3%D9%86%D8%A9-2022.pdf

- 税関の公開元 https://customs.gov.ly/legislation/tariff は2022年表をPDF/XLSで掲示。
- ローカル原本 `hs29-ly2022.pdf`、586頁。
- PDF表紙は2022年HS改正に沿った表であるとアラビア語で明記し、英語側にもTARIFF2022を表示。
- PDF第55頁（index54）: 09.01の親項目、未焙煎/焙煎、非脱カフェイン/脱カフェインの親子関係、090111.00/090121.00/090122.00を画像とテキストで照合。
- 公開元ページの旧い利用説明にはHS2007が残るが、このPDF本文の2022年改正対応を根拠としてHS2022を採用。サイト共通の古い説明を版識別に流用しない。
- 検証画像 `hs29-ly-p0.png` / `hs29-ly-p54.png`。
- SHA256: `84aa615b2ef8a6a4c84d46f824f40d1010e2eafd5bac0f7fc82f8cc4c51d141c`

## Gambia：国内採用説明＋国際HS2022本文

採用根拠: https://www.gra.gm/custom-faqs

- GRAのCOMPUTATION OF CUSTOMS DUTY & TAXES → Tariff and Classification節。
- 2017年のECOWAS CET実施に加え、現在の品目を2022 HS Nomenclature ECOWAS CETに掲載すると直接説明。
- WCOの実施一覧から推測したものではない。

具体品目本文: https://www.wcoomd.org/-/media/wco/public/global/pdf/topics/nomenclature/instruments-and-tools/hs-nomenclature-2022/2022/0209_2022e.pdf?la=en

- 第1頁に09.01の親項目、0901.11、0901.21、0901.22と焙煎・脱カフェイン状態を明記。
- GMルールは必ず上記2つのsourceIdsを持つ。
- 国際共通HS6だけを参照する。UEMOA表・他国国内表をGMへ流用していない。GM国内細分・現在税率は未確認。

## Mauritania：国別公表版MR-TARIFF-2021

公開元: https://www.douanes.mr/view/1x617NY/PWvbrqErOMa

本文: https://www.douanes.mr/uploads/pics/tarif_fr_2021.pdf

- 公開元が2021年税表と明記し、フランス語原本へのリンクを掲示。
- 原本 `hs29-mr2021.pdf`、396頁。本文p38–39（PDFindex37–38）で親項目・0901.11下位区分・0901.21下位区分・0901.22下位区分を確認。
- 元となる国際HS版は本文の年だけで確定できないため、**MR-TARIFF-2021** として独立させる。HS2017/HS2022への変換を行わない。
- source.referenceBasis = national_edition_reference。
- 最新の国内税表・後続改正・現在税率は未確認。
- SHA256: `3585fbe23bf6b7be3c4e9eb963fdb31bf0336b059bf0019e4b471f178829c182`
- 補助的にWTOのHS2017認証済み改正添付も取得したが、この国内表の国際HS版をWTO年号から決めていない。WTO添付は今回収録していない。

## Ghana / Sierra Leone：WTO認証済みHS2017譲許分類

### Ghana

- 国別一次公開元 https://goods-schedules.wto.org/member/ghana はSchedule CXI、HS2017、認証WT/Let/1543を表示。
- 資料セット https://goods-schedules.wto.org/browse/43390/file_browser
- 公開ZIP https://goods-schedules.wto.org/download_all/43390
- 実際に取得した添付 `hs29-wto-gh/1543-02-en.pdf`、9頁。
- PDF第2頁（本文p4）にHS2017の欄見出し、08.05親項目、0805.10.00/0805.21.00/0805.22.00と各果実名が実在。
- 添付SHA256 `22e8d4be6f9e8f8839e1607b9cc2083fefa8074299b189624a0abb3560003b15`

### Sierra Leone

- 国別一次公開元 https://goods-schedules.wto.org/member/sierra-leone はSchedule CXX、HS2017、認証WT/Let/1485を表示。
- 資料セット https://goods-schedules.wto.org/browse/43325/file_browser
- 公開ZIP https://goods-schedules.wto.org/download_all/43325
- 実際に取得した添付 `hs29-wto-sl/1485-02-en.pdf`、95頁。
- PDF第2頁（本文p4）にHS2017の欄見出し、08.05親項目、0805.10.00/0805.21.00/0805.22.00と各果実名が実在。
- 添付SHA256 `9fed4316b89134006980e3eb8b31e7a6980b6fd5cc3cd173b2c8b8b1891d7879`

両国とも source.referenceBasis = wto_bound_nomenclature。国の認証済み譲許表の法的効力を一律否定していない。アプリのHS6候補参照と現在の適用税表を区別し、適用税率や現在の国内表としては使わない。

これらの添付はHS2017への**改正差分**であり、コーヒーは掲載されていない。掲載されていない0901を推定せず、添付に実在する柑橘3例だけを採用。WTO CTSダウンロードはログイン/連絡先要求を観測したため、送信・迂回は行わず、一般公開のGoods Schedules ZIPを使用した。

GHの現行検索APIは0901に対してNo posts foundを返した。SLの現行NRA資料索引はタイムアウトしたため、現行国内表が取得できたと扱わない。

## Algeria：公式2017採用説明＋実在品目＋国際親項目

- 2017年財政法の公式官報 https://www.joradp.dz/FTP/jo-francais/2016/F2016077.pdf
- 原本 `hs29-dz2017.pdf`、64頁。2016-12-29官報No77、2017年財政法を掲載。
- PDF第17頁（本文p17）に生鮮バナナ0803.90.10.00、生鮮パイナップル0804.30.10.00、キウイ0810.50.00.00を確認。6桁だけを参照する。
- 税関のHS2017採用説明 https://douane.gov.dz/IMG/pdf/note_no_2262_du_15.11.2016_-amendement_sh_2017.pdf
- このPDFは直接取得503だが、公式URLの検索索引本文を取得し、2016-11-15付2262号がHS2017改正を国内税表に組み込み2017-01-01に適用する旨を確認。
- 親項目の補助照合 https://www.wcoomd.org/-/media/wco/public/global/pdf/topics/nomenclature/instruments-and-tools/hs-nomenclature-2017/2017/0208_2017e.pdf?la=en
- WCO本文第2頁に08.03/080390（プランテン以外）、08.04/080430、第3頁に08.10/081050を確認。国別採用をWCO実施一覧から推定していない。
- 3つのsourceIdsを必須として収録。2017年の歴史的分類参照であり、現在の適用税表・税率は未確認。
- 官報SHA256 `178a05e48c16a6ae4ade03321d441b51e746fc0c0a7c79f2a6f1715ce95f7b3a`

## São Tomé and Príncipe：国別公表版ST-TARIFF-2023

- 税関運営ポータルである旨の一次説明 https://guce.gov.st/quem-somos/
- 公式章別公開元 https://guce.gov.st/pauta-aduaneira/
- 第9章リンクから取得 https://guce.gov.st/wp-content/uploads/2023/12/Cap9.pdf
- 原本 `hs29-st-cap9.pdf`、3頁。2023-11-30官報No60と本文に明記。
- PDF第2頁に09.01親項目、焙煎/未焙煎、脱カフェインの状態と0901.11.00.00/0901.21.00.00/0901.22.00を直接確認。
- 非公式転載は法令14/2023とHS2022対応を示すが、公式の表紙・当該採用条文を取得できていないため、その転載を採用根拠としていない。
- **ST-TARIFF-2023** という国内公表版の識別子だけを使用し、HS2022等に変換しない。source.referenceBasis = national_edition_reference。
- SHA256 `e7f74bc219b5844cc1224a212ce671697d1ea40e22e4f64dc66e9956acb2324c`
- 同ポータルの一部商品案内はカカオと010121（馬）の誤対応があるため、商品案内の対応関係は参照せず、官報本文だけを使用した。

## 見送り

EH：地域全体に適用する具体品目本文・公表版の一次根拠を特定できなかった。モロッコの税表を地域全体へ自動的に流用せず、今回のsources/rules/casesには含めていない。

## 検証

`node （作業用ファイル）`

結果: `countries=14, rules=42, sources=12, checks=1053`。カタログのschema/参照整合、全42例の候補と期待6桁、全必須属性の個別欠落時の質問、矛盾属性による除外、別版と輸出方向での候補除外、国内細分/税表版なし、承認不可、classificationConfirmed=falseを検証済み。

---

## africa-east

# hs29 Africa East — reviewed reference fragments

Fixed output: 11 destinations, 31 HS6 reference candidates, 15 official sources. International edition HS2022: CD, DJ, ER, ET, MZ, YE, ZM (20 candidates). Separate published editions: KM-TARIFF-2022, SO-TARIFF-2022, SD-TARIFF-2017 and SS-EAC-TFTA-2026 (11 candidates). TF is deferred.

All source checkedOn/effectiveFrom 2026-11-18 and reviewBy/effectiveThrough 2026-12-18 denote an internal review interval. No rate, national code, tariffEdition, approval, clearance, delivery permission or treaty-origin qualification is supplied. Edition-specific fixtures contain positive, incomplete and conflicting-product cases. Every declared edition is matched literally.

## Shared international coffee hierarchy

WCO HS2022 Chapter 9, PDF page 1, distinguishes unroasted/non-decaf 090111, roasted/non-decaf 090121, roasted/decaf 090122. Used only alongside each country's actual table and direct edition support for ET/MZ, because their flattened item tables omit intermediate roasting labels.

https://www.wcoomd.org/-/media/wco/public/global/pdf/topics/nomenclature/instruments-and-tools/hs-nomenclature-2022/2022/0209_2022e.pdf?la=en

## MZ — Mozambique — HS2022 — 3 coffee candidates

AT official 2026 workbook fetched as `hs29-mz-xlsx.xlsx`, SHA256 `5abc2f58d8277281e4c2e3deb35679d4791f2a93fb660f78ce07d38882b78336`. `Export Worksheet` Excel rows 571, 573, 574 contain 09011100, 09012100, 09012200. Those item numbers and coffee/non-decaf/decaf labels were read directly. WCO Chapter 9 supplies the roasting parents. Government MEF CFMP2024–2026 paragraph 77 (printed p31) explicitly reports the transition from SH2017 to SH2022; this is direct government edition evidence, rather than inference from a WCO implementation matrix.

- Workbook: https://www.at.gov.mz/api/webdav?path=%2FSERVI%C3%87OS%20ADUANEIROS%2FPAUTA%20ADUANEIRA%2FPAUTA%20ADUANEIRA%202026.xlsx
- Official entry: https://www.at.gov.mz/servicos/pauta-aduaneira
- MEF edition support: https://www.mef.gov.mz/index.php/todas-publicacoes/instrumentos-de-gestao-economica-e-social/cenario-fiscal-de-medio-prazo-cfmp/cfmp-2024-2026/1912-cfmp-2024-2026/file%3Fforce-download%3D1
- Current law8/2025 fetched for provenance, not used to infer edition: https://e-viajante.at.gov.mz/legislacao/lei_8_2025.pdf

## ET — Ethiopia — HS2022 — 3 coffee candidates

Government trade ministry publishes Federal Negarit Gazette No55, 14 July2025. Printed p18540 lists 09011100, 09012100, 09012200 (and 09011200). Its agreement annex is used as `agreement_nomenclature`; it is not a general current applied-rate claim. WCO Chapter 9 supplies intermediate roasting hierarchy. The Customs Commission's 29 December2021 notification, published by WCO, explicitly states HS2022 entry from 1 January2022; the official article links an image of the original government letter.

- Government annex: https://www.motri.gov.et/sites/default/files/announcement/3.%20Ethiopia%20TiG%20PSTC_compressed.pdf
- ECC notification article: https://www.wcoomd.org/en/media/newsroom/2022/january/ethiopia-notifies-implementation-of-hs-2022-amendments-from-1-january-2022.aspx
- Original notification image: https://www.wcoomd.org/-/media/wco/public/images/media/press-releases/january-2022/hs-2022-notification-by-ethiopia.png?la=en

## SO — Somalia — SO-TARIFF-2022 — 3 coffee candidates

Government published Somali Customs Tariff2022, May2022. Direct PDF read, printed/PDF page32: coffee parents unroasted/roasted and 09011100,09012100,09012200. Publication year does not establish international HS2022. Later Customs Strategic Plan2024–2027 plans a nomenclature update to HS2022, reinforcing the need to leave the international mapping unconfirmed. `national_edition_reference` is literal separate published-edition reference. It must not match an HS2022 request.

- Publication: https://mof.gov.so/publications/somali-customs-tariff-2022
- PDF: https://mof.gov.so/sites/default/files/Publications/Somali_Customs_Tariff_Final.pdf
- Later update plan: https://revenuedirectorate.gov.so/sites/default/files/pdf/Somali%20Customs%20Strategic%20Plan2024-2027.pdf
- Local evidence: `hs29-so.pdf`, extracted `hs29-so.txt`.

## KM — Comoros — KM-TARIFF-2022 — 3 narrow candidates

Official listing calls this `Tarif Douanier V2022`. Direct 19,935,684-byte PDF read; PDF pages77–78 (zero-based76–77) were also visually inspected. Its raw coffee parent and valid 0901.1121 etc establish unroasted/non-decaf 090111; 0902.4000 establishes fermented black tea otherwise packaged (our case strictly >3kg); 0903.0000 establishes maté (our case pure dried whole leaves).

The PDF actually prints inconsistent coffee 0901.1300/0901.2300 and repeated green-tea0902.3000. These are not OCR guesses: the page image confirms the printed errors. We do not correct or use those entries. Publication V2022 does not alone prove HS2022, and older-looking lines/typos prevent asserting an international edition from this domestic PDF. WCO implementation matrix alone was not used to override this. `national_edition_reference` is fixed to the actual published title.

- Official listing: https://douane.gov.km/douane-comorienne/reglementation/
- Working official www PDF URL: https://www.douane.gov.km/douane-comorienne/uploads/documents/ce748146196adca3605c0c01d291347a.pdf
- Local PDF: `hs29-km-www.pdf`; visually inspected `hs29-km-77.png`.

## SS — South Sudan — SS-EAC-TFTA-2026 — 2 decaf-coffee candidates

EAC Gazette Vol.AT1 No12, 22 May2026, Legal Notice EAC/138/2026: printed p2 expressly includes South Sudan among destination countries. Printed p25 contains unroasted decaf09011200 and roasted decaf09012200 with parent labels. The selected lines actually occur in this particular notice; no unlisted non-decaf line is borrowed from generic EAC CET. No international HS edition is asserted. Use `agreement_nomenclature` and separate literal public-annex edition SS-EAC-TFTA-2026. National applied tariff, treaty entry, originating-goods qualification and rates remain unverified.

https://www.eac.int/documents?controller=download&file=e4164a25-729c-4642-8f22-2c6ea656f463&name=EAC+Vol.+AT+1+NO.+12+MAY+2026.pdf.pdf&task=download.file

## SD — Sudan — SD-TARIFF-2017 — 3 coffee candidates, availability limitation

Official PDF indexed full text has cover `CUSTOMS AUTHORITY - SUDAN / JANUARY 2017`, and an ambiguous subsequent edition label. Chapter9 printed p35 contains 09011100,09012100,09012200 and unroasted/roasted parent hierarchy. The current official chapter9 HTML independently contains the same hierarchy/numbers. Direct PDF retrieval at review time returned HTTP 404; the published official PDF was read through the web index, so this availability limitation is explicit in terms. Do not assert that the undated current HTML has the same edition, or map the 2017 publication to an international HS edition. This is `national_edition_reference` for the named 2017 publication only.

- Published PDF: https://web.customs.gov.sd/wp-content/uploads/2013/01/At-Tryft-Arba-Kamlh.pdf
- Official PDF link remains on tariff landing: https://web.customs.gov.sd/التعريفة-الجمركية/
- Current chapter text, supplementary only: https://web.customs.gov.sd/التعريفة-الجمركية/القسم-الثاني/الفصل-التاسع/
- Web retrieval refs for parent review:  (cover),  (chapter9 lines3752–3773),  (current chapter).

## DJ / ZM / YE / CD — WTO submitted certified HS2022 changes — 3 product candidates each

Each attachment was downloaded directly from WTO Goods Schedules eLibrary and its actual text read with PyMuPDF (OCR also checked selected pages). These are HS2022 transposition **changes** attachments, not complete current national applied tariffs; coffee lines do not occur and are not invented. Each country's actual attachment contains fresh/chilled0704 parent → Brussels sprouts070420, fresh/chilled0709 parent → spinach070970, dried/not further prepared0712 parent → shiitake(Lentinus edodes)071234. Narrow cases cover fresh whole Brussels-sprout heads; fresh whole spinach leaves; dried whole shiitake, pure and not further prepared.

`wto_bound_nomenclature` distinguishes this source basis. WTO schedules may carry legal obligations; no blanket nonbinding characterization is made. We do not assert current national applied rates or domestic subdivisions.

| Country | WTO member / browser | Certified attachment | Actual PDF pages / printed pages for 070420,070970,071234 |
|---|---|---|---|
| DJ | /member/djibouti ; /browse/43593/file_browser | WT/Let/1793, https://goods-schedules.wto.org/system/files/procedure/2026-06/1793-02-FR.pdf | 4/6, 6/8, 7/9; dried parent on PDF6/printed8 |
| ZM | /member/zambia ; /browse/43604/file_browser | WT/Let/1802, https://goods-schedules.wto.org/system/files/procedure/2026-06/1802-02-EN.pdf | 4/6, 5/7, 6/8; dried parent on same PDF6 |
| YE | /member/yemen ; /browse/43608/file_browser | WT/Let/1807, https://goods-schedules.wto.org/system/files/procedure/2026-07/1807-02-EN.pdf | 4/6, 5/7, 7/9; dried parent on PDF6/printed8 |
| CD | /member/democratic-republic-of-the-congo ; /browse/43603/file_browser | WT/Let/1801, https://goods-schedules.wto.org/system/files/procedure/2026-06/1801-02-FR.pdf | 4/6, 5/7, 6/8; dried parent on same PDF6 |

Local PDFs `hs29-wto-{dj,zm,ye,cd}-0.pdf`; browser HTML files preserve the actual public attachment links. The certified PDF header itself explicitly labels SH2022 or HS2022. No EAC membership assumption is needed for CD.

## ER — Eritrea — HS2022 limited HFC sector — 2 pure-compound candidates

UNIDO official hosts UNEP/OzL.Pro/ExCom/96/34 (30 April2025). Paragraph1 and footnote2 identify the Government of Eritrea submission and 12 March2025 Ministry letter; paragraph6 and paragraph20 expressly report adoption of HS2022 tariff codes in the HFC/HCFC regulatory context. This is government-report-based UN primary reporting, not domestic statutory text. Restrict adoption support to HFCs; do not extend to coffee or all goods.

WCO HS2022 Chapter29 note1(a) limits the ordinary Chapter29 chemical case to separately chemically defined compounds. PDF page4 explicitly identifies **290342 difluoromethane(HFC-32)** and **290345 1,1,1,2-tetrafluoroethane(HFC-134a)** (the second subheading also includes HFC-134, but this rule narrows to HFC-134a). Required attributes include exact identity, pure compound, no mixture, no added substances, standalone bulk chemical and liquefied-gas form. Mixtures/solutions/preparations, refrigerants inside equipment and extinguisher charges do not match.

- Country reporting/adoption scope: https://downloads.unido.org/ot/38/46/38469382/3.%20Eritrea%20-%20HPMP%20Stage%20II%2C%20second%20tranche%20-%20project%20document.pdf
- Concrete WCO codes/notes: https://www.wcoomd.org/-/media/wco/public/global/pdf/topics/nomenclature/instruments-and-tools/hs-nomenclature-2022/2022/0629_2022e.pdf?la=en

Both sourceIds are mandatory on both rules. Terms/rationale explicitly preserve the domestic-law-original/current-rate limitation and do not decide permits, customs acceptance or delivery legality.

## Deferred TF — French Southern Territories

Official TAAF customs/baggage forms and mission documents were found, but no actual HS edition or product classification body specific to this territory was confirmed. Neither EU membership nor a France/Reunion relationship is used to copy EU tariff references. No TF rule is added.

Evidence examined: https://taaf.fr/content/uploads/2021/05/DECLARATION-DOUANES.pdf and https://taaf.fr/recrutement/preparer-sa-mission-dans-les-terres-australes-francaises/ .

## Validation

`node （作業用ファイル）` passed: 15 sources,31 rules,31 fixtures,11 destinations. Catalog schema validation, expected HS6, nationalCode=null, non-approval, wrong attributes, every missing required attribute, and literal mismatched-edition rejection were checked using the repository's actual ClassificationCatalog/proposeClassification. No shared repository file was edited.

---

## europe-mena

# rc29 欧州・中東・中央アジアの追加参照候補

16か国・地域、20出典、47候補、47商品ケース。追加先は AZ / BA / BH / FO / GE / GG / GI / IL / IM / JE / KW / LB / PS / QA / TR / XK。

すべて輸入向けの他原料を加えない粒状コーヒー豆に限定。通常は090111（未焙煎・非脱カフェイン）、090121（焙煎・非脱カフェイン）、090122（焙煎・脱カフェイン）の3例。QAのみ090111と090121の2例。国別表の掲載コードは根拠照合に用い、カタログへ取り込むのは先頭6桁だけ。税率、国内細分、tariffEdition、承認データは含まない。

checkedOn / effectiveFrom は2026-11-18、reviewBy / effectiveThrough は2026-12-18。これは内部確認期間であり法的有効期間ではない。

## 版を保持した国別資料

| 国・地域 | カタログの版 | 公式出典と確認位置 | 適用範囲・制限 |
|---|---|---|---|
| AZ | AZ-Decision500-2017 | [公式法令HTML](https://frameworks.e-qanun.az/37/f_37035.html)、閣議決定500号・2017-11-17、第9章の0901 11 / 21 / 22 | 約58MBの公式HTMLをHTTP Rangeで分割し該当章を実読。qovrulmamış / qovrulmuş と kofeinli / kofeinsiz の階層を確認。2017は国内決定の年。国際HS版、全改正の統合時点は未確認。 |
| BA | BA-InspectionList-v208 | [連邦検査局の統一商品リスト](https://fuzip.gov.ba/wp-content/uploads/2022/10/1512138700Jedinstvena_lista_roba_v208compressed.pdf)、PDF63頁、第9章 | nepržena / pržena と sa kofeinom / bez kofeina の区分。政府公開の検査分類表であり、現行税率表・検査義務の判断資料として扱わない。URLの2022やファイル名の数値からHS版を推測しない。 |
| BH | HS2022 | [情報省の官報3585号付録](https://www.mia.gov.bh/wp-content/uploads/2022/02/3585-sup.pdf)、2022-02-10、公報54頁、第9章 | 2022年決議19号と巻頭のHS2022基礎版明記、0901 11 / 21 / 22を公式検索本文で確認。直接取得は405/403。2022年基礎版の参照候補であり、その後の12桁移行や現行税率は未確認。 |
| FO | FO-TAKS-Nomenclature | [TAKS公式オンライン第9章](https://voruskra.taks.fo/en/Chapters/Details/09)、[公式第II部PDF](https://voruskra.taks.fo/PDFReports/Show?sectionNr=II)、Kap 09 Síða 19 | Rå / Brændt、Med koffeinindhold / Koffeinfri の区分。PDFの印刷日は18-11-2026。印刷日を法令の版年とはせず、国際HS版は未確認のまま。 |
| GE | HS2022 | [財務省令21号の法令本文](https://matsne.gov.ge/ka/document/view/6086072)、[公式付表](https://matsne.gov.ge/ka/document/download/6086072/0/1)、第1条・第9章 | 2024-01-26制定・施行。付表第1条がHS国際条約2022版を基礎とする11桁分類と明記。実体はDOCXで、公式Content-Typeはmsword。第9章の未焙煎/焙煎とカフェイン有/無を実読。 [税務当局の品目検索](https://www.rs.ge/CommodityCodes-en) の公開APIでも同じ掲載コード・英語名を確認。 |
| GI | GI-IntegratedTariff-2017 | [HM Customs公式第9章](https://www.hmcustoms.gov.gi/portal/services/tariff/print.jsf?c=09)、[Integrated Tariff Regulations 2017](https://gibraltarlaws.gov.gi/legislations/integrated-tariff-regulations-2017-2817/download) | ライブ関税表でコーヒーの階層・6桁を確認。2017は国内法令名でありHS2017ではない。官報の2026年改正履歴を確認したが、対EU協定による税率・手続の変更を推定しない。 |
| IL | IL-IMPORT-NOMENCLATURE | [政府公式品目CSV](https://data.gov.il/dataset/3de0e7f0-03e1-4665-b078-da6e87543ed7/resource/c96d99fe-fd3a-4e86-a767-4119dd8b723e/download/c96d99fe-fd3a-4e86-a767-4119dd8b723e.csv)、090110 / 090120親階層と090111 / 121 / 122行 | 実データの未焙煎/焙煎親階層・非脱カフェイン/脱カフェイン名称を照合。政府公開の国別輸入品目分類を年なしの独立識別子で保持。国際HS版との対応未確認。WCO実施一覧を国内の直接HS2022採用根拠とは扱わず、候補の出典から除去。先頭6桁のみ参照し、国内チェックディジット・細分を同梱せずPSへ転用しない。 |
| KW | KW-PAI-Tariff-2022 | [産業庁公式ワークブック](https://www.pai.gov.kw/documents/d/guest/tariffschedule)、シート「جدول التعرفة 2022」、行1550–1556 | ワークブックの表題はGCC統一関税表2022。英語・アラビア語の親階層と12桁コードの先頭6桁を確認。年だけからHS2022との同一性を断定せず国別公表版として保持。 |
| LB | LB-IntegratedTariff | [レバノン税関公式第9章](https://www.customs.gov.lb/Tariff/Tariff_Table.aspx?CH=9) | 公開ページの公式検索索引本文にある0901.11 / 12 / 21 / 22と親階層を確認。直接アクセスはタイムアウト。国際基礎版・最新統合日時・税率は未確認。 |
| PS | PS-PCBS-Local-2009 | [PCBS公式ローカル版PDF](https://www.pcbs.gov.ps/Portals/_PCBS/Class/Arabic/Economic/HarmonizedSystem-ar-en-class-doc.pdf)、表紙2009年3月、第9章。[原刊・序文を含む公式PDF](https://www.pcbs.gov.ps/Portals/_PCBS/Classifications/HS2007-2007-2008.pdf)では印刷128–129頁 | 原刊序文は国際HS2007とパレスチナ税関分類を基礎とする説明。改訂された国別ローカル版をHS2007そのものとみなさず、独立版を保持。英訳の090111・090121行は脱カフェイン条件が省略されるため、アラビア語の名称と090112・090122の脱カフェイン区分を併読。統計分類の参考であり現行関税表ではない。 |
| QA | QA-ImportStats-2025-2026 | [国家計画評議会の公式データセットAPI](https://www.data.gov.qa/api/explore/v2.1/catalog/datasets/qatar-imports-2025-2026)、[実データ照会](https://www.data.gov.qa/api/explore/v2.1/catalog/datasets/qatar-imports-2025-2026/records?select=harmonized_system_code%2Cdetails%2Cltfsyl&where=harmonized_system_code%3E%3D90100000000%20AND%20harmonized_system_code%3C90200000000&group_by=harmonized_system_code%2Cdetails%2Cltfsyl&limit=100) | 輸入統計のHS12商品名称。数値型のコードから落ちた先頭0を12桁に復元。090111の英語Unfrostedはアラビア語の未焙煎を優先。090122は英訳Caffeinatedとアラビア語の脱カフェインが食い違うので除外。関税表・HS2022への対応と推定しない。 |
| TR | TR-TGTC-2026 | [商務省公式2026 TGTC配布ZIP](https://ticaret.gov.tr/data/5dee4b8813b876e93804be6f/2026%20TGTC.zip)、内部09 fasıl 2025.xls、第1シート行9–14（ゼロ始まり） | kavrulmamış / kavrulmuş、Kafeini alınmamış / alınmış の区分を実読。2026の配布パッケージ名と内部ファイル名2025の差を保持。国際HS版・行別改訂時点は推定しない。 |
| XK | XK-TARIK-2026 | [Kosovo Customs公式TARIK PDF](https://dogana.rks-gov.net/sharedfolder/ProductFiles/2026_488f89e7-9610-4161-b671-3e11c747d458.pdf)、表紙・序文・PDF119頁 | 表紙version01.01.2026、序文はHSとEUCNの2025-01-01基準を説明。国際HS版は別に推定せず国別2026版を保持。0901 1100 / 2100 / 2200の親階層と名称を実読。 |

## 王室属領の正式な共通税表適用

政治的な所属だけで英国コードを流用していない。各政府の正式取決めがUK Customs Tariffを第三国との取引に適用し、改訂後の整合を維持する条項を持つ。

| 地域 | 正式な適用根拠 | 現行運用の補助資料 |
|---|---|---|
| GG | [Guernsey–UK取決め](https://assets.publishing.service.gov.uk/media/5bfbe6aaed915d11aa497a29/Guernsey-UK_Customs_Arrangement_final.pdf)、PDF4頁・第8項。定義はGuernsey、Alderney、Sarkを含む | [Guernsey議会P.2021/82](https://parliament.gg/parliamentary-business/assets/propositions/p2021-82)、第2.3節の共通外部税表。 |
| JE | [Jersey–UK取決め](https://assets.publishing.service.gov.uk/media/5bfbe69fed915d11965a192f/Jersey-UK_Customs_Arrangement_final.pdf)、PDF4頁・第8項 | [Jersey政府の現行分類案内](https://www.gov.je/Travel/InformationAdvice/ImportsExports/CustomsTradersAgents/Pages/Classifications.aspx)がUK Global Tariffへの分類照会を明記。 |
| IM | [Isle of Man–UK附属書](https://assets.publishing.service.gov.uk/media/5bfbe6b6e5274a0fb775cc9c/IoM-UK_Customs_Arrangement_final_PDF.pdf)、PDF4頁・第5項 | [Customs (Import Duty) Regulations 2019](https://legislation.gov.im/cms/images/LEGISLATION/SUBORDINATE/2019/2019-0152/2019-0152_12.pdf)。 |

コードと焙煎・脱カフェイン階層は[UK公式090111 API](https://www.trade-tariff.service.gov.uk/api/v2/commodities/0901110000)、[090121 API](https://www.trade-tariff.service.gov.uk/api/v2/commodities/0901210000)、[090122 API](https://www.trade-tariff.service.gov.uk/api/v2/commodities/0901220000)を参照。英国政府の[公表HS2022品目対応資料](https://assets.publishing.service.gov.uk/media/687e5e378adf4250705c96db/uk_india_ceta_annex3a_product_specific_rules_of_origin.pdf)はPDF3頁第10項でHS2022基礎版と明記、4頁に090121・090122の名称がある。原産地規則、協定の発効、優遇税率は転用しない。GB向け条件customs_territory=great_britainは移植せず、各地域のcountryコンテキストで限定する。

## 見送り

| 対象 | 理由 |
|---|---|
| IO | BIOTの輸入規制と英国との政治的関係だけでは、実際の6桁品目分類の採用根拠にならない。 |
| IQ | 公式法令の入口は確認したが、今回選ぶ商品のコードと状態区分を一次資料で照合できていない。 |
| SH | Saint Helena、Ascension、Tristanの制度差を跨ぐ適用範囲を確認できず、国コード全域へ単一税表を適用しない。 |
| SJ | Svalbardはノルウェーの通常関税領域とは別。ノルウェー表の自動転用をしない。 |
| SY | 民間再掲の現行表は見つかるが、今回必要な行と版を公式公表資料で照合できていない。 |
| VA | EU・イタリアとの地理的/政治的関係のみでは品目分類の正式採用を確認できない。 |

## 検証

`node --experimental-strip-types （作業用ファイル）` を共有リポジトリの実装に対して実行し、47ケース・1,175検証が成功。各ルールの正例、全必須属性の欠落、各条件属性の矛盾、fixtureの負例、輸出コンテキスト、版違い、確認期限外を照合。国内税番null、承認対象外、未確定を確認。

生成物は `hs29-europe-mena.json` と `hs29-europe-mena-cases.json`。共有リポジトリのファイルは変更していない。

IL監査修正：ILの国際版推定を撤回し、source/rule/fixtureをIL-IMPORT-NOMENCLATUREに統一。IL専用WCO出典を削除。修正後も47ケース・1,175検証に成功。

---

## asia-pacific

# Asia/Pacific HS6 reference expansion — main research

確認日: 2026-11-18。親agent指定の未対応地域から10国・13資料・29候補。太平洋分11国・16資料・33候補と統合して21国地域・29資料・62候補。

全件は輸入向けHS6参照候補。国内細分・tariffEdition・税率・輸入許可・申告承認は追加しない。確認日から2026-12-18までは内部の参照期間であり、法的な有効期間ではない。現行表、旧版の実表、WTO譲許表、協定附属表、独立国別版を混同しない。

## 10国の本文・版と限定範囲

| 国 | hsEdition | 商品・HS6 | 公式本文の位置・版の根拠 | 制限 |
|---|---|---|---|---|
| TL | HS2017 | 純コーヒー豆090111 / 090121 / 090122 | 税関のTL Tariff HS Codes 2017。PDF p.66に0901.11、p.74に0901.21とunground、p.82に0901.22とunground。第9類はp.65開始、Operative 1 October 2017の表示 | 2017年公表版の商品記述を使い、現行国際版・税率は推定しない |
| LA | HS2022 | 純コーヒー豆090111 / 090121 / 090122 | 商工省公式品目検索がAHTN2022を明示。公式full-tree JSONの0901階層、090111、090121、090122及びungroundの子項目を実取得・確認 | 先頭6桁に限定、Arabica/Robusta等の国内細分は未選択 |
| UZ | HS2022 | 焙煎コーヒー豆090121 / 090122 | LexUZ決議491（2023-09-22）。冒頭で2023-01-01からのHS2022採用を説明。付表の0901焙煎親項目と090121000/090122000を照合 | 植物検疫資料の商品記述だけを使い、検疫条件・資格・輸入許可を転用しない。未焙煎090111は当該箇所で未確認のため追加しない |
| KH | HS2022 | 純コーヒー豆090111 / 090121 / 090122 | カンボジア税関自身のWCO/WTO実施報告（2022-10-17）、スライド10（PDF p.10）で輸出入申告へのAHTN2022適用を明記。同版WCO第9章p.1の0901親項目と6桁本文を併用 | 他国の国内税則は流用せず国際共通6桁のみ。カンボジア国内細分・現在税率は未確認 |
| TM | TM-COMMODITY-NOMENCLATURE | 純コーヒー豆090111 / 090121 / 090122 | 公式税関nomenclature.pdfのPDF/印刷p.83。別の公式Customs Code第21条がHS基盤と通関・統計への利用を定める | PDFの国際HS版・刊行年は未確認。メタデータ作成年は法的刊行年に流用しない。年を創作しない独立ID。national_edition_reference |
| AF | HS2022 | 生鮮・冷蔵きのこ070952 / 070953 / 070954 | WTO認証WT/Let1808、国別HS2022改訂セット43609、添付1808-02-EN-en.pdf。PDF p.3（印刷p.5）の0709生鮮・冷蔵野菜からp.4（印刷p.6）のBoletus / Cantharellus / Lentinus edodesまで親子階層を確認 | wto_bound_nomenclature。改訂譲許表の商品記述だけ。現行国内適用表・適用税率の根拠にはしない |
| MV | HS2017 | 生鮮マンダリン080521 / クレメンタイン080522 / グレープフルーツ080540 | WTO認証WT/Let/1525、セット43364、1525-02-en.pdfのPDF p.2（印刷p.4）。HS2017欄名、0805生鮮又は乾燥の親項目と3コード | wto_bound_nomenclature。生鮮・丸ごと・無添加の単一果実に限定。現行国内適用表は未確認 |
| MN | HS2017 | 同上080521 / 080522 / 080540 | WTO認証WT/Let/1546、セット43393、1546-02-en.pdfのPDF p.2（印刷p.4） | 同上 |
| TJ | HS2017 | 同上080521 / 080522 / 080540 | WTO認証WT/Let/1549、セット43396、1549-02-en.pdfのPDF p.2（印刷p.4） | 同上 |
| IR | IR-TARIFF-2016-2017 | 天然はちみつ040900、無添加非発酵緑茶090210（直接包装3kg以下）/090220（3kg超） | EEC公式協定PDF、Annex1印刷p.106がイランの品目体系を2016–2017 Export & Import Regulation Actと特定。I.R. Iran Schedule印刷p.163に天然はちみつ、p.164に非発酵緑茶の2区分 | agreement_nomenclature。実際のイラン欄でありEAEU表の代用ではない。国際HS版は未確認で、日付からHS2017と推定しない。現在税率・協定発効・原産地資格は推定しない |

コーヒーは添加物のない粒状豆に限定。果皮・代用品・抽出物・混合調製品・粉末を含まない。きのこは単一種類の丸ごとの食用子実体で生鮮・冷蔵に限定し、乾燥、冷凍、調理品、混合品、菌糸体・培地を除く。柑橘は単一果実の生鮮・丸ごと・無添加だけで、果汁、冷凍、缶詰、調製品を含まない。

## 公式URL

- `tl-customs-hs2017-coffee`: [ティモール・レステ税関：HS2017作業関税表・第9章](https://customs.gov.tl/wp-content/uploads/formidable/2/TL-Tariff-HS-Codes-2017-1.pdf)

- `la-moci-ahtn2022-coffee`: [ラオス商工省：AHTN2022品目検索・全品目階層](https://www.laotradeportal.gov.la/en-gb/site/full-tree)

- `la-moci-ahtn2022-index`: [ラオス商工省：AHTN2022品目検索の版表示](https://www.laotradeportal.gov.la/en-gb/site/listcommodity)

- `uz-lexuz-hs2022-roasted-coffee`: [ウズベキスタン法令LexUZ：2023年決議491・HS2022対応分類](https://www.lex.uz/mact/-6615175)

- `kh-gdce-hs2022-implementation`: [カンボジア税関：HS2022実施に関するWCO・WTO公式研修報告](https://www.wto.org/english/tratop_e/markacc_e/session2_cambodia.pdf)

- `kh-wco-hs2022-chapter09`: [WCO：HS2022第9章・カンボジア採用版の国際共通HS6](https://www.wcoomd.org/-/media/wco/public/global/pdf/topics/nomenclature/instruments-and-tools/hs-nomenclature-2022/2022/0209_2022e.pdf)

- `tm-customs-national-nomenclature-coffee`: [トルクメニスタン税関：公表商品分類表・コーヒー](https://customs.gov.tm/pdf/nomenclature.pdf)

- `tm-customs-code-hs-basis`: [トルクメニスタン税関：Customs Code第21条・商品分類のHS基盤](https://www.customs.gov.tm/en/pages/customs-code)

- `mv-wto-hs2017-citrus`: [WTO：モルディブのHS2017譲許表・柑橘（WT/Let/1525）](https://goods-schedules.wto.org/download_all/43364)

- `mn-wto-hs2017-citrus`: [WTO：モンゴルのHS2017譲許表・柑橘（WT/Let/1546）](https://goods-schedules.wto.org/download_all/43393)

- `tj-wto-hs2017-citrus`: [WTO：タジキスタンのHS2017譲許表・柑橘（WT/Let/1549）](https://goods-schedules.wto.org/download_all/43396)

- `af-wto-hs2022-fresh-mushrooms`: [WTO：アフガニスタンHS2022譲許表・生鮮きのこ（WT/Let1808）](https://goods-schedules.wto.org/download_all/43609)

- `ir-eec-agreement-national-2016-2017`: [EEC公式協定附属表：イラン2016–2017国別分類・蜂蜜と緑茶](https://eec.eaeunion.org/upload/medialibrary/7bc/Interim-Agreement-EAEU_Iran_final.pdf)

補助確認:

- [TL現在のTariff Finder](https://customs.gov.tl/tariff-finder/): 同じ0901親子の記述を照合。採用版の証拠としてはHS2017 PDFを用いる。
- LAの有効な葉: [0901211100](https://laotradeportal.gov.la/en-gb/site/commodity/0901211100)、[0901113000](https://laotradeportal.gov.la/en-gb/site/commodity/0901113000)、[0901221000](https://laotradeportal.gov.la/en-gb/site/commodity/0901221000)。公式HTMLに埋め込まれた階層データも照合。推測した無効な葉コードは収録しない。
- [AF WTO国別セット](https://goods-schedules.wto.org/browse/43609/file_browser)、[MV](https://goods-schedules.wto.org/browse/43364/file_browser)、[MN](https://goods-schedules.wto.org/browse/43393/file_browser)、[TJ](https://goods-schedules.wto.org/browse/43396/file_browser)。Download setから公式ZIPを実取得し、認証添付PDFの国名、HS版、親項目と具体コードを確認。改訂差分だけの資料のため、本文にないコーヒーをこれら4国へ流用していない。
- KH国内関税表は動的サイトで本文取得不能、MOCの協定PSR PDFも500が続いたため、実施報告＋WCO同版本文の経路を採用。PSRや関税譲許をこのKH候補の証拠に転用していない。

## 取得バイト列のSHA256

2026-11-18に取得した公式原典。ZIPはセットから展開した下記PDFのハッシュを記録する。

| 原典ファイル | SHA256 |
|---|---|
| hs29-tl-pdf.pdf | `3d4e9ce3ba2f952cb44179b5ccf32d90a9a0836aa83c2610a169a1e77fe870c0` |
| hs29-la-full-tree.html | `fa5dd0832367cd951ce9eaf6ebb9fc1cc8982e06e812b8e3fda3bab413336a36` |
| hs29-kh-implementation.pdf | `ec551b116f741521ec3e39055b1f26320be1018ff652d25c6b659ec316745700` |
| hs29-kh-wco09.pdf | `9c0539b85007b36d55dd672f3090c84f882079bff893485cb2708d07ef109044` |
| hs29-tm-nom.pdf | `8bee3bb791536652d54809f59199802760f0c7cbcda1a3e3da0071e8c55fc0c7` |
| hs29-tm-code.html | `9258ef5f4e8abc0cdfdae204a6264e85b1a74a8c624217ef4c0ca0dc5fa9409d` |
| hs29-af-wto/1808-02-EN-en.pdf | `749471f6d79ec69c9d0f2fbf403d29132864d2e499e1e3361f35de5f7bd923d8` |
| hs29-mv-wtozip/1525-02-en.pdf | `1c61486b51fb7efacb81a6e480ca2705b3ad8a42706b2c2e2212a0c4b68b47dc` |
| hs29-mn-wtozip/1546-02-en.pdf | `59f4c61dd5cb679acba08f9b36a12063f4530cafd7ee70ebe1d120f5d98497fb` |
| hs29-tj-wtozip/1549-02-en.pdf | `73339b36e754397167782422cea6ff4a0e0151df5e07fd36b6b58c343e31e9cd` |
| hs29-ir-fta.pdf | `1db7ae5b85cb7baecd145fa6cbe24d547139a6b6cf0753eca9d6b9ad7762c59f` |

## 未収録・見送り

- AS/GU/MP/UM: 米国の政治領域であることだけではUS HTSの適用根拠にならない。米関税領域との相違、現地税・申告制度があり、領域固有のHS6本文とHS基盤・版を結び付ける一次資料を確保できなかった。USコードを流用しない。
- CC/CX/NF: [ABF Customs Notice 2026/11](https://www.abf.gov.au/help-and-support-subsite/CustomsNotices/2026-11.pdf)は本土と異なる関税領域・修正法令を説明するが、領域固有のHS6分類本文の採用証拠にはならない。豪州本土表を所属だけで流用しない。
- HM: 同ABF通知で個別Customs法令やABF運用がないことを確認したが、HS分類本文の代わりにはならない。商取引の不可能・禁止とは断定せず、分類根拠不足として保留。
- TK/PN: 太平洋分メモに記載。固有のHS本文・版と適用根拠を確認できない。

## 検証と成果物

統合前29ルールと統合後62ルールを現行ClassificationCatalogスキーマ・実proposeClassificationエンジンで検証。各正例、全必要属性の欠落・質問、全条件の矛盾、誤属性、国・方向・版の不一致、内部期限超過を確認。全候補のnationalCode=null、eligibleForApproval=false、classificationConfirmed=falseを確認。ソース国の一致と入力オブジェクト非変更も確認。

- hs29-asia-pacific.json: 21国地域・29資料・62ルール（統合済み）
- hs29-asia-pacific-cases.json: 明示hsEdition付き62 fixtures
- hs29-verify.mjs: 実エンジン検証用（共有リポジトリに編集なし）
- hs29-pacific-sub.md: 太平洋11地域の一次資料・版・頁・SHA256・制限

---

# Pacific HS6 reference fragment

確認日: 2026-11-18。11か国・地域、16資料、33個の限定的なHS6参考候補。共有リポジトリは変更していない。

## 収録の意味と範囲

- 純コーヒーの粒状の豆に限定し、未焙煎・非脱カフェイン090111、焙煎済み・非脱カフェイン090121、焙煎済み・脱カフェイン090122をそれぞれ収録。果皮、抽出物、代用品、混合調製品、粉末は候補条件から除く。
- 全件import、国内コード・税則年版・税率・輸入許可・承認は追加しない。5個の必要属性が揃っても自動承認不可。
- 2026-11-18〜2026-12-18は内部参照期間であり、法的効力期間ではない。旧版をHS2022扱いにしない。
- WSは現在の当局公開ページがリンクするHS2017基礎版、PFは当局のHS第7次改訂採用説明に対応するTAPA 2026 V1を参照。後続改訂は保証しない。
- KI/NU/SB/TO/TV/NR/MH/FMは国内現行表として扱わず、referenceBasis=agreement_nomenclature。国別附属表の基礎品目記述だけを参照する。協定で定義するactualまたはproxy国別税目について、対象行がどちらかは未確認。批准・発効・現行国内HS採用・税率・原産資格を推定しない。
- 特にNRは発効済み当事国とは扱わず、FM/MHも交渉資料としての公表から国内適用を推定しない。
- WFはreferenceBasis=national_edition_reference、独立ID WF-TARIFF-2020。公式表紙にある2020-04-23更新版を使い、国際HS改訂版との対応は未確認。WCO公式一覧はHS基盤の補助根拠に限る。

## 国別本文と版

| 国・地域 | 入力hsEdition | 本文位置 | 根拠・制限 |
|---|---|---|---|
| WS | HS2017 | PDF p.52（印刷 p.52） | 公式国内品目表 |
| PF | HS2022 | PDF pp.122–123（印刷 pp.174–175） | 公式国内品目表 |
| WF | WF-TARIFF-2020 | 第9類0901およびアルファベット索引CAFE。検索抽出のみのためPDF頁番号未検証 | 公式国別版、国際HS版対応未確認 |
| KI | HS2012 | PDF p.11 | PACER公式国別附属表、現行国内適用未確認 |
| NU | HS2012 | PDF p.18 | PACER公式国別附属表、現行国内適用未確認 |
| SB | HS2012 | PDF p.14 | PACER公式国別附属表、現行国内適用未確認 |
| TO | HS2012 | PDF p.10 | PACER公式国別附属表、現行国内適用未確認 |
| TV | HS2012 | PDF p.13 | PACER公式国別附属表、現行国内適用未確認 |
| NR | HS2012 | PDF p.14 | PACER公式国別附属表、現行国内適用未確認 |
| MH | HS2012 | PDF p.11 | PACER公式国別附属表、現行国内適用未確認 |
| FM | HS2002 | PDF p.9 | PACER公式国別附属表、現行国内適用未確認 |

## 公式URL

- `ws-hs2017-official-index` (HS2017): [サモア税関：HS2017税則の公式公開案内](https://customs.gov.ws/rates/)
- `ws-hs2017-coffee-chapter9` (HS2017): [サモア税関：HS2017第1～10類・第9類コーヒー](https://customs.gov.ws/wp-content/uploads/2022/09/Chapter-1-10.pdf)
- `pf-hs2022-official-index` (HS2022): [仏領ポリネシア税関：HS第7次改訂と2026年税則案内](https://www.service-public.pf/douane/professionnels/procedure-de-dedouanement/le-tarif-douanier/)
- `pf-hs2022-tapa2026-coffee` (HS2022): [仏領ポリネシア税関：TAPA 2026 V1第9類コーヒー](https://www.service-public.pf/douane/wp-content/uploads/sites/18/2026/01/TAPA-2026-V1-sans-sommaire-et-annexes.pdf)
- `ki-pacer-hs2012-coffee` (HS2012): [NZ外務貿易省：PACER Plus キリバス Part I（HS2012）](https://www.mfat.govt.nz/assets/Trade-agreements/PACER-Plus/PACER-Plus-schedule-of-commitments-on-tariffs-for-Kiribati-HS2012.pdf)
- `nu-pacer-hs2012-coffee` (HS2012): [NZ外務貿易省：PACER Plus ニウエ Part I（HS2012）](https://www.mfat.govt.nz/assets/Trade-agreements/PACER-Plus/PACER-Plus-schedule-of-commitments-on-tariffs-for-Niue-HS2012.pdf)
- `sb-pacer-hs2012-coffee` (HS2012): [NZ外務貿易省：PACER Plus ソロモン諸島 Part I（HS2012）](https://www.mfat.govt.nz/assets/Trade-agreements/PACER-Plus/PACER-Plus-schedule-of-commitments-on-tariffs-for-Solomon-Islands-HS2012.pdf)
- `to-pacer-hs2012-coffee` (HS2012): [NZ外務貿易省：PACER Plus トンガ Part I（HS2012）](https://www.mfat.govt.nz/assets/Trade-agreements/PACER-Plus/PACER-Plus-schedule-of-commitments-on-tariffs-for-Tonga-HS2012.pdf)
- `tv-pacer-hs2012-coffee` (HS2012): [NZ外務貿易省：PACER Plus ツバル Part I（HS2012）](https://www.mfat.govt.nz/assets/Trade-agreements/PACER-Plus/PACER-Plus-schedule-of-commitments-on-tariffs-for-Tuvalu-HS2012.pdf)
- `nr-pacer-hs2012-coffee` (HS2012): [NZ外務貿易省：PACER Plus ナウル Part I（HS2012）](https://www.mfat.govt.nz/assets/Trade-agreements/PACER-Plus/PACER-Plus-schedule-of-commitments-on-tariffs-for-Nauru-HS2012.pdf)
- `mh-pacer-hs2012-coffee` (HS2012): [NZ外務貿易省：PACER Plus マーシャル諸島 Part I（HS2012）](https://www.mfat.govt.nz/assets/Trade-agreements/PACER-Plus/PACER-Plus-schedule-of-commitments-on-tariffs-for-the-Republic-of-the-Marshall-Islands-HS2012.pdf)
- `fm-pacer-hs2002-coffee` (HS2002): [NZ外務貿易省：PACER Plus ミクロネシア連邦 Part I（HS2002）](https://www.mfat.govt.nz/assets/Trade-agreements/PACER-Plus/PACER-Plus-schedule-of-commitments-on-tariffs-for-the-Federated-States-of-Micronesia-HS2002.pdf)
- `wco-hs2012-pacer-coffee-hierarchy` (HS2012): [WCO：HS2012第9類・PACER附属表の親見出し照合](https://www.wcoomd.org/-/media/wco/public/global/pdf/topics/nomenclature/instruments-and-tools/hs-nomenclature-2012/hs-2012/0209_2012e.pdf?la=en)
- `wco-hs2002-pacer-coffee-hierarchy` (HS2002): [WCO：HS2002第9類・ミクロネシア附属表の親見出し照合](https://www.wcoomd.org/-/media/wco/public/global/pdf/topics/nomenclature/instruments-and-tools/hs-nomenclature-older-edition/2002/hs-2002/0209e.pdf?la=en)
- `wf-tariff2020-coffee` (WF-TARIFF-2020): [ワリス・フツナ税関：2020-04-23更新版・第9類コーヒー](https://www.douane.wf/wp-content/uploads/2016/06/TARIF-DES-DOUANES-mis-%C3%A0-jour-le-23.04.2020.pdf)
- `wf-wco-hs-application-reference` (WF-TARIFF-2020): [WCO：HS使用国一覧・ワリス・フツナの掲載](https://www.wcoomd.org/-/media/wco/public/global/pdf/topics/nomenclature/overview/hs-contracting-parties/list-of-countries/countries_applying_hs.pdf?db=web)

補助確認:

- [PACER Plus公式資料一覧（NZ外務貿易省）](https://www.mfat.govt.nz/en/trade/free-trade-agreements/free-trade-agreements-in-force/pacer-plus/pacer-plus-text-and-resources)。実際にページ内の国別PDFリンクを抽出して上記8ファイルを取得。
- [PACER Plus統合条文・Annex 2-A](https://www.mfat.govt.nz/assets/Trade-agreements/PACER-Plus/PACER-Plus-consolidated-legal-text.pdf)。国別税目はactualまたはproxyという定義であり、国別行の現行適用性は示さない。
- [豪州DFATの公式資料一覧](https://www.dfat.gov.au/trade/agreements/in-force/pacer/documents)でもHS2012国別表の掲載を照合。
- [WCO HS2002公式版一覧](https://www.wcoomd.org/en/topics/nomenclature/instrument-and-tools/hs_nomenclature_previous_editions/hs_nomenclature_table_2002.aspx)。実リンクの第9類本文を取得し、FM附属表で省略された焙煎状態の親見出しを同版で照合。
- [サモアHS2017索引PDF](https://customs.gov.ws/wp-content/uploads/2022/09/Index-and-Preliminary.pdf)はPDFメタデータもHS2017を明示。
- [WF当局税則公開ページ](https://www.douane.wf/2016/06/28/tarif-des-douanes-2016/)がリンクする2020更新版と、同一タイトルの旧ディレクトリ版を照合。直取得は503/timeoutとなったが、公式PDFの検索本文から表紙日付、第9類0901親見出し、0901.11/21/22の記述、CAFE索引を確認した。全文未取得のため頁番号・PDFハッシュは未検証。

## 取得PDFのSHA256

下記は2026-11-18に公式URLから実取得したバイト列のSHA256。WFは未取得のため記載しない。

| 資料 | SHA256 |
|---|---|
| ws | `7008ec4c96526761fa1fd00b971b0fbbcc4918763995066631047d07f014da6f` |
| ws-index | `86028ed29ec9b5e40896cf9b6a514ad666ce53380edef9a247b35d0c1ea43fb8` |
| pf | `3c45eee042903918266a07be35a131411644b44e2e30543b08c54ae29aea112b` |
| ki | `2da6c04fc2f5375f2325c4272dd3102f49bce0b601674c4dfb07237c20cec9e9` |
| nu | `699957633bb88a865291504e86615d75cf52c35c29bb19bfef7e720ce6f89456` |
| sb | `de400d5eace457df5ae08625f5c9680f7e1f019e050790ad8cea0674b2120d72` |
| to | `6611b6cd2775d0b981357c36ff6ec69eff069d0b0a26bd2c44fe37fe5178a89e` |
| tv | `b88a8e65e68abf5cc7dad677854cc51101712b036f91eff5e2881bad8849dc6a` |
| nr | `b13c74cc407e129e538df503ab982f71a3f46fa87414e7e6b7b527f19bcb7931` |
| mh | `f606317c37d1beb6ce19a72c38231913bea8f76ffdfe614cbf84c3fa62fb947c` |
| fm | `0c4fe9d74f523d3bba2a2372b082fe4bc848e6144477ff5d140570de49780ed0` |
| wco2012 | `57c1b75842ae4c9ed3e62eae7f4bdfc3a75df7ef797d4cf010e73be1e5b0aeae` |
| wco2002 | `2831b98c2211c9df92a90c7536da0976b5bace8ef3be9a0472b401f04be7be01` |
| wco-users | `1c8b3317d68a1190b9ffbed67fc39df6d2c55ea2f2465e003adfefdb8f3744c6` |

## 検証

`node hs29-pacific-verify.mjs` は現行ClassificationCatalogスキーマと実エンジンで11か国・33ルールを検証。33件の正例、33件の混合商品除外、全5属性の欠落・矛盾、版の不一致、期限超過を含め計462ケースが成功。全候補でnationalCode=null、tariffEdition=null、eligibleForApproval=false、classificationConfirmed=falseを確認。

## 見送り

- TK: Tokelauの公開通関規則は確認できるが、領域固有のHS6品目本文と分類版・HS基盤を結び付ける公式資料を確保できない。ニュージーランド領であることだけでNZ分類を流用しない。
- PN: Pitcairnの公開法令から領域固有のHS6分類本文を確保できない。英国分類を政治的所属だけで流用しない。

## 成果物

- hs29-pacific-sub.json: 統合用sources/rules
- hs29-pacific-sub-cases.json: hsEdition付き33正例・誤属性のfixture
- hs29-pacific-verify.mjs: フラグメント単独のエンジン検証
