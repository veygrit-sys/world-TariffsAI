# rc.28 公式資料の調査記録

2026年11月18日JSTに確認した資料の範囲・取得制限・見送り理由を記録します。本文・補助資料・参考附属書は用途を区別します。出典の統合後ID・適用先の正本は `data/classification-catalog.json` です。下記の断片単位の件数には、URL共通化前の出典レコードを含みます。

---

## americas

# 米州 HS分類追加（2026-11-18 JST）

17か国、51国別ルール、19出典。GT/SV/HN/NI/CR/AR/PY/UY/PE/CO/EC/JM/BZ/VC/DO/PA の16か国は純コーヒー豆の3区分（090111、090121、090122）。BOは焙煎非脱カフェイン豆090121、殻付き未焙煎乾燥ブラジルナッツ080121、生鮮マンゴー080450。国内細分・税率・許認可・特恵・輸出還付・承認の追加はない。全ルールimport/HS2022、source.kind=hs_nomenclature。

`hs28-americas.json` と `hs28-americas-cases.json` が統合用。以下のPDF等原本は研究用一時ファイルであり公開リポジトリへ全文を加えない。引用本文は転記せず、独自要約とコード事実だけを追加する。各sourceの2026-11-18〜2026-12-18は内部レビュー範囲。

## GT/SV/HN/NI/CR：SIECA共通分類の5国限定

- 公式公開元: https://www.sieca.int/recursos/arancel-centroamericano-importacion/ （web ）。2025年8月v6、SAC VII Enmienda、450-2021第1附属書と明記。
- 本文: https://www.sieca.int/recursos/arancel-centroamericano-importacion/?wpdmdl=47049&ind=1757371835197&filename=SACVIIENM-WORD-VERSION6-AGOSTO25-COMPRIMIDO.pdf
- webクリックは403だが、同じ公式URLをurllibで取得して9,500,670 bytes・996頁のPDF本文を確認。研究原本 `hs28-am-sac.pdf`。0基準91頁で未焙煎/非脱カフェイン、92頁で焙煎の2区分を確認。親項目と3HS6を独立確認済み。
- 版・採用範囲: https://www.sieca.int/recursos/resolucion-450-2021-comieco/ （）。公式決議PDFを同ページのリンクから取得（`hs28-am-resolution.pdf`、103,562 bytes、3頁）。本文が画像主体なので1頁・3頁を画像確認。1頁はHS第7次改訂、3頁は2022-01-01施行とCR/SV/GT/HN/NIおよびPA担当大臣等の署名。
- v6 Part II の列がGU/ES/HO/NI/CRであることもpdftotext-layoutで確認。今回はこれら5国への共通HS6参照だけで、国別DAIや例外を流用しない。PAは別の国内官報を使うためここへ含めない。
- 国家導入の追加補足（catalog sourceには入れず参考）: SV https://infotrade.economia.gob.sv/sistema-arancelario-centroamericano-2022/ (); GT https://www.prensa.gob.gt/comunicado/comieco-anuncia-cambios-en-arancel-centroamericano-de-importacion (); HN https://www.aduanas.gob.hn/wp-content/uploads/2022/10/ADUANAS-DNOA-010-2022.pdf (); NI議会官報 https://digesto.asamblea.gob.ni/consultas/util/pdf.php?rdd=GmlYFDdw6JQ%3D&type=rdd () はMIFIC019-2021で450-2021公表を確認。

## AR アルゼンチン

- https://biblioteca.arca.gob.ar/pdfp/anexo_6992944_1.pdf （, ）。ARCA政府図書館の公開NCM2022附属書。冒頭に第7次改訂に基づく2022版、2023年文書番号。
- 5,771,824 bytes・437頁。0基準43頁で親項目と3区分を本文確認。最新版国内税表を取得したとは主張しない。

## PY パラグアイ

- 公開元 https://www.mef.gov.py/es/aranceles-importacion () は2025年10月版、HS第7次改訂、参考整理資料で法的効力なしと明記。
- 公式リンク先 https://www.mef.gov.py/sites/default/files/2025-11/Arancel%20Nacional%20Vigente_octubre%202025_1.pdf (, )。
- 9,847,093 bytes・455頁。0基準44頁にNCM2022表示、親項目と3区分。参考資料の限定はsource.termsにも維持。

## UY ウルグアイ

- 公式案内 https://www.gub.uy/ministerio-economia-finanzas/nomenclatura-aranceles-uruguay-0 () はSA2022に基づく国内分類、2022-01-01から採用、整理Excelは法令に代わらない旨を明記。
- 公式導入案内 https://www.gub.uy/ministerio-economia-finanzas/politicas-y-gestion/nomenclatura-arancelaria-nacional-adopcion-vii-enmienda-sa-2022 () のAnexo Iリンク57を追跡。
- 親項目の本文 https://www.gub.uy/ministerio-economia-finanzas/sites/ministerio-economia-finanzas/files/2021-12/Anexo%20I%20-%20NCM%202022%20%28VII%20Enmienda%29.pdf 。web timeout後、公式から6,119,333 bytes・422頁を直接取得（`hs28-am-uy2022.pdf`）。0基準41頁で親項目と3区分を確認。
- 2025年2月Excel https://www.gub.uy/ministerio-economia-finanzas/sites/ministerio-economia-finanzas/files/2025-05/Arancel%20Nacional_10%20d%C3%ADgitos_Febrero%202025%20-final.xlsx を取得（664,976 bytes）、openpyxlでHoja1の1106〜1110行のコードを照合。親項目のない国内リーフ表だけで焙煎状態を推定せず2022本文を併用。

## PE ペルー

- https://www.sunat.gob.pe/legislacion/procedim/normasadua/gja-04/ctrlCambios/anexos/Arancel_2022.pdf ()。
- 2,426,962 bytes・320頁。2022年税表の表題と序文のNANDINA第7次改訂採用、0基準32頁の親項目・3区分を本文確認。後続改正統合済みと主張しない。

## CO コロンビア

- https://normograma.dian.gov.co/dian/compilacion/docs/decreto_1881_2021.htm (, )。
- 48〜51行でNANDINA885/HS第7次改訂、2022-01-01採用。1377〜1389行にコーヒー親項目・3区分。個別の時限改正や国内税率は転記しない。

## EC エクアドル

- https://www.produccion.gob.ec/wp-content/uploads/2023/03/Resolucio%CC%81n-002-2023.pdf ()。
- 5,051,643 bytes・424頁。0基準1頁で第7次改訂・2022年体系を明示、44頁で親項目・3区分。002-2023を011-2023等で改正した後の最新統合国内税表とは扱わない。
- 公式SENAE採用案内 https://www.aduana.gob.ec/gaceta-boletin/entrada-en-vigor-resolucion-comex-nro-002-2023--arancel-del-ecuador/ () もHS第7次改訂、2023-09-01施行を確認。

## JM ジャマイカ

- 現行公式入口 https://jca.gov.jm/services/current-tariffs/ ()。
- https://jca.gov.jm/wp-content/uploads/2026/11/INTEGRATED-TARIFF-BASED-ON-HS-2022-October-30-2026.pdf を直接取得（4,723,119 bytes・377頁、`hs28-am-jm.pdf`）。0頁にHS2022と2026-10-30、44頁で3区分と親項目。複数の税・手数料列は一切採用しない。

## BZ ベリーズ

- 公式採用案内 https://www.customs.gov.bz/ttpg.html () は2023-01-01施行とHS2022、公式第9類リンク18。
- そのリンク先 https://www.customs.gov.bz/tariffs_PDF/15_CHAPTER%209COFFEE,%20TEA,%20MAT%C3%89%20AND%20SPICES.pdf ()。
- 4頁の公式PDFはHS2022を明示。1頁（zero-based）に親項目と3区分。協定税率や国内枝番を候補へ使わない。

## VC セントビンセント・グレナディーン

- 公式輸入分類表 https://customs.gov.vc/downloads/tariff-classification.pdf (, ) の0基準26頁で3コードを確認。
- 国内採用法 https://customs.gov.vc/downloads/Act%20No.%2021%20Customs%20Duties%20(Amendment)%20Act,%202022.pdf (, ) は14頁でHS2022共通表を採用、0頁で主要条項2023-01-01施行。
- 親項目の補足はCARICOM公式 https://caricom.org/wp-content/uploads/CET-based-on-HS2022-Final.pdf 。14,243,916 bytes・807頁を直接取得（`hs28-am-cet.pdf`）、75頁で未焙煎・焙煎の親項目と3HS6を確認。国内採用法と実コードを確認したVCにだけ結合し、他のCARICOM加盟国へ一括展開しない。

## DO ドミニカ共和国

- DGA公式入口 https://www.aduanas.gob.do/de-interes/consultas/ () の57番から https://www.aduanas.gob.do/consultas/arancel-de-aduanas-7ma-enmienda-2022/ () へ進む。
- 公式ページiframe54番は https://heyzine.com/flip-book/afb3acbd13.html ()。
- その公開PDF https://cdnm.heyzine.com/files/uploaded/v2/afb3acbd131d1e36f30088edcc4b65f9d0d3a8f1.pdf を直接取得（6,049,029 bytes・633頁、`hs28-am-do.pdf`）。1頁はDGA公式刊行物/2022年初版、76頁で親項目と3区分。DGA刊行物の全文・表を再配布せず、コードの事実と独自条件要約だけを追加。
- HS2022採用は公式案内 https://www.aduanas.gob.do/media/rupaj0fj/aviso-entrada-en-vigor-enmienda.pdf () と https://vucerd.gob.do/de-inter%C3%A9s/arancel-7ma-enmienda/ () でも補足確認。後続法改正の統合やITBIS判定を提供しない。

## PA パナマ

- https://www.gacetaoficial.gob.pa/storage/gacetas/2021/12/29427_B/GacetaNo_29427b_20211202.pdf はweb timeout後に直接取得（10,380,812 bytes・650頁、`hs28-am-pa-gaceta.pdf`）。
- 冒頭画像の官報タイトル29427-B・2021-12-02・政令30によるHS第7次改訂採用を目視確認。0基準67頁でコーヒーの親項目と3区分の本文を確認。
- 税関の公式HS2022導入補助案内 https://www.ana.gob.pa/w_ana/images/ANA_pdf/arancel_VII.pdf () も2022-01-01から第7次改訂採用と明示。基本分類の参照のみで、国別割当・輸入許可を確定しない。

## BO ボリビア：商品3例、附属書の限定利用

- 主たるMEFP2026輸入税表PDFは503/502で直接取得できず、コードを全て収録したとも主張しない。
- 公式補足資料 https://dgaj.produccion.gob.bo/docs/RESOLUCION-BI-MINISTERIAL-N-001.2026.pdf () を直接取得（64,713,408 bytes・91頁、`hs28-am-bo-alt.pdf`）。web parserは64MBの上限、PDFは画像主体なので画像とOCRで照合。
- 0基準2頁は、2026年輸入税表がHS第7次改訂とNANDINA885/906に基づくことを明記。7頁・8頁を画像で確認。
- 7頁: 08.01は対象ナッツの生鮮/乾燥、0801.21はブラジルナッツの殻付き。今回候補は殻付き・乾燥・未焙煎・粒状・他原料なしに限定。
- 7頁: 08.04は対象果実の生鮮/乾燥、0804.50の国内行にマンゴーとマンゴスチンを記載。今回候補は未加工・生鮮・丸ごとのマンゴーだけに限定。
- 7頁下端の09.01親項目・焙煎コーヒー、8頁上端の0901.21と非脱カフェイン・粒状を合わせて確認。090111/090122はこの附属書に対応行がないため追加しない。
- 同資料の本来の目的は輸出還付の対象一覧である。HS2022体系・品目記述の照合にだけ使い、輸出還付資格・国内輸入税率・許認可へ変換しないとsource.termsとrationaleへ明記。

## 検証

`hs28-am-check.mjs` が実ClassificationCatalogとproposeClassificationを使用。51正例すべてで期待HS6・nationalCode=null・eligibleForApproval=false。全254必須属性の欠落で不足質問、全254条件を矛盾値に変えた場合に該当候補が除外されることを確認。共有repoは未編集。

## 見送り・後続

- CARICOM他国：CET2022地域冊子だけで各国の採用を推定しない。Barbadosは計画段階の公式2023案内が見つかったが、その後の採用と対象品目の照合を今回完了していない。TT等も後続。
- 既存調査にHS2017資料が残るGuyana等はHS2022と扱わない。
- 未確認国を非採用・非対応と断定しない。ボリビアの未確認コーヒー2条件や各国の商品群拡張・国内コード・税率は別段階。

---

## west-central-africa

# rc.28 西・中部・北部アフリカ候補の確認記録

2026-11-18 JST確認。15国・43ルール・13出典レコード。HS6候補のみで、国内細分・税率・通関許可・配送許可・承認資格は付与しない。2026-11-18から12-18の日付は内部カタログの確認期間であり、法令の施行・失効期間ではない。資料原本・税率一覧は公開リポジトリへ追加しない。

## 対象範囲

| 範囲 | 国 | ルール | 対象 |
| --- | --- | ---: | --- |
| UEMOAの共通基礎分類 | BJ BF CI GW ML NE SN TG | 24 | 純コーヒー豆3区分を8国へ展開 |
| 国別資料の本文確認 | GN NG EG LR CV | 15 | 純コーヒー豆3区分 |
| モロッコ公式索引に限定 | MA | 2 | 未焙煎の非脱カフェイン090111・脱カフェイン090112 |
| チュニジア公式索引に限定 | TN | 2 | 未焙煎非脱カフェイン090111・直接包装3kg以下の焙煎非脱カフェイン090121 |

UEMOA24行は共通3分類の国別展開であり、24商品・8国別独立裁定ではない。ECOWAS加盟や脱退を理由に対象国を推定していない。UEMOAの現行8国と全8国のHS2022利用を明示する2026年WCOの記事と、UEMOA公式TEC2022の両方を確認した。国別税率や国内例外は別途確認する。

## UEMOA（8国）

公式分類本文: https://www.e-docucenter.uemoa.int/sites/default/files/2024-09/UEMOA_TEC2022_V4.pdf

UEMOA Commission公開のTEC2022。482頁、公式PDFを直接取得しPyMuPDFでも照合した。PDF49頁（0始まり、印刷52）に未焙煎・非脱カフェインの親項目と0901.11配下、PDF50頁（印刷53）に焙煎・非脱カフェイン0901.21、焙煎・脱カフェイン0901.22と未粉砕/粉砕の枝分かれがある。国別候補は他原料を加えない粒状の豆に限定する。refs:  / 。資料の画面取得ref 。

対象と版の根拠: https://www.wcoomd.org/fr/media/newsroom/2026/june/waemu-facilitates-origin-determination-by-aligning-to-hs-2022.aspx?p=1

2026-06-17のWCO公式記事は、共通税表を設ける現行8国を列挙し、全8国がHS2022を各国の税表・統計分類の基礎として利用していることを明記する（本文21〜22行）。記事の原産地承認商品の対応表や特恵資格は取り込まない。歴史的な国内導入日を一律2022年と確定するものでもない。refs:  / 。

## ギニア（GN）

公式本文: https://dgd.gov.gn/wp-content/uploads/2024/02/Copie-de-TEC-version-SH-2022-GP.pdf

ギニアDGDの公開TEC SH2022資料を直接取得し、PDF45頁と46頁のコーヒー親見出し・3HS6を本文確認。未焙煎非脱カフェイン0901.11の多くの国内区分と、焙煎0901.21/0901.22の未粉砕・粉砕区分が対応する。HS版はファイル名だけから推定せず、WCO2026表のGN行HS2022欄（2022-01-01）でも確認した。現行の全税率・後続改正を統合した国内税表とは扱わない。refs:  /  / 。

## ナイジェリア（NG）

公式API本文: https://cet-backend.customs.gov.ng/api/harmonized-system/tariff-lines?edition=2026&page=1&per_page=all

NCS公開APIから4,880,011 bytesのJSONを直接取得。090111配下の具体的な品名で未焙煎・非脱カフェインを照合し、0901211000と0901221000の具体的な品名で焙煎・非粉砕と脱カフェイン状態を照合した。レスポンスの一部階層タイトルにはArabicaなど位置が紛らわしい表記があるため、抽象的な階層タイトルだけから判定せず、当該行の具体的な品名全文・コードと親項目を読んだ。税関のdemo-cet公開案内に対応する参照データとして扱い、法的に申告可能な税表や税率として扱わない。WCO表のNG行はHS2022=2022-04-01。refs: /3 /  / 。原JSONはhs28-wca-ng.jsonとして研究用保存。

## エジプト（EG）

公式本文: https://customs.gov.eg/Upload/ECAAdminace/d772d67c-ffad-4b8c-b89e-fcdd188d2064.pdf

2022年大統領令218によるHS2022関税表。公式PDF485頁を直接取得し、本文のHS2022導入説明（印刷7頁）とコーヒー区分（PDF59頁、印刷58）を確認した。アラビア語の未焙煎/焙煎と非脱カフェイン/脱カフェインの親項目が0901.11/0901.21/0901.22へ対応する。2022年導入版の基礎分類であり、2026年最新統合税率を確認したとは扱わない。refs:  / 。画面取得ref 。

## リベリア（LR）

公式本文: https://revenue.lra.gov.lr/wp-content/uploads/2023/04/LIBERIA-CUSTOMS-TARIFF-HS-2022.pdf

公式公開元: https://revenue.lra.gov.lr/customs-laws-regulations/

LRA公開元がHS2022としてリンクするPDF738頁を直接取得。PDF32〜33頁で未焙煎と焙煎の親項目、および0901.11/0901.21/0901.22を確認。焙煎2HS6の未粉砕枝を粒状豆の条件へ限定した。最新統合国内税率の保証ではない。refs:  /  / 。

## カーボベルデ（CV）

2026年公式Excel: https://www.mf.gov.cv/documents/54571/63592/PAUTA+ADUANEIRA_2026.xlsx/7c03ad59-cf82-efbc-f965-e72d12eb35e9?t=1770725795112

HS2022導入法: https://boe.incv.cv/Bulletins/View/84887

DNRE公式公開元の2026年品目表Excelを直接取得しopenpyxlで読取。シート名はPauta 2026 SH 2022、表題にも2026年・SH2022が明記されている。コーヒー行の3状態とHS6を確認。2025年4月17日法律51/X/2025はHS2022の第7次改訂を導入する法令として確認。旧2022年版は表題にSH2017と明記されており、刊行年2022をHS版2022と混同せず採用しなかった。refs:  / /6 / 。

## モロッコ（MA）

公式公開資料の検索索引: https://www.finances.gov.ma/Publication/db/2023/BO_7154-bis_Ar.pdf

財務省公開の2023年財政法（2022年12月23日付官報7154bis）の公式検索索引本文に、官報8207頁の未焙煎コーヒー0901.11（非脱カフェイン）/0901.12（脱カフェイン）の親項目と記述を確認した。PDF直接取得は503/timeoutであり、全文や最新統合表を読んだとは扱わない。この制限をtermsとrationaleへ明記し、確認できる未焙煎2条件に限る。HS2022の採用はWCOのMA行（2022-01-01）で補足する。焙煎2区分は今回の当該国候補へ追加しない。ONSSAの輸出衛生書類PDFにもコードがあるが、輸出書類を輸入分類の根拠へ置き換えていない。refs:  /  / 。

## チュニジア（TN）

未焙煎の公式照会: https://www.douane.gov.tn/tarifwebnew/getresultat.php?chap=09&choix=2&sel=09011100000

焙煎の公式照会: https://www.douane.gov.tn/tarifwebnew/getresultat.php?chap=09&choix=2&sel=09012100028

税関の公式検索索引の実品名で、未焙煎非脱カフェイン090111と、非粉砕・焙煎非脱カフェイン・直接包装3kg以下090121を確認した。後者にはpack_size_band=up_to_3kgという追加必須条件を設け、根拠にある商品範囲へ狭めている。原頁直接取得は403/502であり、最新の税率・許可・原頁全文を確認したとは扱わない（termsに明記）。HS2022の採用はWCO TN行（2023-10-05）で補足。2014年版の章別PDFは旧版のため候補の主要根拠に採用しない。未取得の焙煎脱カフェイン区分は追加しない。refs: /1 / /1 / 。

## WCOの補足資料

https://www.wcoomd.org/~/media/WCO/Public/Global/PDF/Topics/Nomenclature/Overview/HS%20Contracting%20Parties/Positions%20of%20CP/Situation_HS.ashx

2026-07-23版を直接取得し、GN/NG/MA/TNのHS2022列を本文と座標付きPDF抽出で確認。同資料の冒頭は透明性のための参照であり法的・公式の適用認定効力がないことを明記している。source.termsにも反映。国際導入表だけから商品の分類コードや税率を作らず、各国の品目記述と必ず併用する。既存カタログにも同一URLがあるため、root統合時は同一URLの出典重複を解消して構わない。refs:  / /2/3 / 。

## 見送り・次段階

- CEMAC6国（CM CF TD CG GA GQ）: HS2022採用の一部裏付けはあるが、今回取得できる地域共通の品目表は古い版が混在。採用通知だけから旧品目表をHS2022へ格上げせず、最新公式品目本文の再取得へ回す。
- GH: 現行GRAのHS Codeページは表の見出しだけでコーヒー行が返らず、HS2022採用情報だけから他国のコードを流用しない。
- GM: GRA現行FAQは2022版ECOWAS CETを利用する旨を明記するが、当該国に適用する実品目本文の確認が不足した。
- SL: 取得可能な公式Customs HS Tariffの公開年が古く、HS2022へ対応する最新本文の確認を残す。
- DZ: 2022HS改訂公式資料や採用情報はあるが、最新の具体的コーヒー区分本文の直接取得がtimeoutになり見送った。
- LY/MR: HS2022採用情報はあるが、当該国の現行品目資料の取得を残す。旧2017年の官報・過去税表だけでHS2022候補を作らない。

## 検証

hs28-wca-check.mjsで43正例・全216必須属性の欠落・全216条件の矛盾を検証し、候補のHS6・国内細分null・自動承認不可を確認する。各ルールの輸出区分・HS2017不一致、確認済み国内税番の承認拒否も検証する。共有リポジトリは編集しない。

## 研究用取得ファイルの指紋

- hs28-wca-uemoa.pdf: SHA256 e7774d3fbcc565adfd24b063bffe7f1f079c094b66116cecea0289bfb278c5ae
- hs28-wca-gn.pdf: SHA256 305caa525d340046dd206c34525798f8800bb04f1daa9fe764cd4eb8eba659c9
- hs28-wca-ng.json: SHA256 7fdc2165e8827b7c7e0f7926371a67ac1e657ac4ad5ae14a129df775d8bebc0e
- hs28-wca-eg.pdf: SHA256 802f0dee162d1fa96e3f7f753d2980c298dde25a55745340ec0b8141edc03047
- hs28-wca-lr.pdf: SHA256 e9613b20149b0b65d136de5aaa80dbbbf5c8904c746eafe6694a1a94795a1a32
- hs28-wca-cv2026.xlsx: SHA256 50d183627ed6a3361335961898882ecf4a6b73a5b224e3491f2419bac5f66c50
- hs28-wca-wco.pdf: SHA256 bfd45a6a63fb64a994805542c3ac7bfaa325c603b73a434aec27f00bfa68f5ed

---

## east-south-africa

# 東部・南部アフリカと島嶼：HS6候補の確認記録

2026-11-18 JST確認。追加14国（BW LS NA SZ KE RW BI TZ UG MG ZW MW SC MU）、42ルール、19出典レコード。すべて純コーヒー豆の090111／090121／090122に限定する。内部カタログ期間は2026-11-18〜2026-12-18。国内細分、税率、原産地特恵、輸入・発送の許可、正式分類承認は追加しない。

共有リポジトリは未編集。断片は `hs28-east-south-africa.json`、正例と矛盾属性は `hs28-east-south-africa-cases.json`。

## SACU：BW・LS・NA・SZ（4国12ルール）

単なる加盟を根拠に南アフリカの分類をコピーしていない。次の3つを併用した。

1. SACU事務局の2022-02-15公式発表は、全加盟国が2022-01-01に共通品目表をHS2022へ同時移行したことを説明。PDF2ページ目は共通品目表の分類体系と公式CETへの導線も示す。
   https://www.sacu.int/uploads/documents/7755c28fdc23bc6668d3498cd468dcbef8d40a25.pdf
2. ナミビア政府Trade PortalはHS22体系と、SACU共通品目表がBW・LS・NA・ZA・SZの5加盟国に適用することを明示。さらに「現在適用される各品目」としてSARS原表を公式リンクする。
   https://namibiatradeportal.gov.na/trade-goods/tariffs
3. そのSARS公式原表（2026-11-13付）を直接取得。PDFゼロ始まり58ページの親見出し・未焙煎／焙煎・カフェイン除去区分を照合。国別の免除や国内追加税を移植しない。
   https://www.sars.gov.za/wp-content/uploads/Legal/SCEA1964/Legal-LPrim-CE-Sch1P1Chpt1-to-99-Schedule-No-1-Part-1-Chapters-1-to-99.pdf

Refs: （SACU本文）、（ナミビアL79–85）、（SACUの現行CET導線）。SARS原本は `hs28-esa-sacu.pdf`。原文全文や税率は公開断片へ入れていない。

この原表URLは既存ZA出典と同じため、rootで適用国を整理して重複出典を統合できる。

## EAC：KE・RW・BI・TZ・UG（5国15ルール）

対象5国にはそれぞれ当該国の採用・公開根拠を併用。SS・SO・CD等への自動展開はしない。

- 共通品目本文：RRAが公開するEAC CET2022・2025年6月更新版。表紙はHS2022を明示。PDFゼロ始まり55ページ（印刷54）のコーヒー親見出しと3状態を照合。
  https://www.rra.gov.rw/fileadmin/user_upload/COMMON_EXTERNAL_TARIFF__Updated_June_2025.pdf
- KE：KRAの公式採用案内は2022-07-01からHS2022とEAC CET2022を実施すると明記。
  https://www.kra.go.ke/news-center/public-notices/1733-implementation-of-the-2022-harmonized-system-the-2022-east-african-community-common-external-tariff
- RW：RRAの公式EAC Customs Unionページが2022版と2025年6月更新版を公開し、共通品目表の利用を説明。
  https://www.rra.gov.rw/index.php?L=0&id=129
- BI：OBRの2022-07-14付公式通知は、2022版共通品目表の運用を同年07-15に開始すると明記。PDFは画像主体のためスクリーンショットで本文を確認した。
  https://www.obr.bi/images/PDF/Communiqu%C3%A9_Tarif_Ext%C3%A9rieur_Commun_copy_copy.pdf
- TZ：TRA現行トップページのTariffリンク先を実際に取得。HS2022・2025年6月更新版でRRA公開原本と同一。PDF55ページで3状態を確認。
  https://www.tra.go.tz/images/uploads/pages/CET_2022_VERSION_Updated_June_2025.pdf
- UG：URAが公式にCOMMON EXTERNAL TARIFF 2022 VERSIONを公開。国別の体系公開根拠として使い、コード本文は共通原表を併用。URAページのDownloadリンクは解析上、目的と異なるリンクになるため、そのリンクを原表取得済みとは扱わない。
  https://ura.go.ug/en/download/common-external-tariff-2022-version/

Refs: （KRA L320–323）、（RRA L65–69）、（OBR画像）、（TRA公式導線）、（URA公開見出し）。RRA/TZのPDFは `hs28-esa-eac.pdf` / `hs28-esa-tz.pdf` に直接取得し、本文・版を照合。最新の国別税率、stay、例外措置の適用確認ではない。

## MG：マダガスカル（3ルール）

現行税関の一覧からリンクされる、2026年7月・LFR更新版を取得。表紙にHS2022基準を明示。PDF37ページ（印刷38）の未焙煎／焙煎の親見出しと脱カフェイン区分を照合。

https://www.douanes.gov.mg/srcs/uploads/2026/07/TARIF-DES-DOUANES-2026-MAJ-LFR.pdf

公開元: https://www.douanes.gov.mg/tarifs-des-douanes/

Refs: 、。原本 `hs28-esa-mg.pdf`。豆の国内品種別細分や税率は転記しない。

## ZW：ジンバブエ（3ルール）

ZIMRA公式のS.I.203/2022原本を取得。PDF108〜109ページ（ゼロ始まり）で3状態を照合。公式導入説明は2022年HSへの変更とS.I.203/2022との関係を明記。

https://www.zimra.co.zw/customs/classification-of-goods/tariff-handbook?download=393:download-tariff-handbook

https://www.zimra.co.zw/customs/classification-of-goods/customs-and-excise-duties-2022

Refs: 、、。原本 `hs28-esa-zw.pdf`。HS2022導入時の基本分類であり、後続改正を統合した2026国内税表の確認とは扱わない。

## MW：マラウイ（3ルール）

政府Revenue Appeals Tribunalが掲載するMRA作成のHS2022表を取得。表紙にHS2022 Version、PDF56ページ（印刷57）の3状態を照合。MRA側URLはHTML応答になるため、政府公式の掲載元と添付コンテンツAPIを利用した。

https://elibrary.rat.gov.mw/items/e800e97d-2b66-4554-9804-ede8539e7c80/full

https://elibrary.rat.gov.mw/server/api/core/bitstreams/771322c5-bd77-4da8-ad05-71592bd61b1d/content

Refs: 。原本 `hs28-esa-mw-content.pdf`。公開元は2025〜2027適用資料として整理しているが、今回採用するのはHS6の品目記述だけで、最新税率は認定しない。

## SC：セーシェル（3ルール）

政府Trade Portalの現行Seychelles Customs tariffリンク先であるHS2022参照Excelを直接取得。sheet1の875〜881行にコーヒー見出し・3状態がある。コードセルは数値型（例901.11）なので、親見出しと桁構造によりHS6の090111／090121／090122を照合。資料自身の先頭行に、法的文書ではなく参照用であると明記されている。この制限をsource.termsとrationaleへ残した。

https://www.tradeportal.sc/

https://www.tradeportal.sc/wp-content/uploads/2024/04/Reference-Document-HS-2022-2026-1.xlsx

Refs: 、。原本 `hs28-esa-sc.xlsx`。WCO導入状況表のSeychelles行130（PDF7ページ）はHS2022欄2022-07-01を示す。書類・免許・国内税の判断には用いない。

## MU：モーリシャス（3ルール）

MRA現行案内から2026-10-01版の統合品目表を取得。通常転送は途中で切断されたため、同じ公式URLへのHTTP Rangeで各部分を取得・Content-Rangeと長さを検証して完全な17,002,440 bytesを復元。PDF全810ページが読取可能で、表紙がHS2022版・2026-10-01を明示。PDF65ページ（印刷66）の3状態を照合した。

https://www.mra.mu/index.php/customs1/tariff-information

https://www.mra.mu/download/TariffInf011026.pdf

Refs: （公式現行案内）。原本 `hs28-esa-mu.pdf`。原表は案内用であり最新法令のみが権威を有すると自ら限定する。HS6候補に限定し、当局・税率・特恵・国内細分を確定しない。

## WCO補足出典

MU・SCのHS2022採用欄を、2026-07-23実施状況表で補足照合（MU97行2022-01-01、SC130行2022-07-01）。同表は透明性のための参照で法的・公式な適用認定効力がない旨を明記。該当国自身の品目表と併用し、単独で商品分類を作らない。

https://www.wcoomd.org/~/media/WCO/Public/Global/PDF/Topics/Nomenclature/Overview/HS%20Contracting%20Parties/Positions%20of%20CP/Situation_HS.ashx

Refs: 、、。既存IS/SAの同一出典URLとrootで共通IDへ統合可能。

## 今回保留する対象

| 国 | 状態と理由 |
| --- | --- |
| CD | DGDA公式のHS2022採用案内は確認したが、対象商品の公式品目本文が未取得。EAC新加盟を理由に共通表を流用しない。 |
| SS / SO | EAC加盟と具体的なHS2022共通分類の国内実装を同一視せず、国別の採用・実物分類確認を後続へ回す。 |
| ZM | ZRA公式2026年版・2022年版PDFは索引に存在しWCOHS2022採用欄も確認したが、公式本文の取得が503・timeoutのため品目条件の照合を保留。 |
| MZ | 公式2022年法と現行税関法令一覧は確認したが、最新版の動的配布からコーヒーの原表を取得できていない。 |
| ET / DJ | 公的照会先はあるが、今回の時間内にHS版と対象品目本文を揃えていない。 |

これらは未採用や法的な輸入不可を意味せず、候補データに必要な確認が未完了という状態。

## 実装検証

実リポジトリのClassificationCatalogとproposeClassificationで独立に検証する。42正例・210必須属性欠落・210矛盾属性、各fixtureの矛盾パッチを確認。期待HS6、nationalCode=null、eligibleForApproval=false、classificationConfirmed=falseを検証する。全属性を具体条件に限定し、抽出物・粉末・混合品へ流用しない。

---

## europe-mena

# rc.28 Europe / Central Asia / Middle East reference expansion

Checked 2026-11-18 JST. Fragment is fixed at 14 countries, 19 source records, 41 HS6 candidate rules and 41 fixtures. Shared source records whose URLs already exist in rc.27 (WCO implementation table, Swiss general tariff, Swiss HS2022 revision page) should be merged by the integrator with the verified country scope, not counted as new distinct documents.

Countries: AL, AM, BY, JO, KG, KZ, LI, MD, ME, MK, OM, RS, RU, UA. All examples are pure whole coffee beans. Three conditions (090111, 090121, 090122) are included for every country except UA. Ukraine is deliberately restricted to the two unroasted conditions explicitly described by its official import-control commodity table: 090111 and 090112. No domestic suffix, tariff edition, tax rate, preference or permission is added.

The review interval 2026-11-18–2026-12-18 is internal catalog scope, not legal validity. EU or GCC/SACU membership by itself has not been used to expand countries.

## EAEU: AM / BY / KZ / KG / RU — 15 rules, 2 sources

- Official EEC current common nomenclature index: https://eec.eaeunion.org/comission/department/catr/ett/ . Opened , current modifications through September 2026 are listed, with Decision 80 as the basis.
- Its Chapter 9 link: https://eec.eaeunion.org/upload/files/catr/ett/ru.09_2022_25.04.2022.pdf . Opened ; PDF pages 0–1 show the parent roasting distinctions, 090111/090121/090122, decaffeination states, and bean/national descendants. National rates/descendants are omitted.
- Explicit five-country / HS2022 scope: https://eec.eaeunion.org/upload/files/dep_stat/metadata/classification/%D0%A1%D0%B2%D0%BE%D0%B4%D0%BD%D0%B0%D1%8F%20%D1%82%D0%B0%D0%B1%D0%BB%D0%B8%D1%86%D0%B0%201%20%D1%8F%D0%BD%D0%B2%D0%B0%D1%80%D1%8F%202022.pdf . Opened , PDF page 2 has all five country columns and one shared TN VED EAEU cell based on HS2022 / CN2022. This is actual shared-classification scope, not a membership-only extrapolation.
- Five destination rows are references to the same common classification. Do not claim five separate product rulings or national effective tax/permit/sanctions eligibility. Kazakhstan's national departures, country-specific measures, sanctions, origin conditions and intra-union movements remain separate.

## Albania AL — 3 rules

- Customs 2026 combined nomenclature: https://dogana.gov.al/dokument/6715/nomenklatura-2026 .  and , PDF page 86, parent coffee headings and the three state/code pairs.
- The 2026-07-23 WCO implementation matrix shows Albania's HS2022 date as 2022-01-01, row 1 / PDF page 1. Source URL below. The official Albanian classification guide also explains HS2017/2022 updates: https://www.dogana.gov.al/d/182/249/0/1464/rregulli-i-origjines-dhe-klasifikimi-sipas-sistemit-te-harmonizuar-hs (, supplementary only).

## Serbia RS — 3 rules

- Current official consolidated 2026 tariff PDF: https://www.carina.rs/upload/media/2026/7/17/70031/Regulation_on_harmonization_of_the_Customs_Tariff_nomenclature_for_the_2026_consolidated.pdf . Web parser size limit, so directly downloaded official PDF, 10,589,275 bytes, 1836 pages. PyMuPDF page 219 (printed 220) contains all three coffee conditions and parent headings. The large FTA/rate columns are omitted.
- Official classification basis: https://www.carina.rs/privreda/tarifski-poslovi/carinska-tarifa/privreda_carinska_tarifa_opste.html .  lines 718–723 expressly identify HS2022 and CN2026. The page update is 2026-11-06.

## North Macedonia MK — 3 rules

- Official workbook: https://customs.gov.mk/content/CT%20%202026.xlsx . Directly downloaded because web cannot parse xlsx; 1,713,912 bytes. `tariff 2026` sheet rows 1963–1969 give the parent heading, unroasted/roasted rows and all three selected states. The header still says Customs Tariff 2025, so the catalog does not claim current rate-year accuracy.
- An existing source-data issue is explicit in terms: code cells use lower-case `o` in place of zero (e.g. `o9o121oooo`). Numeric interpretation was checked against the HS hierarchy and adjacent descriptions; no national suffix is returned.
- HS2022 adoption corroboration is the WCO matrix row 110 / PDF page 6, 2022-01-01 (). Official tariff guide: https://customs.gov.mk/en-GB/pocetna/biznis-zaednica/carinska-tarifa.nspx (, supplementary).

## Montenegro ME — 3 rules

- Live official TARICG parent: https://taric.carina.co.me/TariCG/public/Browse.jsp?pindent=0&ptarifa=0901000000 . .
- Opened actual child branches, current live footer 2026-11-18:
  - https://taric.carina.co.me/TariCG/public/Browse.jsp?ptarifa=0901110000&pindent=1 (): unroasted 090111/090112 and caffeine distinction.
  - https://taric.carina.co.me/TariCG/public/Browse.jsp?ptarifa=0901210000&pindent=1 (): roasted 090121/090122 and caffeine distinction.
- HS2022 version basis: https://www.gov.me/upravacarina/carinska-tarifa . Search  expressly names the 2022 edition in the legal-basis section; direct official HTML was also downloaded and read. The page's annual tariff narrative says 2025, so only its explicit HS2022 basis is used; product state mappings come from live TARICG.
- 2026 export workbook exists in official TARICG regulations (https://taric.carina.co.me/TariCG/public/public/Regulations.jsp) but its linked `https://e-carina.me/taricg/TARICG_EXPORT_16.02.2026..xlsx` returned 503 and was not used. The short 2026 decree PDF alone lacks the actual tariff appendix and is not used for code conditions.

## Moldova MD — 3 rules

- Government statistics classifier index: https://statistica.gov.md/ro/clasificari-si-nomenclatoare-9881.html (). Direct HTML links to the HS2022 DOCX below.
- Official DOCX: https://statistica.gov.md/files/files/Clasificatoare/Nomenclatura_Combinat%C4%83_a_Marfurilor_2022_din_15_12_2022.docx . Directly downloaded (2,126,206 bytes), ZIP/XML parsed; the 0901 table has the parent roasting rows and 090111/090121/090122 state pairs.
- Official import-classification / adoption statement: https://trade.gov.md/ro/articles/nomenclatura-combinata-a-marfurilor-republicii-moldova . Opened , lines 13–15 say the seventh edition adjustment took effect 2023-01-01 and describe use for imports and exports.
- This is an HS2022 baseline, not a consolidated 2026 tariff/rate endorsement. Legis.md itself returned 403, so its unreadable page was not substituted as product-code evidence.

## Jordan JO — 3 rules

- Public official form: https://asytrade.customs.gov.jo/customs/tariff?lang=en (). Direct public POST (read-only search) to `/customs/tariff/search`, fields `tariff=0901`, `keywords=`, `searchMode=ANY`, `_action_searchByTariffKeywords=Search`, returns 200 and the seven coffee code rows.
- Result HTML was saved in `hs28-eumena-raw/jo-result.html`. It explicitly differentiates unroasted nondecaf/decaf, roasted nondecaf (vacuum portions / other), roasted decaf (vacuum portions / other), and husks/substitutes. Only six-digit prefixes are returned; the example is restricted to whole pure beans and does not select the vacuum-packaging suffix.
- The WCO matrix row 76 / PDF page 4 shows HS2022 implementation 2022-01-13 (). No government portal credentials or private data were used.

## Oman OM — 3 rules

- Current national customs PDF: https://www.customs.gov.om/media/gmglqkjb/2026-4.pdf . Official current user-guide index names the 2026 version (https://www.customs.gov.om/en/user-guides/, ). Direct file downloaded, 18,338,590 bytes, 315 pages. PDF pages 21–22 provide the coffee parent heading and three selected state pairs.
- Explicit HS2022 corroboration from Oman's own schedule: https://www.mjla.gov.om/images/legislation/file/Book317360.pdf . Direct official gazette 1636 PDF downloaded, 22,794,887 bytes, 1480 pages. **Annex 2B** at PDF page 637 identifies Oman's tariff commitments; its own column heading at page 638 is HS8 (2022), and page 667 contains 09011100/09012100/09012200. Annex 2A is India's schedule and was not confused with Oman's.
- The treaty annex is used solely to corroborate nomenclature edition, not entry into force, concessions, FTA rates, origin qualification, or permissions. The WCO implementation table leaves Oman unreported; it was not falsely cited as confirmation.

## Liechtenstein LI — 3 rules

- Actual territorial basis, national-government source: https://www.llv.li/de/privatpersonen/mobilitaet-reisen-und-ausland/grenzuebertritt-und-warenverkehr .  lines 4361–4363 expressly state inclusion in the Swiss customs territory and import/export/transit handling under Swiss customs law. EEA-related procedures are distinguished.
- Reuse the rc.27 Swiss commodity source already checked on this same day: https://www.bazg.admin.ch/dam/en/sd-web/T495snjnoiLu/tarif_general.pdf . Previous official PDF verification in hs27-europe.md: PDF page 72 / printed 73 contains all three code and parent-state pairs.
- Edition source: https://www.bazg.admin.ch/de/zolltarif-aenderungen-2022 (). The new LI destination uses the verified Swiss classification scope; this is not an EFTA-membership extrapolation. Domestic taxes, exemptions and EEA procedures are not assumed identical.

## Ukraine UA — 2 rules

- Customs published finance-ministry import-control order 352/2025: https://customs.gov.ua/documents/pro-zatverdzhennia-pereliku-dokumentiv-ta-abo-vidomostei-iaki-neobkhidno-podati-derzhavnii-sluzhbi-ukrayini-z-pitan-bezpeki-kharchovikh-produktiv-ta-zakhistu-spozhivachiv-dlia-zdiisnennia-vidpovidnogo-zakhodu-561 . Opened . Lines 140–142 explicitly describe unroasted caffeinated coffee 090111 and unroasted decaffeinated coffee 090112 as import-control commodity rows. This supports the two narrow HS6 references, not permissions or an exhaustive tariff schedule.
- Edition basis: https://customs.gov.ua/news/zagalne-20/post/zakon-ukrayini-no-2697-ix-pro-mitnii-tarif-ukrayini-nabiraie-chinnosti-z-1-sichnia-2023-roku-1016 (, ): UKTZED is based on HS2022, with Law2697 entering operation 2023-01-01.
- Rada's full tariff returned timeout/503. Roasted detailed conditions were not verified from a usable official source, so no 090121/090122 rule is fabricated for UA.

## WCO shared reference

https://www.wcoomd.org/~/media/WCO/Public/Global/PDF/Topics/Nomenclature/Overview/HS%20Contracting%20Parties/Positions%20of%20CP/Situation_HS.ashx . Opened  and directly downloaded as `hs28-eumena-raw/wco.pdf`. The 2026-07-23 version's introduction explicitly says it is a transparency reference without legal or official status. Only AL, MK and JO are scoped to this new record, based on the actual implementation cells. EAEU scope/edition, Oman, Montenegro, Moldova and Liechtenstein have different official evidence.

## Deferred / excluded investigation results

These are research outcomes for the rollout backlog, not candidate approvals:

- AZ: official full decree HTML is about 58MB and repeatedly returned 503; WCO HS2022 cell is TBD. Existing private tariff-pack labels alone are insufficient. Defer until direct edition and product text can be read.
- BA: HS2022 implementation is confirmed by WCO and the 2026 decision's official index exists, but the full national tariff PDF returned 503/timeout. Neither a rate summary nor an EU-like structure was used to manufacture product rules.
- BH: official tariff-finder endpoint and government service page found. The e-copy service requires payment/login and code text was not obtained in this batch. No purchase or credential flow was attempted.
- KW: official PAI workbook https://www.pai.gov.kw/documents/d/guest/tariffschedule was downloaded (2,086,434 bytes); sheet title says 2022 and coffee codes match, but a sufficiently direct explicit HS2022 adoption/correlation basis was not obtained. WCO cell is unreported. Defer rather than infer from 2022 publication year or another GCC state's tariff.
- QA: official 2024 decree98 PDF explicitly refers to HS2022 in the official search index, but direct retrieval repeatedly returned 502/503 and the actual coffee rows could not be read. Earlier decree43/2022 is repealed; it was not presented as current.
- LB: WCO HS2022 is TBD, national tariff endpoint fails, older food-control PDF is 2021 and not a HS2022 product reference. Defer.
- GE: official nomenclature search endpoint was located from the prior work, but the existing published baseline only covers selected other headings, not coffee; further direct lookup is needed. No 0901 rules inferred.
- IL: national Customs Book exists and prior selected goods are known, but HS2022 edition/product details were not sufficiently checked in this batch. Defer.
- TR: official 2026 code table was available in earlier research and the government statistics HS2022 classifier exists. The direct link from that statistical classifier to the current national tariff remains insufficiently verified. No rule added solely from generic global HS2022 or third-party explanations.

## Validation and outputs

`check-hs28-europe-mena.mjs` loads the fragment with the repository's actual ClassificationCatalog and proposeClassification. 533 assertions/probes passed: 41 positive cases, all 205 individual required-attribute omissions, all 205 incompatible attributes, and direction/edition rejection per case. Every positive returns the expected HS6, nationalCode=null, eligibleForApproval=false, no missing attributes.

Files ready for integration:

- `hs28-europe-mena.json`: sources/rules
- `hs28-europe-mena-cases.json`: 41 independent complete-product fixtures plus wrong-attribute patch
- `hs28-europe-mena.md`: this provenance/limitations record

Downloaded original documents remain research-only temporary files and must not be copied wholesale into the public repository. Shared repository code was not modified.

---

## asia-pacific

# rc.28 Asia-Pacific verified HS6 candidate references

Confirmed 2026-11-18 JST. **13 countries/territories, 21 source records, 39 rules**, all import-only HS2022 references. Each country has the three restricted examples 090111 (unroasted/non-decaffeinated), 090121 (roasted/non-decaffeinated), and 090122 (roasted/decaffeinated). The product must be pure whole coffee beans, not mixtures, grounds, extract, husks or substitutes. National suffixes, rates, preferential origin, import permits and shipping/assignment approvals are not supplied. Source date ranges are the internal catalog review period (2026-11-18–2026-12-18), not statutory validity.

Shared repository files were not edited. Integration files are `hs28-asia-pacific.json` and `hs28-asia-pacific-cases.json` in the parent scratch directory.

## Verification by country

PDF page numbers below are zero-based, allowing exact comparison with the research files. All code-table PDFs except the New Caledonia 2023 table were directly downloaded again from official URLs; New Caledonia's 2023 code table was read with the web PDF parser. The NC adoption notice was downloaded and visually read because it is an image PDF. Raw documents and extracted text are temporary research files, not material to publish in the repository.

| Country | Official code source | Directly checked location and HS edition evidence | Limits |
| --- | --- | --- | --- |
| BD | https://nbr.gov.bd/uploads/tariff_schedule/Chapter_9.pdf | PDF p0, parent roasting headings and 3 code prefixes. WCO 2026-07-23 table row12 confirms HS2022 implementation 2022-07-01. | The chapter PDF does not itself prove a current fiscal year; only nomenclature/code description is reused. |
| PK | https://download1.fbr.gov.pk/Docs/20268251181330180Tariff-2026-27.pdf | 345-page official FY2026/27 PDF p22, all three descriptions. Official FBR adoption note https://www.fbr.gov.pk/Budget2022-23/SalientFeatures/Salient-Feature.pdf p0 expressly identifies HS2022 adoption effective July2022. | Do not infer national PCT selection or any taxes/concessions. WCO's blank PK HS2022 cell is not treated as non-adoption; the national notice is used instead. |
| NP | https://giwmscdnone.gov.np/media/files/%E0%A4%8F%E0%A4%95%E0%A5%80%E0%A4%95%E0%A5%83%E0%A4%A4%20%E0%A4%AD%E0%A4%A8%E0%A5%8D%E0%A4%B8%E0%A4%BE%E0%A4%B0%20%E0%A4%AE%E0%A4%B9%E0%A4%B8%E0%A5%81%E0%A4%B2%20%E0%A4%A6%E0%A4%B0%E0%A4%AC%E0%A4%A8%E0%A5%8D%E0%A4%A6%E0%A5%80%20%E0%A5%A8%E0%A5%A6%E0%A5%AE%E0%A5%A9%E0%A5%A4%E0%A5%A6%E0%A5%AE%E0%A5%AA_qv4xx54.pdf | 683-page FY2083/84 PDF p46: Devanagari item numbers and Nepali roasting/decaf descriptions. WCO row105 confirms HS2022 implementation 2022-05-29. | Separate total tax/other duty/VAT columns were not copied. |
| LK | https://www.customs.gov.lk/wp-content/uploads/2026/11/Tariff%20Guide%20%20Updated%2003.11.2026/3.Tariff%202022%20Section%20II%20Final%20Printable%20(Chapter%206-14)/Tariff%202022%20Section%20I%20Final_Chap_09.pdf | Chapter9 PDF p0 for three code descriptions. Official 2026 preamble p1 and p8 explicitly identify HS2022: https://www.customs.gov.lk/wp-content/uploads/2026/11/Tariff%20Guide%20%20Updated%2003.11.2026/1.%20Preamble/Preamble%20intergrated.pdf | Official guide itself says it is not a legal document; relevant laws/gazettes remain authoritative. |
| BT | https://ecms.gov.bt/frontend/images/publication/1757981817158149.pdf | 493-page PDF cover identifies seventh edition2022; preface says it reproduces international HS six-digit nomenclature. p45 has three coffee classes. Current official index https://ecms.gov.bt/publication/btc-and-tariff-schedule labels the download as 2022 edition (amended2026). | Use the base 2022 nomenclature, not a claim of fully consolidated current tax rates or all 2026 changes. WCO's blank2022 cell is not interpreted negatively. |
| FJ | https://frcs.org.fj/files/2026/09/HS-2022-with-2026-2027-Budget-Amendments.pdf | 882-page official download p68, three descriptions and parent headings. Official FRCS HS2022 publication index https://frcs.org.fj/our-services/customs/trade-business/customs-tariff/hs/ identifies the named HS2022/2026–27 publication. | Some index controls are dynamic; large PDF was fetched directly (33,071,589 bytes). Tax columns not copied. |
| PG | https://customs.gov.pg/uploads/HS%202022%20Import%20%26%20Export%20Tariff%20Act.pdf | 322-page official PDF p33 for the three coffee classes (green bean and roasted branches). The publication is labelled HS2022 by the tax authority URL; WCO row116 reports HS2022 implementation 2023-01-01 as a supplemental system-version check. | The PDF contains historical2022 rate columns and an older Act header. This is a baseline nomenclature reference, not confirmation of present rates or statutory commencement dates. |
| VU | https://vanuatucustoms.gov.vu/images/Customs_Tariff/HS2022_English_Version_Final_V4.pdf | 570-page official PDF p0 explicitly identifies HS2022; p61 has three coffee descriptions/parents. | Only classification description; no fiscal/excise/VAT assertions. |
| PW | https://bcbp.pw/wp-content/uploads/2024/02/PALAU-HS2022.pdf | 592-page official PDF p0 explicitly identifies HS2022; p63 has three coffee descriptions/parents. | No assertion of zero duty, PGST or permit applicability. |
| CK | https://www.mfem.gov.ck/_files/ugd/dbdf40_02d6ca6a6ae54d3fbd45b2d4cce2cf23.pdf | 468-page official linked PDF p50 shows three code descriptions. MFEM notice https://www.mfem.gov.ck/post/cook-islands-customs-tariff-hs2022 explicitly identifies this linked file as the approved HS2022 tariff (notice published Dec2025). | The website also retains HS2017 materials; only the HS2022-linked PDF is used. No concession or tax use. |
| MM | https://customs.gov.mm/wp-content/uploads/2024/10/Customs-Tariff-of-Myanmar-2022-updated19.12.2022.pdf | 789-page official PDF p1 expressly states WCOHS2022 at6digits/AHTN2022 at8digits; p80 has three coffee states and unground branches. | Published2022 base classification, not a consolidated schedule of all later amendments. Large50,479,510-byte PDF was read directly. |
| BN | https://bruneitrade.mofe.gov.bn/wp-content/uploads/2026/02/BDTTC-2022.pdf | 536-page official PDF p49 for three states; p3 identifies BDTTC2022 replacing2017. National customs import guidance https://www.customs.gov.bn/import/ explicitly says imported goods use BDTTC2022 derived from AHTN2022. | No import duty/excise rates or commodity permit/registration approval. |
| NC | https://douane.gouv.nc/sites/default/files/atoms/files/tarif_des_douanes_mj01012023.pdf | 533-page official2023 table p58 shows parent headings and whole-bean branches for all three states. Edition proof: https://douane.gouv.nc/sites/default/files/atoms/files/doc310122-31012022105934.pdf p0, visually read, says the new tariff conforms to WCO amendments under SH2022 and took effect Feb2022. | The2023 baseline is not a fully updated2026 domestic tariff. French/EU tariff coverage is not automatically reused; this is NC's own table. |

## Shared WCO reference

URL: https://www.wcoomd.org/~/media/WCO/Public/Global/PDF/Topics/Nomenclature/Overview/HS%20Contracting%20Parties/Positions%20of%20CP/Situation_HS.ashx

The 23July2026 table is used only for BD/NP/PG edition corroboration. Rows12 (BD),105 (NP),116 (PG) were actually read under the HS2022 implementation column. WCO expressly says the table has no legal or official status. It is not a source for coffee product descriptions, import rates or entitlement. Parent integration may merge this source with existing WCO records sharing the exact URL and expand only the verified country scope.

## Primary retrieval references

- WCO table: , ; BD row12, NP/PG rows on p6.
- PK adoption:  (p0). Code PDF downloaded and extracted independently.
- LK official chapter: /; preamble .
- BT official index/PDF: , , .
- FJ official index: ; official PDF downloaded/extracted.
- PG: ; official PDF downloaded/extracted.
- CK publication and actual PDF link: /.
- BN: , , .
- NC table: /. NC adoption original525055-byte imagePDF was downloaded with `?download=1` and displayed locally (`hs28-ap-nc-proof-0.png`), not inferred from the filename.

The research retrieval IDs above are for internal cross-checking and should not be copied into end-user documentation.

## Deferred countries/territories and why

- **LA**: official current nomenclature page explicitly identifies AHTN2022 (https://www.laotradeportal.gov.la/en-gb/site/searchcommodity), but product hierarchy content was absent from the fetched page and direct HTML retrieval403. Individual valid product pages showed rate rows but not a reliable complete code-description hierarchy. ASEAN's current country-specific AHTN2022 annex index was found but its documents could not be retrieved in this environment. Wait for the actual domestic/official regional product text; no foreign national table substitution.
- **KH**: national customs statistics methodology explicitly identifies HS/AHTN2022 from January2022 (https://stats.customs.gov.kh/en/archives/methodology). National2022 publication page is dynamic and did not expose the table in this environment; the FTA product-search page was JavaScript-only, its script retrieval failed403, ASEAN annex access403. Wait for actual national/current official regional product text.
- **MV**: WCO2022 adoption is explicit, but official tariff search https://www.customs.gov.mv/eServices/findtariff returned an access/payment-wall error to retrieval; three product descriptions were not verified. No catalog rules fabricated.
- **WS**: current official rates/manual page https://customs.gov.ws/rates/ still labels the index as HS2017. A2022 Act amendment alone does not prove a complete HS2022 classification. Await validated HS2022 source.
- **MN**: WCO2022 adoption is explicit, but no current domestic coffee hierarchy was obtained in this batch. Older2018/compiled foreign references are not silently promoted.
- **SB**: identified2022 government amendment document is selected items only; did not obtain a complete HS2022 coffee base schedule in this batch.
- **TO, KI, TV, NR, MH, FM, NU, PF**: not fully reviewed in this batch. No inference from parent-state or neighbouring-country classifications. Leave as pending official-source acquisition, not as unsupported-by-law or code-confirmed.

## Local engine validation

`hs28-ap-check.mjs` constructs a real `ClassificationCatalog`, then tests every rule: positive expectedHS6/no national code/no approval, every required attribute omitted independently and returned as a question, every condition replaced by an incompatible value and excluded. With13countries/39rules, **429 checks** pass (39positive +195omission +195contradiction). Shared source/catalog/schema implementation files are untouched.

---

## products

# rc.28 商品群拡張：カナダ限定の15商品分類

2026年11月18日JSTに確認。`hs28-products.json` は14出典・15ルール、`hs28-products-cases.json` は15例。既存の15種類に含まれないHS6を15種類追加するための断片です。今回の品目資料はカナダCBSAのものに限定し、他国向けの分類へ流用しません。全ルールはHS2022・import・未承認HS6候補です。国内細分、税率、特恵、輸入許可、安全適合、発送可否は実装していません。

## HS版の裏付け

- 公式CN21-19: https://www.cbsa-asfc.gc.ca/publications/cn-ad/cn21-19-eng.html
- 本文1項・5項はカナダのHS2022適用が2022年1月1日であることを明示。 の25・34行で確認。
- この通知は分類体系の補足資料です。品目の現行記述は下記T2026-2の各章の親項目、HS6の枝分かれ、関連注を実際にopen/findして確認しました。
- 参照日と内部期間は2026-11-18〜12-18です。法令の法的有効期間の宣言ではありません。

## 公式品目資料と製品条件

| HS6 | 狭めた商品例 | 公式章・確認箇所 | 主な境界条件 |
| --- | --- | --- | --- |
| 610910 | 成人用・綿100％の半袖編物Tシャツ | 第61類290行、注5・6は52〜57行 | 裾に締め付けなし、襟・首からの開きなし、乳幼児用・混紡・織物・組物は除外 |
| 630231 | 綿100％の無地織物ベッドシーツ | 第63類63〜74行 | 編物・プリント寝具・詰め物入り寝具・中古ばら積み・寝具セットは除外 |
| 490199 | 文章を主体とする紙の製本小説 | 第49類53〜56行、注5・6は42〜43行 | 一枚物・辞書百科事典・絵中心の児童絵本・広告主体・定期刊行物・電子書籍を除外 |
| 960810 | 通常筆記用の完成ボールペン単品 | 第96類130〜131行 | ボール式、替え芯・他方式・化粧医療用・別機能内蔵・セットは除外 |
| 960820 | 通常筆記用の完成フェルト芯マーカー | 第96類133〜140行 | 多孔質先端、ボール式・化粧医療用・部品・複合品・セットは除外 |
| 960910 | 木軸に黒鉛芯を固定した鉛筆 | 第96類170〜174行 | 繰出し式・替え芯・化粧用・組物は除外 |
| 851830 | 一般音声鑑賞用の有線ヘッドホン | 第85類621〜627行 | 補聴器・無線・プレーヤー内蔵品・部分品・機器セットは除外 |
| 441912 | 竹だけの完成した食卓用箸一対 | 第44類390〜392行 | 他木材・複合材・被覆・調理用具・食器セットは除外 |
| 732393 | 非電気式・ステンレス製家庭用片手鍋 | 第73類716〜727行 | 鋳鉄・複合材・電気式・工業実験用・部分品・組物は除外 |
| 392410 | ポリプロピレン製再使用食卓皿 | 第39類496〜518行 | 普通の家庭用、包装容器・複合材・電気機能・組物は除外 |
| 650500 | 綿100％の完成したニット帽 | 第65類45〜59行 | 保護ヘルメット・帽体材料・中古ばら積み・組物は除外 |
| 660191 | 伸縮軸の手持ち雨傘 | 第66類38〜43行 | 固定軸・据置き庭園ビーチ用・部分品・組物は除外 |
| 950300 | 木製の遊戯用ジグソーパズル | 第95類107行と親項目 | 電動電子機構・実用品の組立部材・別ゲームとの複合品を除外 |
| 401692 | 非発泡・非硬質の加硫ゴム製鉛筆用消しゴム | 第40類229〜240行、ゴム定義は注1・4 | PVC等の樹脂製・硬質ゴム・発泡ゴム・鉛筆一体品・セットは除外 |
| 482020 | 紙製・製本済みの学習記入用練習帳 | 第48類393〜396行、注10・12は90〜93行 | ばら紙・本文/問題等の印刷教材・一般ノート/日記/帳簿・文具セットは除外 |

各章の公式URL:

- 第39類: https://www.cbsa-asfc.gc.ca/trade-commerce/tariff-tarif/2026/html/02/ch39-eng.html
- 第40類: https://www.cbsa-asfc.gc.ca/trade-commerce/tariff-tarif/2026/html/02/ch40-eng.html
- 第44類: https://www.cbsa-asfc.gc.ca/trade-commerce/tariff-tarif/2026/html/02/ch44-eng.html
- 第48類: https://www.cbsa-asfc.gc.ca/trade-commerce/tariff-tarif/2026/html/02/ch48-eng.html
- 第49類: https://www.cbsa-asfc.gc.ca/trade-commerce/tariff-tarif/2026/html/02/ch49-eng.html
- 第61類: https://www.cbsa-asfc.gc.ca/trade-commerce/tariff-tarif/2026/html/02/ch61-eng.html
- 第63類: https://www.cbsa-asfc.gc.ca/trade-commerce/tariff-tarif/2026/html/02/ch63-eng.html
- 第65類: https://www.cbsa-asfc.gc.ca/trade-commerce/tariff-tarif/2026/html/02/ch65-eng.html
- 第66類: https://www.cbsa-asfc.gc.ca/trade-commerce/tariff-tarif/2026/html/02/ch66-eng.html
- 第73類: https://www.cbsa-asfc.gc.ca/trade-commerce/tariff-tarif/2026/html/02/ch73-eng.html
- 第85類: https://www.cbsa-asfc.gc.ca/trade-commerce/tariff-tarif/2026/html/02/ch85-eng.html
- 第95類: https://www.cbsa-asfc.gc.ca/trade-commerce/tariff-tarif/2026/html/02/ch95-eng.html
- 第96類: https://www.cbsa-asfc.gc.ca/trade-commerce/tariff-tarif/2026/html/02/ch96-eng.html

## 本文の取得参照

- CN21-19と第61/63/49/96/85類: 〜
- 第44/73/39/65/66/95類: 〜
- 第61類の品目と裾/乳幼児注、第63/96/85類該当行: 〜
- 第44/73/39/65/66/95類の該当コード行: 〜
- 第40/48類: ・
- 消しゴム/練習帳と紙の関連注: 〜

## 検証

`check-hs28-products.mjs` は既存131ルールと新15ルールを結合した実際の `ClassificationCatalog` で検証しています。

- 15正例すべてで期待HS6の候補を取得、国内細分null、承認可否false、不足属性なし。
- 全必須属性104件を一つずつ削除し、該当候補の不足属性と質問を確認。
- 全条件104件を一つずつ矛盾値へ変更し、該当ルールが候補から除外されることを確認。
- fixtureの個別矛盾パッチもすべて除外されることを確認。

共有リポジトリは変更していません。断片はこの内容で固定です。

---

## territories

# rc.28 正式な共通関税法域に基づく地域追加

2026-11-18 JST確認。11国・地域、22ルール、10出典レコード（うち4件は既存EU/US出典と同一URLの適用先別レコード）。共有リポジトリは変更しない。rootで同一URLの出典を共通化する際、各対象国・地域のscopeを保持しcountry集合を拡張できる。

## 追加範囲と方法

| 追加先 | 商品例 | 根拠 |
| --- | --- | --- |
| AX GF GP MQ RE YT MF MC | 既存EU2例（691110・630790） | EU関税法典第4条＋現行欧州委員会の地域適用表 |
| AD | 既存EU2例（691110・630790） | EU–AD関税同盟のHS25〜97類と現行EU税関法採用 |
| SM | 既存EU2例（691110・630790） | EU–SM協力関税同盟協定第2条・第7条＋現行委員会表 |
| PR | 既存US2例（961700・691200） | 米国関税領域に含まれHTSUSを使用する旨の2026年GAO調査本文 |

既存商品条件の`requiredAttributes`・`attributeConditions`・`questions`・`keywords`・HS6は一切変更しない。国ごとの独立した商品調査や新たな国内裁定を取得したとは扱わない。既存の2例を、正式な関税法域または同盟対象範囲へ展開するHS6参考候補であり、国内細分・税率・VAT/物品税・輸入許可・配送可否は追加しない。

MFは仏領Saint-Martinであり、オランダ側Sint Maarten（SX）とは区別する。

## EU関税領域の8地域

現行欧州委員会の地域表:
https://taxation-customs.ec.europa.eu/taxation/vat/vat-directive/how-does-vat-work/territorial-scope_en

公式表の58行にÅland、61行にGuadeloupe/French Guiana/Martinique/Réunion/Mayotte/Saint-Martin、100行にMonacoの関税適用を確認した。前2群はVAT・物品税の適用欄が別であり、customsの適用をVAT等へ流用しない。Monacoはフランスの領域として関税を適用する。refs:  /  / 。

EU関税法典952/2013第4条（公式統合本文）:
https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:02013R0952-20221212

フランス領域（TFEU第4部対象のOCTを除く）、フィンランド領域、モナコを確認。地域の実際の範囲は上の現行委員会表で個別に補足する。条文にある別領域全体へ無条件に展開しない。フランスの海外領域を一括同一扱いせず、今回確認した6地域だけに限定する。ÅlandもVAT適用とは分離。refs: /1 / 。

## アンドラ（AD）

現行委員会案内:
https://taxation-customs.ec.europa.eu/andorra-customs-unions-and-preferential-arrangements_en

1990年協定の現行統合本文（2016-01-01、EUR-Lexがin force表示）:
https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:01990A1231(02)-20160101

第2条は関税同盟対象をHS25〜97類とし、第7条は対象商品の輸入手続・現行のEU税関法規の採用を定める。現行委員会案内も同じ範囲、関税の外部側面、関税規定採用を説明している。対象2例は63類/69類なので範囲内である。農産物1〜24類や原産地特恵、関税免除は流用しない。第10条は保護措置等の規定であり、分類展開の主要根拠として使わない。refs:  /  /  / /1。

## サンマリノ（SM）

正式な協力関税同盟協定（暫定協定ではない2002年公布の正文）:
https://eur-lex.europa.eu/eli/agree_internation/2002/245/oj/eng

第2条でHS1〜97類のうちECSC対象品を除く関税同盟を確認。第7条で現在のCommon Customs Tariffと必要な税関規定を採用することを確認した。EUR-Lexは協定をin forceとし、現行統合版2008-02-01への導線を表示する。統合版への一部直接取得はbot確認表示になるが、正文の第2/7条本文と現行欧州委員会地域表（SMは関税をItaly扱い）を併用した。今回対象の63類/69類はECSC対象ではない。独立裁定取得や各国での個別拘束力の確認を示さない。refs:  /  /  / 。

## プエルトリコ（PR）

米GAOの2026年3月18日付（4月17日一般公開）報告書:
https://files.gao.gov/reports/GAO-26-107811/index.html

本文197〜211行と表1は、PRが米国関税領域に含まれ、CBPが米国商品区分とHTSUSを使用して関税を徴収することを明記する。脚注17は19 CFR101.1を引き、米関税領域が州・DC・PRから成ることを説明する。米関連領域でもGuam/USVI等は異なるため展開しない。refs:  / 。

USITC自身の2026年資料の公式検索索引でも、General Notes1/2が関税領域とPRの包含を明記することを補足確認した:
https://learning.usitc.gov/hts-docs/documents/finalCopy.pdf

このPDFは133MBで、ブラウズ本文のサイズ上限に当たるため補足参照に留め、新規catalog sourceには入れない。PRの関税領域・HTSUS適用の現行確認は上記2026年GAOの取得できた本文を根拠とする。refs:  / 。

## 既存の品目根拠

- EUボーンチャイナ皿: https://eur-lex.europa.eu/eli/reg_impl/2023/1420/oj/eng
- EU未充填クッション用シェル: https://eur-lex.europa.eu/eli/reg_impl/2024/3133/oj/eng
- US真空保温容器: https://hts.usitc.gov/search?query=961700
- USせっ器カップ: https://hts.usitc.gov/search?query=6912.00

いずれも既存カタログで根拠と条件を確立した2例の正確な展開。今回の小バッチで新たな商品条件を作っていない。source.countriesは追加先だけに設定し、既存国を暗黙に拡張しない。root統合時に元sourceと同一URLを共通化することを想定する。

## 検証

hs28-territories-check.mjsで、全22正例・181必須属性欠落・181条件矛盾、全例の輸出/HS2017不一致、国内税番承認拒否を検証しすべて成功。各ルールはnationalCodeなし・eligibleForApproval=false。元ルールの製品条件と完全一致することも別途機械比較した。

確認日2026-11-18と2026-12-18の再確認期限は候補検索用の内部期間であり、法令の施行期間ではない。
