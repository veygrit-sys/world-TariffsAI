# MERCOSUR AEC and Uruguay TGA snapshots

The MERCOSUR Secretariat published the 1 November 2026 NCM and AEC reference in POLCOM. The pack retains the numerical common external tariff for 10,516 eight-digit codes and the published tariff family identifiers. It uses a one-day reference date and covers Argentina, Paraguay and Uruguay. Use national instruments for each country's exceptions, quotas, preferences, and subsequent amendments.

The Uruguay Ministry of Economy and Finance published a February 2025 national TGA workbook. Its MFN and qualifying MERCOSUR intra-zone columns give 24,479 rate entries across 12,240 ten-digit codes. The query date 28 February marks the reference month. The source contains two repeated codes. One code has two distinct MFN values, retained as separate candidates with the corresponding worksheet row reference.

- [MERCOSUR Secretariat POLCOM NCM and AEC](https://polcom.mercosur.int/public/ncm/vigente)
- [MERCOSUR CMC Decision 8/2022 and national incorporation references](https://normas.mercosur.int/public/normativas/4334)
- [Uruguay MEF national nomenclature and tariffs](https://www.gub.uy/ministerio-economia-finanzas/nomenclatura-aranceles-uruguay-0)
- [Uruguay MEF TGA column definitions](https://www.gub.uy/ministerio-economia-finanzas/institucional/informacion-economica/base-datos-aranceles-aplicados-socio-comercial)

## Build

The rate normalizer uses openpyxl. The POLCOM downloader uses lxml for the public page's anti-CSRF form. Use the manifests' input file hashes to identify the source captures.

```bash
python3 scripts/tariffs/fetch_polcom.py raw/polcom-202611.json
python3 scripts/tariffs/mercosur.py polcom raw/polcom-202611.json mercosur-packs
python3 scripts/tariffs/mercosur.py uruguay raw/uy-202502.xlsx uruguay-packs
```

The published packs retain numerical rates, code identifiers and provenance. Product description texts and raw input files are excluded from the redistribution.
