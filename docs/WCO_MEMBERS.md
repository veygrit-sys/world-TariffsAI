# WCO加盟先の対応表

[加盟先対応表](../data/wco-members.json) はWCOの加盟先187件を仕向地コードに対応づけたものです。WCO英語版名簿の加盟先と、2026年7月1日現在の日本の財務省名簿の加盟先は、表記の違いを調整すると187件すべて一致します。

- `members` は加盟先187件です。ISO 3166-1の割り当てがある186件のほか、コソボを `XK` で参照できます。 `XK` は利用者割当コードです。
- `BM`（バミューダ）、`CW`（キュラソー）、`HK`（香港）、`MO`（マカオ）はそれぞれ独立した加盟先の行を持ちます。
- `affiliates` の `EU` は、WCO名簿が加盟に準じる地位と記載する欧州連合です。加盟先数187件の集計から除外しています。
- `joinedOn` はWCO名簿掲載の加盟日です。財務省名簿が掲載する批准書・加入書の寄託日との表記の差は `dateDifferences` に記録しています。
- プエルトリコ（`PR`）は別個のWCO加盟先として掲載されていません。加盟先対応表と仕向地別の税率・通関規則の対応範囲は独立しています。

## 更新手順

Python 3.9以上とPopplerの `pdftotext` を使用します。プロジェクトの `data/countries.json` は国・地域名とコードの照合に使います。PDFのチェックサムが変わった際は、資料の更新日、番号、件数、名称の差を確認し、スクリプト内の対応を更新します。

```sh
curl -fsSL 'https://www.wcoomd.org/-/media/wco/public/global/pdf/about-us/wco-members/list-of-members-with-membership-date.pdf?db=web' -o wco-list.source.pdf
curl -fsSL 'https://www.mof.go.jp/policy/customs_tariff/trade/international/wco/members.pdf' -o wco-japan-mof.source.pdf
python3 scripts/wco/build_wco_members.py \
  --countries data/countries.json \
  --wco-pdf wco-list.source.pdf \
  --mof-pdf wco-japan-mof.source.pdf \
  --output data/wco-members.json
```

配布する対応表には、加盟の有無、名称、コード、日付といった事実を記録しています。出典PDF、図版、ロゴは配布対象外です。財務省のウェブサイト利用条件は[財務省ウェブサイトのご利用にあたって](https://www.mof.go.jp/about_mof/notice/index.html)を参照してください。
