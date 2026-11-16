# 仕向地別の関税・通関対応台帳

以下の表は、過去版のデータ同梱配布物で確認した結果です。使用中の環境にある税表の件数は、表の下にあるAPIまたはCLIで確認できます。

表の対象輸入日は 2026-11-11（日本時間）です。2026-11-12の更新は [北米・中南米・カリブ](AMERICAS_CUSTOMS.md) と [西アジア・アフリカ・オセアニア](WESTERN_ASIA_AFRICA_OCEANIA_CUSTOMS.md) にあります。ほかの追加整備は [アジア・欧州の輸入手続と税表](ASIA_EUROPE_CUSTOMS.md) にまとめています。WCO加盟先 187 件と名簿に単独掲載されていない 62 件について、参照できる資料と税額試算の条件を記録しています。

v1では北朝鮮（KP）の公的資料を台帳に記録し、商用受付の対象外として返します。日中米の商用検証状況は `GET /v1/release-readiness` で確認できます。 [商用対象と取引確認](TRADE_POLICY.md)

| 確認項目 | 仕向地数 |
| --- | ---: |
| 仕向地に結び付く公的資料 | 249 |
| 書類・通関準備API | 249 |
| 指定日の通常領域の基本税表 | 86 |
| 別日の通常領域の基本税表のみ | 39 |
| 指定日の輸入VAT・GST参照 | 44 |
| 指定日の物品税参照 | 11 |
| 指定日の追加関税・貿易救済措置参照 | 36 |
| 通常関税0%・原則0%の制度 | 11 |
| 条件付き試算を行う既存ルール | 32 |

v0.8.0で、指定日の公表税表から84仕向地、通常関税0%・原則0%の制度から11仕向地を合成貨物で試算しました。重複を除くと91仕向地です。各仕向地の対象品目・方式は税表、輸入日、原産地、税関領域で異なります。 [世界の通関準備と基礎関税の試算](WORLDWIDE_CUSTOMS_PLAN.md)

税表の欄は収録済み参照版を示します。品目、原産地、税関領域、適用日を指定した照会が必要です。「条件付き」は、該当する貨物で一部の税目を計算できる仕向地です。区分ごとの判定条件は [README](../README.md#税額計算と通関確認の対応範囲) を参照してください。

最新の集計はサービス認証付きの `GET /v1/coverage/destinations?date=YYYY-MM-DD` または `npm run cli -- destination-coverage YYYY-MM-DD` で取得できます。JSONには過去版、予定版、税種ごとの収録版、制度の範囲、出典・再確認期限が含まれます。

## 実装とデータ追加の優先案

1. 日本・中国本土・米国の越境6方向について、一般輸入の基礎関税に加え、追加税・輸入消費税・特別な通関方式、申告と徴収の担当を実注文で照合します。
2. 英国本土・シンガポール・ニュージーランドで販売時課税の証拠引継ぎを検証します。EUと豪州では、既存の関税概算と輸入VAT・GST等の未確定項目を別々に表示します。
3. その他の仕向地は、品目、原産地、輸入日を指定できる一次資料を集め、税額試算を追加する際は税関評価、免税条件、追加税、徴収時点を照合します。

## 249仕向地

| 仕向地 | WCO | 基本税表 | 輸入VAT・GST | 物品税 | 追加関税等 | 通常関税の制度 | 試算 | 公的資料 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `AD` アンドラ | 加盟 | 公的資料 | — | — | — | — | — | [資料](https://www.govern.ad/es/tematiques/impostos-taxes-i-duana/aranzels-duaners-i-granquicies) |
| `AE` アラブ首長国連邦 | 加盟 | 別日版 | — | — | — | — | — | [資料](https://www.dubaicustoms.gov.ae/en/CustomsInformation/Pages/IntegratedCustomsTariff.aspx) |
| `AF` アフガニスタン | 加盟 | 公的資料 | — | — | — | — | — | [資料](https://www.customs.mof.gov.af/english) |
| `AG` アンティグア・バーブーダ | 加盟 | 公的資料 | — | — | — | — | — | [資料](https://customs.gov.ag/page/duties-and-taxes-collected) |
| `AI` アングイラ | 単独掲載なし | 公的資料 | — | — | — | — | — | [資料](https://customs.gov.ai/wp-content/uploads/2020/01/Anguilla-HS2017-Tariff-Final.pdf) |
| `AL` アルバニア | 加盟 | 公的資料 | — | — | — | — | — | [資料](https://www.dogana.gov.al/english/d/182/248/0/231/combined-nomenclature-of-goods) |
| `AM` アルメニア | 加盟 | 指定日版 | — | — | — | — | — | [資料](https://eec.eaeunion.org/comission/department/catr/ett/) |
| `AO` アンゴラ | 加盟 | 公的資料 | — | — | — | — | — | [資料](https://agt.minfin.gov.ao/PortalAGT/#!/servicos-aduaneiros//pauta-aduaneira) |
| `AR` アルゼンチン | 加盟 | 別日版 | — | — | — | — | — | [資料](https://www.mercosur.int/politica-comercial/ncm/) |
| `AS` 米領サモア | 単独掲載なし | 公的資料 | — | — | — | — | — | [資料](https://files.gao.gov/reports/GAO-26-107811/index.html) |
| `AT` オーストリア | 加盟 | 指定日版 | あり | — | あり | — | 条件付き | [資料](https://ec.europa.eu/taxation_customs/dds2/taric/taric_consultation.jsp?Lang=en) |
| `AU` オーストラリア連邦 | 加盟 | 指定日版 | — | — | — | — | 条件付き | [資料](https://www.abf.gov.au/importing-exporting-and-manufacturing/tariff-classification/current-tariff) |
| `AW` アルーバ | 単独掲載なし | 公的資料 | — | — | — | — | — | [資料](https://www.douane.aw/wp-content/uploads/2023/07/Tarief-van-invoerrechten-versie-1-augustus-2023.pdf) |
| `AX` オーランド諸島 | 単独掲載なし | 公的資料 | — | — | — | — | — | [資料](https://vero.fi/en/businesses-and-corporations/taxes-and-charges/vat/international-commerce/value-added-taxation-of-imported-goods/%C3%A5land-islands-tax-border-and-importing-goods/) |
| `AZ` アゼルバイジャン | 加盟 | 指定日版 | — | — | — | — | — | [資料](https://e-qanun.az/framework/37035) |
| `BA` ボスニア・ヘルツェゴビナ | 加盟 | 公的資料 | — | — | — | — | — | [資料](https://www.uino.gov.ba/portal/bs/carine/carinska-tarifa/) |
| `BB` バルバドス | 加盟 | 公的資料 | — | — | — | — | — | [資料](https://asycuda.customs.gov.bb/portal/services/tariff/search.jsf) |
| `BD` バングラデシュ | 加盟 | 別日版 | — | — | — | — | — | [資料](https://nbr.gov.bd/taxtype/tariff-schedule/eng) |
| `BE` ベルギー | 加盟 | 指定日版 | あり | — | あり | — | 条件付き | [資料](https://ec.europa.eu/taxation_customs/dds2/taric/taric_consultation.jsp?Lang=en) |
| `BF` ブルキナファソ | 加盟 | 公的資料 | — | — | — | — | — | [資料](https://douanes.bf/sydoniabf/files/codeDGD.pdf) |
| `BG` ブルガリア | 加盟 | 指定日版 | あり | — | あり | — | 条件付き | [資料](https://ec.europa.eu/taxation_customs/dds2/taric/taric_consultation.jsp?Lang=en) |
| `BH` バーレーン | 加盟 | 公的資料 | — | — | — | — | — | [資料](https://www.bahrain.bh/wps/portal/en/BNP/ServicesCatalogue/GSX-UI-PServiceDetails?psID=1322) |
| `BI` ブルンジ | 加盟 | 別日版 | — | — | — | — | — | [資料](https://www.obr.bi) |
| `BJ` ベナン | 加盟 | 指定日版 | — | — | — | — | — | [資料](https://douanes.gouv.bj/tarif-douane/) |
| `BL` サンバルテルミ | 単独掲載なし | 公的資料 | — | — | — | — | — | [資料](https://www.douane.gouv.fr/fiche/cas-particuliers-de-lile-de-saint-martin-et-de-lile-de-saint-barthelemy) |
| `BM` バーミューダ | 加盟 | 公的資料 | — | — | — | — | — | [資料](https://www.gov.bm/schedules-customs-tariff-act-1970) |
| `BN` ブルネイ・ダルサラーム国 | 加盟 | 別日版 | — | — | — | — | — | [資料](https://www.customs.gov.bn/ref-rced-customs-taxes/) |
| `BO` ボリビア多民族国 | 加盟 | 別日版 | — | — | — | — | — | [資料](https://media.economiayfinanzas.gob.bo/aranceles-aduaneros) |
| `BQ` ボネール、シントユースタティウス及びサバ | 単独掲載なし | 公的資料 | — | — | — | 0% | — | [資料](https://www.belastingdienst-cn.nl/onderwerpen/douanezaken-bedrijven/invoerbelastingen-bedrijven) |
| `BR` ブラジル | 加盟 | 指定日版 | — | — | — | — | — | [資料](https://portalunico.siscomex.gov.br/classif/#/sumario?perfil=publico) |
| `BS` バハマ | 加盟 | 別日版 | — | — | — | — | — | [資料](https://laws.bahamas.gov.bs/cms/images/LEGISLATION/PRINCIPAL/2013/2013-0027/2013-0027_2.pdf) |
| `BT` ブータン | 加盟 | 公的資料 | — | — | — | — | — | [資料](https://ecms.gov.bt/publication/btc-and-tariff-schedule) |
| `BV` ブーベ島 | 単独掲載なし | 公的資料 | — | — | — | — | — | [資料](https://npolar.no/en/regulations-bouvetoya-nature-reserve/) |
| `BW` ボツワナ | 加盟 | 指定日版 | — | — | — | — | — | [資料](https://www.sars.gov.za/legal-counsel/primary-legislation/schedules-to-the-customs-and-excise-act-1964/) |
| `BY` ベラルーシ | 加盟 | 指定日版 | — | — | — | — | — | [資料](https://eec.eaeunion.org/comission/department/catr/ett/) |
| `BZ` ベリーズ | 加盟 | 別日版 | — | — | — | — | — | [資料](https://www.customs.gov.bz/ttpg.html) |
| `CA` カナダ | 加盟 | 指定日版 | — | — | あり | — | — | [資料](https://www.cbsa-asfc.gc.ca/trade-commerce/tariff-tarif/menu-eng.html) |
| `CC` ココス (キーリング) 諸島 | 単独掲載なし | 公的資料 | — | — | — | 0% | — | [資料](https://www.abf.gov.au/help-and-support-subsite/CustomsNotices/2026-11.pdf) |
| `CD` コンゴ民主共和国 | 加盟 | 公的資料 | — | — | — | — | — | [資料](https://douane.gouv.cd/dgda/tarif-des-droits-et-taxes-a-limportation-et-a-lexportation-aligne-sur-la-version-sh-2022/) |
| `CF` 中央アフリカ共和国 | 加盟 | 公的資料 | — | — | — | — | — | [資料](https://finances.gouv.cf/projet/16/e-douanes) |
| `CG` コンゴ | 加盟 | 公的資料 | — | — | — | — | — | [資料](https://douanes.gouv.cg) |
| `CH` スイス | 加盟 | 指定日版 | — | あり | — | — | — | [資料](https://www.bazg.admin.ch/en/tares-free-data-delivery-on-customers-request) |
| `CI` コートジボワール | 加盟 | 指定日版 | あり | — | — | — | — | [資料](https://www.douanes.ci/info/tec) |
| `CK` クック諸島 | 単独掲載なし | 指定日版 | あり | — | — | — | — | [資料](https://www.mfem.gov.ck/post/cook-islands-customs-tariff-hs2022) |
| `CL` チリ | 加盟 | 別日版 | — | — | — | — | — | [資料](https://www.aduana.cl/arancel-aduanero-vigente/aduana/2016-12-30/090118.html) |
| `CM` カメルーン | 加盟 | 公的資料 | — | — | — | — | — | [資料](https://www.douanes.cm/douanes-cameroun/tarif-des-douanes/) |
| `CN` 中国 | 加盟 | 指定日版 | — | — | — | — | — | [資料](https://online.customs.gov.cn/) |
| `CO` コロンビア | 加盟 | 指定日版 | — | — | — | — | — | [資料](https://muisca.dian.gov.co/WebArancel/DefMenuConsultas.faces) |
| `CR` コスタリカ | 加盟 | 指定日版 | — | — | — | — | — | [資料](https://ticaconsultas.hacienda.go.cr/Tica/hdbaranc.aspx) |
| `CU` キューバ | 加盟 | 公的資料 | — | — | — | — | — | [資料](https://tfadatabase.org/en/members/cuba/publication-of-information-for-governments-and-traders) |
| `CV` カーボヴェルデ | 加盟 | 公的資料 | — | — | — | — | — | [資料](https://www.mf.gov.cv/web/dnre/direca-geral-das-alfandegas) |
| `CW` キュラソー | 加盟 | 公的資料 | — | — | — | — | — | [資料](https://douane.cw/tarief-van-invoerrechten/) |
| `CX` クリスマス島 | 単独掲載なし | 公的資料 | — | — | — | 0% | — | [資料](https://www.abf.gov.au/help-and-support-subsite/CustomsNotices/2026-11.pdf) |
| `CY` キプロス | 加盟 | 指定日版 | あり | — | あり | — | 条件付き | [資料](https://ec.europa.eu/taxation_customs/dds2/taric/taric_consultation.jsp?Lang=en) |
| `CZ` チェコ | 加盟 | 指定日版 | あり | — | あり | — | 条件付き | [資料](https://ec.europa.eu/taxation_customs/dds2/taric/taric_consultation.jsp?Lang=en) |
| `DE` ドイツ | 加盟 | 指定日版 | あり | — | あり | — | 条件付き | [資料](https://ec.europa.eu/taxation_customs/dds2/taric/taric_consultation.jsp?Lang=en) |
| `DJ` ジブチ | 加盟 | 公的資料 | — | — | — | — | — | [資料](https://douanes.gouv.dj/) |
| `DK` デンマーク | 加盟 | 指定日版 | — | — | あり | — | 条件付き | [資料](https://ec.europa.eu/taxation_customs/dds2/taric/taric_consultation.jsp?Lang=en) |
| `DM` ドミニカ | 単独掲載なし | 公的資料 | — | — | — | — | — | [資料](https://customs.gov.dm/legislation) |
| `DO` ドミニカ共和国 | 加盟 | 別日版 | — | — | — | — | — | [資料](https://sirevuce.aduanas.gob.do/) |
| `DZ` アルジェリア | 加盟 | 公的資料 | — | — | — | — | — | [資料](https://douane.gov.dz/spip.php?page=tarif_douanier) |
| `EC` エクアドル | 加盟 | 別日版 | — | — | — | — | — | [資料](https://ecuapass.aduana.gob.ec/) |
| `EE` エストニア | 加盟 | 指定日版 | あり | — | あり | — | 条件付き | [資料](https://ec.europa.eu/taxation_customs/dds2/taric/taric_consultation.jsp?Lang=en) |
| `EG` エジプト | 加盟 | 公的資料 | — | — | — | — | — | [資料](https://www.customs.gov.eg/Services/Tarif) |
| `EH` 西サハラ | 単独掲載なし | 公的資料 | — | — | — | — | — | [資料](https://www.mcinet.gov.ma/sites/default/files/avis%20aux%20imporatteurs.GUERGARATE-1%20Fr.pdf) |
| `ER` エリトリア国 | 加盟 | 公的資料 | — | — | — | — | — | [資料](https://www.wcoomd.org/-/media/wco/public/global/pdf/topics/nomenclature/resources/contacs/hs-membercp.pdf) |
| `ES` スペイン | 加盟 | 指定日版 | あり | — | あり | — | 条件付き | [資料](https://ec.europa.eu/taxation_customs/dds2/taric/taric_consultation.jsp?Lang=en) |
| `ET` エチオピア | 加盟 | 公的資料 | — | — | — | — | — | [資料](https://customs.erca.gov.et/trade/?lang=en) |
| `FI` フィンランド | 加盟 | 指定日版 | あり | — | あり | — | 条件付き | [資料](https://ec.europa.eu/taxation_customs/dds2/taric/taric_consultation.jsp?Lang=en) |
| `FJ` フィジー | 加盟 | 指定日版 | あり | あり | — | — | — | [資料](https://frcs.org.fj/our-services/customs/trade-business/customs-tariff/hs/) |
| `FK` フォークランド諸島 (マルビナス) | 単独掲載なし | 公的資料 | — | — | — | — | — | [資料](https://www.gov.fk/customs/wp-content/uploads/sites/8/2026/06/CI-Duty-and-Charges-FY-2026-27-5.pdf) |
| `FM` ミクロネシア連邦 | 単独掲載なし | 公的資料 | — | — | — | — | — | [資料](https://dofa.gov.fm/dofa-divisions/customs-tax-administration/) |
| `FO` フェロー諸島 | 単独掲載なし | 指定日版 | あり | あり | — | — | — | [資料](https://voruskra.taks.fo/en/Sections) |
| `FR` フランス | 加盟 | 指定日版 | あり | — | あり | — | 条件付き | [資料](https://ec.europa.eu/taxation_customs/dds2/taric/taric_consultation.jsp?Lang=en) |
| `GA` ガボン | 加盟 | 公的資料 | — | — | — | — | — | [資料](https://www.douanes.ga/media/documents/15/la-fiscalite-douaniere?lng=FR) |
| `GB` 英国 | 加盟 | 指定日版 | あり | — | あり | — | 条件付き | [資料](https://www.gov.uk/trade-tariff) |
| `GD` グレナダ | 単独掲載なし | 公的資料 | — | — | — | — | — | [資料](https://www.grenadacustoms.com/index.php) |
| `GE` グルジア | 加盟 | 指定日版 | — | — | — | — | — | [資料](https://rs.ge/CommodityCodes-en?cat=1&tab=1) |
| `GF` 仏領ギアナ | 単独掲載なし | 公的資料 | — | — | — | — | — | [資料](https://www.douane.gouv.fr/demarche/importer-un-bien-dans-un-drom) |
| `GG` ガーンジー | 単独掲載なし | 公的資料 | — | — | — | — | — | [資料](https://gems.gov.gg/) |
| `GH` ガーナ | 加盟 | 公的資料 | — | — | — | — | — | [資料](https://gra.gov.gh/customs/import-procedures/) |
| `GI` ジブラルタル | 単独掲載なし | 公的資料 | — | — | — | — | — | [資料](https://commission.europa.eu/strategy-and-policy/relations-united-kingdom/eu-uk-agreement-respect-gibraltar_en) |
| `GL` グリーンランド | 単独掲載なし | 公的資料 | — | — | — | — | — | [資料](https://aka.gl/da/erhverv/afgifter/indfoerselsafgift-for-varer) |
| `GM` ガンビア | 加盟 | 公的資料 | — | — | — | — | — | [資料](https://www.gra.gm/custom-faqs) |
| `GN` ギニア | 加盟 | 公的資料 | — | — | — | — | — | [資料](https://dgd.gov.gn/actes-du-dg/) |
| `GP` グアドループ | 単独掲載なし | 公的資料 | — | — | — | — | — | [資料](https://www.douane.gouv.fr/professionnels/outre-mer/guadeloupe) |
| `GQ` 赤道ギニア | 加盟 | 公的資料 | — | — | — | — | — | [資料](https://unctad.org/system/files/official-document/dtlasycuda2022d1_en.pdf) |
| `GR` ギリシャ | 加盟 | 指定日版 | あり | — | あり | — | 条件付き | [資料](https://ec.europa.eu/taxation_customs/dds2/taric/taric_consultation.jsp?Lang=en) |
| `GS` サウスジョージア及びサウスサンドウィッチ諸島 | 単独掲載なし | 公的資料 | — | — | — | — | — | [資料](https://laws.gov.gs/wp-content/uploads/2022/05/2016.pdf) |
| `GT` グアテマラ | 加盟 | 指定日版 | — | — | — | — | — | [資料](https://portal.sat.gob.gt/portal/arancel-integrado/) |
| `GU` グアム | 単独掲載なし | 公的資料 | — | — | — | 0% | — | [資料](https://files.gao.gov/reports/GAO-26-107811/index.html) |
| `GW` ギニアビサウ | 加盟 | 公的資料 | — | — | — | — | — | [資料](https://www.ecowas.int/member_states/guinea-bissau/) |
| `GY` ガイアナ | 加盟 | 別日版 | — | — | — | — | — | [資料](https://www.gra.gov.gy/the-national-tariff-2011/) |
| `HK` 香港 | 加盟 | 指定日版 | — | — | — | 0% | — | [資料](https://www.customs.gov.hk/en/service-enforcement-information/cargo-clearance/) |
| `HM` ハード島及びマクドナルド諸島 | 単独掲載なし | 公的資料 | — | — | — | — | — | [資料](https://www.abf.gov.au/help-and-support-subsite/CustomsNotices/2026-11.pdf) |
| `HN` ホンジュラス | 加盟 | 指定日版 | — | — | — | — | — | [資料](https://sarahweb2.aduanas.gob.hn/#/plataforma/informacion/consulta_nomenclador) |
| `HR` クロアチア | 加盟 | 指定日版 | あり | — | あり | — | 条件付き | [資料](https://ec.europa.eu/taxation_customs/dds2/taric/taric_consultation.jsp?Lang=en) |
| `HT` ハイチ | 加盟 | 公的資料 | — | — | — | — | — | [資料](https://www.douane.gouv.ht/tarif-ndp/) |
| `HU` ハンガリー | 加盟 | 指定日版 | あり | — | あり | — | 条件付き | [資料](https://ec.europa.eu/taxation_customs/dds2/taric/taric_consultation.jsp?Lang=en) |
| `ID` インドネシア | 加盟 | 指定日版 | — | — | — | — | — | [資料](https://insw.go.id/intr) |
| `IE` アイルランド | 加盟 | 指定日版 | あり | — | あり | — | 条件付き | [資料](https://ec.europa.eu/taxation_customs/dds2/taric/taric_consultation.jsp?Lang=en) |
| `IL` イスラエル | 加盟 | 別日版 | — | — | — | — | — | [資料](https://shaarolami-query.customs.mof.gov.il/CustomspilotWeb/en/CustomsBook/Import/Doubt) |
| `IM` マン島 | 単独掲載なし | 公的資料 | — | — | — | — | — | [資料](https://www.gov.im/categories/tax-vat-and-your-money/customs-and-excise/imports-and-exports/) |
| `IN` インド | 加盟 | 別日版 | あり | — | — | — | — | [資料](https://old.cbic.gov.in/htdocs-cbec/customs/custom-tariff) |
| `IO` 英国インド洋領土 | 単独掲載なし | 公的資料 | — | — | — | — | — | [資料](https://www.biot.gov.io/wp-content/uploads/The-Imports-Exports-Control-Ord-2009-F.2.pdf) |
| `IQ` イラク | 加盟 | 公的資料 | — | — | — | — | — | [資料](https://www.mof.gov.iq/Customs-tariff-law) |
| `IR` イラン・イスラム共和国 | 加盟 | 公的資料 | — | — | — | — | — | [資料](https://www.jetro.go.jp/world/middle_east/ir/trade_03.html) |
| `IS` アイスランド | 加盟 | 指定日版 | あり | — | — | — | — | [資料](https://www.skatturinn.is/english/companies/customs-matters/customs-tariff/) |
| `IT` イタリア | 加盟 | 指定日版 | あり | — | あり | — | 条件付き | [資料](https://ec.europa.eu/taxation_customs/dds2/taric/taric_consultation.jsp?Lang=en) |
| `JE` ジャージー | 単独掲載なし | 公的資料 | — | — | — | — | — | [資料](https://www.gov.je/taxesmoney/gst/gstcustomers/pages/declaringpaying.aspx) |
| `JM` ジャマイカ | 加盟 | 指定日版 | あり | あり | あり | — | — | [資料](https://jca.gov.jm/business/duties-and-taxes/) |
| `JO` ヨルダン | 加盟 | 公的資料 | — | — | — | — | — | [資料](https://asytrade.customs.gov.jo/customs/tariff?lang=en) |
| `JP` 日本 | 加盟 | 指定日版 | あり | あり | — | — | 条件付き | [資料](https://www.customs.go.jp/english/tariff/index.htm) |
| `KE` ケニア | 加盟 | 別日版 | — | — | — | — | — | [資料](https://kra.go.ke/publications) |
| `KG` キルギスタン | 加盟 | 指定日版 | — | — | — | — | — | [資料](https://www.customs.kg) |
| `KH` カンボジア | 加盟 | 別日版 | — | — | — | — | — | [資料](https://customs.gov.kh/en/publications/14043-customs-tariff-of-cambodia-km-2022) |
| `KI` キリバス | 単独掲載なし | 公的資料 | — | — | — | — | — | [資料](https://mcic.gov.ki/wp-content/uploads/2018/12/Kiribati-Trade-Policy-Framework.pdf) |
| `KM` コモロ | 加盟 | 公的資料 | — | — | — | — | — | [資料](https://www.douane.gov.km/organisation.php) |
| `KN` セントクリストファー・ネーヴィス | 単独掲載なし | 公的資料 | — | — | — | — | — | [資料](https://skncustoms.com/duty-calculator) |
| `KP` 朝鮮民主主義人民共和国 | 単独掲載なし | 公的資料 | — | — | — | — | — | [資料](https://www.meti.go.jp/english/press/2025/0408_001.html) |
| `KR` 大韓民国 (韓国) | 加盟 | 別日版 | — | — | — | — | — | [資料](https://unipass.customs.go.kr/clip/index.do#) |
| `KW` クウェート | 加盟 | 公的資料 | — | — | — | — | — | [資料](https://www.customs.gov.kw/HSCode/HsCode) |
| `KY` ケイマン諸島 | 単独掲載なし | 別日版 | — | — | — | — | — | [資料](https://gov.ky/web/cbc/trade/imports) |
| `KZ` カザフスタン | 加盟 | 指定日版 | — | — | — | — | — | [資料](https://eec.eaeunion.org/comission/department/catr/ett/) |
| `LA` ラオス人民民主共和国 | 加盟 | 別日版 | — | — | — | — | — | [資料](https://www.laotradeportal.gov.la/index.php?r=tradeInfo/index) |
| `LB` レバノン | 加盟 | 公的資料 | — | — | — | — | — | [資料](https://www.customs.gov.lb/Tariff/Tariff_Table.aspx) |
| `LC` セントルシア | 加盟 | 公的資料 | — | — | — | — | — | [資料](https://asycuda.customs.gov.lc/portal/services/tariff/sections.jsf) |
| `LI` リヒテンシュタイン | 単独掲載なし | 指定日版 | — | — | — | — | — | [資料](https://www.llv.li/en/individuals/mobility-travel-and-abroad/border-crossing-and-goods-traffic) |
| `LK` スリランカ | 加盟 | 指定日版 | あり | あり | あり | — | — | [資料](https://www.customs.gov.lk/customs-tariff/import-tariff/) |
| `LR` リベリア | 加盟 | 公的資料 | — | — | — | — | — | [資料](https://www.lra.gov.lr) |
| `LS` レソト | 加盟 | 指定日版 | — | — | — | — | — | [資料](https://www.sars.gov.za/legal-counsel/primary-legislation/schedules-to-the-customs-and-excise-act-1964/) |
| `LT` リトアニア | 加盟 | 指定日版 | あり | — | あり | — | 条件付き | [資料](https://ec.europa.eu/taxation_customs/dds2/taric/taric_consultation.jsp?Lang=en) |
| `LU` ルクセンブルク | 加盟 | 指定日版 | あり | — | あり | — | 条件付き | [資料](https://ec.europa.eu/taxation_customs/dds2/taric/taric_consultation.jsp?Lang=en) |
| `LV` ラトビア | 加盟 | 指定日版 | あり | — | あり | — | 条件付き | [資料](https://ec.europa.eu/taxation_customs/dds2/taric/taric_consultation.jsp?Lang=en) |
| `LY` リビア | 加盟 | 公的資料 | — | — | — | — | — | [資料](https://customs.gov.ly/) |
| `MA` モロッコ | 加盟 | 公的資料 | — | — | — | — | — | [資料](https://mre.gov.ma/fr/e-services/dedouanement-de-marchandises-adil) |
| `MC` モナコ | 単独掲載なし | 公的資料 | — | — | — | — | — | [資料](https://legimonaco.mc/tai/convention/1963/05-18-tai1l000236/) |
| `MD` モルドバ共和国 | 加盟 | 公的資料 | — | — | — | — | — | [資料](https://www.legis.md/cautare/getResults?doc_id=112799&lang=ro) |
| `ME` モンテネグロ | 加盟 | 公的資料 | — | — | — | — | — | [資料](https://taric.carina.co.me/TariCG/) |
| `MF` サンマルタン (仏領) | 単独掲載なし | 公的資料 | — | — | — | — | — | [資料](https://www.douane.gouv.fr/fiche/cas-particuliers-de-lile-de-saint-martin-et-de-lile-de-saint-barthelemy) |
| `MG` マダガスカル | 加盟 | 公的資料 | — | — | — | — | — | [資料](https://www.douanes.gov.mg) |
| `MH` マーシャル諸島 | 単独掲載なし | 公的資料 | — | — | — | — | — | [資料](https://mof.gov.mh/department-of-customs/) |
| `MK` 北マケドニア | 加盟 | 指定日版 | — | — | — | — | — | [資料](https://customs.gov.mk/index.php/mk/za-nas-mk/carinska-regulativa/zakon-za-carinska-tarifa) |
| `ML` マリ | 加盟 | 公的資料 | — | — | — | — | — | [資料](https://douanes.gouv.ml/tarif-des-douanes) |
| `MM` ミャンマー | 加盟 | 別日版 | — | — | — | — | — | [資料](https://www.customs.gov.mm/) |
| `MN` モンゴル国 | 加盟 | 別日版 | — | — | — | — | — | [資料](https://gaali.mn/hscode/en) |
| `MO` マカオ | 加盟 | 指定日版 | — | — | — | 0% | — | [資料](https://www.ipim.gov.mo/en/invest-here/foreign-trade) |
| `MP` 北マリアナ諸島 | 単独掲載なし | 公的資料 | — | — | — | — | — | [資料](https://dof.gov.mp/cus-import-requirements.php) |
| `MQ` マルティニーク | 単独掲載なし | 公的資料 | — | — | — | — | — | [資料](https://www.douane.gouv.fr/professionnels/outre-mer/martinique) |
| `MR` モーリタニア | 加盟 | 公的資料 | — | — | — | — | — | [資料](https://www.msgg.gov.mr/sites/default/files/2020-11/J.O.%201403F%20DU%2030.12.2017.pdf) |
| `MS` モントセラト | 単独掲載なし | 公的資料 | — | — | — | — | — | [資料](https://mcrs.gov.ms/customs/) |
| `MT` マルタ | 加盟 | 指定日版 | あり | — | あり | — | 条件付き | [資料](https://ec.europa.eu/taxation_customs/dds2/taric/taric_consultation.jsp?Lang=en) |
| `MU` モーリシャス | 加盟 | 指定日版 | あり | あり | — | — | — | [資料](https://www.mra.mu/index.php/customs1/tariff-information) |
| `MV` モルディブ | 加盟 | 公的資料 | — | — | — | — | — | [資料](https://www.customs.gov.mv/Business/Importers/import-duty-concessions-allowances) |
| `MW` マラウイ | 加盟 | 公的資料 | — | — | — | — | — | [資料](https://customsetariff.mra.mw/) |
| `MX` メキシコ | 加盟 | 別日版 | — | — | — | — | — | [資料](https://www.snice.gob.mx/cs/avi/snice/ligie.info22.html) |
| `MY` マレーシア | 加盟 | 別日版 | — | — | — | — | — | [資料](https://ezhs.customs.gov.my/) |
| `MZ` モザンビーク | 加盟 | 公的資料 | — | — | — | — | — | [資料](https://www.at.gov.mz/por/Pauta-Aduaneira) |
| `NA` ナミビア | 加盟 | 指定日版 | — | — | — | — | — | [資料](https://www.sars.gov.za/legal-counsel/primary-legislation/schedules-to-the-customs-and-excise-act-1964/) |
| `NC` ニューカレドニア | 単独掲載なし | 指定日版 | あり | あり | — | — | — | [資料](https://data.gouv.nc/explore/dataset/referentiel-douanier-tarif-douanier-compilation/) |
| `NE` ニジェール | 加盟 | 公的資料 | — | — | — | — | — | [資料](https://tfadatabase.org/fr/members/niger/publication-of-information-for-governments-and-traders) |
| `NF` ノーフォーク島 | 単独掲載なし | 公的資料 | — | — | — | 0% | — | [資料](https://www.abf.gov.au/help-and-support-subsite/CustomsNotices/2026-11.pdf) |
| `NG` ナイジェリア | 加盟 | 指定日版 | あり | — | あり | — | — | [資料](https://trade.gov.ng/) |
| `NI` ニカラグア | 加盟 | 指定日版 | — | — | — | — | — | [資料](https://www.dga.gob.ni) |
| `NL` オランダ | 加盟 | 指定日版 | あり | — | あり | — | 条件付き | [資料](https://ec.europa.eu/taxation_customs/dds2/taric/taric_consultation.jsp?Lang=en) |
| `NO` ノルウェー | 加盟 | 指定日版 | あり | あり | あり | — | — | [資料](https://www.toll.no/en/corporate/norwegian-customs-tariff) |
| `NP` ネパール | 加盟 | 指定日版 | あり | — | — | — | — | [資料](https://www.customs.gov.np/page/custom-tariff-new) |
| `NR` ナウル | 単独掲載なし | 公的資料 | — | — | — | — | — | [資料](https://ronlaw.gov.nr/assets/docs%2Flaws%2F2024%2FCustoms%20Tariff%20%28Amendment%20of%20Schedule%201%29%20%28Tariff%29%20Regulations%202024.pdf) |
| `NU` ニウエ | 単独掲載なし | 公的資料 | — | — | — | — | — | [資料](https://www.gov.nu/media-releases/customs-clearance-procedures-customs-clearance-procedures-for-imported-goods-effective-1-february-2026) |
| `NZ` ニュージーランド | 加盟 | 指定日版 | あり | — | — | — | 条件付き | [資料](https://www.customs.govt.nz/business/tariffs/working-tariff-document/) |
| `OM` オマーン | 加盟 | 指定日版 | — | — | — | — | — | [資料](https://www.customs.gov.om/dgcportal/web/dgc/business-services?artid=32719) |
| `PA` パナマ | 加盟 | 別日版 | — | — | — | — | — | [資料](https://aranceles.ana.gob.pa/) |
| `PE` ペルー | 加盟 | 指定日版 | — | — | — | — | — | [資料](https://www.sunat.gob.pe/orientacionaduanera/importacion/consideraciones_generales.html) |
| `PF` 仏領ポリネシア | 単独掲載なし | 公的資料 | — | — | — | — | — | [資料](https://www.service-public.pf/douane/professionnels/procedure-de-dedouanement/le-tarif-douanier/) |
| `PG` パプアニューギニア | 加盟 | 別日版 | — | — | — | — | — | [資料](https://customs.gov.pg/legislations.php?q=legislation) |
| `PH` フィリピン | 加盟 | 別日版 | — | — | — | — | — | [資料](https://finder.tariffcommission.gov.ph/) |
| `PK` パキスタン | 加盟 | 指定日版 | — | — | あり | — | — | [資料](https://www.fbr.gov.pk/categ/customs-tariff/51149/70853/131188) |
| `PL` ポーランド | 加盟 | 指定日版 | あり | — | あり | — | 条件付き | [資料](https://ec.europa.eu/taxation_customs/dds2/taric/taric_consultation.jsp?Lang=en) |
| `PM` サンピエール及びミクロン | 単独掲載なし | 公的資料 | — | — | — | — | — | [資料](https://www.douane975.fr/dedouanement/) |
| `PN` ピトケアン | 単独掲載なし | 公的資料 | — | — | — | — | — | [資料](https://www.government.pn/laws) |
| `PR` プエルトリコ | 単独掲載なし | 指定日版 | — | — | — | — | — | [資料](https://hts.usitc.gov/) |
| `PS` パレスチナ | 加盟 | 公的資料 | — | — | — | — | — | [資料](https://www.mof.gov.ps/) |
| `PT` ポルトガル | 加盟 | 指定日版 | あり | — | あり | — | 条件付き | [資料](https://ec.europa.eu/taxation_customs/dds2/taric/taric_consultation.jsp?Lang=en) |
| `PW` パラオ | 加盟 | 指定日版 | あり | — | — | 0% | — | [資料](https://bcbp.pw/?page_id=3210) |
| `PY` パラグアイ | 加盟 | 別日版 | — | — | — | — | — | [資料](https://economia.gov.py/index.php/paraguay-y-el-mundo/aranceles-la-importacion) |
| `QA` カタール | 加盟 | 公的資料 | — | — | — | — | — | [資料](https://www.customs.gov.qa/English/Tariff/Pages/HS-Guide.aspx) |
| `RE` レユニオン | 単独掲載なし | 公的資料 | — | — | — | — | — | [資料](https://www.douane.gouv.fr/fiche/loctroi-de-mer-la-reunion) |
| `RO` ルーマニア | 加盟 | 指定日版 | あり | — | あり | — | 条件付き | [資料](https://ec.europa.eu/taxation_customs/dds2/taric/taric_consultation.jsp?Lang=en) |
| `RS` セルビア | 加盟 | 指定日版 | — | — | — | — | — | [資料](https://www.carina.rs/en/business-community/CustomsTariff.html) |
| `RU` ロシア連邦 | 加盟 | 指定日版 | — | — | — | — | — | [資料](https://economy.gov.ru/minec/activity/sections/foreignEconomicActivity/regulation/index) |
| `RW` ルワンダ | 加盟 | 別日版 | — | — | — | — | — | [資料](https://rwandatrade.rw) |
| `SA` サウジアラビア | 加盟 | 別日版 | — | — | — | — | — | [資料](https://eservices.zatca.gov.sa/sites/sc/en/tariff/Pages/TariffPages/TariffSearch.aspx) |
| `SB` ソロモン諸島 | 加盟 | 指定日版（石油製品10品目） | — | — | — | — | — | [資料](https://customs.gov.sb/) |
| `SC` セーシェル | 加盟 | 公的資料 | — | — | — | — | — | [資料](https://www.tradeportal.sc/wp-content/uploads/2022/05/Reference-Document-as-of-1st-January-2022-002.pdf) |
| `SD` スーダン | 加盟 | 公的資料 | — | — | — | — | — | [資料](https://web.customs.gov.sd/) |
| `SE` スウェーデン | 加盟 | 指定日版 | あり | — | あり | — | 条件付き | [資料](https://ec.europa.eu/taxation_customs/dds2/taric/taric_consultation.jsp?Lang=en) |
| `SG` シンガポール | 加盟 | 指定日版 | — | あり | — | 原則0% | 条件付き | [資料](https://www.customs.gov.sg/businesses/valuation-duties-taxes-fees/duties-and-dutiable-goods/) |
| `SH` セントヘレナ、アセンション及びトリスタン・ダ・クーニャ | 単独掲載なし | 公的資料 | — | — | — | — | — | [資料](https://www.sainthelena.gov.sh/st-helena/government/portfolios/safety-security-and-home-affairs/hm-customs/) |
| `SI` スロベニア | 加盟 | 指定日版 | あり | — | あり | — | 条件付き | [資料](https://ec.europa.eu/taxation_customs/dds2/taric/taric_consultation.jsp?Lang=en) |
| `SJ` スヴァールバル及びヤンマイエン | 単独掲載なし | 公的資料 | — | — | — | 0%（領域指定） | — | [資料](https://www.toll.no/en/corporate/import/norwegian-customs-in-svalbard) |
| `SK` スロバキア | 加盟 | 指定日版 | あり | — | あり | — | 条件付き | [資料](https://ec.europa.eu/taxation_customs/dds2/taric/taric_consultation.jsp?Lang=en) |
| `SL` シエラレオネ | 加盟 | 公的資料 | — | — | — | — | — | [資料](https://nra.gov.sl/customs/duty/0) |
| `SM` サンマリノ | 単独掲載なし | 公的資料 | — | — | — | — | — | [資料](https://www.gov.sm/pub2/GovSM/Dipartimenti/Dipartimento-Economia-e-Finanze/Ufficio-Tributario.html) |
| `SN` セネガル | 加盟 | 公的資料 | — | — | — | — | — | [資料](https://senegalcommerce.sec.gouv.sn/TauxEtTaxes.aspx) |
| `SO` ソマリア | 加盟 | 公的資料 | — | — | — | — | — | [資料](https://www.mof.gov.so/sites/default/files/Publications/General%20Customs%20Regulation%202024.pdf) |
| `SR` スリナム | 加盟 | 公的資料 | — | — | — | — | — | [資料](https://gov.sr/document/wet-tarief-van-invoerrechten/) |
| `SS` 南スーダン | 加盟 | 公的資料 | — | — | — | — | — | [資料](https://ecustoms.nra.gov.ss/customs) |
| `ST` サントメ・プリンシペ | 加盟 | 公的資料 | — | — | — | — | — | [資料](https://guce.gov.st/legislacao-e-diplomas-legais/) |
| `SV` エルサルバドル | 加盟 | 指定日版 | — | — | — | — | — | [資料](https://aduana2.mh.gob.sv/SAC/) |
| `SX` サンマルタン (オランダ領) | 単独掲載なし | 公的資料 | — | — | — | 0% | — | [資料](https://lokaleregelgeving.overheid.nl/CVDR142349) |
| `SY` シリア・アラブ共和国 | 加盟 | 公的資料 | — | — | — | — | — | [資料](https://sana.sy/presidency/2479092/) |
| `SZ` エスワティニ | 加盟 | 指定日版 | — | — | — | — | — | [資料](https://www.sars.gov.za/legal-counsel/primary-legislation/schedules-to-the-customs-and-excise-act-1964/) |
| `TC` タークス及びカイコス諸島 | 単独掲載なし | 公的資料 | — | — | — | — | — | [資料](https://customs.gov.tc/trf) |
| `TD` チャド | 加盟 | 公的資料 | — | — | — | — | — | [資料](https://douanes.td/douane/) |
| `TF` フランス南方領土 | 単独掲載なし | 公的資料 | — | — | — | — | — | [資料](https://www.legifrance.gouv.fr/codes/section_lc/LEGITEXT000006071570/LEGISCTA000053808277/2026-05-01) |
| `TG` トーゴ | 加盟 | 指定日版 | — | — | — | — | — | [資料](https://anciensite.otr.tg/index.php/fr/documentation/sur-la-douane-togolaise/tarifs-des-douanes.html) |
| `TH` タイ | 加盟 | 別日版 | — | — | — | — | — | [資料](https://itd.customs.go.th/igtf/th/main_frame.jsp?lang=th&top_menu=menu_homepage&current_id=5028) |
| `TJ` タジキスタン | 加盟 | 別日版 | — | — | — | — | — | [資料](https://tajtrade.tj/menu/2?l=en) |
| `TK` トケラウ | 単独掲載なし | 公的資料 | — | — | — | — | — | [資料](https://www.legislation.govt.nz/secondary-legislation/pco-drafted/1991/4/en/latest/) |
| `TL` 東ティモール | 加盟 | 別日版 | — | — | — | — | — | [資料](https://customs.gov.tl/doing-business/hs-code-tariff-and-incoterms/) |
| `TM` トルクメニスタン | 加盟 | 別日版 | — | — | — | — | — | [資料](https://customs.gov.tm/en/customs-info/customs-fees/duties) |
| `TN` チュニジア | 加盟 | 公的資料 | — | — | — | — | — | [資料](https://www.douane.gov.tn/tarifweb2026/) |
| `TO` トンガ | 加盟 | 公的資料 | — | — | — | — | — | [資料](https://www.revenue.gov.to/index.php/customs-tariffs-and-fees) |
| `TR` トルコ | 加盟 | 指定日版 | — | — | あり | — | — | [資料](https://uygulama.gtb.gov.tr/Tara) |
| `TT` トリニダード・トバゴ | 加盟 | 公的資料 | — | — | — | — | — | [資料](https://tradeind.gov.tt/ttbizlink-launches-an-enhanced-hs-code-and-tariff-finder/) |
| `TV` ツバル | 単独掲載なし | 公的資料 | — | — | — | — | — | [資料](https://tuvalu.tradeportal.org/media/CustomsRevenueandBorderProtectionAct2014_1.pdf) |
| `TW` 中国領・台湾 | 単独掲載なし | 指定日版 | — | — | — | — | — | [資料](https://web.customs.gov.tw/singlehtml/1207?cntId=cus1_93361_1207) |
| `TZ` タニザニア連合共和国 | 加盟 | 別日版 | — | — | — | — | — | [資料](https://www.kra.go.ke/news-center/public-notices/1733-implementation-of-the-2022-harmonized-system-the-2022-east-african-community-common-external-tariff) |
| `UA` ウクライナ | 加盟 | 指定日版 | — | — | — | — | — | [資料](https://zakon.rada.gov.ua/laws/show/2697-20) |
| `UG` ウガンダ | 加盟 | 別日版 | — | — | — | — | — | [資料](https://ugandatrades.go.ug) |
| `UM` アメリカ合衆国外諸島 | 単独掲載なし | 公的資料 | — | — | — | — | — | [資料](https://public-inspection.federalregister.gov/2026-15420.pdf) |
| `US` 米国 | 加盟 | 指定日版 | — | — | あり | — | — | [資料](https://hts.usitc.gov/current) |
| `UY` ウルグアイ | 加盟 | 別日版 | — | — | — | — | — | [資料](https://aplicaciones.aduanas.gub.uy/LuciapubX/DatoBasico.Arancel.HPUDBAr2.aspx) |
| `UZ` ウズベキスタン | 加盟 | 別日版 | — | — | — | — | — | [資料](https://tarif.customs.uz/en?lang=uz_UZ) |
| `VA` 聖庁 (バチカン市国) | 単独掲載なし | 公的資料 | — | — | — | — | — | [資料](https://def.finanze.it/DocTribFrontend/getAttoNormativoDetail.do?ACTION=getArticolo&articolo=Articolo+2&codiceOrdinamento=200000200000000&id=%7B442FDF84-CF15-4F73-9BA4-4CA474515FCD%7D) |
| `VC` セントビンセント及びグレナディーン諸島 | 加盟 | 別日版 | — | — | — | — | — | [資料](https://customs.gov.vc/tariff-classification) |
| `VE` ベネズエラ・ボリバル共和国 | 加盟 | 公的資料 | — | — | — | — | — | [資料](https://tfadatabase.org/en/members/venezuela-bolivarian-republic-of/publication-of-information-for-governments-and-traders) |
| `VG` 英領ヴァージン諸島 | 単独掲載なし | 公的資料 | — | — | — | — | — | [資料](https://laws.gov.vg/laws/customs-management-and-duties-act-2010) |
| `VI` 米領ヴァージン諸島 | 単独掲載なし | 公的資料 | — | — | — | — | — | [資料](https://files.gao.gov/reports/GAO-26-107811/index.html) |
| `VN` ベトナム | 加盟 | 別日版 | — | — | — | — | — | [資料](https://www.vietnamtradeportal.gov.vn/index.php?r=tradeInfo/index) |
| `VU` バヌアツ | 加盟 | 指定日版 | あり | あり | — | — | — | [資料](https://vanuatucustoms.gov.vu/index.php/customs/hs-nomenclature) |
| `WF` ワリー及びフテュナ | 単独掲載なし | 公的資料 | — | — | — | — | — | [資料](https://www.wallis-et-futuna.gouv.fr/Demarches/Formalites-douanieres) |
| `WS` サモア | 加盟 | 公的資料 | — | — | — | — | — | [資料](https://customs.gov.ws/customs-services/) |
| `XK` コソボ | 加盟 | 公的資料 | — | — | — | — | — | [資料](https://dogana.rks-gov.net/sharedfolder/ProductFiles/2026_488f89e7-9610-4161-b671-3e11c747d458.pdf) |
| `YE` イエメン | 加盟 | 公的資料 | — | — | — | — | — | [資料](https://www.yemen-customs.net/ar/help/duty-calculator/) |
| `YT` マヨット | 単独掲載なし | 公的資料 | — | — | — | — | — | [資料](https://www.douane.gouv.fr/fiche/vos-echanges-commerciaux-avec-mayotte) |
| `ZA` 南アフリカ | 加盟 | 指定日版 | — | — | — | — | — | [資料](https://www.sars.gov.za/Pages/default.aspx) |
| `ZM` ザンビア | 加盟 | 公的資料 | — | — | — | — | — | [資料](https://www.zra.org.zm/applied-rates-of-duties-and-taxes-imposed-in-connection-with-importation-exportation/) |
| `ZW` ジンバブエ | 加盟 | 指定日版 | — | — | — | — | — | [資料](https://www.zimra.co.zw/customs/classification-of-goods/tariff-handbook) |
