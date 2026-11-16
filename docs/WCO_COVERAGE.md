# WCO加盟先の関税・通関対応

WCO加盟先187件を[加盟先対応表](WCO_MEMBERS.md)に収録しています。バミューダ、キュラソー、香港、マカオはそれぞれ固有の仕向地コードで検索できます。コソボの仕向地コードは `XK` です。EUの共通関税表は各加盟国のコードで照会でき、EU自体はWCO加盟に準じる地位として `affiliates` に表示します。

## APIとCLI

サーバーのサービス認証で `GET /v1/tariffs/coverage/wco?date=2026-11-11` を呼び出すと、全加盟先の対応状況が得られます。`date` を省略した場合は日本時間の当日です。

```sh
npm run build
npm run cli -- tariff-wco-coverage 2026-11-11
```

| `status` | 意味 |
| --- | --- |
| `tariff_reference_on_date` | 指定日を含む期間の基本税表・関税参照版が収録されています。 |
| `tariff_reference_other_date` | 別日の参照版が収録されています。 |
| `official_sources_only` | 基本税表・関税参照版の収録前で、税関、官報、関税照会などの参照先があります。 |
| `membership_only` | 加盟情報を収録しています。加盟先固有の照会先は追加が必要です。 |

`tariffReferences` の `scope`、参照期間、`sourceUrl` を確認し、仕向地、原産地、輸入日と品目番号を `POST /v1/tariffs/lookup` に渡します。品目番号、原産地、手続条件によって取得できる税率候補は変わります。輸入VAT・GST、追加関税、物品税などの収録範囲は `measureSnapshotIdsOnDate` と `measureChargesOnDate` にあります。実際の品目照会は[品目別税率データ](TARIFF_DATA.md)を参照してください。

`officialSources` の `kind` は、税率表、官報、照会システム、税関案内、WCOのリンク集などを示します。WCOのディレクトリ掲載先はリンク先の稼働状況と法令の版を確認してください。187加盟先すべてに、国内当局、WCO、WTO、地域機関または公的貿易機関が公開する資料を登録しました。税表が未収録の仕向地では、照会APIが該当する案内や照会先を返します。

WCO加盟先数、収録版がある加盟先数、指定日に参照できる加盟先数を別々に集計します。すべての税率・措置を照会できる状態に達したかは `allMemberTaxRatesComplete` で確認できます。

## WCO名簿に単独掲載されていない仕向地

仕向地レジストリからWCO加盟先と南極を除いた62件について、公的な参照先と関税・通関の適用範囲を記録しています。領域コードと税関領域は一致しない場合があります。たとえばプエルトリコでは米国基本税表を参照できます。米領ヴァージン諸島は独自の税関領域です。現地税や例外の取扱いは各仕向地の公式資料で確認できます。

```sh
npm run cli -- tariff-territory-coverage 2026-11-11
```

`GET /v1/tariffs/coverage/territories?date=2026-11-11` は、62件の出典と税表の収録状況、および指定日に参照できる通常関税0%・原則0%の制度を返します。対象には、香港・マカオ、パラオ、シンガポール、ボネール等、シント・マールテン、グアム、スヴァールバル、オーストラリアの3外部領域が含まれます。

- `generalDutyPolicy.treatment` の `general_zero` は、資料が示す範囲の通常関税0%です。`most_goods_zero` は、指定された課税品目以外を対象とする制度です。
- `otherChargesAndControls` は、輸入VAT・GST、物品税、申告、許可などの確認事項です。日付を含む制度の出典は `sources` に記録しています。
- スヴァールバルは `destinationCountry: "SJ"` と `customsTerritory: "SVALBARD"` を指定します。`SJ` にはヤンマイエンも含まれるため、スヴァールバルの制度は領域の指定時に返します。
- HS番号を照会すると `generalDutyPolicy` と税率候補が返ります。品目番号に該当するデータがない場合、`applicableRate` は `null` です。
- `POST /v1/ask` は、仕向地が特定できた場合に `destinationCustomsProfile` を返します。品目番号がなくても、加盟状況、参照先と通常関税の制度を確認できます。
