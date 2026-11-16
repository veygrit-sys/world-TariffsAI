# 世界の通関準備と基礎関税の試算

通関準備APIは、249仕向地の公的照会先と通関担当への確認事項を返します。対象はWCO加盟187件と名簿に単独掲載されていない62件です。品目と原産地に合う税表候補は、読み込み済みの税表がある場合に返します。公開版の品目別税表マニフェストは空です。以下の試算結果はデータ同梱配布物で確認した記録です。

## 入力と出力

| 入力 | 照合する記録 |
| --- | --- |
| `shipment.originCountry` と `destinationCountry` | 実出荷拠点と配送先の国・地域 |
| `shipment.items[].originCountry` | 製品ごとの原産地資料 |
| `shipment.importDate` と `destinationZone` | 輸入日と税関領域。特別領域の固有コードは `customsTerritory` |
| `lines[].tariffCode` と `classificationConfirmed` | 現地の品目番号を確認した商品台帳。HS6だけの入力は分類候補に使う |
| `shipment.customsValue` と `lines[].customsValue` | 同一通貨で確定した貨物全体と各明細の課税価格。数量を含めた明細額の合計を照合する。1明細では貨物全体の額を使用可 |
| `lines[].grossWeightKg` | 税率行がCHF／100 kg（総重量）を指定したときの通関用総重量 |
| `lines[].rateTreatment` | 照会するMFN・一般税率の欄、または確認済みの通常関税0%制度 |
| `availableDocuments` | 用意できた書類の種類。内容と提出要否は通関担当が確認する |

`POST /v1/customs/plan` はサーバー間で呼び出します。 [OpenAPI](openapi.json)

```sh
npm run build
npm run cli -- customs-plan examples/customs-plan-us.json
npm run cli -- customs-plan examples/customs-plan-bt.json
npm run cli -- customs-plan examples/customs-plan-hk.json
```

| 出力 | 確認できる内容 |
| --- | --- |
| `origin`、`destination` | 公的な問い合わせ先、加盟区分、適用範囲が確認できる通常関税0%の制度 |
| `tariffCoverage` | 輸入日に対応する税表の版、別日版、公式照会先のみの状態、領域確認の要否 |
| `lines[].tariffReferences` | 品目番号と原産地で照会した関税・輸入税・追加措置候補。日付、版、候補件数、続きの位置を照合できる |
| `baseDutyScenario` | 指定した基礎関税の試算、小計、確認が残る明細 |
| `checkout` | 対応手続における販売時・輸入時の税額概算、未確定の税・費用 |
| `handoff` | 用意済み、準備する、提出要否を確認する書類と不足項目 |

## 試算の条件

- 通常の越境売買で、貨物範囲・在庫区分・通関方式が確認済みの普通品を扱います。選択した税率欄に候補が複数ある場合や、確定した品目番号を収録版で照合できない場合は確認に戻します。
- 従価税は確認済み明細課税価格に税率を掛け、通貨の最小単位へ明細単位で四捨五入します。従量税は表記が一致するCHF／100 kg（総重量）の税率行に対応します。法定丸めや他の従量・複合・割当税は現地手続で確認します。
- 通常関税0%の制度を使うときは、対象領域、輸入日、品目の適格性を確認します。物品税、輸入VAT・GST、追加関税、許認可、手数料は該当する資料を別途照合します。
- 既存の手続別プレビューで関税額が出た場合は、その手続別の見積もりを優先します。基礎関税の試算額をチェックアウトの概算へ加算すると二重計上になるため、合算は避けます。
- 試算は対象の税率欄と収録版を使う参考値です。優遇・免税・追加措置の適用、最終的な申告税額、輸送受付は当事者と通関担当が確認します。未確定費用を含む着地総額は `null` です。

## 通関担当への引き継ぎ

1. 明細の品目番号、原産地、数量、課税価格を商品・注文台帳と照合します。
2. 書類の準備状況、用途、輸送方式、輸出入申告の確認先を渡します。郵便の申告様式や必要な許認可は荷物に合わせて確認します。
3. 仕向地の税率候補、未確定税目、使用した税表の版・参照期間・SHA-256を記録します。
4. EC連携では注文と住所利用許可をVeygritのサーバーで照合します。 `available_for_review` は通関担当に渡すための資料が揃った状態です。 [Veygritへの接続](INTEGRATION.md)

商用の申告・徴収・配送承認は、実注文と通関担当の確認を経て行います。同梱のテストは合成貨物を使用しています。

## 根拠資料

- 品目分類の国際的な枠組み。 [WCOのHS概要](https://www.wcoomd.org/en/topics/nomenclature/overview/what-is-the-harmonized-system.aspx)
- 税関評価と原産地の確認。 [WCOの税関評価](https://www.wcoomd.org/en/topics/valuation/overview/wto-valuation-agreement.aspx) ・ [WCOの原産地FAQ](https://www.wcoomd.org/en/topics/origin/overview/faq-origin.aspx)
- 通関書類と郵便申告。 [WCOの通関ガイドライン](https://www.wcoomd.org/~/media/wco/public/global/pdf/topics/wto-atf/dev/rkc-guidelines-ch3.pdf) ・ [UPUの電子事前データ](https://www.upu.int/en/postal-solutions/technical-solutions/products/ead-customs-declarations-app)
- CHF／100 kgの総重量基準。 [スイス連邦税関の課税基準](https://www.bazg.admin.ch/en/customs-assessment-bases-gross-weight-and-effective-weight)
