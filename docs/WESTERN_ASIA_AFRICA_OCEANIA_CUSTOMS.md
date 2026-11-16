# 西アジア・アフリカとオセアニア・島しょ地域の通関

以下の集計は、過去版のデータ同梱配布物の記録です。GitHub公開版からは公的照会先と通関案内を確認できます。

第5回は共通税表・国別例外・輸入許可、第6回は島ごとの税関領域、検疫・保護区域、書類の提出先と受付条件を扱います。集計の税表・別表・照会条件は2026年11月12日指定です。

| 範囲 | 台帳 | 公的資料で手続または領域を確認 | 標準税表・品目別税率資料 | 別表 | 構造化した輸入・書類条件 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 第5回 西アジア・アフリカ | 78 | 67 | 21 | 8 | 15 |
| 第6回 オセアニア・島しょ地域 | 29 | 24 | 8 | 7 | 9 |

共通対外税表と一部品目の税率資料を集計に含めています。EACは5カ国の指定品目と例外、ジョージアは税法第197条の明示134コード、ソロモン諸島は石油製品10品目を収録しました。実際の税率は原産地・用途・輸入日・対象国の特例や追加措置を照合してください。

## 共通税表と国別例外

- SACUは共通対外税表を参照します。加盟国間の移動は、域内流通の証拠と仕向国の保健・動植物等の制限を確認する手続に回します。 [SACU協定18～19条](https://www.sacu.int/uploads/documents/6a7ae39b41cba945b083e93a2e1a103d7cee629c.pdf)
- EACとECOWASは公表税表と国別措置を照合します。EACの一部国別収録では、同じ品目番号でも税率や従量条件が異なる行を区別します。地域名だけで適用税率を決めず、収録版の国別条件を使います。ECOWASから離脱した国の扱いは公的な経過措置・現地案内に照合します。 [EAC官報 2026年6月30日](https://www.eac.int/documents?controller=download&file=a3c7fa5a-b765-48ed-befa-b6b65bf5b3cc&name=EAC+Vol.+AT+1+NO.+16+JUNE+2026.pdf.pdf&task=download.file) ・ [ECOWAS経過措置](https://www.ecowas.int/press-statement-2/)
- GCCでは、最初の入域地の申告・納税証拠と最終仕向地の規制を照合します。域内移動で関税を重複計上しないために共通領域の確認に回します。禁止・制限品、検疫、特恵は国と貨物の条件を確認します。 [GCC関税同盟と最初の入域地点](https://icp.gov.ae/en/customs-union-for-gcc/)
- 南アフリカでは指定の8桁品目にITAC輸入許可の確認を出します。サウジアラビアはFasahへの商業申告と、販売用食品のSFDA登録・審査を区別します。 [南アフリカSARSの品目一覧](https://www.sars.gov.za/latest-news/updated-prohibited-and-restricted-imports-and-exports-list-14/) ・ [サウジSFDAの食品通関要件](https://www.sfda.gov.sa/sites/default/files/2025-04/ConditionsRequirementsFoodClearanceE.pdf)

## 島しょの受付条件

- 豪州本土のBICON、海上コンテナの梱包申告、クリスマス島・ココス諸島・ノーフォーク島の個別手続を区別します。豪州本土発でも、外部領土ごとに税関上の扱い、検疫、搬入条件を確認します。 [豪州ABF税関通知2026/11](https://www.abf.gov.au/help-and-support-subsite/CustomsNotices/2026-11.pdf) ・ [DAFF外部領土](https://www.agriculture.gov.au/import/goods/external-territories)
- ニュージーランドの輸入手続はTSWを案内し、海上コンテナでは検疫申告とMPIのBACC手続を案内します。ハード島・マクドナルド諸島などの保護区域は活動許可と受入れの個別照会を表示します。 [NZ MPIのコンテナ・貨物手続](https://www.mpi.govt.nz/import/border-clearance/containers-and-cargo-border-clearance/steps-to-importing-containers-and-cargo) ・ [HIMI環境承認](https://www.antarctica.gov.au/antarctic-operations/stations-and-field-locations/heard-island/protection-and-management/permits/)

## 方向・貨物別の照会

- 方向照会の `destinationImportControls` に品目・輸送・提出先の条件を表示します。通関計画の `importIntake` は貨物情報に合う条件と不足書類を表示します。品目番号が途中までの場合は、まず分類を確認します。
- `availableDocuments` で渡された書類種別は `reported_present` として表示します。実際の書類の内容、荷物との対応、当局の受理は担当者が確認します。 `acceptanceConfirmed` は `false` です。

```sh
npm run cli -- worldwide-coverage 2026-11-12
npm run cli -- customs-plan examples/customs-plan-za-itac.json
```

## 仕向地別の収録状況

| コード | 仕向地 | 手続・領域 | 標準税表 | 輸入・書類条件 | 公的資料 |
| --- | --- | --- | --- | --- | --- |
| `AE` | アラブ首長国連邦 | 手続・領域を確認 | 別日版あり | あり | [公的資料](https://www.dubaicustoms.gov.ae/en/OpenData/Publications/DubaiCustomsServiceGuide2025_V09.pdf) |
| `AM` | アルメニア | 手続・領域を確認 | 公表税表 | — | [公的資料](https://eec.eaeunion.org/comission/department/catr/ett/) |
| `AO` | アンゴラ | 手続・領域を確認 | 確認待ち | — | [公的資料](https://pice.gov.ao/como-funciona) |
| `AZ` | アゼルバイジャン | 手続・領域を確認 | 公表税表 | — | [公的資料](https://e-qanun.az/framework/37035) |
| `BF` | ブルキナファソ | 手続・領域を確認 | 確認待ち | — | [公的資料](https://douanes.bf/sydoniabf/files/codeDGD.pdf) |
| `BH` | バーレーン | 手続・領域を確認 | 確認待ち | あり | [公的資料](https://www.bahrain.bh/wps/portal/en/BNP/ServicesCatalogue/GSX-UI-PServiceDetails?psID=1318) |
| `BI` | ブルンジ | 手続・領域を確認 | 共通表・確認品目 | — | [公的資料](https://www.eac.int/documents?controller=download&file=a3c7fa5a-b765-48ed-befa-b6b65bf5b3cc&name=EAC+Vol.+AT+1+NO.+16+JUNE+2026.pdf.pdf&task=download.file) |
| `BJ` | ベナン | 手続・領域を確認 | 公表税表 | — | [公的資料](https://douanes.gouv.bj/tarif-douane/) |
| `BW` | ボツワナ | 手続・領域を確認 | 公表税表 | あり | [公的資料](https://www.sars.gov.za/legal-counsel/primary-legislation/schedules-to-the-customs-and-excise-act-1964/) |
| `CD` | コンゴ民主共和国 | 手続・領域を確認 | 確認待ち | — | [公的資料](https://douane.gouv.cd/les-procedures-douanieres/les-procedures-de-dedouanement-a-limportation-en-rdc%EF%BF%BC/) |
| `CF` | 中央アフリカ共和国 | 手続・領域を確認 | 確認待ち | — | [公的資料](https://finances.gouv.cf/projet/16/e-douanes) |
| `CG` | コンゴ | 手続・領域を確認 | 確認待ち | — | [公的資料](https://guot.cg/docs/GUIDE%20UTILISATEUR%20CONSULTGUOT.pdf) |
| `CI` | コートジボワール | 手続・領域を確認 | 公表税表 | あり | [公的資料](https://www.douanes.ci/info/tec) |
| `CM` | カメルーン | 手続・領域を確認 | 確認待ち | — | [公的資料](https://www.douanes.cm/douanes-cameroun/wp-content/uploads/2022/09/Procedure-dedaounement-imposition-ok.pdf.pdf) |
| `CV` | カーボヴェルデ | 公的照会先 | 確認待ち | — | [公的資料](https://www.mf.gov.cv/web/dnre/direca-geral-das-alfandegas) |
| `CY` | キプロス | 手続・領域を確認 | 公表税表 | — | [公的資料](https://eur-lex.europa.eu/eli/reg_impl/2025/1926/oj/eng) |
| `DJ` | ジブチ | 手続・領域を確認 | 確認待ち | — | [公的資料](https://douanes.gouv.dj/wp-content/uploads/2024/06/guide_nouveau_onglet_docs_scannes_SW_v1.0.pdf) |
| `DZ` | アルジェリア | 手続・領域を確認 | 確認待ち | — | [公的資料](https://www.commerce.gov.dz/fr/questions-frequentes/collection/controle-amp-repression-des-fraudes?page=6) |
| `EG` | エジプト | 手続・領域を確認 | 確認待ち | あり | [公的資料](https://www.nafeza.gov.eg/web/m/docs-7442175c9c80264cbb76d7b4c8484a2622478bc9a3e7e8f327cee238.pdf?down=) |
| `EH` | 西サハラ | 公的照会先 | 確認待ち | — | [公的資料](https://mcinet.gov.ma/sites/default/files/avis%20aux%20imporatteurs.GUERGARATE-1%20Fr.pdf) |
| `ER` | エリトリア国 | 公的照会先 | 確認待ち | — | [公的資料](https://www.wcoomd.org/-/media/wco/public/global/pdf/topics/valuation/resources/contact/contact-point-valuation-matters.pdf) |
| `ET` | エチオピア | 手続・領域を確認 | 確認待ち | — | [公的資料](https://customs.erca.gov.et/traders-guide/) |
| `GA` | ガボン | 手続・領域を確認 | 確認待ち | — | [公的資料](https://douanes.ga/med/pdf/code-des-douanes-juin21-210608020852.pdf) |
| `GE` | グルジア | 手続・領域を確認 | 税法第197条の134コード | — | [公的資料](https://matsne.gov.ge/ka/document/view/1043717?publication=248) |
| `GH` | ガーナ | 手続・領域を確認 | 確認待ち | — | [公的資料](https://gra.gov.gh/customs/import-procedures/) |
| `GM` | ガンビア | 手続・領域を確認 | 確認待ち | — | [公的資料](https://www.gra.gm/download-file/f1319dea-3e38-11f1-b086-029254d29bb1) |
| `GN` | ギニア | 手続・領域を確認 | 確認待ち | — | [公的資料](https://dgd.gov.gn/wp-content/uploads/2024/02/CODE-DES-DOUANESDE-GUINEE.pdf) |
| `GQ` | 赤道ギニア | 公的照会先 | 確認待ち | — | [公的資料](https://unctad.org/system/files/official-document/dtlasycuda2022d1_en.pdf) |
| `GW` | ギニアビサウ | 手続・領域を確認 | 確認待ち | — | [公的資料](https://asycuda.org/en/guinea-bissau-launches-asycudaworld-to-strengthen-customs-digitalization/) |
| `IL` | イスラエル | 手続・領域を確認 | 別日版あり | — | [公的資料](https://www.gov.il/he/service/import_license_economy) |
| `IO` | 英国インド洋領土 | 公的照会先 | 確認待ち | — | [公的資料](https://www.biot.gov.io/wp-content/uploads/The-Imports-Exports-Control-Ord-2009-F.2.pdf) |
| `IQ` | イラク | 手続・領域を確認 | 確認待ち | — | [公的資料](https://asy.mof.gov.iq/) |
| `JO` | ヨルダン | 手続・領域を確認 | 確認待ち | — | [公的資料](https://tradeportal.customs.gov.jo/procedure/2180/step/10194?l=en) |
| `KE` | ケニア | 手続・領域を確認 | 共通表・確認品目 | あり | [公的資料](https://www.eac.int/documents?controller=download&file=a3c7fa5a-b765-48ed-befa-b6b65bf5b3cc&name=EAC+Vol.+AT+1+NO.+16+JUNE+2026.pdf.pdf&task=download.file) |
| `KM` | コモロ | 手続・領域を確認 | 確認待ち | — | [公的資料](https://douane.gov.km/douane-comorienne/pages/importation.php) |
| `KW` | クウェート | 手続・領域を確認 | 確認待ち | あり | [公的資料](https://www.e.gov.kw/sites/kgoenglish/Pages/Services/MOCI/ReleasesCustoms.aspx) |
| `LB` | レバノン | 手続・領域を確認 | 確認待ち | — | [公的資料](https://www.customs.gov.lb/Files/Laws/law_en.pdf) |
| `LR` | リベリア | 手続・領域を確認 | 確認待ち | — | [公的資料](https://revenue.lra.gov.lr/customs-fact-sheet/) |
| `LS` | レソト | 手続・領域を確認 | 公表税表 | あり | [公的資料](https://www.sars.gov.za/legal-counsel/primary-legislation/schedules-to-the-customs-and-excise-act-1964/) |
| `LY` | リビア | 手続・領域を確認 | 確認待ち | — | [公的資料](https://customs.gov.ly/services/customs-declaration) |
| `MA` | モロッコ | 手続・領域を確認 | 確認待ち | あり | [公的資料](https://www.portnet.ma/titre-d-importation) |
| `MG` | マダガスカル | 手続・領域を確認 | 確認待ち | — | [公的資料](https://www.vae.douanes.gov.mg/module-midac) |
| `ML` | マリ | 手続・領域を確認 | 確認待ち | — | [公的資料](https://douanes.gouv.ml/index.php/intentions-dimportation-ou-intentions-dexportation) |
| `MR` | モーリタニア | 手続・領域を確認 | 確認待ち | — | [公的資料](https://www.commerce.gov.mr/fr/?q=node%2F1448) |
| `MU` | モーリシャス | 手続・領域を確認 | 公表税表 | — | [公的資料](https://mra.mu/index.php/customs1/tariff-information) |
| `MW` | マラウイ | 手続・領域を確認 | 確認待ち | — | [公的資料](https://www.mra.mw/assets/upload/downloads/Mandatory_Import_and_Export_Documents.pdf) |
| `MZ` | モザンビーク | 手続・領域を確認 | 確認待ち | — | [公的資料](https://portalcomercioexterno.gov.mz/wp-content/uploads/2023/12/guia-de-exportacao.pdf) |
| `NA` | ナミビア | 手続・領域を確認 | 公表税表 | あり | [公的資料](https://www.sars.gov.za/legal-counsel/primary-legislation/schedules-to-the-customs-and-excise-act-1964/) |
| `NE` | ニジェール | 公的照会先 | 確認待ち | — | [公的資料](https://tfadatabase.org/index.php/fr/members/niger) |
| `NG` | ナイジェリア | 手続・領域を確認 | 公表税表 | — | [公的資料](https://demo-cet.customs.gov.ng/) |
| `OM` | オマーン | 手続・領域を確認 | 公表税表 | あり | [公的資料](https://www.customs.gov.om/en/user-guides/) |
| `PS` | パレスチナ | 公的照会先 | 確認待ち | — | [公的資料](https://www.portal.psc.ps/en/import/category-62) |
| `QA` | カタール | 手続・領域を確認 | 確認待ち | あり | [公的資料](https://www.customs.gov.qa/English/Procedures/UnifiedGuide/Pages/Importation.aspx) |
| `RE` | レユニオン | 手続・領域を確認 | 確認待ち | — | [公的資料](https://www.douane.gouv.fr/demarche/importer-un-bien-dans-un-drom) |
| `RW` | ルワンダ | 手続・領域を確認 | 共通表・確認品目 | — | [公的資料](https://www.eac.int/documents?controller=download&file=a3c7fa5a-b765-48ed-befa-b6b65bf5b3cc&name=EAC+Vol.+AT+1+NO.+16+JUNE+2026.pdf.pdf&task=download.file) |
| `SA` | サウジアラビア | 手続・領域を確認 | 別日版あり | あり | [公的資料](https://zatca.gov.sa/en/RulesRegulations/Taxes/Pages/customs-bussiness/import-pages/Import-Instructions.aspx) |
| `SC` | セーシェル | 手続・領域を確認 | 確認待ち | — | [公的資料](https://www.tradeportal.sc/wp-content/uploads/2024/10/Final-Draft-Import-Guide-2024.pdf) |
| `SD` | スーダン | 公的照会先 | 確認待ち | — | [公的資料](https://web.customs.gov.sd/%D8%A7%D9%84%D8%A7%D8%B3%D8%AA%D9%8A%D8%B1%D8%A7%D8%AF-%D9%88%D8%A7%D9%84%D8%AA%D8%B5%D8%AF%D9%8A%D8%B1/%D8%A5%D8%AC%D8%B1%D8%A7%D8%A1%D8%A7%D8%AA-%D8%A7%D9%84%D9%88%D8%A7%D8%B1%D8%AF/) |
| `SH` | セントヘレナ、アセンション及びトリスタン・ダ・クーニャ | 手続・領域を確認 | 確認待ち | — | [公的資料](https://www.sainthelena.gov.sh/important-reminder-on-customs-procedures-for-imported-goods/) |
| `SL` | シエラレオネ | 手続・領域を確認 | 確認待ち | — | [公的資料](https://www.nra.gov.sl/sites/default/files/Revised%20%20Customs%20Clearance%20Process_0.pdf) |
| `SN` | セネガル | 手続・領域を確認 | 確認待ち | — | [公的資料](https://senegalcommerce.sec.gouv.sn/Documents/DGD/Proc%C3%A9dure/D%C3%A9douanement%20marchandises/Le%20d%C3%A9douanement%20de%20marchandises.PDF) |
| `SO` | ソマリア | 手続・領域を確認 | 確認待ち | — | [公的資料](https://mof.gov.so/sites/default/files/Publications/Standard%20Operating%20Procedures%20on%20the%20Process%20of%20Customs%20Declarations%20Through%20SOMCAS_0.pdf) |
| `SS` | 南スーダン | 手続・領域を確認 | 確認待ち | — | [公的資料](https://ecustoms.nra.gov.ss/customs) |
| `ST` | サントメ・プリンシペ | 手続・領域を確認 | 確認待ち | — | [公的資料](https://guce.gov.st/procedimentos/) |
| `SY` | シリア・アラブ共和国 | 手続・領域を確認 | 確認待ち | — | [公的資料](https://eaip.gaca.gov.sy/public/eaip/SY-AIP-20261028T002236Z-cdec0a9a92c4/section/86) |
| `SZ` | エスワティニ | 手続・領域を確認 | 公表税表 | あり | [公的資料](https://www.sars.gov.za/legal-counsel/primary-legislation/schedules-to-the-customs-and-excise-act-1964/) |
| `TD` | チャド | 手続・領域を確認 | 確認待ち | — | [公的資料](https://douanes.td/e-douane/acces-au-systeme-sydonia-world/) |
| `TF` | フランス南方領土 | 公的照会先 | 確認待ち | — | [公的資料](https://www.legifrance.gouv.fr/codes/section_lc/LEGITEXT000006071570/LEGISCTA000053808277/2026-05-01) |
| `TG` | トーゴ | 手続・領域を確認 | 公表税表 | — | [公的資料](https://anciensite.otr.tg/index.php/fr/documentation/sur-la-douane-togolaise/tarifs-des-douanes.html) |
| `TN` | チュニジア | 手続・領域を確認 | 確認待ち | — | [公的資料](https://www.douane.gov.tn/sinda/) |
| `TR` | トルコ | 公的照会先 | 公表税表 | — | [公的資料](https://ticaret.gov.tr/ithalat/ithalat-mevzuati/ithalat-rejimi-karari-igv-karari-ve-ithalat-tebligleri/1-ithalat-rejimi-kararikarar-sayisi3350karar-metni-ve-tablolar-konsolide-edilmis-olup-gunceldir) |
| `TZ` | タニザニア連合共和国 | 手続・領域を確認 | 共通表・確認品目 | — | [公的資料](https://www.eac.int/documents?controller=download&file=a3c7fa5a-b765-48ed-befa-b6b65bf5b3cc&name=EAC+Vol.+AT+1+NO.+16+JUNE+2026.pdf.pdf&task=download.file) |
| `UG` | ウガンダ | 手続・領域を確認 | 共通表・確認品目 | — | [公的資料](https://www.eac.int/documents?controller=download&file=a3c7fa5a-b765-48ed-befa-b6b65bf5b3cc&name=EAC+Vol.+AT+1+NO.+16+JUNE+2026.pdf.pdf&task=download.file) |
| `YE` | イエメン | 公的照会先 | 確認待ち | — | [公的資料](https://www.yemen-customs.net/ar/) |
| `YT` | マヨット | 手続・領域を確認 | 確認待ち | — | [公的資料](https://www.douane.gouv.fr/fiche/vos-echanges-commerciaux-avec-mayotte) |
| `ZA` | 南アフリカ | 手続・領域を確認 | 公表税表 | あり | [公的資料](https://www.sars.gov.za/legal-counsel/primary-legislation/schedules-to-the-customs-and-excise-act-1964/) |
| `ZM` | ザンビア | 手続・領域を確認 | 確認待ち | — | [公的資料](https://www.zra.org.zm/importation-of-goods/) |
| `ZW` | ジンバブエ | 手続・領域を確認 | 別日版あり | — | [公的資料](https://www.zimra.co.zw/customs/customs-clearance-procedures) |
| `AS` | 米領サモア | 手続・領域を確認 | 確認待ち | — | [公的資料](https://asbar.org/code-annotated/27-1005-customs-entry-and-declaration/) |
| `AU` | オーストラリア連邦 | 手続・領域を確認 | 公表税表 | あり | [公的資料](https://www.abf.gov.au/importing-exporting-and-manufacturing/tariff-classification/current-tariff/schedule-3) |
| `CC` | ココス (キーリング) 諸島 | 手続・領域を確認 | 確認待ち | あり | [公的資料](https://www.agriculture.gov.au/biosecurity-trade/aircraft-vessels-military/vessels/first-point-entry-and-non-first-point-entry/seaport-locations) |
| `CK` | クック諸島 | 手続・領域を確認 | 公表税表 | — | [公的資料](https://www.mfem.gov.ck/post/cook-islands-customs-tariff-hs2022) |
| `CX` | クリスマス島 | 手続・領域を確認 | 確認待ち | あり | [公的資料](https://www.agriculture.gov.au/biosecurity-trade/aircraft-vessels-military/vessels/first-point-entry-and-non-first-point-entry/seaport-locations) |
| `FJ` | フィジー | 手続・領域を確認 | 公表税表 | あり | [公的資料](https://frcs.org.fj/our-services/customs/trade-business/customs-tariff/hs/) |
| `FM` | ミクロネシア連邦 | 手続・領域を確認 | 確認待ち | — | [公的資料](https://dofa.gov.fm/services/customs-tax/) |
| `GU` | グアム | 手続・領域を確認 | 確認待ち | — | [公的資料](https://cqa.guam.gov/resources/) |
| `HM` | ハード島及びマクドナルド諸島 | 公的照会先 | 確認待ち | あり | [公的資料](https://www.antarctica.gov.au/antarctic-operations/stations-and-field-locations/heard-island/protection-and-management/permits/) |
| `KI` | キリバス | 手続・領域を確認 | 確認待ち | — | [公的資料](https://kiribati.tradeportal.org/procedure/119/step/24) |
| `MH` | マーシャル諸島 | 公的照会先 | 確認待ち | — | [公的資料](https://mof.gov.mh/department-of-customs/) |
| `MP` | 北マリアナ諸島 | 手続・領域を確認 | 確認待ち | あり | [公的資料](https://dof.gov.mp/cus-offices-and-staff.php) |
| `NC` | ニューカレドニア | 手続・領域を確認 | 公表税表 | — | [公的資料](https://data.gouv.nc/explore/dataset/referentiel-douanier-tarif-douanier-compilation/) |
| `NF` | ノーフォーク島 | 手続・領域を確認 | 確認待ち | あり | [公的資料](https://www.agriculture.gov.au/biosecurity-trade/aircraft-vessels-military/vessels/first-point-entry-and-non-first-point-entry/seaport-locations) |
| `NR` | ナウル | 手続・領域を確認 | 確認待ち | — | [公的資料](https://nauru.tradeportal.org/procedure/17?l=en) |
| `NU` | ニウエ | 手続・領域を確認 | 確認待ち | — | [公的資料](https://www.gov.nu/media-releases/customs-clearance-procedures-customs-clearance-procedures-for-imported-goods-effective-1-february-2026) |
| `NZ` | ニュージーランド | 手続・領域を確認 | 公表税表 | あり | [公的資料](https://www.customs.govt.nz/business/tariffs/tariff-classifications-and-rates) |
| `PF` | 仏領ポリネシア | 手続・領域を確認 | 確認待ち | — | [公的資料](https://www.service-public.pf/douane/fenix/) |
| `PG` | パプアニューギニア | 手続・領域を確認 | 別日版あり | — | [公的資料](https://customs.gov.pg/trade/pns) |
| `PN` | ピトケアン | 公的照会先 | 確認待ち | — | [公的資料](https://www.government.pn/laws) |
| `PW` | パラオ | 手続・領域を確認 | 公表税表 | — | [公的資料](https://www.palaulaw.gov.pw/palau-national-code) |
| `SB` | ソロモン諸島 | 手続・領域を確認 | 石油製品10品目 | — | [公的資料](https://solomons.gov.sb/office-of-the-prime-minister-and-cabinet/) |
| `TK` | トケラウ | 公的照会先 | 確認待ち | — | [公的資料](https://www.tokelau.org.nz/site/tokelau/files/TokelauNSO/IMTS-Appendix1_Charlie-Trade-Proposal%20to%20establish%20IMTS.pdf) |
| `TO` | トンガ | 手続・領域を確認 | 確認待ち | — | [公的資料](https://tonga.tradeportal.org/procedure/44/step/638) |
| `TV` | ツバル | 手続・領域を確認 | 確認待ち | — | [公的資料](https://tuvalu.tradeportal.org/procedure/12?l=en) |
| `UM` | アメリカ合衆国外諸島 | 公的照会先 | 確認待ち | — | [公的資料](https://www.fws.gov/national-monument/pacific-islands-heritage-marine/visit-us) |
| `VU` | バヌアツ | 手続・領域を確認 | 公表税表 | あり | [公的資料](https://vanuatucustoms.gov.vu/index.php/customs/hs-nomenclature) |
| `WF` | ワリー及びフテュナ | 手続・領域を確認 | 確認待ち | — | [公的資料](https://www.wallis-et-futuna.gouv.fr/Demarches/Formalites-douanieres) |
| `WS` | サモア | 手続・領域を確認 | 確認待ち | — | [公的資料](https://customs.gov.ws/customs-services/) |

[世界全方向の開発計画](WORLDWIDE_ROLLOUT.md) ・ [OpenAPI](openapi.json)
