# Peru, Central American SAC and Colombia tariff snapshots

For the November 12 update, see [Americas customs and fees](AMERICAS_CUSTOMS.md).

The parsers retain numeric tariff codes, rates and legal references from official documents. This parser note describes the 2026-11-11 reference edition. The Central American and Colombia snapshots use the published baseline scope. Colombia provides the referenced day's DIAN compilation. Central America provides the latest regional edition located and the country columns for Parts II and III. Apply subsequent national measures and any applicable preferences or quotas separately.

## Rebuild

Run these commands from the repository root after downloading the inputs listed in each manifest. The URLs and SHA-256 digests in the manifests identify the source files.

```bash
python3 scripts/tariffs/peru.py raw peru_pack
python3 scripts/tariffs/central-america-sac.py raw/sac-2025.pdf sac_packs
python3 scripts/tariffs/colombia.py raw/co.html colombia_pack
```

The PDF parsers require Poppler `pdftotext`. The DIAN parser requires Python `lxml`. Each output folder has a version 1 manifest and the matching gzip packs. The source PDFs and HTML are acquired independently.

## Verification

| Source | 10-digit rows | Numeric rate rows | Coverage |
| --- | ---: | ---: | --- |
| SUNAT D.S. 404-2021-EF as amended by D.S. 163-2022-EF and D.S. 194-2022-EF | 8,017 | 8,017 | Peru |
| SIECA ACI version 6, Parts I–III | 37,695 | 37,687 | Guatemala, El Salvador, Honduras, Nicaragua, Costa Rica |
| DIAN consolidated Decreto 1881 | 7,995 | 7,990 | Colombia |

Peru matches the MEF count of 8,017 subheadings. Chapter 98 entries include a special-treatment condition. The 2022 amendments add code 9811000000 and replace 0208900000 with 0208900010 and 0208900090.

The SIECA PDF lists two Part II referrals without national rates for Guatemala, El Salvador, Honduras and Costa Rica. Those country-specific lines retain an empty rate list. Nicaragua's Part III gives rates for those codes. The five packs retain their separate destination columns. Part I code values therefore recur in the totals. Annex 2 records Panama-specific changes without providing a complete current national tariff here.

DIAN rate values preserve linked decrees and vigencia markers, including where a temporary instrument can replace the printed base. Five ten-digit heading codes have no independent printed rate. The capture includes the 2026 motorcycle assembly provisions, including 9801200000 at a published 3% subject to its regime.
