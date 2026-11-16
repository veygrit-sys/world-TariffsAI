# Third-party software and data

## Runtime

| Component            | Version | License      | Upstream                                            |
| -------------------- | ------- | ------------ | --------------------------------------------------- |
| Ajv                  | 8.20.0  | MIT          | https://github.com/ajv-validator/ajv                |
| ajv-formats          | 3.0.1   | MIT          | https://github.com/ajv-validator/ajv-formats        |
| fast-deep-equal      | 3.1.3   | MIT          | https://github.com/epoberezkin/fast-deep-equal      |
| fast-uri             | 3.1.9   | BSD-3-Clause | https://github.com/fastify/fast-uri                 |
| json-schema-traverse | 1.0.0   | MIT          | https://github.com/epoberezkin/json-schema-traverse |
| require-from-string  | 2.0.2   | MIT          | https://github.com/floatdrop/require-from-string    |

## Development

| Component    | Version | License    |
| ------------ | ------- | ---------- |
| TypeScript   | 5.9.3   | Apache-2.0 |
| @types/node  | 24.10.0 | MIT        |
| undici-types | 7.16.0  | MIT        |

Exact dependency versions, source tarball URLs and integrity hashes are recorded in package-lock.json. License and copyright texts are retained under licenses/. Node.js and optional Ollama are separately installed runtimes. Ollama models are not included; operators must check each model's license. Ollama API documentation: https://docs.ollama.com/api/chat .

## Country and territory names

data/countries.json is an adapted subset of the iso-codes ISO 3166-1 dataset with Japanese display names from the Veygrit research register. The subset changes the field names and adds Veygrit scope/profile metadata. The list is an indexing aid, not a definition of customs or tax territory. ISO identifiers and country names do not establish trade eligibility.

Upstream: https://salsa.debian.org/iso-codes-team/iso-codes . License: LGPL-2.1-or-later, retained in licenses/iso-codes-LGPL-2.1.txt. The machine-readable JSON is the editable source of the adapted list; upstream also provides the original source data and translations.

Upstream notice: Copyright 2001-2008 Alastair McKinstry, 2004-2016 Christian Perrier, 2005-2025 Dr. Tobias Quathamer. ISO 3166 is a designation of the International Organization for Standardization; this project is not an official ISO or customs publication.

## Customs and tax information

Source metadata and original summaries are in data/sources.json, data/knowledge.json and data/research-cards.json. This distribution does not include full government webpages, paid tariff schedules, WCO explanatory notes, HS training corpora or the original Veygrit research PDFs. Each source retains its own rights and terms. URLs and concise summaries do not grant a right to redistribute full source material.

## WCO member and source references

The WCO member crosswalk records public membership facts from the World Customs Organization and Japan's Ministry of Finance. The source registry links to national, regional and international government sources. The registry includes citations and scope for each link.

- [WCO membership](https://www.wcoomd.org/en/about-us/wco-members/membership.aspx)
- [Japan Ministry of Finance website terms](https://www.mof.go.jp/about_mof/notice/index.html)

## Official tariff schedules

`data/tariffs/manifest.json` lists the issuing authority, edition, source files, SHA-256 hashes and reuse terms for each normalized snapshot. The transformed data retain official rate expressions, source locations and published treatment labels. Each dataset follows its own reuse terms. The optional Canada source conversion uses mdb-reader 3.2.0 (MIT), installed separately for that conversion. The program runs with the bundled tariff snapshots without that dependency.

The Korean national and foreign tariff extracts are adapted by Veygrit from Korea Customs Service public datasets under the Korea Open Government License (KOGL) Type 1. The datasets are published through the Korean Public Data Portal.

- [KCS national tariff rates](https://www.data.go.kr/data/15051179/fileData.do)
- [KCS foreign tariff compilation](https://www.data.go.kr/data/15051176/fileData.do)
- [KOGL Type 1](https://www.kogl.or.kr/info/licenseType1.do)

The Taiwan CCC rate extract is adapted from the Customs Administration, Ministry of Finance, Taiwan under Government Data Open License version 1.0. The Australian Schedule 3 rate extract is adapted from the Australian Government Department of Home Affairs / Australian Border Force under CC BY 3.0 Australia. Dataset-specific attribution and source checksums are in the tariff manifest.

- [Taiwan tariff and commodity classification dataset](https://data.gov.tw/dataset/80871)
- [Australian Government Department of Home Affairs copyright](https://www.homeaffairs.gov.au/access-and-accountability/using-our-website/copyright-and-disclaimer)

The Norway tariff and import tax extracts contain data from Tolletaten, adapted under CC BY 4.0. The manifest records the original datasets and the hashes of the imported files.

- [Tolletaten customs duties](https://data.toll.no/dataset/tollavgiftssats)
- [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)

The British product VAT extracts contain public sector information licensed under the Open Government Licence v3.0. TARIC extracts contain European Union data © European Union, 2026, adapted from the European Commission, DG Taxation and Customs Union.

- [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/)
- [European Commission legal notice](https://commission.europa.eu/legal-notice_en)

The Singapore statutory extracts are reproduced with the permission of the Government of Singapore under the e-Gazette Terms of Use. Refer to the Singapore e-Gazette for the latest legislation.

- [Singapore e-Gazette Terms of Use](https://www.egazette.gov.sg/terms-of-use/)

The Great Britain trade remedy extract contains public sector information licensed under the Open Government Licence v3.0. Source data are from the UK Department for Business and Trade. The VAT extracts from TEDB contain European Union data © European Union, 2026, adapted from the European Commission Directorate-General for Taxation and Customs Union.

- [DBT Data API](https://data.api.trade.gov.uk/)
- [European Commission Taxes in Europe Database](https://ec.europa.eu/taxation_customs/tedb/index.html)
- [European Commission legal notice](https://commission.europa.eu/legal-notice_en)

The 2026 Hong Kong HKHS code list is adapted from the Census and Statistics Department of Hong Kong SAR website. The Government of the Hong Kong Special Administrative Region is the intellectual property rights owner. Veygrit extracted the numeric codes and paired them with the ordinary free-port duty rule published by the Customs and Excise Department.

- [HKHS classification publications](https://www.censtatd.gov.hk/en/page_1364.html)
- [Census and Statistics Department reuse terms](https://www.censtatd.gov.hk/en/page_31.html)
- [Hong Kong Customs cargo clearance](https://www.customs.gov.hk/en/service-enforcement-information/cargo-clearance/)

The 7th revision NCEM/HS code list is adapted from the Statistics and Census Service of Macao SAR. Veygrit extracted the numeric codes and paired them with the ordinary free-port duty rule.

- [Statistics and Census Service NCEM/HS publication and reuse notice](https://www.dsec.gov.mo/getdoc/cdc315c4-da4f-4db4-b087-852a3ceb4617/HS2020.aspx)
- [Macao SAR trade and free-port guidance](https://www.ipim.gov.mo/en/invest-here/foreign-trade)

The New Caledonia tariff and import tax extracts are adapted from the Direction régionale des douanes de Nouvelle-Calédonie tariff compilation under Licence Ouverte 2.0. The tariff manifest records the issuing authority, dataset date, and source checksum for each extract.

- [New Caledonia customs tariff compilation](https://data.gouv.nc/explore/dataset/referentiel-douanier-tarif-douanier-compilation/)
- [Licence Ouverte 2.0](https://www.etalab.gouv.fr/wp-content/uploads/2017/04/ETALAB-Licence-Ouverte-v2.0.pdf)
