# 6桁分類の国・地域別参照データ（rc.30）

2026年11月18日JST確認。234か国・地域、271出典レコード（268固有URL）、664件の国別ルール、60種類の6桁コード候補を収録しました。今回は14か国・地域と38ルールを追加しています。共通資料の同一URLでも分類版・用途が異なる場合は別レコードとして保持します。

HS2022の参照は166か国・地域、その他の確認済み版は68か国・地域です。旧版や国別公表分類をHS2022に変換しません。WTO譲許表・協定附属書・統計分類・歴史的基礎版も、資料に実在する品目の参照として用途を明示します。234か国の現行税率や全商品の国内分類が完成したという意味ではありません。

全250仕向地の状態は[版別展開台帳](HS_CLASSIFICATION_ROLLOUT.md)と[JSON](HS_CLASSIFICATION_ROLLOUT.json)で追跡します。all版集計では候補234、未確認14、対象外2です。API版指定省略時のHS2022集計とは区別します。

## 分類版ごとの範囲

| 分類版 | 国・地域数 | 国別ルール数 |
| --- | ---: | ---: |
| AZ-Decision500-2017 | 1 | 3 |
| BA-InspectionList-v208 | 1 | 3 |
| FO-TAKS-Nomenclature | 1 | 3 |
| GI-IntegratedTariff-2017 | 1 | 3 |
| GL-GRKN8-1989-2003 | 1 | 4 |
| HS2002 | 1 | 3 |
| HS2007 | 7 | 21 |
| HS2012 | 11 | 34 |
| HS2017 | 21 | 63 |
| HS2022 | 166 | 466 |
| IL-IMPORT-NOMENCLATURE | 1 | 3 |
| IQ-TARIFF-LAW22-2010 | 1 | 1 |
| IR-TARIFF-2016-2017 | 1 | 3 |
| KM-TARIFF-2022 | 1 | 3 |
| KW-PAI-Tariff-2022 | 1 | 3 |
| KY-TARIFF-2026 | 1 | 3 |
| LB-IntegratedTariff | 1 | 3 |
| MR-TARIFF-2021 | 1 | 3 |
| PS-PCBS-Local-2009 | 1 | 3 |
| QA-ImportStats-2025-2026 | 1 | 2 |
| SD-TARIFF-2017 | 1 | 3 |
| SO-TARIFF-2022 | 1 | 3 |
| SS-EAC-TFTA-2026 | 1 | 2 |
| ST-TARIFF-2023 | 1 | 3 |
| SY-DECREE188-2026 | 1 | 1 |
| TC-TARIFF-2010 | 1 | 2 |
| TM-COMMODITY-NOMENCLATURE | 1 | 3 |
| TR-TGTC-2026 | 1 | 3 |
| VE-CARICOM-1992 | 1 | 2 |
| VG-TARIFF-2010 | 1 | 3 |
| VI-HTSUS-2026-STATISTICS | 1 | 3 |
| WF-TARIFF-2020 | 1 | 3 |
| XK-TARIK-2026 | 1 | 3 |

同じ国が複数版に含まれる場合、版別件数の合計と国別の和集合は一致しません。現在の台帳は各ルールの版を保持し、他版の候補を自動流用しません。

## 国・地域別の参照候補

| 国・地域 | 収録版 | 国別ルール数 | 6桁コード数 | 入力例 |
| --- | --- | ---: | ---: | --- |
| EU27 | HS2022 | 54 | 2 | [ドイツ例](../examples/classification-eu-de.json) |
| アンドラ（AD） | HS2022 | 2 | 2 | [例](../examples/classification-ad.json) |
| UAE（AE） | HS2022 | 3 | 3 | [例](../examples/classification-ae.json) |
| アフガニスタン（AF） | HS2022 | 3 | 3 | [例](../examples/classification-af.json) |
| アンティグア・バーブーダ（AG） | HS2007 | 3 | 3 | [例](../examples/classification-ag.json) |
| アングイラ（AI） | HS2017 | 3 | 3 | [例](../examples/classification-ai.json) |
| アルバニア（AL） | HS2022 | 3 | 3 | [例](../examples/classification-al.json) |
| アルメニア（AM） | HS2022 | 3 | 3 | [例](../examples/classification-am.json) |
| アンゴラ（AO） | HS2022 | 3 | 3 | [例](../examples/classification-ao.json) |
| アルゼンチン（AR） | HS2022 | 3 | 3 | [例](../examples/classification-ar.json) |
| オーストラリア連邦（AU） | HS2022 | 3 | 3 | [例](../examples/classification-au.json) |
| アルーバ（AW） | HS2012 | 3 | 3 | [例](../examples/classification-aw.json) |
| オーランド諸島（AX） | HS2022 | 2 | 2 | [例](../examples/classification-ax.json) |
| アゼルバイジャン（AZ） | AZ-Decision500-2017 | 3 | 3 | [例](../examples/classification-az.json) |
| ボスニア・ヘルツェゴビナ（BA） | BA-InspectionList-v208 | 3 | 3 | [例](../examples/classification-ba.json) |
| バルバドス（BB） | HS2017 | 3 | 3 | [例](../examples/classification-bb.json) |
| バングラデシュ（BD） | HS2022 | 3 | 3 | [例](../examples/classification-bd.json) |
| ブルキナファソ（BF） | HS2022 | 3 | 3 | [例](../examples/classification-bf.json) |
| バーレーン（BH） | HS2022 | 3 | 3 | [例](../examples/classification-bh.json) |
| ブルンジ（BI） | HS2022 | 3 | 3 | [例](../examples/classification-bi.json) |
| ベナン（BJ） | HS2022 | 3 | 3 | [例](../examples/classification-bj.json) |
| バーミューダ（BM） | HS2022 | 3 | 3 | [例](../examples/classification-bm.json) |
| ブルネイ・ダルサラーム国（BN） | HS2022 | 3 | 3 | [例](../examples/classification-bn.json) |
| ボリビア多民族国（BO） | HS2022 | 3 | 3 | [例](../examples/classification-bo.json) |
| ボネール、シントユースタティウス及びサバ（BQ） | HS2017 | 3 | 3 | [例](../examples/classification-bq.json) |
| ブラジル（BR） | HS2022 | 3 | 3 | [例](../examples/classification-br.json) |
| バハマ（BS） | HS2012 | 3 | 3 | [例](../examples/classification-bs.json) |
| ブータン（BT） | HS2022 | 3 | 3 | [例](../examples/classification-bt.json) |
| ボツワナ（BW） | HS2022 | 3 | 3 | [例](../examples/classification-bw.json) |
| ベラルーシ（BY） | HS2022 | 3 | 3 | [例](../examples/classification-by.json) |
| ベリーズ（BZ） | HS2022 | 3 | 3 | [例](../examples/classification-bz.json) |
| カナダ（CA） | HS2022 | 17 | 17 | [例](../examples/classification-ca.json) |
| ココス (キーリング) 諸島（CC） | HS2022 | 3 | 3 | [例](../examples/classification-cc.json) |
| コンゴ民主共和国（CD） | HS2022 | 3 | 3 | [例](../examples/classification-cd.json) |
| 中央アフリカ共和国（CF） | HS2007 | 3 | 3 | [例](../examples/classification-cf.json) |
| コンゴ（CG） | HS2007 | 3 | 3 | [例](../examples/classification-cg.json) |
| スイス（CH） | HS2022 | 3 | 3 | [例](../examples/classification-ch.json) |
| コートジボワール（CI） | HS2022 | 3 | 3 | [例](../examples/classification-ci.json) |
| クック諸島（CK） | HS2022 | 3 | 3 | [例](../examples/classification-ck.json) |
| チリ（CL） | HS2022 | 3 | 3 | [例](../examples/classification-cl.json) |
| カメルーン（CM） | HS2007 | 3 | 3 | [例](../examples/classification-cm.json) |
| 中国（CN） | HS2022 | 3 | 3 | [例](../examples/classification-cn.json) |
| コロンビア（CO） | HS2022 | 3 | 3 | [例](../examples/classification-co.json) |
| コスタリカ（CR） | HS2022 | 3 | 3 | [例](../examples/classification-cr.json) |
| キューバ（CU） | HS2017 | 3 | 3 | [例](../examples/classification-cu.json) |
| カーボヴェルデ（CV） | HS2022 | 3 | 3 | [例](../examples/classification-cv.json) |
| キュラソー（CW） | HS2017 | 3 | 3 | [例](../examples/classification-cw.json) |
| クリスマス島（CX） | HS2022 | 3 | 3 | [例](../examples/classification-cx.json) |
| ジブチ（DJ） | HS2022 | 3 | 3 | [例](../examples/classification-dj.json) |
| ドミニカ（DM） | HS2017 | 3 | 3 | [例](../examples/classification-dm.json) |
| ドミニカ共和国（DO） | HS2022 | 3 | 3 | [例](../examples/classification-do.json) |
| アルジェリア（DZ） | HS2017 | 3 | 3 | [例](../examples/classification-dz.json) |
| エクアドル（EC） | HS2022 | 3 | 3 | [例](../examples/classification-ec.json) |
| エジプト（EG） | HS2022 | 3 | 3 | [例](../examples/classification-eg.json) |
| エリトリア国（ER） | HS2022 | 2 | 2 | [例](../examples/classification-er.json) |
| エチオピア（ET） | HS2022 | 3 | 3 | [例](../examples/classification-et.json) |
| フィジー（FJ） | HS2022 | 3 | 3 | [例](../examples/classification-fj.json) |
| ミクロネシア連邦（FM） | HS2002 | 3 | 3 | [例](../examples/classification-fm.json) |
| フェロー諸島（FO） | FO-TAKS-Nomenclature | 3 | 3 | [例](../examples/classification-fo.json) |
| ガボン（GA） | HS2007 | 3 | 3 | [例](../examples/classification-ga.json) |
| 英国（GB） | HS2022 | 2 | 2 | [例](../examples/classification-gb.json) |
| グレナダ（GD） | HS2012 | 3 | 3 | [例](../examples/classification-gd.json) |
| グルジア（GE） | HS2022 | 3 | 3 | [例](../examples/classification-ge.json) |
| 仏領ギアナ（GF） | HS2022 | 2 | 2 | [例](../examples/classification-gf.json) |
| ガーンジー（GG） | HS2022 | 3 | 3 | [例](../examples/classification-gg.json) |
| ガーナ（GH） | HS2017 | 3 | 3 | [例](../examples/classification-gh.json) |
| ジブラルタル（GI） | GI-IntegratedTariff-2017 | 3 | 3 | [例](../examples/classification-gi.json) |
| グリーンランド（GL） | GL-GRKN8-1989-2003 | 4 | 4 | [例](../examples/classification-gl.json) |
| ガンビア（GM） | HS2022 | 3 | 3 | [例](../examples/classification-gm.json) |
| ギニア（GN） | HS2022 | 3 | 3 | [例](../examples/classification-gn.json) |
| グアドループ（GP） | HS2022 | 2 | 2 | [例](../examples/classification-gp.json) |
| 赤道ギニア（GQ） | HS2007 | 3 | 3 | [例](../examples/classification-gq.json) |
| グアテマラ（GT） | HS2022 | 3 | 3 | [例](../examples/classification-gt.json) |
| ギニアビサウ（GW） | HS2022 | 3 | 3 | [例](../examples/classification-gw.json) |
| ガイアナ（GY） | HS2017 | 3 | 3 | [例](../examples/classification-gy.json) |
| 香港（HK） | HS2022 | 3 | 3 | [例](../examples/classification-hk.json) |
| ホンジュラス（HN） | HS2022 | 3 | 3 | [例](../examples/classification-hn.json) |
| ハイチ（HT） | HS2022 | 3 | 3 | [例](../examples/classification-ht.json) |
| インドネシア（ID） | HS2022 | 3 | 3 | [例](../examples/classification-id.json) |
| イスラエル（IL） | IL-IMPORT-NOMENCLATURE | 3 | 3 | [例](../examples/classification-il.json) |
| マン島（IM） | HS2022 | 3 | 3 | [例](../examples/classification-im.json) |
| インド（IN） | HS2022 | 3 | 3 | [例](../examples/classification-in.json) |
| イラク（IQ） | IQ-TARIFF-LAW22-2010 | 1 | 1 | [例](../examples/classification-iq.json) |
| イラン・イスラム共和国（IR） | IR-TARIFF-2016-2017 | 3 | 3 | [例](../examples/classification-ir.json) |
| アイスランド（IS） | HS2022 | 3 | 3 | [例](../examples/classification-is.json) |
| ジャージー（JE） | HS2022 | 3 | 3 | [例](../examples/classification-je.json) |
| ジャマイカ（JM） | HS2022 | 3 | 3 | [例](../examples/classification-jm.json) |
| ヨルダン（JO） | HS2022 | 3 | 3 | [例](../examples/classification-jo.json) |
| 日本（JP） | HS2022 | 2 | 2 | [例](../examples/classification-jp.json) |
| ケニア（KE） | HS2022 | 3 | 3 | [例](../examples/classification-ke.json) |
| キルギスタン（KG） | HS2022 | 3 | 3 | [例](../examples/classification-kg.json) |
| カンボジア（KH） | HS2022 | 3 | 3 | [例](../examples/classification-kh.json) |
| キリバス（KI） | HS2012 | 3 | 3 | [例](../examples/classification-ki.json) |
| コモロ（KM） | KM-TARIFF-2022 | 3 | 3 | [例](../examples/classification-km.json) |
| セントクリストファー・ネーヴィス（KN） | HS2017 | 3 | 3 | [例](../examples/classification-kn.json) |
| 韓国（KR） | HS2022 | 3 | 3 | [例](../examples/classification-kr.json) |
| クウェート（KW） | KW-PAI-Tariff-2022 | 3 | 3 | [例](../examples/classification-kw.json) |
| ケイマン諸島（KY） | KY-TARIFF-2026 | 3 | 3 | [例](../examples/classification-ky.json) |
| カザフスタン（KZ） | HS2022 | 3 | 3 | [例](../examples/classification-kz.json) |
| ラオス人民民主共和国（LA） | HS2022 | 3 | 3 | [例](../examples/classification-la.json) |
| レバノン（LB） | LB-IntegratedTariff | 3 | 3 | [例](../examples/classification-lb.json) |
| セントルシア（LC） | HS2022 | 3 | 3 | [例](../examples/classification-lc.json) |
| リヒテンシュタイン（LI） | HS2022 | 3 | 3 | [例](../examples/classification-li.json) |
| スリランカ（LK） | HS2022 | 3 | 3 | [例](../examples/classification-lk.json) |
| リベリア（LR） | HS2022 | 3 | 3 | [例](../examples/classification-lr.json) |
| レソト（LS） | HS2022 | 3 | 3 | [例](../examples/classification-ls.json) |
| リビア（LY） | HS2022 | 3 | 3 | [例](../examples/classification-ly.json) |
| モロッコ（MA） | HS2022 | 2 | 2 | [例](../examples/classification-ma.json) |
| モナコ（MC） | HS2022 | 2 | 2 | [例](../examples/classification-mc.json) |
| モルドバ共和国（MD） | HS2022 | 3 | 3 | [例](../examples/classification-md.json) |
| モンテネグロ（ME） | HS2022 | 3 | 3 | [例](../examples/classification-me.json) |
| サンマルタン (仏領)（MF） | HS2022 | 2 | 2 | [例](../examples/classification-mf.json) |
| マダガスカル（MG） | HS2022 | 3 | 3 | [例](../examples/classification-mg.json) |
| マーシャル諸島（MH） | HS2012 | 3 | 3 | [例](../examples/classification-mh.json) |
| 北マケドニア（MK） | HS2022 | 3 | 3 | [例](../examples/classification-mk.json) |
| マリ（ML） | HS2022 | 3 | 3 | [例](../examples/classification-ml.json) |
| ミャンマー（MM） | HS2022 | 3 | 3 | [例](../examples/classification-mm.json) |
| モンゴル国（MN） | HS2017 | 3 | 3 | [例](../examples/classification-mn.json) |
| マカオ（MO） | HS2022 | 3 | 3 | [例](../examples/classification-mo.json) |
| 北マリアナ諸島（MP） | HS2022 | 3 | 3 | [例](../examples/classification-mp.json) |
| マルティニーク（MQ） | HS2022 | 2 | 2 | [例](../examples/classification-mq.json) |
| モーリタニア（MR） | MR-TARIFF-2021 | 3 | 3 | [例](../examples/classification-mr.json) |
| モントセラト（MS） | HS2017 | 3 | 3 | [例](../examples/classification-ms.json) |
| モーリシャス（MU） | HS2022 | 3 | 3 | [例](../examples/classification-mu.json) |
| モルディブ（MV） | HS2017 | 3 | 3 | [例](../examples/classification-mv.json) |
| マラウイ（MW） | HS2022 | 3 | 3 | [例](../examples/classification-mw.json) |
| メキシコ（MX） | HS2022 | 3 | 3 | [例](../examples/classification-mx.json) |
| マレーシア（MY） | HS2022 | 3 | 3 | [例](../examples/classification-my.json) |
| モザンビーク（MZ） | HS2022 | 3 | 3 | [例](../examples/classification-mz.json) |
| ナミビア（NA） | HS2022 | 3 | 3 | [例](../examples/classification-na.json) |
| ニューカレドニア（NC） | HS2022 | 3 | 3 | [例](../examples/classification-nc.json) |
| ニジェール（NE） | HS2022 | 3 | 3 | [例](../examples/classification-ne.json) |
| ノーフォーク島（NF） | HS2022 | 3 | 3 | [例](../examples/classification-nf.json) |
| ナイジェリア（NG） | HS2022 | 3 | 3 | [例](../examples/classification-ng.json) |
| ニカラグア（NI） | HS2022 | 3 | 3 | [例](../examples/classification-ni.json) |
| ノルウェー（NO） | HS2022 | 3 | 3 | [例](../examples/classification-no.json) |
| ネパール（NP） | HS2022 | 3 | 3 | [例](../examples/classification-np.json) |
| ナウル（NR） | HS2012 | 3 | 3 | [例](../examples/classification-nr.json) |
| ニウエ（NU） | HS2012 | 3 | 3 | [例](../examples/classification-nu.json) |
| ニュージーランド（NZ） | HS2022 | 3 | 3 | [例](../examples/classification-nz.json) |
| オマーン（OM） | HS2022 | 3 | 3 | [例](../examples/classification-om.json) |
| パナマ（PA） | HS2022 | 3 | 3 | [例](../examples/classification-pa.json) |
| ペルー（PE） | HS2022 | 3 | 3 | [例](../examples/classification-pe.json) |
| 仏領ポリネシア（PF） | HS2022 | 3 | 3 | [例](../examples/classification-pf.json) |
| パプアニューギニア（PG） | HS2022 | 3 | 3 | [例](../examples/classification-pg.json) |
| フィリピン（PH） | HS2022 | 3 | 3 | [例](../examples/classification-ph.json) |
| パキスタン（PK） | HS2022 | 3 | 3 | [例](../examples/classification-pk.json) |
| サンピエール及びミクロン（PM） | HS2022 | 3 | 3 | [例](../examples/classification-pm.json) |
| プエルトリコ（PR） | HS2022 | 2 | 2 | [例](../examples/classification-pr.json) |
| パレスチナ（PS） | PS-PCBS-Local-2009 | 3 | 3 | [例](../examples/classification-ps.json) |
| パラオ（PW） | HS2022 | 3 | 3 | [例](../examples/classification-pw.json) |
| パラグアイ（PY） | HS2022 | 3 | 3 | [例](../examples/classification-py.json) |
| カタール（QA） | QA-ImportStats-2025-2026 | 2 | 2 | [例](../examples/classification-qa.json) |
| レユニオン（RE） | HS2022 | 2 | 2 | [例](../examples/classification-re.json) |
| セルビア（RS） | HS2022 | 3 | 3 | [例](../examples/classification-rs.json) |
| ロシア連邦（RU） | HS2022 | 3 | 3 | [例](../examples/classification-ru.json) |
| ルワンダ（RW） | HS2022 | 3 | 3 | [例](../examples/classification-rw.json) |
| サウジアラビア（SA） | HS2022 | 3 | 3 | [例](../examples/classification-sa.json) |
| ソロモン諸島（SB） | HS2012 | 3 | 3 | [例](../examples/classification-sb.json) |
| セーシェル（SC） | HS2022 | 3 | 3 | [例](../examples/classification-sc.json) |
| スーダン（SD） | SD-TARIFF-2017 | 3 | 3 | [例](../examples/classification-sd.json) |
| シンガポール（SG） | HS2022 | 3 | 3 | [例](../examples/classification-sg.json) |
| セントヘレナ、アセンション及びトリスタン・ダ・クーニャ（SH） | HS2012 | 4 | 4 | [例](../examples/classification-sh.json) |
| シエラレオネ（SL） | HS2017 | 3 | 3 | [例](../examples/classification-sl.json) |
| サンマリノ（SM） | HS2022 | 2 | 2 | [例](../examples/classification-sm.json) |
| セネガル（SN） | HS2022 | 3 | 3 | [例](../examples/classification-sn.json) |
| ソマリア（SO） | SO-TARIFF-2022 | 3 | 3 | [例](../examples/classification-so.json) |
| スリナム（SR） | HS2017 | 3 | 3 | [例](../examples/classification-sr.json) |
| 南スーダン（SS） | SS-EAC-TFTA-2026 | 2 | 2 | [例](../examples/classification-ss.json) |
| サントメ・プリンシペ（ST） | ST-TARIFF-2023 | 3 | 3 | [例](../examples/classification-st.json) |
| エルサルバドル（SV） | HS2022 | 3 | 3 | [例](../examples/classification-sv.json) |
| サンマルタン (オランダ領)（SX） | HS2017 | 3 | 3 | [例](../examples/classification-sx.json) |
| シリア・アラブ共和国（SY） | SY-DECREE188-2026 | 1 | 1 | [例](../examples/classification-sy.json) |
| エスワティニ（SZ） | HS2022 | 3 | 3 | [例](../examples/classification-sz.json) |
| タークス及びカイコス諸島（TC） | TC-TARIFF-2010 | 2 | 2 | [例](../examples/classification-tc.json) |
| チャド（TD） | HS2007 | 3 | 3 | [例](../examples/classification-td.json) |
| トーゴ（TG） | HS2022 | 3 | 3 | [例](../examples/classification-tg.json) |
| タイ（TH） | HS2022 | 3 | 3 | [例](../examples/classification-th.json) |
| タジキスタン（TJ） | HS2017 | 3 | 3 | [例](../examples/classification-tj.json) |
| トケラウ（TK） | HS2017 | 3 | 3 | [例](../examples/classification-tk.json) |
| 東ティモール（TL） | HS2017 | 3 | 3 | [例](../examples/classification-tl.json) |
| トルクメニスタン（TM） | TM-COMMODITY-NOMENCLATURE | 3 | 3 | [例](../examples/classification-tm.json) |
| チュニジア（TN） | HS2022 | 2 | 2 | [例](../examples/classification-tn.json) |
| トンガ（TO） | HS2012 | 3 | 3 | [例](../examples/classification-to.json) |
| トルコ（TR） | TR-TGTC-2026 | 3 | 3 | [例](../examples/classification-tr.json) |
| トリニダード・トバゴ（TT） | HS2017 | 3 | 3 | [例](../examples/classification-tt.json) |
| ツバル（TV） | HS2012 | 3 | 3 | [例](../examples/classification-tv.json) |
| 台湾（TW） | HS2022 | 3 | 3 | [例](../examples/classification-tw.json) |
| タニザニア連合共和国（TZ） | HS2022 | 3 | 3 | [例](../examples/classification-tz.json) |
| ウクライナ（UA） | HS2022 | 2 | 2 | [例](../examples/classification-ua.json) |
| ウガンダ（UG） | HS2022 | 3 | 3 | [例](../examples/classification-ug.json) |
| 米国（US） | HS2022 | 2 | 2 | [例](../examples/classification-us.json) |
| ウルグアイ（UY） | HS2022 | 3 | 3 | [例](../examples/classification-uy.json) |
| ウズベキスタン（UZ） | HS2022 | 2 | 2 | [例](../examples/classification-uz.json) |
| セントビンセント及びグレナディーン諸島（VC） | HS2022 | 3 | 3 | [例](../examples/classification-vc.json) |
| ベネズエラ・ボリバル共和国（VE） | VE-CARICOM-1992 | 2 | 2 | [例](../examples/classification-ve.json) |
| 英領ヴァージン諸島（VG） | VG-TARIFF-2010 | 3 | 3 | [例](../examples/classification-vg.json) |
| 米領ヴァージン諸島（VI） | VI-HTSUS-2026-STATISTICS | 3 | 3 | [例](../examples/classification-vi.json) |
| ベトナム（VN） | HS2022 | 3 | 3 | [例](../examples/classification-vn.json) |
| バヌアツ（VU） | HS2022 | 3 | 3 | [例](../examples/classification-vu.json) |
| ワリー及びフテュナ（WF） | WF-TARIFF-2020 | 3 | 3 | [例](../examples/classification-wf.json) |
| サモア（WS） | HS2017 | 3 | 3 | [例](../examples/classification-ws.json) |
| コソボ（XK） | XK-TARIK-2026 | 3 | 3 | [例](../examples/classification-xk.json) |
| イエメン（YE） | HS2022 | 3 | 3 | [例](../examples/classification-ye.json) |
| マヨット（YT） | HS2022 | 2 | 2 | [例](../examples/classification-yt.json) |
| 南アフリカ（ZA） | HS2022 | 3 | 3 | [例](../examples/classification-za.json) |
| ザンビア（ZM） | HS2022 | 3 | 3 | [例](../examples/classification-zm.json) |
| ジンバブエ（ZW） | HS2022 | 3 | 3 | [例](../examples/classification-zw.json) |

## 参照資料の区分と利用条件

すべて候補段階であり、国内細分・税率・原産地資格・還付資格・輸入許可・配送可否を確定しません。sourceIdsから本文、版、適用国、確認日、termsを確認してください。特殊なreferenceBasisから国内税番の承認適格性は作りません。

| referenceBasis | 用途・制限 |
| --- | --- |
| official_reference／未指定 | 公式資料への参照。現在の適用税率を検証済みという意味ではない |
| wto_bound_nomenclature | 当該国のWTO譲許表・変更添付に実在する品目の参照。現行国内適用税表と区別 |
| agreement_nomenclature | 当該国の協定附属書に掲載された基礎分類。発効・資格・現在の税率を推定しない |
| national_edition_reference | 確認した国別公表表・統計分類等の独立版。未確認の国際HS版へ読み替えない |

CEMAC6国の公式2009年表はHS2007の歴史的基礎参照です。WTOの変更添付にコーヒーがない国では、実在する柑橘・野菜・乾燥シイタケ等だけを採用しました。PACER関連附属書には当時のactual/proxy分類を含み、現在の国内分類や協定の適用を証明するものではありません。

国別の版が不明確なIL、FO、XK、KM等は、その公表表の独立識別子へ固定します。KMの非標準な誤記は採用せず、QAの言語間で矛盾する品目も除外しました。SD・WF等の公式検索本文だけを確認した範囲は出典termsに明示します。ERは政府書簡に基づくUNEP報告のHFC分野とWCOの具体品目・注釈に基づき、純粋単一のHFC-32/HFC-134aだけを対象とし、他商品へ採用範囲を外挿しません。

旧来のSIECA/UEMOA/SACU/EAC/EAEU/EU等の展開も、正式な適用範囲を確認した国だけへ限定しています。単なる加盟・政治的所属・出典リンクの存在から候補を追加しません。詳細は[rc.30調査記録](HS_CLASSIFICATION_RESEARCH_RC30.md)、[rc.29調査記録](HS_CLASSIFICATION_RESEARCH_RC29.md)と[rc.28調査記録](HS_CLASSIFICATION_RESEARCH_RC28.md)へ残しています。

## 出典レコード

同一URLの版・用途が異なるレコードは同一資料の独立した検証回数として数えません。内部確認期間は原則2026-11-18〜12-18であり、法令の法的有効期間や刊行年ではありません。

| 出典ID | 資料 | 分類版 | referenceBasis | 確認した対象 |
| --- | --- | --- | --- | --- |
| `jp-ruling-cellulose-filter-2024` | [日本税関：セルロースが主要な特性を与えるろ過材](<https://www.customs.go.jp/tetsuzuki_search/bunrui/J1/24/J12400968.htm>) | HS2022 | official_reference | JP |
| `jp-ruling-mineral-filter-2024` | [日本税関：鉱物性材料が主要な機能を担うろ過材](<https://www.customs.go.jp/tetsuzuki_search/bunrui/J1/24/J12400541.htm>) | HS2022 | official_reference | JP |
| `us-usitc-vacuum-vessels-hs6-2026` | [USITC：真空保温容器のHS6参照](<https://hts.usitc.gov/search?query=961700>) | HS2022 | official_reference | PR, US |
| `us-usitc-nonporcelain-tableware-hs6-2026` | [USITC：磁器以外の陶磁製食卓用品のHS6参照](<https://hts.usitc.gov/search?query=6912.00>) | HS2022 | official_reference | PR, US |
| `ca-cbsa-ceramic-products-hs6-2026` | [CBSA：2026年カナダ品目表第69類のHS6参照](<https://www.cbsa-asfc.gc.ca/trade-commerce/tariff-tarif/2026/html/02/ch69-eng.html>) | HS2022 | official_reference | CA |
| `cn-gacc-2025-259-official-reprint` | [中国海関総署2025年第259号・分類決定（香港政府の公式再掲）](<https://www.tid.gov.hk/en/tradecircular/files/2026/ci512026a.pdf>) | HS2022 | official_reference | CN |
| `sg-customs-product-guide-2022` | [Singapore Customs Product Guide v4.0（2022年6月・HS2022）](<https://go.gov.sg/productguide>) | HS2022 | official_reference | SG |
| `au-hs2022-coffee` | [豪州ABF：コーヒーのHS6参照候補](<https://www.abf.gov.au/importing-exporting-and-manufacturing/tariff-classification/current-tariff/schedule-3/section-ii/chapter-9>) | HS2022 | official_reference | AU, CC, CX, NF |
| `nz-hs2022-coffee-20261020` | [NZ税関：2026年10月20日版コーヒーのHS6参照候補](<https://www.customs.govt.nz/media/cfch3obt/section-ii-effective-20-october-2026.pdf>) | HS2022 | official_reference | NZ |
| `eu-reg-2023-1420-bone-china-plate` | [EU規則2023/1420：実用性のあるボーンチャイナ製装飾皿](<https://eur-lex.europa.eu/eli/reg_impl/2023/1420/oj/eng>) | HS2022 | official_reference | AD, AT, AX, BE, BG, CY, CZ, DE, DK, EE, ES, FI, FR, GF, GP, GR, HR, HU, IE, IT, LT, LU, LV, MC, MF, MQ, MT, NL, PL, PT, RE, RO, SE, SI, SK, SM, YT |
| `eu-reg-2024-3133-beanbag-shell` | [EU規則2024/3133：未充填の大型クッション用シェル](<https://eur-lex.europa.eu/eli/reg_impl/2024/3133/oj/eng>) | HS2022 | official_reference | AD, AT, AX, BE, BG, CY, CZ, DE, DK, EE, ES, FI, FR, GF, GP, GR, HR, HU, IE, IT, LT, LU, LV, MC, MF, MQ, MT, NL, PL, PT, RE, RO, SE, SI, SK, SM, YT |
| `gb-hmrc-ceramics-guidance-2026` | [HMRC陶磁器分類ガイド：セラミック製グラインダー部を持つ塩挽き](<https://www.gov.uk/guidance/classifying-ceramics>) | HS2022 | official_reference | GB |
| `gb-hmrc-coffee-roasted-api-2026` | [HMRC Trade Tariff API：焙煎済み・非脱カフェインのコーヒー](<https://www.trade-tariff.service.gov.uk/api/v2/commodities/0901210000>) | HS2022 | official_reference | GB, GG, IM, JE |
| `gb-hs2022-nomenclature-annex-2025` | [英国政府公開資料：HS2022のコーヒー品目対応](<https://assets.publishing.service.gov.uk/media/687e5e378adf4250705c96db/uk_india_ceta_annex3a_product_specific_rules_of_origin.pdf>) | HS2022 | official_reference | GB, GG, IM, JE |
| `kr-government-coffee-hs6-20221231` | [韓国政府公開・関税法付表（2022年12月31日改正版）：コーヒーのHS6参照](<https://trade.forest.go.kr/file/download/e085580b-8935-404e-a5e9-8b43137fbed720241002154014811/5>) | HS2022 | official_reference | KR |
| `kr-kcs-hs2022-adoption` | [韓国関税庁：HS2022の輸出入適用開始案内](<https://www.customs.go.kr/kcs/na/ntt/selectNttInfo.do?mi=2891&nttSn=10059678&nttSnUrl=search>) | HS2022 | official_reference | KR |
| `tw-customs-coffee-hs2022-2023` | [台湾関務署：112年版輸入税則合訂本（上）・コーヒーのHS6参照](<https://web.customs.gov.tw/download/fbac2681c6fe4492a5d3a7ab9a97b417>) | HS2022 | official_reference | TW |
| `tw-customs-hs2022-downloads` | [台湾関務署：HS2022年版資料区（2026年11月2日更新）](<https://web.customs.gov.tw/singlehtml/1205?cntId=b0461e083fdf46d0a26a696be4fdb1e5>) | HS2022 | official_reference | TW |
| `hk-censtatd-hkhs2022-coffee` | [香港政府統計処：HKHS2022第1冊・コーヒーのHS6参照](<https://www.censtatd.gov.hk/en/data/stat_report/product/B2XX0011/att/B2XX0011012022XXXXB0100.pdf>) | HS2022 | official_reference | HK |
| `hk-censtatd-alpha-list-2026` | [香港政府統計処：2026年の常見貨品名称・コーヒー区分](<https://www.censtatd.gov.hk/FileManager/TC/Content_93/alpha_list.pdf>) | HS2022 | official_reference | HK |
| `mo-dsec-ncem-hs2022-coffee` | [マカオ統計調査局：NCEM/HS2022第7版・コーヒーのHS6参照](<https://www.dsec.gov.mo/getdoc/cdc315c4-da4f-4db4-b087-852a3ceb4617/HS2020.aspx>) | HS2022 | official_reference | MO |
| `my-customs-duty-order-2025-coffee` | [マレーシア税関：2025年関税令第9類のHS6参照](<https://www.customs.gov.my/images/06-prosedur/perintah-kastam/perintah/PUA_384.pdf>) | HS2022 | official_reference | MY |
| `my-hs2022-coffee-annex-2026` | [マレーシア税関：2026年公開附属書によるHS2022照合](<https://www.customs.gov.my/images/06-prosedur/perintah-kastam/perintah/PUA_181_2026.pdf>) | HS2022 | official_reference | MY |
| `th-customs-coffee-nomenclature` | [タイ税関：参考用英語分類表第9類のHS6参照](<https://www.customs.go.th/data_files/3a4ffe38a9a5a67e1e4724218016c369.pdf>) | HS2022 | official_reference | TH |
| `th-customs-hs2022-coffee-annex` | [タイ税関：HS2022附属書のコーヒー区分照合](<https://www.customs.go.th/data_files/f196d2a22b72858f299fca59022ee563.pdf>) | HS2022 | official_reference | TH |
| `ph-tc-ahtn2022-coffee-2024-2028` | [フィリピン関税委員会：AHTN2022第9類のHS6参照](<https://drive.google.com/file/d/1WiIjbJBXF7-WVriogOhuv1Y3Bln79zvJ/view?usp=sharing>) | HS2022 | official_reference | PH |
| `ph-tc-ahtn2022-index` | [フィリピン関税委員会：AHTN2022公式章別索引](<https://newtc.tariffcommission.gov.ph/tariff-book/>) | HS2022 | official_reference | PH |
| `vn-customs-hs2022-coffee-annex-2024` | [ベトナム税関Trade Portal：2024年公開HS2022附属書のコーヒー区分](<https://www.vietnamtradeportal.gov.vn/index.php?id=4135&r=site/display>) | HS2022 | official_reference | VN |
| `id-mof-hs2022-coffee-base` | [インドネシア財務省：26/PMK.010/2022のHS2022コーヒー区分](<https://jdih.kemenkeu.go.id/api/download/04d90736-33d5-4b72-92a3-0d2b7c6bb8bd/26~PMK.010~2022Per.pdf>) | HS2022 | official_reference | ID |
| `id-customs-btki2022-reference` | [インドネシア税関：BTKI2022公式参照案内](<https://www.beacukai.go.id/btki-dan-tarif>) | HS2022 | official_reference | ID |
| `in-dgft-itc2022-import-appendix-v` | [インドDGFT：ITC(HS)2022輸入政策付録V・コーヒー区分](<https://content.dgft.gov.in/Website/dgftprod/b1664c58-420e-401b-8e11-3f95d316a5cb/Appendix-V-updated%20%281%29.pdf>) | HS2022 | official_reference | IN |
| `ae-dubai-coffee-correlation-v3-3` | [UAEドバイ税関：統合税番対応表v3.3・コーヒー区分](<https://www.dubaicustoms.gov.ae/en/PoliciesAndNotices/Documents/HSCodeMaster-v3.3customers.xlsx>) | HS2022 | official_reference | AE |
| `ae-dubai-gcc-hs2022-transition-guide` | [UAEドバイ税関：HS2022に基づく12桁統合税番移行ガイド](<https://www.dubaicustoms.gov.ae/en/PoliciesAndNotices/Documents/IntegratedCustomsTariffv4.pdf>) | HS2022 | official_reference | AE |
| `sa-zatca-coffee-hs6-search` | [サウジZATCA：統合税番検索・コーヒー区分](<https://eservices.zatca.gov.sa/sites/sc/ar/SCTariffs/Pages/Pages/SearchTariffsPage%20.aspx?SearchFor=9>) | HS2022 | official_reference | SA |
| `ch-bazg-general-tariff-20250301` | [スイスBAZG：2025年3月版一般輸入品目表・コーヒー](<https://www.bazg.admin.ch/dam/en/sd-web/T495snjnoiLu/tarif_general.pdf>) | HS2022 | official_reference | CH, LI |
| `ch-bazg-hs2022-revision` | [スイスBAZG：2022年HS改訂の採用案内](<https://www.bazg.admin.ch/de/zolltarif-aenderungen-2022>) | HS2022 | official_reference | CH, LI |
| `no-tolletaten-coffee-tariff-2026` | [ノルウェー税関：2026年品目表・コーヒーとHS2022の説明](<https://www.toll.no/files/e9d43fc8a9d49f811d58e1aa47a752ff12b5560c.pdf>) | HS2022 | official_reference | NO |
| `is-skatturinn-coffee-hs2022-2026` | [アイスランド税関：2026年適用のTollskrá 2022第3版・コーヒー](<https://www.skatturinn.is/media/tollamal/Tollskra-2022-3.pdf>) | HS2022 | official_reference | IS |
| `br-mdic-tec-coffee-20261111` | [ブラジルMDIC：2026年11月11日版TEC・コーヒーのHS6参照](<https://www.gov.br/mdic/pt-br/assuntos/camex/estrategia-comercial/arquivos-listas/11-11-2026-anexos-i-a-x-resolucao-gecex-272-21.xlsx>) | HS2022 | official_reference | BR |
| `br-mdic-hs2022-current-guide` | [ブラジルMDIC：SH2022体系と現行TEC資料の案内](<https://www.gov.br/mdic/pt-br/assuntos/camex/se-camex/strat/tarifas/vigentes/tarifas-vigentes>) | HS2022 | official_reference | BR |
| `mx-snice-ligie-coffee-20250728` | [メキシコSNICE：2025年7月28日版LIGIE統合資料・コーヒーのHS6参照](<https://www.snice.gob.mx/~oracle/SNICE_DOCS/LIGIE-UNIFICADA-LIGIE_20250728-20250728.pdf>) | HS2022 | official_reference | MX |
| `mx-snice-fractions-20261014` | [メキシコSNICE：2026年10月14日版品目コード一覧のHS6照合](<https://www.snice.gob.mx/~oracle/SNICE_DOCS/FRACCIONESARANCELARIAS-LIGIE_20261014-20261014.xlsx>) | HS2022 | official_reference | MX |
| `mx-snice-hs2022-implementation` | [メキシコSNICE：LIGIEのHS2022導入案内](<https://www.snice.gob.mx/cs/avi/snice/ligie.info22.html>) | HS2022 | official_reference | MX |
| `za-sars-coffee-20261113` | [南アフリカSARS：2026年11月13日版Schedule 1 Part 1・コーヒーのHS6参照](<https://www.sars.gov.za/wp-content/uploads/Legal/SCEA1964/Legal-LPrim-CE-Sch1P1Chpt1-to-99-Schedule-No-1-Part-1-Chapters-1-to-99.pdf>) | HS2022 | official_reference | BW, LS, NA, SZ, ZA |
| `za-sars-hs2022-implementation` | [南アフリカSARS：HS2022導入案内](<https://www.sars.gov.za/legal-counsel/primary-legislation/hs-2022/>) | HS2022 | official_reference | ZA |
| `cl-subrei-hs2022-coffee` | [チリSUBREI掲載官報：HS2022導入版のコーヒーHS6参照](<https://www.subrei.gob.cl/docs/default-source/default-document-library/arancel_aduanero_nacional_de_la_republica_de_chile.pdf>) | HS2022 | official_reference | CL |
| `wco-hs2022-implementation-20260723` | [WCO：HS実施状況表（HS2022導入欄の補足照合）](<https://www.wcoomd.org/~/media/WCO/Public/Global/PDF/Topics/Nomenclature/Overview/HS%20Contracting%20Parties/Positions%20of%20CP/Situation_HS.ashx>) | HS2022 | official_reference | AL, BD, GN, IS, JO, MA, MK, MU, NG, NP, PG, SA, SC, TN |
| `sieca-sac-v6-coffee-202508` | [SIECA：2025年8月版SAC第7次改訂・コーヒーのHS6参照](<https://www.sieca.int/recursos/arancel-centroamericano-importacion/?wpdmdl=47049&ind=1757371835197&filename=SACVIIENM-WORD-VERSION6-AGOSTO25-COMPRIMIDO.pdf>) | HS2022 | official_reference | GT, SV, HN, NI, CR |
| `sieca-sac-hs2022-resolution-450-2021` | [SIECA：決議450-2021によるHS2022改訂と地域適用の照合](<https://www.sieca.int/recursos/resolucion-450-2021-comieco/>) | HS2022 | official_reference | GT, SV, HN, NI, CR |
| `ar-arca-ncm2022-coffee-reference` | [アルゼンチンARCA：HS2022に基づくNCM・コーヒーの参照](<https://biblioteca.arca.gob.ar/pdfp/anexo_6992944_1.pdf>) | HS2022 | official_reference | AR |
| `py-mef-ncm2022-coffee-202510` | [パラグアイMEF：2025年10月版参考税表のコーヒー区分](<https://www.mef.gov.py/sites/default/files/2025-11/Arancel%20Nacional%20Vigente_octubre%202025_1.pdf>) | HS2022 | official_reference | PY |
| `uy-mef-ncm2022-coffee-annex` | [ウルグアイMEF：2022年NCM附属書のコーヒー区分](<https://www.gub.uy/ministerio-economia-finanzas/sites/ministerio-economia-finanzas/files/2021-12/Anexo%20I%20-%20NCM%202022%20%28VII%20Enmienda%29.pdf>) | HS2022 | official_reference | UY |
| `uy-mef-national-coffee-202502` | [ウルグアイMEF：2025年2月版国内コードのHS6照合](<https://www.gub.uy/ministerio-economia-finanzas/sites/ministerio-economia-finanzas/files/2025-05/Arancel%20Nacional_10%20d%C3%ADgitos_Febrero%202025%20-final.xlsx>) | HS2022 | official_reference | UY |
| `uy-mef-hs2022-nomenclature-guide` | [ウルグアイMEF：HS2022に基づく国内分類と公式資料の案内](<https://www.gub.uy/ministerio-economia-finanzas/nomenclatura-aranceles-uruguay-0>) | HS2022 | official_reference | UY |
| `pe-sunat-hs2022-coffee-2022` | [ペルーSUNAT：2022年輸入税表のコーヒー区分](<https://www.sunat.gob.pe/legislacion/procedim/normasadua/gja-04/ctrlCambios/anexos/Arancel_2022.pdf>) | HS2022 | official_reference | PE |
| `co-dian-decree1881-coffee` | [コロンビアDIAN：政令1881/2021のHS2022コーヒー区分](<https://normograma.dian.gov.co/dian/compilacion/docs/decreto_1881_2021.htm>) | HS2022 | official_reference | CO |
| `ec-comex-hs2022-coffee-2023` | [エクアドルCOMEX：決議002-2023のHS2022コーヒー区分](<https://www.produccion.gob.ec/wp-content/uploads/2023/03/Resolucio%CC%81n-002-2023.pdf>) | HS2022 | official_reference | EC |
| `jm-jca-integrated-coffee-20261030` | [ジャマイカ税関：2026年10月30日版HS2022統合税表のコーヒー区分](<https://jca.gov.jm/wp-content/uploads/2026/11/INTEGRATED-TARIFF-BASED-ON-HS-2022-October-30-2026.pdf>) | HS2022 | official_reference | JM |
| `bz-customs-hs2022-coffee-ch09` | [ベリーズ税関：HS2022第9類のコーヒー区分](<https://www.customs.gov.bz/tariffs_PDF/15_CHAPTER%209COFFEE,%20TEA,%20MAT%C3%89%20AND%20SPICES.pdf>) | HS2022 | official_reference | BZ |
| `vc-customs-classification-coffee` | [セントビンセント税関：輸入分類一覧のコーヒーHS6照合](<https://customs.gov.vc/downloads/tariff-classification.pdf>) | HS2022 | official_reference | VC |
| `vc-customs-hs2022-adoption-act21` | [セントビンセント：2022年改正法第21号によるHS2022共通表の採用](<https://customs.gov.vc/downloads/Act%20No.%2021%20Customs%20Duties%20(Amendment)%20Act,%202022.pdf>) | HS2022 | official_reference | VC |
| `caricom-cet-hs2022-coffee-for-vc` | [CARICOM：HS2022共通表のコーヒー区分（VC国内資料と併用）](<https://caricom.org/wp-content/uploads/CET-based-on-HS2022-Final.pdf>) | HS2022 | official_reference | VC |
| `do-dga-arancel2022-coffee` | [ドミニカ共和国DGA：2022年公式税表のコーヒー区分](<https://cdnm.heyzine.com/files/uploaded/v2/afb3acbd131d1e36f30088edcc4b65f9d0d3a8f1.pdf>) | HS2022 | official_reference | DO |
| `do-dga-arancel2022-official-publication` | [ドミニカ共和国DGA：2022年第7次改訂税表の公式公開元](<https://www.aduanas.gob.do/consultas/arancel-de-aduanas-7ma-enmienda-2022/>) | HS2022 | official_reference | DO |
| `pa-gaceta-hs2022-coffee-20211202` | [パナマ官報29427-B：HS2022採用税表のコーヒー区分](<https://www.gacetaoficial.gob.pa/storage/gacetas/2021/12/29427_B/GacetaNo_29427b_20211202.pdf>) | HS2022 | official_reference | PA |
| `bo-production-hs2022-annex2026` | [ボリビア政府：2026年附属書によるHS2022品目記述の照合](<https://dgaj.produccion.gob.bo/docs/RESOLUCION-BI-MINISTERIAL-N-001.2026.pdf>) | HS2022 | official_reference | BO |
| `uemoa-cet-coffee-hs2022` | [UEMOA：TEC2022公式共通品目分類・コーヒー](<https://www.e-docucenter.uemoa.int/sites/default/files/2024-09/UEMOA_TEC2022_V4.pdf>) | HS2022 | official_reference | BJ, BF, CI, GW, ML, NE, SN, TG |
| `wco-uemoa-hs2022-adoption-20260617` | [WCO：2026年6月17日UEMOA8国の共通税表とHS2022採用の説明](<https://www.wcoomd.org/fr/media/newsroom/2026/june/waemu-facilitates-origin-determination-by-aligning-to-hs-2022.aspx?p=1>) | HS2022 | official_reference | BJ, BF, CI, GW, ML, NE, SN, TG |
| `gn-dgd-cet-coffee-hs2022` | [ギニア税関：公式TEC SH2022公開表・コーヒー](<https://dgd.gov.gn/wp-content/uploads/2024/02/Copie-de-TEC-version-SH-2022-GP.pdf>) | HS2022 | official_reference | GN |
| `ng-ncs-cet-coffee-2026` | [ナイジェリア税関：2026年CET公式API・コーヒー](<https://cet-backend.customs.gov.ng/api/harmonized-system/tariff-lines?edition=2026&page=1&per_page=all>) | HS2022 | official_reference | NG |
| `eg-customs-hs2022-decree-218-2022` | [エジプト税関：大統領令218/2022・HS2022コーヒー区分](<https://customs.gov.eg/Upload/ECAAdminace/d772d67c-ffad-4b8c-b89e-fcdd188d2064.pdf>) | HS2022 | official_reference | EG |
| `lr-lra-coffee-hs2022` | [リベリア歳入庁：公式HS2022品目表・コーヒー](<https://revenue.lra.gov.lr/wp-content/uploads/2023/04/LIBERIA-CUSTOMS-TARIFF-HS-2022.pdf>) | HS2022 | official_reference | LR |
| `lr-lra-hs2022-publication` | [リベリア歳入庁：Customs Laws & RegulationsのHS2022公開元](<https://revenue.lra.gov.lr/customs-laws-regulations/>) | HS2022 | official_reference | LR |
| `cv-dnre-coffee-hs2022-2026` | [カーボベルデDNRE：2026年版SH2022公式品目表・コーヒー](<https://www.mf.gov.cv/documents/54571/63592/PAUTA+ADUANEIRA_2026.xlsx/7c03ad59-cf82-efbc-f965-e72d12eb35e9?t=1770725795112>) | HS2022 | official_reference | CV |
| `cv-boe-hs2022-adoption-2025` | [カーボベルデ官報：法律51/X/2025・HS2022第7次改訂導入](<https://boe.incv.cv/Bulletins/View/84887>) | HS2022 | official_reference | CV |
| `ma-finance-act-2023-green-coffee` | [モロッコ財務省：2023年財政法・未焙煎コーヒーの2区分](<https://www.finances.gov.ma/Publication/db/2023/BO_7154-bis_Ar.pdf>) | HS2022 | official_reference | MA |
| `tn-customs-unroasted-coffee-lookup` | [チュニジア税関：未焙煎・非脱カフェインのコーヒー照会](<https://www.douane.gov.tn/tarifwebnew/getresultat.php?chap=09&choix=2&sel=09011100000>) | HS2022 | official_reference | TN |
| `tn-customs-roasted-coffee-lookup` | [チュニジア税関：非粉砕・焙煎済み非脱カフェインのコーヒー照会](<https://www.douane.gov.tn/tarifwebnew/getresultat.php?chap=09&choix=2&sel=09012100028>) | HS2022 | official_reference | TN |
| `sacu-hs2022-simultaneous-adoption` | [SACU事務局：全加盟国のHS2022共通品目表への移行完了](<https://www.sacu.int/uploads/documents/7755c28fdc23bc6668d3498cd468dcbef8d40a25.pdf>) | HS2022 | official_reference | BW, LS, NA, SZ |
| `na-government-sacu-tariff-scope` | [ナミビア政府Trade Portal：HS22・SACU共通品目表の5加盟国適用範囲](<https://namibiatradeportal.gov.na/trade-goods/tariffs>) | HS2022 | official_reference | BW, LS, NA, SZ |
| `eac-cet-hs2022-coffee-202506` | [EAC共通品目表HS2022・2025年6月更新版（RRA公開）：コーヒーのHS6参照](<https://www.rra.gov.rw/fileadmin/user_upload/COMMON_EXTERNAL_TARIFF__Updated_June_2025.pdf>) | HS2022 | official_reference | KE, RW, BI, TZ, UG |
| `ke-kra-hs2022-cet-implementation` | [ケニアKRA：HS2022・EAC CET2022実施案内](<https://www.kra.go.ke/news-center/public-notices/1733-implementation-of-the-2022-harmonized-system-the-2022-east-african-community-common-external-tariff>) | HS2022 | official_reference | KE |
| `rw-rra-hs2022-cet-publication` | [ルワンダRRA：EAC共通品目表2022・2025年6月更新版の公式公開元](<https://www.rra.gov.rw/index.php?L=0&id=129>) | HS2022 | official_reference | RW |
| `bi-obr-cet2022-implementation` | [ブルンジOBR：2022年版共通外部関税表の運用開始案内](<https://www.obr.bi/images/PDF/Communiqu%C3%A9_Tarif_Ext%C3%A9rieur_Commun_copy_copy.pdf>) | HS2022 | official_reference | BI |
| `tz-tra-cet-hs2022-coffee-202506` | [タンザニアTRA：HS2022共通品目表・2025年6月更新版](<https://www.tra.go.tz/images/uploads/pages/CET_2022_VERSION_Updated_June_2025.pdf>) | HS2022 | official_reference | TZ |
| `ug-ura-cet2022-publication` | [ウガンダURA：2022年版共通品目表の公式公開案内](<https://ura.go.ug/en/download/common-external-tariff-2022-version/>) | HS2022 | official_reference | UG |
| `mg-customs-coffee-hs2022-202607` | [マダガスカル税関：HS2022に基づく2026年7月版品目表](<https://www.douanes.gov.mg/srcs/uploads/2026/07/TARIF-DES-DOUANES-2026-MAJ-LFR.pdf>) | HS2022 | official_reference | MG |
| `zw-zimra-coffee-hs2022-si203` | [ジンバブエZIMRA：S.I.203/2022コーヒーのHS6参照](<https://www.zimra.co.zw/customs/classification-of-goods/tariff-handbook?download=393:download-tariff-handbook>) | HS2022 | official_reference | ZW |
| `zw-zimra-hs2022-adoption` | [ジンバブエZIMRA：2022年版HSへの移行説明](<https://www.zimra.co.zw/customs/classification-of-goods/customs-and-excise-duties-2022>) | HS2022 | official_reference | ZW |
| `mw-rat-coffee-hs2022-2025-reference` | [マラウイ政府Revenue Appeals Tribunal掲載：HS2022版品目表のコーヒー区分](<https://elibrary.rat.gov.mw/server/api/core/bitstreams/771322c5-bd77-4da8-ad05-71592bd61b1d/content>) | HS2022 | official_reference | MW |
| `mw-rat-hs2022-tariff-publication` | [マラウイ政府Revenue Appeals Tribunal：HS2022品目表の公式公開元](<https://elibrary.rat.gov.mw/items/e800e97d-2b66-4554-9804-ede8539e7c80/full>) | HS2022 | official_reference | MW |
| `sc-tradeportal-hs2022-coffee-reference` | [セーシェル政府Trade Portal：HS2022参照表のコーヒー区分](<https://www.tradeportal.sc/wp-content/uploads/2024/04/Reference-Document-HS-2022-2026-1.xlsx>) | HS2022 | official_reference | SC |
| `sc-tradeportal-tariff-publication` | [セーシェル政府Trade Portal：現行税関参照表への公式導線](<https://www.tradeportal.sc/>) | HS2022 | official_reference | SC |
| `mu-mra-coffee-hs2022-20261001` | [モーリシャスMRA：2026年10月1日版統合品目表のコーヒー区分](<https://www.mra.mu/download/TariffInf011026.pdf>) | HS2022 | official_reference | MU |
| `mu-mra-tariff-publication-202610` | [モーリシャスMRA：2026年10月版統合品目表の公式公開元](<https://www.mra.mu/index.php/customs1/tariff-information>) | HS2022 | official_reference | MU |
| `eaeu-eec-coffee-hs2022-chapter09` | [EEC：EAEU共通品目表第9類・コーヒーのHS6参照](<https://eec.eaeunion.org/upload/files/catr/ett/ru.09_2022_25.04.2022.pdf>) | HS2022 | official_reference | AM, BY, KZ, KG, RU |
| `eaeu-eec-five-country-hs2022-classifications` | [EEC：5加盟国の共通HS2022品目体系対応表（2022年1月1日）](<https://eec.eaeunion.org/upload/files/dep_stat/metadata/classification/%D0%A1%D0%B2%D0%BE%D0%B4%D0%BD%D0%B0%D1%8F%20%D1%82%D0%B0%D0%B1%D0%BB%D0%B8%D1%86%D0%B0%201%20%D1%8F%D0%BD%D0%B2%D0%B0%D1%80%D1%8F%202022.pdf>) | HS2022 | official_reference | AM, BY, KZ, KG, RU |
| `al-customs-nomenclature-coffee-2026` | [アルバニア税関：2026年複合品目表第9類](<https://dogana.gov.al/dokument/6715/nomenklatura-2026>) | HS2022 | official_reference | AL |
| `rs-customs-coffee-consolidated-2026` | [セルビア税関：2026年統合品目表・コーヒー](<https://www.carina.rs/upload/media/2026/7/17/70031/Regulation_on_harmonization_of_the_Customs_Tariff_nomenclature_for_the_2026_consolidated.pdf>) | HS2022 | official_reference | RS |
| `rs-customs-hs2022-basis-2026` | [セルビア税関：HS2022と2026年CNへの対応案内](<https://www.carina.rs/privreda/tarifski-poslovi/carinska-tarifa/privreda_carinska_tarifa_opste.html>) | HS2022 | official_reference | RS |
| `mk-customs-coffee-workbook-2026` | [北マケドニア税関：CT 2026公式品目表・コーヒー](<https://customs.gov.mk/content/CT%20%202026.xlsx>) | HS2022 | official_reference | MK |
| `me-taricg-coffee-hierarchy-2026` | [モンテネグロ税関：TARICGのコーヒー分類階層](<https://taric.carina.co.me/TariCG/public/Browse.jsp?pindent=0&ptarifa=0901000000>) | HS2022 | official_reference | ME |
| `me-customs-hs2022-reference` | [モンテネグロ税関：HS2022を法的基礎として示す分類案内](<https://www.gov.me/upravacarina/carinska-tarifa>) | HS2022 | official_reference | ME |
| `md-statistics-hs2022-combined-nomenclature` | [モルドバ政府統計局：HS2022複合品目表（2022年12月15日）](<https://statistica.gov.md/files/files/Clasificatoare/Nomenclatura_Combinat%C4%83_a_Marfurilor_2022_din_15_12_2022.docx>) | HS2022 | official_reference | MD |
| `md-trade-portal-hs2022-adoption` | [モルドバ政府Trade Portal：第7版への移行と国内適用の案内](<https://trade.gov.md/ro/articles/nomenclatura-combinata-a-marfurilor-republicii-moldova>) | HS2022 | official_reference | MD |
| `jo-customs-jcap-coffee-search` | [ヨルダン税関：JCAP公式コーヒー品目検索](<https://asytrade.customs.gov.jo/customs/tariff?lang=en>) | HS2022 | official_reference | JO |
| `om-customs-coffee-tariff-2026` | [オマーン税関：2026年統合品目表・コーヒー](<https://www.customs.gov.om/media/gmglqkjb/2026-4.pdf>) | HS2022 | official_reference | OM |
| `om-gazette-hs2022-own-schedule-annex2b` | [オマーン官報1636号：Annex 2BのオマーンHS8（2022）品目表](<https://www.mjla.gov.om/images/legislation/file/Book317360.pdf>) | HS2022 | official_reference | OM |
| `li-government-swiss-customs-territory` | [リヒテンシュタイン政府：スイス関税領域への所属と輸入手続の適用](<https://www.llv.li/de/privatpersonen/mobilitaet-reisen-und-ausland/grenzuebertritt-und-warenverkehr>) | HS2022 | official_reference | LI |
| `ua-customs-import-control-coffee-2025` | [ウクライナ税関掲載：2025年輸入管理資料の未焙煎コーヒー区分](<https://customs.gov.ua/documents/pro-zatverdzhennia-pereliku-dokumentiv-ta-abo-vidomostei-iaki-neobkhidno-podati-derzhavnii-sluzhbi-ukrayini-z-pitan-bezpeki-kharchovikh-produktiv-ta-zakhistu-spozhivachiv-dlia-zdiisnennia-vidpovidnogo-zakhodu-561>) | HS2022 | official_reference | UA |
| `ua-customs-hs2022-uktzed-adoption` | [ウクライナ税関：2023年1月施行UKTZEDのHS2022基礎の説明](<https://customs.gov.ua/news/zagalne-20/post/zakon-ukrayini-no-2697-ix-pro-mitnii-tarif-ukrayini-nabiraie-chinnosti-z-1-sichnia-2023-roku-1016>) | HS2022 | official_reference | UA |
| `bd-nbr-coffee-ch9` | [バングラデシュNBR：第9類コーヒーのHS6参照](<https://nbr.gov.bd/uploads/tariff_schedule/Chapter_9.pdf>) | HS2022 | official_reference | BD |
| `np-customs-coffee-2083-84` | [ネパール税関：FY2083/84輸入税表・コーヒーのHS6参照](<https://giwmscdnone.gov.np/media/files/%E0%A4%8F%E0%A4%95%E0%A5%80%E0%A4%95%E0%A5%83%E0%A4%A4%20%E0%A4%AD%E0%A4%A8%E0%A5%8D%E0%A4%B8%E0%A4%BE%E0%A4%B0%20%E0%A4%AE%E0%A4%B9%E0%A4%B8%E0%A5%81%E0%A4%B2%20%E0%A4%A6%E0%A4%B0%E0%A4%AC%E0%A4%A8%E0%A5%8D%E0%A4%A6%E0%A5%80%20%E0%A5%A8%E0%A5%A6%E0%A5%AE%E0%A5%A9%E0%A5%A4%E0%A5%A6%E0%A5%AE%E0%A5%AA_qv4xx54.pdf>) | HS2022 | official_reference | NP |
| `pk-fbr-coffee-2026-27` | [パキスタンFBR：FY2026/27品目表・コーヒーのHS6参照](<https://download1.fbr.gov.pk/Docs/20268251181330180Tariff-2026-27.pdf>) | HS2022 | official_reference | PK |
| `pk-fbr-hs2022-adoption` | [パキスタンFBR：2022年予算のHS2022採用案内](<https://www.fbr.gov.pk/Budget2022-23/SalientFeatures/Salient-Feature.pdf>) | HS2022 | official_reference | PK |
| `lk-customs-coffee-2026` | [スリランカ税関：2026年11月公開第9類・コーヒーのHS6参照](<https://www.customs.gov.lk/wp-content/uploads/2026/11/Tariff%20Guide%20%20Updated%2003.11.2026/3.Tariff%202022%20Section%20II%20Final%20Printable%20(Chapter%206-14)/Tariff%202022%20Section%20I%20Final_Chap_09.pdf>) | HS2022 | official_reference | LK |
| `lk-customs-hs2022-preamble` | [スリランカ税関：2026年輸入税表ガイド前文・HS2022の説明](<https://www.customs.gov.lk/wp-content/uploads/2026/11/Tariff%20Guide%20%20Updated%2003.11.2026/1.%20Preamble/Preamble%20intergrated.pdf>) | HS2022 | official_reference | LK |
| `bt-drc-coffee-2022` | [ブータンDRC：第7版2022年品目表・コーヒーのHS6参照](<https://ecms.gov.bt/frontend/images/publication/1757981817158149.pdf>) | HS2022 | official_reference | BT |
| `bt-ecms-classification-index` | [ブータンeCMS：2022年版品目表（2026年改正）の公開元](<https://ecms.gov.bt/publication/btc-and-tariff-schedule>) | HS2022 | official_reference | BT |
| `fj-frcs-coffee-2026-27` | [フィジーFRCS：HS2022・2026/27年予算改正資料のコーヒーHS6参照](<https://frcs.org.fj/files/2026/09/HS-2022-with-2026-2027-Budget-Amendments.pdf>) | HS2022 | official_reference | FJ |
| `fj-frcs-hs2022-index` | [フィジーFRCS：HS2022関税資料の公式公開元](<https://frcs.org.fj/our-services/customs/trade-business/customs-tariff/hs/>) | HS2022 | official_reference | FJ |
| `pg-customs-coffee-hs2022` | [PNG税関：HS2022公開関税法資料・コーヒーのHS6参照](<https://customs.gov.pg/uploads/HS%202022%20Import%20%26%20Export%20Tariff%20Act.pdf>) | HS2022 | official_reference | PG |
| `vu-customs-coffee-hs2022-v4` | [バヌアツ税関：HS2022英語V4・コーヒーのHS6参照](<https://vanuatucustoms.gov.vu/images/Customs_Tariff/HS2022_English_Version_Final_V4.pdf>) | HS2022 | official_reference | VU |
| `pw-customs-coffee-hs2022` | [パラオ税関：HS2022公開資料・コーヒーのHS6参照](<https://bcbp.pw/wp-content/uploads/2024/02/PALAU-HS2022.pdf>) | HS2022 | official_reference | PW |
| `ck-mfem-coffee-hs2022` | [クック諸島MFEM：HS2022公開品目表・コーヒーのHS6参照](<https://www.mfem.gov.ck/_files/ugd/dbdf40_02d6ca6a6ae54d3fbd45b2d4cce2cf23.pdf>) | HS2022 | official_reference | CK |
| `ck-mfem-hs2022-notice` | [クック諸島MFEM：HS2022品目表の公式導入案内](<https://www.mfem.gov.ck/post/cook-islands-customs-tariff-hs2022>) | HS2022 | official_reference | CK |
| `mm-customs-coffee-hs2022` | [ミャンマー税関：MCT2022更新版・コーヒーのHS6参照](<https://customs.gov.mm/wp-content/uploads/2024/10/Customs-Tariff-of-Myanmar-2022-updated19.12.2022.pdf>) | HS2022 | official_reference | MM |
| `bn-rced-coffee-bdttc2022` | [ブルネイRCED：BDTTC2022・コーヒーのHS6参照](<https://bruneitrade.mofe.gov.bn/wp-content/uploads/2026/02/BDTTC-2022.pdf>) | HS2022 | official_reference | BN |
| `bn-rced-import-hs2022` | [ブルネイRCED：輸入分類とAHTN2022の公式案内](<https://www.customs.gov.bn/import/>) | HS2022 | official_reference | BN |
| `nc-customs-coffee-2023` | [ニューカレドニア税関：2023年1月版品目表・コーヒーのHS6参照](<https://douane.gouv.nc/sites/default/files/atoms/files/tarif_des_douanes_mj01012023.pdf>) | HS2022 | official_reference | NC |
| `nc-customs-hs2022-notice` | [ニューカレドニア税関：2022年1月31日HS2022改訂採用の公式通達](<https://douane.gouv.nc/sites/default/files/atoms/files/doc310122-31012022105934.pdf>) | HS2022 | official_reference | NC |
| `ca-cbsa-ch39-products-hs6-2026` | [カナダCBSA：T2026-2第39類・プラスチック製品のHS6参照](<https://www.cbsa-asfc.gc.ca/trade-commerce/tariff-tarif/2026/html/02/ch39-eng.html>) | HS2022 | official_reference | CA |
| `ca-cbsa-ch40-products-hs6-2026` | [カナダCBSA：T2026-2第40類・ゴム製品のHS6参照](<https://www.cbsa-asfc.gc.ca/trade-commerce/tariff-tarif/2026/html/02/ch40-eng.html>) | HS2022 | official_reference | CA |
| `ca-cbsa-ch44-products-hs6-2026` | [カナダCBSA：T2026-2第44類・木製・竹製品のHS6参照](<https://www.cbsa-asfc.gc.ca/trade-commerce/tariff-tarif/2026/html/02/ch44-eng.html>) | HS2022 | official_reference | CA |
| `ca-cbsa-ch48-products-hs6-2026` | [カナダCBSA：T2026-2第48類・紙製品のHS6参照](<https://www.cbsa-asfc.gc.ca/trade-commerce/tariff-tarif/2026/html/02/ch48-eng.html>) | HS2022 | official_reference | CA |
| `ca-cbsa-ch49-products-hs6-2026` | [カナダCBSA：T2026-2第49類・印刷物のHS6参照](<https://www.cbsa-asfc.gc.ca/trade-commerce/tariff-tarif/2026/html/02/ch49-eng.html>) | HS2022 | official_reference | CA |
| `ca-cbsa-ch61-products-hs6-2026` | [カナダCBSA：T2026-2第61類・編物衣類のHS6参照](<https://www.cbsa-asfc.gc.ca/trade-commerce/tariff-tarif/2026/html/02/ch61-eng.html>) | HS2022 | official_reference | CA |
| `ca-cbsa-ch63-products-hs6-2026` | [カナダCBSA：T2026-2第63類・繊維製家庭用品のHS6参照](<https://www.cbsa-asfc.gc.ca/trade-commerce/tariff-tarif/2026/html/02/ch63-eng.html>) | HS2022 | official_reference | CA |
| `ca-cbsa-ch65-products-hs6-2026` | [カナダCBSA：T2026-2第65類・帽子のHS6参照](<https://www.cbsa-asfc.gc.ca/trade-commerce/tariff-tarif/2026/html/02/ch65-eng.html>) | HS2022 | official_reference | CA |
| `ca-cbsa-ch66-products-hs6-2026` | [カナダCBSA：T2026-2第66類・傘のHS6参照](<https://www.cbsa-asfc.gc.ca/trade-commerce/tariff-tarif/2026/html/02/ch66-eng.html>) | HS2022 | official_reference | CA |
| `ca-cbsa-ch73-products-hs6-2026` | [カナダCBSA：T2026-2第73類・鉄鋼製家庭用品のHS6参照](<https://www.cbsa-asfc.gc.ca/trade-commerce/tariff-tarif/2026/html/02/ch73-eng.html>) | HS2022 | official_reference | CA |
| `ca-cbsa-ch85-products-hs6-2026` | [カナダCBSA：T2026-2第85類・音響機器のHS6参照](<https://www.cbsa-asfc.gc.ca/trade-commerce/tariff-tarif/2026/html/02/ch85-eng.html>) | HS2022 | official_reference | CA |
| `ca-cbsa-ch95-products-hs6-2026` | [カナダCBSA：T2026-2第95類・玩具・パズルのHS6参照](<https://www.cbsa-asfc.gc.ca/trade-commerce/tariff-tarif/2026/html/02/ch95-eng.html>) | HS2022 | official_reference | CA |
| `ca-cbsa-ch96-products-hs6-2026` | [カナダCBSA：T2026-2第96類・筆記具のHS6参照](<https://www.cbsa-asfc.gc.ca/trade-commerce/tariff-tarif/2026/html/02/ch96-eng.html>) | HS2022 | official_reference | CA |
| `ca-cbsa-hs2022-adoption-cn21-19` | [カナダCBSA：HS2022採用に関するCustoms Notice 21-19](<https://www.cbsa-asfc.gc.ca/publications/cn-ad/cn21-19-eng.html>) | HS2022 | official_reference | CA |
| `eu-customs-territorial-scope-2026` | [欧州委員会：関税・VAT・物品税の地域別適用範囲](<https://taxation-customs.ec.europa.eu/taxation/vat/vat-directive/how-does-vat-work/territorial-scope_en>) | HS2022 | official_reference | AX, GF, GP, MQ, RE, YT, MF, MC, SM |
| `eu-ucc-article4-territories` | [EU関税法典952/2013第4条：フランス・フィンランド・モナコの関税領域](<https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:02013R0952-20221212>) | HS2022 | official_reference | AX, GF, GP, MQ, RE, YT, MF, MC |
| `ad-eu-customs-union-scope` | [欧州委員会：アンドラとの関税同盟・HS25〜97類の適用範囲](<https://taxation-customs.ec.europa.eu/andorra-customs-unions-and-preferential-arrangements_en>) | HS2022 | official_reference | AD |
| `ad-eu-agreement-1990-consolidated-2016` | [EU・アンドラ関税協定：2016年統合版の第2条・第7条](<https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:01990A1231(02)-20160101>) | HS2022 | official_reference | AD |
| `sm-eu-cooperation-customs-union-2002` | [EU・サンマリノ協力関税同盟協定：第2条・第7条](<https://eur-lex.europa.eu/eli/agree_internation/2002/245/oj/eng>) | HS2022 | official_reference | SM |
| `pr-gao-us-customs-territory-2026` | [米GAO：2026年報告書・プエルトリコの米関税領域とHTSUS適用](<https://files.gao.gov/reports/GAO-26-107811/index.html>) | HS2022 | official_reference | PR |
| `ag-customs-hs2007-coffee-reference-2026` | [アンティグア・バーブーダ税関：Customs Duties (Amendment) Act 2011・HS2007基礎参照](<https://customs.gov.ag/resources/pdf/The_Customs_Duties_%28Amendment%29_Act_2011.pdf>) | HS2007 | official_reference | AG |
| `ai-customs-hs2017-coffee-reference-2026` | [アンギラ税関：Integrated Customs Tariff 2019・HS2017基礎参照](<https://customs.gov.ai/wp-content/uploads/2020/01/Anguilla-HS2017-Tariff-Final.pdf>) | HS2017 | official_reference | AI |
| `aw-customs-hs2012-coffee-reference-2026` | [アルバ税関：2023年8月版 Tarief van invoerrechten・GS2012基礎参照](<https://asycuda.douane.aw/documents/Tarief%20van%20invoerrechten_versie%201%20augustus%202023%20%28GS%202012%29.pdf>) | HS2012 | official_reference | AW |
| `bm-customs-hs2022-coffee-reference-2026` | [バミューダ政府：Customs Tariff Act 1970 First Schedule 2026・コーヒーHS6参照](<https://www.gov.bm/files/media-library/20260413/e1311751-2026_customs_tariff_act_1970_first_schedule_final_2026.03.31v1r0.pdf>) | HS2022 | official_reference | BM |
| `cw-customs-hs2017-coffee-reference-2026` | [キュラソー税関：Tarief van Invoerrechten versie 2017・コーヒーHS6基礎参照](<https://douane.cw/wp-content/uploads/2026/10/Tarief-van-Invoerrechten-versie-2017.pdf>) | HS2017 | official_reference | CW |
| `dm-customs-hs2017-coffee-reference-2026` | [ドミニカ国税関：HS2017 CET・コーヒーHS6基礎参照](<https://customs.gov.dm/uploads/HS_2017_new_a8f4ed247b.pdf>) | HS2017 | official_reference | DM |
| `gd-customs-hs2012-coffee-reference-2026` | [グレナダ議会：SRO 13/2014 CET・HS2012コーヒー基礎参照](<https://grenadaparliament.gd/wp-content/uploads/2021/08/S.R.O.-13-of-2014-Caricom-Common-External-Tariff.pdf>) | HS2012 | official_reference | GD |
| `gy-customs-hs2017-coffee-reference-2026` | [ガイアナ歳入庁：HS2017公開品目表・コーヒーHS6基礎参照](<https://www.gra.gov.gy/wp-content/uploads/2020/12/HS-2017-version.pdf>) | HS2017 | official_reference | GY |
| `ht-customs-hs2022-coffee-reference-2026` | [ハイチ税関：Nomenclature de dédouanement des produits SH2022・コーヒーHS6参照](<https://www.douane.gouv.ht/wp-content/uploads/2025/01/Tarif-NDP-SH-2022.pdf>) | HS2022 | official_reference | HT |
| `lc-customs-hs2022-coffee-reference-2026` | [セントルシア：SI 151/2025 Schedule 4・HS2022コーヒー参照](<https://exportsaintlucia.org/wp-content/uploads/2026/07/HS-2022-TARIFF.pdf>) | HS2022 | official_reference | LC |
| `ms-customs-hs2017-coffee-reference-2026` | [モントセラト歳入関税庁：2021年公開関税表・HS2017コーヒー基礎参照](<https://mcrs.gov.ms/wp-content/uploads/2022/08/Customs-2021-Tariff-Using-2017-HS-Code-SRO-27-of-2021.pdf>) | HS2017 | official_reference | MS |
| `pm-customs-hs2022-coffee-reference-2026` | [サンピエール・ミクロン税関：Délibération 301/2022附属SH2022・コーヒーHS6参照](<https://www.douane975.fr/wp-content/uploads/2023/01/Annexe-deliberation-301-2022-tarif_douane-2022-.pdf>) | HS2022 | official_reference | PM |
| `aw-customs-gs2012-publishing-page` | [アルバ税関：公開品目表のGS2012版表示](<https://asycuda.douane.aw/portal/content.jsf?c=tariff>) | HS2012 | official_reference | AW |
| `bm-parliament-hs2022-first-schedule-reference` | [バミューダ議会：2022年First ScheduleのHS2022更新説明](<https://parliament.bm/admin/uploads/hansards/bef22754b366d90b4bf47ac3cac654df.pdf>) | HS2022 | official_reference | BM |
| `nl-treaty-hs2017-bq-cw-sx-adoption-reference` | [オランダ政府条約記録：HS2017改正のBES・キュラソー・シントマールテンへの適用](<https://treatydatabase.overheid.nl/nl/Verdrag/Details/013786>) | HS2017 | national_edition_reference | BQ, CW, SX |
| `nl-official-gazette-hs2017-coffee-bq-sx-reference` | [オランダ官報：HS2017条約附属書のコーヒー品目（2018年統合文）](<https://zoek.officielebekendmakingen.nl/trb-2020-121.html>) | HS2017 | national_edition_reference | BQ, SX |
| `bs-statistics-hs2012-adoption-reference` | [バハマ政府統計局：HS2012の2013年採用を記録した2017年貿易統計](<https://cdn.bahamas.gov.bs/tenant/tenantbnsi/documents/All%20Documents/AnnualForeignTradeReport2017forwebsite-20240607020714.pdf>) | HS2012 | national_edition_reference | BS |
| `bs-wco-hs2012-ch09-adoption-pair-reference` | [WCO HS2012第9類：バハマの歴史的採用根拠と組み合わせるコーヒー国際HS6](<https://www.wcoomd.org/-/media/wco/public/global/pdf/topics/nomenclature/instruments-and-tools/hs-nomenclature-2012/hs-2012/0209_2012e.pdf?la=en>) | HS2012 | national_edition_reference | BS |
| `bb-wto-hs2017-citrus-nomenclature-reference` | [WTO Barbados：WT/Let/1536附属HS2017柑橘品目参照](<https://goods-schedules.wto.org/system/files/2021-04/1536-02.pdf>) | HS2017 | wto_bound_nomenclature | BB |
| `kn-wto-hs2017-citrus-nomenclature-reference` | [WTO Saint Kitts and Nevis：WT/Let/1620附属HS2017柑橘品目参照](<https://goods-schedules.wto.org/system/files/procedure/2023-07/1620-02-EN.pdf>) | HS2017 | wto_bound_nomenclature | KN |
| `sr-wto-hs2017-citrus-nomenclature-reference` | [WTO Suriname：WT/Let/1621附属HS2017柑橘品目参照](<https://goods-schedules.wto.org/system/files/procedure/2023-07/1621-02-EN.pdf>) | HS2017 | wto_bound_nomenclature | SR |
| `tt-wto-hs2017-citrus-nomenclature-reference` | [WTO Trinidad and Tobago：WT/Let/1642附属HS2017柑橘品目参照](<https://goods-schedules.wto.org/system/files/procedure/2023-12/1642-02-EN.pdf>) | HS2017 | wto_bound_nomenclature | TT |
| `cu-wto-hs2017-citrus-nomenclature-reference` | [WTO Cuba：WT/Let/1599附属HS2017柑橘品目参照](<https://goods-schedules.wto.org/system/files/procedure/2023-02/1599-02-ES.pdf>) | HS2017 | wto_bound_nomenclature | CU |
| `cemac-coffee-hs2007-2009-baseline` | [CEMAC：2009年共通税表のHS2007基礎分類・コーヒー](<https://douanes.ga/med/pdf/tarif-des-douanes-de-la-cemac-version-originale-pdf-210608020644.pdf>) | HS2007 | official_reference | CF, CG, CM, GA, GQ, TD |
| `ao-tariff-coffee-hs2022-2024` | [AO：2024年官報のHS2022採用品目表・コーヒー](<https://www.ucm.minfin.gov.ao/cs/groups/public/documents/document/aw4z/nzcw/~edisp/minfin3770211.pdf>) | HS2022 | official_reference | AO |
| `ly-tariff-coffee-hs2022` | [LY：税関公式HS2022改正対応品目表・コーヒー](<https://customs.gov.ly/wp-content/uploads/2023/12/%D8%A7%D9%84%D8%AA%D8%B9%D8%B1%D9%8A%D9%81%D8%A9-%D8%A7%D9%84%D8%AC%D9%85%D8%B1%D9%83%D9%8A%D8%A9-%D9%84%D8%B3%D9%86%D8%A9-2022.pdf>) | HS2022 | official_reference | LY |
| `gm-gra-hs2022-adoption` | [GM：GRAのHS2022 ECOWAS分類採用説明](<https://www.gra.gm/custom-faqs>) | HS2022 | official_reference | GM |
| `wco-hs2022-chapter09-gm-reference` | [WCO：HS2022第9章の国際共通6桁分類（GM採用根拠併用）](<https://www.wcoomd.org/-/media/wco/public/global/pdf/topics/nomenclature/instruments-and-tools/hs-nomenclature-2022/2022/0209_2022e.pdf?la=en>) | HS2022 | official_reference | ET, GM, MP, MZ |
| `mr-tariff-coffee-national2021` | [MR：税関公式2021年品目表・コーヒー](<https://www.douanes.mr/uploads/pics/tarif_fr_2021.pdf>) | MR-TARIFF-2021 | national_edition_reference | MR |
| `gh-wto-bound-hs2017-citrus` | [GH：WTO認証済みHS2017譲許表の柑橘類区分](<https://goods-schedules.wto.org/browse/43390/file_browser>) | HS2017 | wto_bound_nomenclature | GH |
| `sl-wto-bound-hs2017-citrus` | [SL：WTO認証済みHS2017譲許表の柑橘類区分](<https://goods-schedules.wto.org/browse/43325/file_browser>) | HS2017 | wto_bound_nomenclature | SL |
| `dz-finance2017-fresh-fruit` | [DZ：2017年財政法に掲載された生鮮果実区分](<https://www.joradp.dz/FTP/jo-francais/2016/F2016077.pdf>) | HS2017 | official_reference | DZ |
| `dz-customs-hs2017-adoption` | [DZ：税関2262号の2017年HS改正採用説明](<https://douane.gov.dz/IMG/pdf/note_no_2262_du_15.11.2016_-amendement_sh_2017.pdf>) | HS2017 | official_reference | DZ |
| `st-tariff-coffee-national2023` | [ST：税関ポータル公開の2023年官報第9章・コーヒー](<https://guce.gov.st/wp-content/uploads/2023/12/Cap9.pdf>) | ST-TARIFF-2023 | national_edition_reference | ST |
| `wco-hs2017-chapter08-dz-reference` | [WCO：HS2017第8章の国際共通親項目（DZ採用根拠併用）](<https://www.wcoomd.org/-/media/wco/public/global/pdf/topics/nomenclature/instruments-and-tools/hs-nomenclature-2017/2017/0208_2017e.pdf?la=en>) | HS2017 | official_reference | DZ |
| `mz-at-customs-workbook-2026-coffee` | [モザンビーク税務当局：2026年関税表ワークブックのコーヒー品目](<https://www.at.gov.mz/api/webdav?path=%2FSERVI%C3%87OS%20ADUANEIROS%2FPAUTA%20ADUANEIRA%2FPAUTA%20ADUANEIRA%202026.xlsx>) | HS2022 | official_reference | MZ |
| `mz-mef-hs2022-transition-cfmp2024-2026` | [モザンビーク財務省：SH2017からSH2022への移行記載](<https://www.mef.gov.mz/index.php/todas-publicacoes/instrumentos-de-gestao-economica-e-social/cenario-fiscal-de-medio-prazo-cfmp/cfmp-2024-2026/1912-cfmp-2024-2026/file%3Fforce-download%3D1>) | HS2022 | official_reference | MZ |
| `et-motri-afcfta-schedule-2025-coffee` | [エチオピア商業省：2025年官報AfCFTA附属品目表のコーヒー品目](<https://www.motri.gov.et/sites/default/files/announcement/3.%20Ethiopia%20TiG%20PSTC_compressed.pdf>) | HS2022 | agreement_nomenclature | ET |
| `et-ecc-hs2022-notification-20220101` | [エチオピア税関のHS2022採用通知（WCO公式公表）](<https://www.wcoomd.org/en/media/newsroom/2022/january/ethiopia-notifies-implementation-of-hs-2022-amendments-from-1-january-2022.aspx>) | HS2022 | official_reference | ET |
| `so-mof-customs-tariff-2022-reference` | [ソマリア財務省：Somali Customs Tariff 2022の独立公表版](<https://mof.gov.so/sites/default/files/Publications/Somali_Customs_Tariff_Final.pdf>) | SO-TARIFF-2022 | national_edition_reference | SO |
| `km-customs-tariff-v2022-reference` | [コモロ税関：Tarif Douanier V2022の独立公表版](<https://www.douane.gov.km/douane-comorienne/uploads/documents/ce748146196adca3605c0c01d291347a.pdf>) | KM-TARIFF-2022 | national_edition_reference | KM |
| `ss-eac-tfta-concessions-2026-reference` | [南スーダン対象EAC官報：TFTA譲許品目表2026の独立公表版](<https://www.eac.int/documents?controller=download&file=e4164a25-729c-4642-8f22-2c6ea656f463&name=EAC+Vol.+AT+1+NO.+12+MAY+2026.pdf.pdf&task=download.file>) | SS-EAC-TFTA-2026 | agreement_nomenclature | SS |
| `sd-customs-published-tariff-2017-reference` | [スーダン税関：January 2017関税表の独立公表版](<https://web.customs.gov.sd/wp-content/uploads/2013/01/At-Tryft-Arba-Kamlh.pdf>) | SD-TARIFF-2017 | national_edition_reference | SD |
| `dj-wto-hs2022-certified-schedule-1793` | [WTO：ジブチ提出HS2022譲許表（WT/Let/1793）](<https://goods-schedules.wto.org/system/files/procedure/2026-06/1793-02-FR.pdf>) | HS2022 | wto_bound_nomenclature | DJ |
| `zm-wto-hs2022-certified-schedule-1802` | [WTO：ザンビア提出HS2022譲許表（WT/Let/1802）](<https://goods-schedules.wto.org/system/files/procedure/2026-06/1802-02-EN.pdf>) | HS2022 | wto_bound_nomenclature | ZM |
| `ye-wto-hs2022-certified-schedule-1807` | [WTO：イエメン提出HS2022譲許表（WT/Let/1807）](<https://goods-schedules.wto.org/system/files/procedure/2026-07/1807-02-EN.pdf>) | HS2022 | wto_bound_nomenclature | YE |
| `cd-wto-hs2022-certified-schedule-1801` | [WTO：コンゴ民主共和国提出HS2022譲許表（WT/Let/1801）](<https://goods-schedules.wto.org/system/files/procedure/2026-06/1801-02-FR.pdf>) | HS2022 | wto_bound_nomenclature | CD |
| `er-unep-government-report-hfc-hs2022-2025` | [エリトリア政府報告に基づくUNEP：HFC分野HS2022コード採用](<https://downloads.unido.org/ot/38/46/38469382/3.%20Eritrea%20-%20HPMP%20Stage%20II%2C%20second%20tranche%20-%20project%20document.pdf>) | HS2022 | official_reference | ER |
| `er-wco-hs2022-chapter29-hfc-reference` | [WCO：HS2022第29類の純単一HFC品目本文](<https://www.wcoomd.org/-/media/wco/public/global/pdf/topics/nomenclature/instruments-and-tools/hs-nomenclature-2022/2022/0629_2022e.pdf?la=en>) | HS2022 | official_reference | ER |
| `crown-uk-coffee-090122` | [UK Trade Tariff公式API：コーヒー 090122](<https://www.trade-tariff.service.gov.uk/api/v2/commodities/0901220000>) | HS2022 | official_reference | GG, JE, IM |
| `crown-uk-coffee-090111` | [UK Trade Tariff公式API：コーヒー 090111](<https://www.trade-tariff.service.gov.uk/api/v2/commodities/0901110000>) | HS2022 | official_reference | GG, JE, IM |
| `gg-uk-common-tariff-arrangement` | [Guernseyと英国の正式な共通税表取決め](<https://assets.publishing.service.gov.uk/media/5bfbe6aaed915d11aa497a29/Guernsey-UK_Customs_Arrangement_final.pdf>) | HS2022 | official_reference | GG |
| `je-uk-common-tariff-arrangement` | [Jerseyと英国の正式な共通税表取決め](<https://assets.publishing.service.gov.uk/media/5bfbe69fed915d11965a192f/Jersey-UK_Customs_Arrangement_final.pdf>) | HS2022 | official_reference | JE |
| `im-uk-common-tariff-arrangement` | [Isle of Manと英国の正式な共通税表取決め](<https://assets.publishing.service.gov.uk/media/5bfbe6b6e5274a0fb775cc9c/IoM-UK_Customs_Arrangement_final_PDF.pdf>) | HS2022 | official_reference | IM |
| `fo-taks-coffee-nomenclature` | [フェロー諸島TAKS公式 Toll- og vøruskráin 第9章](<https://voruskra.taks.fo/en/Chapters/Details/09>) | FO-TAKS-Nomenclature | national_edition_reference | FO |
| `xk-tarik-2026-coffee` | [Kosovo Customs TARIK version 01.01.2026 第9章](<https://dogana.rks-gov.net/sharedfolder/ProductFiles/2026_488f89e7-9610-4161-b671-3e11c747d458.pdf>) | XK-TARIK-2026 | national_edition_reference | XK |
| `kw-pai-tariff-2022-coffee` | [クウェート産業庁公表：GCC統一関税表2022ワークブック](<https://www.pai.gov.kw/documents/d/guest/tariffschedule>) | KW-PAI-Tariff-2022 | national_edition_reference | KW |
| `il-official-customs-coffee-csv` | [イスラエル政府オープンデータ：公式税関品目の英語名称](<https://data.gov.il/dataset/3de0e7f0-03e1-4665-b078-da6e87543ed7/resource/c96d99fe-fd3a-4e86-a767-4119dd8b723e/download/c96d99fe-fd3a-4e86-a767-4119dd8b723e.csv>) | IL-IMPORT-NOMENCLATURE | national_edition_reference | IL |
| `ba-inspection-list-v208-coffee` | [ボスニア・ヘルツェゴビナ連邦検査局：統一商品検査分類リスト v208](<https://fuzip.gov.ba/wp-content/uploads/2022/10/1512138700Jedinstvena_lista_roba_v208compressed.pdf>) | BA-InspectionList-v208 | national_edition_reference | BA |
| `lb-customs-integrated-tariff-coffee` | [レバノン税関公式統合関税表 第9章](<https://www.customs.gov.lb/Tariff/Tariff_Table.aspx?CH=9>) | LB-IntegratedTariff | national_edition_reference | LB |
| `gi-official-harmonised-tariff-coffee` | [HM Customs Gibraltar公式 Harmonised Tariff 第9章](<https://www.hmcustoms.gov.gi/portal/services/tariff/print.jsf?c=09>) | GI-IntegratedTariff-2017 | national_edition_reference | GI |
| `qa-import-statistics-2025-2026-coffee` | [カタール国家計画評議会：2025–2026輸入統計のHSコード別商品名称](<https://www.data.gov.qa/api/explore/v2.1/catalog/datasets/qatar-imports-2025-2026>) | QA-ImportStats-2025-2026 | national_edition_reference | QA |
| `tr-tgtc-2026-coffee` | [トルコ商務省：2026 TGTC公式配布ZIP 第9章](<https://ticaret.gov.tr/data/5dee4b8813b876e93804be6f/2026%20TGTC.zip>) | TR-TGTC-2026 | national_edition_reference | TR |
| `az-decision500-2017-coffee` | [アゼルバイジャン公式法令：閣議決定500号（2017年）の商品分類 第9章](<https://frameworks.e-qanun.az/37/f_37035.html>) | AZ-Decision500-2017 | national_edition_reference | AZ |
| `ge-order21-2024-hs2022-coffee` | [ジョージア財務省令21号（2024年）：HS2022基礎の国家商品分類公式付表](<https://matsne.gov.ge/ka/document/download/6086072/0/1>) | HS2022 | official_reference | GE |
| `bh-gazette3585-hs2022-coffee` | [バーレーン公式官報3585号付録：HS2022統一商品分類（2022年決議19号）](<https://www.mia.gov.bh/wp-content/uploads/2022/02/3585-sup.pdf>) | HS2022 | official_reference | BH |
| `ps-pcbs-local2009-coffee` | [パレスチナ中央統計局：HSローカル版2009 商品分類 第9章](<https://www.pcbs.gov.ps/Portals/_PCBS/Class/Arabic/Economic/HarmonizedSystem-ar-en-class-doc.pdf>) | PS-PCBS-Local-2009 | national_edition_reference | PS |
| `tl-customs-hs2017-coffee` | [ティモール・レステ税関：HS2017作業関税表・第9章](<https://customs.gov.tl/wp-content/uploads/formidable/2/TL-Tariff-HS-Codes-2017-1.pdf>) | HS2017 | official_reference | TL |
| `la-moci-ahtn2022-coffee` | [ラオス商工省：AHTN2022品目検索・全品目階層](<https://www.laotradeportal.gov.la/en-gb/site/full-tree>) | HS2022 | official_reference | LA |
| `la-moci-ahtn2022-index` | [ラオス商工省：AHTN2022品目検索の版表示](<https://www.laotradeportal.gov.la/en-gb/site/listcommodity>) | HS2022 | official_reference | LA |
| `uz-lexuz-hs2022-roasted-coffee` | [ウズベキスタン法令LexUZ：2023年決議491・HS2022対応分類](<https://www.lex.uz/mact/-6615175>) | HS2022 | official_reference | UZ |
| `kh-gdce-hs2022-implementation` | [カンボジア税関：HS2022実施に関するWCO・WTO公式研修報告](<https://www.wto.org/english/tratop_e/markacc_e/session2_cambodia.pdf>) | HS2022 | official_reference | KH |
| `kh-wco-hs2022-chapter09` | [WCO：HS2022第9章・カンボジア採用版の国際共通HS6](<https://www.wcoomd.org/-/media/wco/public/global/pdf/topics/nomenclature/instruments-and-tools/hs-nomenclature-2022/2022/0209_2022e.pdf>) | HS2022 | official_reference | KH |
| `tm-customs-national-nomenclature-coffee` | [トルクメニスタン税関：公表商品分類表・コーヒー](<https://customs.gov.tm/pdf/nomenclature.pdf>) | TM-COMMODITY-NOMENCLATURE | national_edition_reference | TM |
| `tm-customs-code-hs-basis` | [トルクメニスタン税関：Customs Code第21条・商品分類のHS基盤](<https://www.customs.gov.tm/en/pages/customs-code>) | TM-COMMODITY-NOMENCLATURE | national_edition_reference | TM |
| `mv-wto-hs2017-citrus` | [WTO：モルディブのHS2017譲許表・柑橘（WT/Let/1525）](<https://goods-schedules.wto.org/download_all/43364>) | HS2017 | wto_bound_nomenclature | MV |
| `mn-wto-hs2017-citrus` | [WTO：モンゴルのHS2017譲許表・柑橘（WT/Let/1546）](<https://goods-schedules.wto.org/download_all/43393>) | HS2017 | wto_bound_nomenclature | MN |
| `tj-wto-hs2017-citrus` | [WTO：タジキスタンのHS2017譲許表・柑橘（WT/Let/1549）](<https://goods-schedules.wto.org/download_all/43396>) | HS2017 | wto_bound_nomenclature | TJ |
| `af-wto-hs2022-fresh-mushrooms` | [WTO：アフガニスタンHS2022譲許表・生鮮きのこ（WT/Let1808）](<https://goods-schedules.wto.org/download_all/43609>) | HS2022 | wto_bound_nomenclature | AF |
| `ir-eec-agreement-national-2016-2017` | [EEC公式協定附属表：イラン2016–2017国別分類・蜂蜜と緑茶](<https://eec.eaeunion.org/upload/medialibrary/7bc/Interim-Agreement-EAEU_Iran_final.pdf>) | IR-TARIFF-2016-2017 | agreement_nomenclature | IR |
| `ws-hs2017-official-index` | [サモア税関：HS2017税則の公式公開案内](<https://customs.gov.ws/rates/>) | HS2017 | official_reference | WS |
| `ws-hs2017-coffee-chapter9` | [サモア税関：HS2017第1～10類・第9類コーヒー](<https://customs.gov.ws/wp-content/uploads/2022/09/Chapter-1-10.pdf>) | HS2017 | official_reference | WS |
| `pf-hs2022-official-index` | [仏領ポリネシア税関：HS第7次改訂と2026年税則案内](<https://www.service-public.pf/douane/professionnels/procedure-de-dedouanement/le-tarif-douanier/>) | HS2022 | official_reference | PF |
| `pf-hs2022-tapa2026-coffee` | [仏領ポリネシア税関：TAPA 2026 V1第9類コーヒー](<https://www.service-public.pf/douane/wp-content/uploads/sites/18/2026/01/TAPA-2026-V1-sans-sommaire-et-annexes.pdf>) | HS2022 | official_reference | PF |
| `ki-pacer-hs2012-coffee` | [NZ外務貿易省：PACER Plus キリバス Part I（HS2012）](<https://www.mfat.govt.nz/assets/Trade-agreements/PACER-Plus/PACER-Plus-schedule-of-commitments-on-tariffs-for-Kiribati-HS2012.pdf>) | HS2012 | agreement_nomenclature | KI |
| `nu-pacer-hs2012-coffee` | [NZ外務貿易省：PACER Plus ニウエ Part I（HS2012）](<https://www.mfat.govt.nz/assets/Trade-agreements/PACER-Plus/PACER-Plus-schedule-of-commitments-on-tariffs-for-Niue-HS2012.pdf>) | HS2012 | agreement_nomenclature | NU |
| `sb-pacer-hs2012-coffee` | [NZ外務貿易省：PACER Plus ソロモン諸島 Part I（HS2012）](<https://www.mfat.govt.nz/assets/Trade-agreements/PACER-Plus/PACER-Plus-schedule-of-commitments-on-tariffs-for-Solomon-Islands-HS2012.pdf>) | HS2012 | agreement_nomenclature | SB |
| `to-pacer-hs2012-coffee` | [NZ外務貿易省：PACER Plus トンガ Part I（HS2012）](<https://www.mfat.govt.nz/assets/Trade-agreements/PACER-Plus/PACER-Plus-schedule-of-commitments-on-tariffs-for-Tonga-HS2012.pdf>) | HS2012 | agreement_nomenclature | TO |
| `tv-pacer-hs2012-coffee` | [NZ外務貿易省：PACER Plus ツバル Part I（HS2012）](<https://www.mfat.govt.nz/assets/Trade-agreements/PACER-Plus/PACER-Plus-schedule-of-commitments-on-tariffs-for-Tuvalu-HS2012.pdf>) | HS2012 | agreement_nomenclature | TV |
| `nr-pacer-hs2012-coffee` | [NZ外務貿易省：PACER Plus ナウル Part I（HS2012）](<https://www.mfat.govt.nz/assets/Trade-agreements/PACER-Plus/PACER-Plus-schedule-of-commitments-on-tariffs-for-Nauru-HS2012.pdf>) | HS2012 | agreement_nomenclature | NR |
| `mh-pacer-hs2012-coffee` | [NZ外務貿易省：PACER Plus マーシャル諸島 Part I（HS2012）](<https://www.mfat.govt.nz/assets/Trade-agreements/PACER-Plus/PACER-Plus-schedule-of-commitments-on-tariffs-for-the-Republic-of-the-Marshall-Islands-HS2012.pdf>) | HS2012 | agreement_nomenclature | MH |
| `fm-pacer-hs2002-coffee` | [NZ外務貿易省：PACER Plus ミクロネシア連邦 Part I（HS2002）](<https://www.mfat.govt.nz/assets/Trade-agreements/PACER-Plus/PACER-Plus-schedule-of-commitments-on-tariffs-for-the-Federated-States-of-Micronesia-HS2002.pdf>) | HS2002 | agreement_nomenclature | FM |
| `wco-hs2012-pacer-coffee-hierarchy` | [WCO：HS2012第9類・PACER附属表の親見出し照合](<https://www.wcoomd.org/-/media/wco/public/global/pdf/topics/nomenclature/instruments-and-tools/hs-nomenclature-2012/hs-2012/0209_2012e.pdf?la=en>) | HS2012 | agreement_nomenclature | KI, NU, SB, TO, TV, NR, MH |
| `wco-hs2002-pacer-coffee-hierarchy` | [WCO：HS2002第9類・ミクロネシア附属表の親見出し照合](<https://www.wcoomd.org/-/media/wco/public/global/pdf/topics/nomenclature/instruments-and-tools/hs-nomenclature-older-edition/2002/hs-2002/0209e.pdf?la=en>) | HS2002 | agreement_nomenclature | FM |
| `wf-tariff2020-coffee` | [ワリス・フツナ税関：2020-04-23更新版・第9類コーヒー](<https://www.douane.wf/wp-content/uploads/2016/06/TARIF-DES-DOUANES-mis-%C3%A0-jour-le-23.04.2020.pdf>) | WF-TARIFF-2020 | national_edition_reference | WF |
| `wf-wco-hs-application-reference` | [WCO：HS使用国一覧・ワリス・フツナの掲載](<https://www.wcoomd.org/-/media/wco/public/global/pdf/topics/nomenclature/overview/hs-contracting-parties/list-of-countries/countries_applying_hs.pdf?db=web>) | WF-TARIFF-2020 | national_edition_reference | WF |
| `ky-tariff2026-maize-honey` | [ケイマン諸島：Customs Tariff Act 2026 Revision・とうもろこし／天然はちみつ](<https://legislation.gov.ky/cms/images/LEGISLATION/PRINCIPAL/2012/2012-0001/2012-0001.pdf>) | KY-TARIFF-2026 | national_edition_reference | KY |
| `vg-tariff2010-maize-honey` | [英領ヴァージン諸島：2010年法Schedule 4・とうもろこし／天然はちみつ](<https://laws.gov.vg/sites/default/files/2026-01/G00333_Customs%20Management%20and%20Duties%20Act%2C%202010.pdf>) | VG-TARIFF-2010 | national_edition_reference | VG |
| `tc-tariff2010-roasted-coffee` | [タークス・カイコス税関：Customs Tariff General Order 2010・焙煎コーヒー](<https://customs.gov.tc/webuploads/currdoc/CustomTariffs%20%282010%29.pdf>) | TC-TARIFF-2010 | national_edition_reference | TC |
| `vi-gao2026-formal-import-classification` | [GAO 2026：米領ヴァージン諸島の正式輸入記録とHTSUS分類](<https://files.gao.gov/reports/GAO-26-107811/index.html>) | VI-HTSUS-2026-STATISTICS | national_edition_reference | VI |
| `vi-usitc2026-rev23-coffee-statistics` | [USITC HTSUS Revision 23 2026：第9類コーヒーの統計参照](<https://hts.usitc.gov/reststop/file?release=currentRelease&filename=Chapter%209>) | VI-HTSUS-2026-STATISTICS | national_edition_reference | VI |
| `mp-finance-pachs2022-adoption` | [北マリアナ財務局：PACHS2022の採用根拠](<https://finance.gov.mp/division-forms/customs/2021-customs-biosecurity-annual-report.pdf>) | HS2022 | official_reference | MP |
| `cc-applied-customs-classification-law` | [ココス諸島：適用税関法で豪州品目分類を使う明文根拠](<https://www.legislation.gov.au/F2006B00522/2015-07-01/2015-07-01/text/original/epub/OEBPS/document_1/document_1.html>) | HS2022 | official_reference | CC |
| `cx-applied-customs-classification-law` | [クリスマス島：適用税関法で豪州品目分類を使う明文根拠](<https://www.legislation.gov.au/F2006B00138/2015-07-01/2015-07-01/text/original/epub/OEBPS/document_1/document_1.html>) | HS2022 | official_reference | CX |
| `nf-applied-customs-classification-law` | [ノーフォーク島：適用税関法で豪州品目分類を使う明文根拠](<https://www.legislation.gov.au/F2016L00736/asmade/2016-05-09/text/original/epub/OEBPS/document_1/document_1.html>) | HS2022 | official_reference | NF |
| `au-external-territories-hs2022-adoption` | [豪州ABF：適用先法が参照する関税分類のHS2022導入](<https://www.abf.gov.au/help-and-support-subsite/CustomsNotices/2021-50.pdf>) | HS2022 | official_reference | CC, CX, NF |
| `au-external-territories-customs-scope-2026` | [豪州ABF：外部領域を区別する税関法の適用範囲](<https://www.abf.gov.au/help-and-support-subsite/CustomsNotices/2026-11.pdf>) | HS2022 | official_reference | CC, CX, NF |
| `sh-saint-helena-hs2012-coffee-tariff-2025` | [セントヘレナ政府：2025年7月公開税則・HS2012基盤と第9類](<https://www.sainthelena.gov.sh/documents/St-Helena-Tariff-July-2025.pdf>) | HS2012 | national_edition_reference | SH |
| `gl-statbank-grkn8-commodity-metadata` | [デンマーク統計局：グリーンランドGRKN8・1989–2003年貿易品目メタデータ](<https://api.statbank.dk/v1/tableinfo/GRKN8?format=JSON&lang=en>) | GL-GRKN8-1989-2003 | national_edition_reference | GL |
| `gl-statbank-grkn8-official-table-scope` | [デンマーク統計局：グリーンランドGRKN8のKN分類・廃止済み統計表の範囲](<https://www.statistikbanken.dk/statbank5a/SelectVarVal/Define.asp?Maintable=GRKN8>) | GL-GRKN8-1989-2003 | national_edition_reference | GL |
| `tk-tnso-hs2017-import-statistics-2019` | [トケラウ統計局：2019年報告・2014–2019年の輸入貨物統計とHS2017使用品目](<https://www.tokelau.org.nz/site/tokelau/files/TokelauNSO/2019-IMTS-reportJJ.pdf>) | HS2017 | national_edition_reference | TK |
| `tk-wco-hs2017-vegetable-hierarchy` | [WCO HS2017第7類：トマト・にんにくの親見出し条件](<https://www.wcoomd.org/-/media/wco/public/global/pdf/topics/nomenclature/instruments-and-tools/hs-nomenclature-2017/2017/0207_2017e.pdf?la=en>) | HS2017 | national_edition_reference | TK |
| `tk-wco-hs2017-apple-hierarchy` | [WCO HS2017第8類：新鮮なりんごの親見出し条件](<https://www.wcoomd.org/-/media/wco/public/global/pdf/topics/nomenclature/instruments-and-tools/hs-nomenclature-2017/2017/0208_2017e.pdf?la=en>) | HS2017 | national_edition_reference | TK |
| `iq-law22-2010-hs-foundation` | [イラク財務省：2010年関税法22号・HSに基づく品目体系の定義](<https://www.mof.gov.iq/api/download/920>) | IQ-TARIFF-LAW22-2010 | national_edition_reference | IQ |
| `iq-law22-2010-part2-cotton-blanket` | [イラク財務省：2010年関税法22号第2部・綿製非電気毛布](<https://www.mof.gov.iq/api/download/921>) | IQ-TARIFF-LAW22-2010 | national_edition_reference | IQ |
| `sy-decree188-2026-announcement` | [シリア国営SANA：2026年政令188号と関税品目表改正の公布](<https://sana.sy/presidency/2604942/>) | SY-DECREE188-2026 | national_edition_reference | SY |
| `sy-decree188-2026-glass-mineral-water` | [シリア政令188号添付表：ガラス容器入りミネラルウォーター](<https://cdn.sananews.sy/2026/10/%D9%85%D8%B1%D8%B3%D9%88%D9%85-%D8%B1%D9%82%D9%85-188.pdf>) | SY-DECREE188-2026 | national_edition_reference | SY |
| `ve-caricom-1992-import-annex-context` | [OAS SICE：1992年Venezuela・CARICOM協定第4条・輸入附表の位置付け](<https://sice.oas.org/Trade/CARIVEN1.asp>) | VE-CARICOM-1992 | agreement_nomenclature | VE |
| `ve-caricom-1992-annex3-coffee` | [OAS SICE：Venezuela向け輸入例外表・1992年協定附属書IIIコーヒー](<https://sice.oas.org/Trade/carven4s.asp>) | VE-CARICOM-1992 | agreement_nomenclature | VE |
| `ve-caricom-1992-nandina-hs-foundation` | [OAS SICE・アンデス共同体決定381号前文：旧NANDINAのHS基盤](<https://sice.oas.org/Trade/Junac/decisiones/Dec381s.asp>) | VE-CARICOM-1992 | agreement_nomenclature | VE |

## 実行例と継続検証

```sh
npm run cli -- classification-propose examples/classification-ai.json 2026-11-18T12:00:00+09:00
npm run classification:rollout -- --date 2026-11-18 --write
npm run classification:rollout -- --date 2026-11-18 --edition HS2022
```

各入力例は実際の収録版を指定します。全664ルールの正例、3,630必須属性の個別欠落、3,628条件の矛盾、国・方向・版・期限の混同、承認拒否を継続検証します。カタログ更新はダイジェストを変えるため、旧版に結合した承認は再確認が必要です。独自カタログへ同梱データを自動混入しません。
