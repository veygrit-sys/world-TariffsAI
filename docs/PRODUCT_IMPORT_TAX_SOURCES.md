# Product import tax sources

## EU member-state VAT

The European Commission Taxes in Europe Database (TEDB) publishes national VAT submissions. The SOAP service was queried for the situation on 2026-11-11. The snapshots retain explicitly published numeric rates linked to CN goods codes in 23 countries. Rate labels and national scope qualifiers accompany each result. Check the actual goods, any product exclusions, the territory, import exemptions and applicable national law. Article 94 of Directive 2006/112/EC generally ties the import VAT rate to the rate for domestic supply of like goods.

The release retains the separate statutory packs for Germany, Poland and Slovakia. Denmark's TEDB response contains zero CN-linked rows. Each new snapshot covers its observation date and identifies the edition date supplied by TEDB. When a source row names a chapter, heading or subheading, its qualifier also governs narrower descendants.

Source credit © European Union, 2026. Source dataset European Commission DG TAXUD Taxes in Europe Database, from national Ministry of Finance submissions. Rates, codes and qualifiers were extracted, deduplicated and mapped to the catalog. Commission reuse conditions and source hashes are recorded in the manifest.

- [TEDB and public VAT web service](https://ec.europa.eu/taxation_customs/tedb/index.html)
- [VAT service specification](https://taxation-customs.ec.europa.eu/document/download/d4a05b85-fd95-45a5-95b4-3ef320fa9728_en)
- [VAT Directive, Article 94](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX%3A02006L0112-20250414)
- [European Commission legal notice](https://commission.europa.eu/legal-notice_en)

## Japan

Japan Customs' 2026-10-31 commodity numbers are linked to conditional consumption-tax candidates for selected food-related headings and alcoholic liquor. The declared human food or drink use, the statutory definition of food and the conditions for combined goods control reduced-rate eligibility. The snapshot uses combined national and local rates. The liquor pack preserves selected excise rates and volume/strength formulas from the National Tax Agency table effective on 2026-10-01. Product classification under Japan's Liquor Tax Act and exemptions govern the actual assessment.

- [Japan Customs consumption-tax calculation](https://www.customs.go.jp/english/c-answer_e/imtsukan/1111_e.htm)
- [Japan Customs guidance on reduced import consumption tax](https://www.customs.go.jp/news/news/consumptiontax2019/consumptiontax_annex03.pdf)
- [Japan Customs guidance for imported alcoholic beverages](https://www.customs.go.jp/english/c-answer_e/kojin/3105_e.htm)
- [National Tax Agency liquor-tax schedule effective October 1, 2026](https://www.nta.go.jp/taxes/sake/shiori-gaikyo/shiori/2026/pdf/05-1.pdf)

## Regenerate

Save the input files listed by name and URL in the manifest. Keep the three scripts in the same directory. For precise rebuilds, compare the retrieved files against the recorded hashes. The public service may update historical submissions.

```sh
python3 scripts/tariffs/fetch_tedb.py raw
python3 scripts/tariffs/build_tedb_vat.py raw tedb_packs
python3 scripts/tariffs/build_japan_import_tax.py raw private-tariffs/rebuilt/jp-tariff-2026-10-31.json.gz japan_packs
```
