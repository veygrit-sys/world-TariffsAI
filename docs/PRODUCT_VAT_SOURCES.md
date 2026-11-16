# Product VAT snapshots

The build reads three first-party sources. It retains tax candidates with the product limitations needed for interpretation.

| Snapshot | Authority | Included scope |
| --- | --- | --- |
| gb-hmrc-vat-2026-11-11 | HM Revenue & Customs | Selected Great Britain tariff headings, ten-digit declarable commodity codes and VAT measure 305, with VATZ and VATR additional-code labels where provided |
| pl-vat-annexes-2026-11 | Republic of Poland, Sejm and Ministry of Finance | Combined Nomenclature entries in Annexes 3 and 10, including product definitions and statutory exclusions |
| sk-vat-annex7-2026 | Slovak Ministry of Justice, Slov-Lex | Combined Nomenclature entries in Annex 7 points 1–3, subject to §27 conditions and the §68cb exception |

The manifest includes the source document names, exact URLs and hashes. Use those hashes to pin the input bytes. Subsequent updates require a review of the authorities’ effective dates, amended clauses and rate conditions. Treat the Great Britain heading API results as overview measures and consult individual commodity details and the underlying law for exceptions.

## Build

```sh
python3 scripts/tariffs/fetch_gb_headings.py raw
python3 scripts/tariffs/build_product_vat.py raw packs
```

The heading downloader uses an explicit heading list and a fixed reference date. The other input documents are available through the URLs below.

| File | Authoritative source |
| --- | --- |
| pl-vat-2026-sejm.pdf | [Polish VAT Act 2026 consolidated publication](https://api.sejm.gov.pl/eli/acts/DU/2026/1263/text.pdf) |
| pl-1446.pdf | [Polish VAT Act November 2026 amendment](https://eli.gov.pl/api/acts/DU/2026/1446/text.pdf) |
| pl-vat-rates.html | [Polish Ministry of Finance rate overview](https://podatki.gov.pl/en/information-for-entrepreneurs/value-added-tax/general-vat-rules-and-rates) |
| sk-vat-2026.html | [Slovak VAT Act 2026 consolidated edition](https://static.slov-lex.sk/static/SK/ZZ/2004/222/20260101.print.html) |
| sk-annex7-2026.pdf | [Slovak VAT Act Annex 7](https://static.slov-lex.sk/pdf/prilohy/SK/ZZ/2004/222/20260101_5815198-2.pdf) |

The UK material contains public sector information licensed under the Open Government Licence v3.0. Official statutory text in the other packs is excluded from copyright under the respective copyright laws.

- [UK Trade Tariff API licence and authority](https://www.api.gov.uk/hmrc/gov-uk-trade-tariff-api/)
- [Polish Copyright Act Article 4](https://eli.gov.pl/eli/DU/2025/24/ogl)
- [Slovak Copyright Act §5(b)](https://static.slov-lex.sk/static/SK/ZZ/2015/185/20260901.print.html)
