# アジア・欧州の輸入手続と税表

以下の税表件数と参照日は、過去版のデータ同梱配布物の記録です。GitHub公開版からは公的照会先と通関案内を確認できます。

第2回と第3回で、東・東南・南・中央アジア33件と欧州52件を調べました。北朝鮮はアジアの台帳に含め、商用対象外として記録しています。地理的な割り当てと税関領域の判定は別の情報として扱います。 [世界全方向の開発計画](WORLDWIDE_ROLLOUT.md)

この表は第2回・第3回の統合版 `rc.3` の集計です。 [アジアの追加整備状況](ASIA_TARIFF_COVERAGE.md)

| 範囲 | 台帳 | 手続または領域の扱いを確認 | 2026-11-12の標準税表 |
| --- | ---: | ---: | ---: |
| アジア | 33 | 31 | 8 |
| 欧州 | 52 | 50 | 31 |

イラン、ベラルーシ、ロシアは公的な参照先を掲載し、個別手続の確認に回します。EU共通税表は地理区分で西アジアに属するキプロスも対象に含むため、11月12日の標準税表は全体で **40仕向地** です。

## 輸入先ごとの確認事項

発送元とお届け先を入れ替えると、結果の `destinationProcedures` が切り替わります。仕向地、整備回、確認日、公的出典と日本語の確認手順を返します。日付パラメーターは税表参照の対象日です。手続案内は `reviewedOn` 時点で確認した資料を表示します。

| 状態 | 意味 |
| --- | --- |
| `official_procedure` | 公的資料で確認できた手続または税関・税領域の扱いを掲載 |
| `official_reference` | 公的な参照先を掲載。現在の個別申告手順は要確認 |
| `pending` | 当該仕向地の追加調査が必要 |
| `excluded` | 商用対象外。関係当局の規制資料を掲載できる |

`GET /v1/worldwide/coverage` の `withVerifiedImportProcedures` は、当局資料から手続または領域の扱いを確認した仕向地数です。`withRegionalOfficialReferences` には、その仕向地に加え、公的な参照先を確認した仕向地も含まれます。北朝鮮は両方の集計から除外します。これらは掲載資料の確認状況です。税表の参照可否は別の `withStandardTariffReferenceOnDate` で指定日ごとに確認します。

`POST /v1/customs/plan` でも、通常領域を指定した貨物の `destinationProcedures` を取得できます。個別の手続の適用、必要書類、配送の可否は貨物の審査結果を使います。特別領域や未特定の領域は通常領域の手続を自動付与せず、既存の税関領域確認に進みます。

## 欧州の税関・税領域

EUの通常領域どうしと、域外からの輸入は扱いが異なります。オーランド諸島、モナコ、サンマリノ、ジブラルタルが発着地となる越境方向には `territoryReviewRequired` が付きます。関税、VAT、物品税、実際の申告窓口を確認するまで通常の越境見積もりは保留します。ジブラルタルについては、2026年7月15日からのEU・英国協定の暫定適用も確認先に含めます。英国とガーンジー、マン島、ジャージーの相互方向も、個別の通関取り決めと税の扱いを確認するため保留します。EUとアンドラの相互方向、スイスとリヒテンシュタインの相互方向も、関税同盟・共通領域の手続へ回します。英国を指定した貨物は英国本土と北アイルランドの区分を確認してください。 [英国政府の王室属領との通関取り決め](https://www.gov.uk/government/news/uk-agrees-new-customs-arrangements-with-the-crown-dependencies)英国本土への輸入品目を試算する場合は、10桁の品目番号を指定します。 [HMRCの品目番号案内](https://www.gov.uk/guidance/using-the-harmonised-system-and-product-specific-rules-for-trade-between-the-uk-and-eu) [欧州委員会の税関・VAT・物品税の領域表](https://taxation-customs.ec.europa.eu/taxation/vat/vat-directive/how-does-vat-work/territorial-scope_en) ・ [欧州連合理事会のジブラルタル協定登録](https://www.consilium.europa.eu/en/documents/treaties-agreements/agreement/?docLanguage=en&id=2026009)

[欧州委員会のアンドラ関税同盟案内](https://taxation-customs.ec.europa.eu/andorra-customs-unions-and-preferential-arrangements_en) ・ [リヒテンシュタイン当局の税関領域案内](https://www.llv.li/en/individuals/mobility-travel-and-abroad/border-crossing-and-goods-traffic)

## 2026年11月12日の税表参照

- アジアでは日本、中国本土、台湾、インドネシア、香港、パキスタン、ネパール、スリランカの公表表と代表品目を再照合しました。11月12日の参照版を分けて収録し、旧版の参照日を保持しました。 [日本税関の税表](https://www.customs.go.jp/english/tariff/) ・ [中国国務院関税税則委員会の2026年税則](https://gss.mof.gov.cn/gzdt/zhengcefabu/202512/t20251231_3981044.htm)
- 欧州ではEU共通品目表、英国の法定税表、スイス・リヒテンシュタインの共通領域の基礎税表を再照合しました。ノルウェーの11月12日データ、アイスランドの10月1日発効版の標準税表と輸入VATを追加しました。 [EU官報の2026年版共通品目表](https://eur-lex.europa.eu/eli/reg_impl/2025/1926/oj) ・ [ノルウェー税関の公開データ](https://data.toll.no/dataset/tollavgiftssats) ・ [アイスランド税務当局の税表データ](https://www.skatturinn.is/fagadilar/tollamal/hugbunadarhus/tollskrarlyklar/tollskrarlyklar)

- EUの日次データから、11月12日に開始する暫定アンチダンピング措置23件を追加しました。2つのTARICコードが対象で、原産地と生産者、請求書などの適用条件を保持します。日次データの収録範囲外は別途照会してください。 [欧州委員会のTARIC日次資料](https://ec.europa.eu/taxation_customs/dds2/taric/daily_publications.jsp?Lang=en)

## 実行例

```sh
npm run cli -- worldwide-coverage 2026-11-12
npm run cli -- worldwide-direction examples/worldwide-direction-jp-de.json
npm run cli -- worldwide-direction examples/worldwide-direction-de-jp.json
npm run cli -- tariff examples/tariff-jp-observed.json
```

参照可能な標準税表には版、出典、指定日、適用上の制約が付きます。標準税表に加え、原産地や取引ごとに適用される追加関税、時限措置、特恵、輸入VAT・GST、物品税を確認してください。世界向けの注文試算は、これらの費目の根拠と貨物単位の取引確認がそろった場合に行います。実注文による通関・請求の検証は第8回の対象です。 [品目別税率データ](TARIFF_DATA.md) ・ [OpenAPI](openapi.json)
