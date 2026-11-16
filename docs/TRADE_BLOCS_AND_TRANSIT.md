# 貿易同盟と経由貨物の確認

v1.0.0-rc.8は、2026年11月12日の公的資料に基づく地域枠組み18件を収録します。対象は99の国・地域コード、重複を除く1,254の発送方向です。関税同盟、自由貿易協定、経過措置の適用範囲はそれぞれ異なります。

| 確認事項 | 実装 |
| --- | --- |
| EU域内 | 通常税関領域の域内区分を返します。域外経由や特別税関領域がある場合は流通条件を確認します。 |
| その他の関税同盟 | GCC、SACU、EAEU、EAC、ECOWAS、UEMOA、MERCOSUR、CEMAC、中米等の対象方向を検出します。域内流通、関税納付の証拠、対象品目、国別例外を確認するまで税額試算を保留します。 |
| 経過措置 | ECOWAS離脱後のETLS、EAC新規加盟国、ボリビアのMERCOSUR移行などを方向別に案内します。 |
| 自由貿易協定 | ATIGAなどでは通常の通関経路を保ち、協定特恵を使う場合の証拠を案内します。 |

EU–MERCOSUR暫定貿易協定のEU・アルゼンチン・ブラジル・パラグアイ・ウルグアイ、ASEAN ATIGAの確認済み10カ国、AfCFTAの確認済み5仕向地を追加しました。新規14ルールの範囲は、原産国と仕向地の333組です。既存分を含む特恵の確認ルールは8協定、445組です。 [EU–MERCOSURの原産地規則](https://taxation-customs.ec.europa.eu/customs/rules-origin-goods/preferential-rules-origin/latin-america/mercosur_en) ・ [ASEANの暫定適用宣言](https://agreement.asean.org/media/download/20260922094235.pdf) ・ [AfCFTA原産地規則マニュアル](https://au.int/sites/default/files/treaties/36437-ax-AfCFTA_RULES_OF_ORIGIN_MANUAL.pdf)

## 方向照会と通関計画

方向照会では、例として `originCountry=BR&destinationCountry=DE&transitCountries=PT,NL` を指定できます。`loadingCountry` は実際の船積国が判明したときに入力します。発送地・船積地・経由地・明細の原産国は別々に扱います。

`POST /v1/customs/plan` には、経由地を実際の順序で記録します。経由地ごとに積替え・通過・保管、税関管理下か輸入許可済みか、証拠の参照IDを入力できます。同じ国を複数回経由する場合は、それぞれの順番に入れます。確認済みの直送を入力するときは、`completeness` を `confirmed`、`stops` を空にします。

- `tradeBlocs` は、方向に合う同盟の確認条件と資料の確認期間を返します。確認日外の資料は `reference_date_unverified` と表示します。
- `transitReview` は、経由順、税関管理・通過条件、証拠IDが提示されているかを返します。証拠原本の有効性と当局の受理は通関担当者が確認します。
- 発送国と船積国が異なり経由情報が不足している場合、経由地での税関管理が不明または輸入許可済みの場合、取引規制の照会が必要な場合は、通関計画と見積もりを確認に回します。積替えの記録には、原産国の申告と特恵の確認を別に記録します。 [日本税関のRCEP積送基準](https://www.customs.go.jp/kyotsu/kokusai/news/rcep/shiryou.pdf)

## 見積もりの確認

経由貨物の費目付き見積もりには `POST /v1/worldwide/quote` を使います。税関・通関担当者の確認記録 `tradeReview.evidence.transitReviewShipmentDigest` には、確認した注文と経由順に対する `pilotQuoteShipmentDigest` の値を入れます。費目に対する `reviewedShipmentDigest` も同じ注文に対応させます。経由順、証拠ID、船積地などが変わった場合は、担当者が再照合します。

```sh
npm run cli -- customs-plan examples/customs-plan-br-de-via-pt.json
npm run tariff:verify-update -- --date 2026-11-12
```

[OpenAPI](openapi.json) ・ [税表更新の検証と切り戻し](TARIFF_UPDATE_OPERATIONS.md) ・ [日中米6方向の実注文検証](PILOT_LIVE_VALIDATION.md)
