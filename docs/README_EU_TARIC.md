# EU TARIC import measure snapshots

Veygrit extracts selected import measure types from the European Commission DG TAXUD TARIC November 2026 publication. These dated references cover the EU customs territory in standard zones of all 27 member states.

| Pack | Reference date | Inputs and scope |
| --- | --- | --- |
| `eu-taric-trade-measures-20261111` | 2026-11-11 | Single-country origin records from the monthly workbook with the six available daily updates through 2026-11-10 19:14 European Commission local time. The official publication list was checked again on the morning of November 11. |
| `eu-taric-trade-measures-20261101` | 2026-11-01 | Group-origin records from the monthly workbook and corresponding group membership and exclusions. |

The selected import measure codes are 551 and 552 for provisional and definitive anti-dumping duties, 553 and 554 for provisional and definitive countervailing duties, and 652, 654, 695 and 696 for additional duties. China-origin electric vehicles under TARIC 8703801010 are covered by the separately sourced Veygrit countervailing dataset.

Veygrit resolves the tariff code level using the active English nomenclature workbook and retains the padded 10-digit source code. It associates individual origins or dated group members, documented exclusions, raw duty expressions, company and additional codes, certificate and action identifiers, and measure footnote identifiers. The parser retains a long expression or condition in row notes if it exceeds a rate field's character limit. The catalog returns candidates. For a declaration, check the live TARIC entry and the governing EU legal act for product scope, documentation, interaction between measures and applicable rates.

## Reproduction

The pinned source URLs and SHA-256 digests are in each pack manifest. Save the workbooks and daily ZIP files under the names listed in `inputFiles`. The Commission CIRCABC public endpoints accept the guest account with an empty password. Verify that a daily ZIP's internal workbook names match the requested publication date and time. Public endpoints may return a different daily ZIP or update ZIP metadata on retrieval.

With Python and openpyxl installed, run from the repository root.

```sh
python scripts/tariffs/normalize_taric.py --registry data/countries.json \
  --input inputs --urls input_urls.tsv --output taric-current
python scripts/tariffs/normalize_taric.py --registry data/countries.json \
  --input inputs --urls input_urls.tsv --output taric-groups --group-origins
npm run tariff:import -- taric-current/source.json taric-current/lines.json eu-taric-current-pack
npm run tariff:import -- taric-groups/source.json taric-groups/lines.json eu-taric-group-pack
```

Construct `input_urls.tsv` with one manifest `inputFiles` name and its URL per line, separated by a tab. The two output directories contain independent manifests for the tariff loader.

© European Union, 2026. Source: European Commission, DG Taxation and Customs Union, TARIC. The files are derived by Veygrit through filtering, normalization and joins. Reuse follows the Commission's legal notice and Decision 2011/833/EU.

- [European Commission TARIC and raw data access](https://taxation-customs.ec.europa.eu/online-services/online-services-and-databases-customs/eu-customs-tariff-taric_en)
- [November 2026 CIRCABC folder contents](https://circabc.europa.eu/service/api/node/workspace/SpacesStore/e8082cdc-fa7f-4adb-882b-f0039bbe7a98/children)
- [European Commission daily publications](https://ec.europa.eu/taxation_customs/dds2/taric/daily_publications.jsp?Lang=en)
- [TARIC database extraction guide](https://circabc.europa.eu/sd/a/3d892b27-176f-4b8c-bbf5-4e0ee63f7e5a/Explanation%20for%20the%20Taric%20database%20extractions.pdf)
- [European Commission legal notice](https://commission.europa.eu/legal-notice_en)
