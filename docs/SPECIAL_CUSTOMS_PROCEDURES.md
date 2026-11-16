# 第7回 特別税関領域と輸入特例

v1.0.0-rc.7は、2026年11月12日の公的資料をもとに、特別税関領域25件と輸入手続の確認ルール58件を収録します。手続の仕向地は重複を除いて36です。

| 収録分野 | 件数 | 確認事項 |
| --- | ---: | --- |
| 特別税関領域 | 25 | 税関・VAT領域、発送方向、申告先、適用条件 |
| 少額輸入・越境EC | 17 | 対象取引、価格基準、徴収時点、輸送方式、必要書類 |
| 贈答 | 8 | 個人間の贈答か、品目・価格条件、関税と輸入税の扱い |
| 返品・再輸入 | 10 | 元の輸出・輸入記録、同一性、期限、申告・還付条件 |
| B2B | 8 | 輸入者、申告主体、輸入時の税、登録番号と証明書 |
| 特恵税率 | 15 | 5協定、原産国・仕向地112組、原産地証明・積送・申告 |

## 税関領域と発送方向

`GET /v1/worldwide/direction` は、発送元と仕向地の国コードに加え、必要に応じて `originCustomsTerritory` と `customsTerritory` を受け取ります。`standardTerritoryRoute` は国コードによる通常領域の表示です。実際の確認は `territoryReviewRequired` と `specialTerritories` を使います。

- スペイン本土からカナリア諸島へは、両端の国コードを `ES` とし、仕向地に `CANARY_ISLANDS` を指定します。VAT領域と税関領域を区別し、IGICや申告先を案内します。セウタ・メリリャは個別の領域として扱います。 [欧州委員会の領域表](https://taxation-customs.ec.europa.eu/taxation/vat/vat-directive/how-does-vat-work/territorial-scope_en)
- 英国本土から北アイルランドへは、国コード `GB` に仕向地 `XI` を指定します。逆方向は発送元に `XI` を指定します。書類と受付手順は発送方向で切り替わります。 [北アイルランド向け小包の手順](https://www.gov.uk/guidance/sending-parcels-between-great-britain-and-northern-ireland-under-the-windsor-framework)
- 通関計画では、領域コードを指定する側の `originZone` または `destinationZone` を `special` にします。領域不明や別日指定でも確認の必要性を表示し、法令や手続の参照は確認日の範囲で返します。

## 少額輸入と書類確認

- EUの対象貨物の3ユーロ暫定関税は、申告担当者が確認した `shipment.euDeclaration.itemCount` と `countConfirmed: true` を使います。11月以降の通常申告方式では `flatDutyTreatmentConfirmed: true` も必要です。分類済みHS6の異なる品目数は、申告明細数の下限確認に使います。 [EU委任規則 2026/1022](https://eur-lex.europa.eu/eli/reg_del/2026/1022/oj/eng)
- EUの対象輸入通信販売では、11月1日開始の取扱手数料F00を別に案内します。法定額は申告明細ごとに2ユーロです。支払額は申告方式と貨物に基づき担当者が確認します。 [EU委任規則 2026/2152](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=OJ:L_202602152)
- 米国は国際郵便の少額簡易申告と、免税停止を区別します。中国は直送 `9610` と保税在庫からの `1210` に対し、本人確認、対象品目、注文・決済・物流、購入枠の確認を案内します。 [米CBPの郵便簡易申告](https://www.govinfo.gov/content/pkg/FR-2026-10-22/html/2026-21600.htm) ・ [中国財政部の越境EC小売輸入税制](https://www.chinatax.gov.cn/chinatax/n810341/n810765/n3359382/201812/c4182338/content.html)
- `POST /v1/customs/plan` の `specialProcedures` に、取引・貨物情報に合うルール、書類種別、確認状態を返します。金額照合を持つルールは指定通貨と確認済み集計がそろう場合に比較します。受領済みとして入力した書類は `reported_present` になります。通関担当者が原本と取引を照合し、当局が受理・適用を判断します。

## 特恵の照会

対象はRCEP、CPTPP、USMCA、日EU・EPA、日英EPAです。発送地と明細の原産国を別々に評価します。`lines[].preferenceAgreement` で協定を指定すると、対象明細、申告・証明条件、未確定事項が表示されます。同じ明細で基礎関税の `rateTreatment` と協定指定を併用すると入力エラーになります。

日本・カナダ・ニュージーランドでは、公表税表の該当協定欄と確認済みの国別品目番号が一致する場合に税率候補を表示します。RCEPや日本向けCPTPPの国別税率差は、適用国と証明書の確認に進みます。候補の `eligibilityConfirmed` は `false` で、特恵額は自動確定しません。 [日本税関のRCEP原産国資料](https://www.customs.go.jp/english/epa/rcep/rcep_gensankoku_E.pdf) ・ [カナダCBSAのCUSMA取扱い](https://www.cbsa-asfc.gc.ca/publications/cn-ad/cn20-14-eng.html)

```sh
npm run cli -- customs-plan examples/customs-plan-jp-preference.json
```

[OpenAPI](openapi.json) ・ [全方向の開発計画](WORLDWIDE_ROLLOUT.md)
