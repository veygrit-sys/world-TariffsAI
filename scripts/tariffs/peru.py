#!/usr/bin/env python3
"""Build the Peru 2022 tariff snapshot, consolidated through the 2022 code amendments.

Run with a directory containing the three official PDFs and an output directory.
Requires Poppler pdftotext. See PERU.md for inputs and verification.
"""

import argparse
from collections import Counter
import gzip
from hashlib import sha256
import json
from pathlib import Path
import re
import subprocess

BASE = "https://www.sunat.gob.pe/legislacion/procedim/normasadua/gja-04/ctrlCambios/anexos/Arancel_2022.pdf"
AMEND_163 = "https://www.sunat.gob.pe/legislacion/procedim/normasadua/gja-04/ctrlCambios/anexos/DS_163-2022-EF.pdf"
AMEND_194 = "https://cdn.www.gob.pe/uploads/document/file/3543937/DS194_2022EF.pdf.pdf?v=1661438370"
POLICY = "https://www.mef.gob.pe/es/economia-internacional/politica-arancelaria/"
TERMS = "https://cdn.www.gob.pe/uploads/document/file/1669698/DL%20822.pdf.pdf"
PUBLISHED_CODE = r"\d{4}\.\d{2}\.\d{2}\.\d{2}"
BASE_ROW = re.compile(rf"^\s*({PUBLISHED_CODE})\s+.*? {{3,}}(0|4|6|11)\.?\s*$")
ID = "pe-sunat-nandina-2022-amended"


def pdf_text(path):
    return subprocess.check_output(["pdftotext", "-layout", path, "-"], text=True)


def record(code, percent, reference, url, *, condition=None):
    is_special = code.startswith("98")
    rate = {
        "charge": "customs_duty",
        "treatment": "other" if is_special else "mfn",
        "label": "SUNAT special-regime schedule A/V" if is_special else "SUNAT general schedule A/V",
        "expression": f"{percent}%",
    }
    if is_special:
        rate["condition"] = condition or "Chapter 98 special treatment. Check the corresponding legal note and eligibility before applying."
    return {
        "code": code.replace(".", ""),
        "reference": reference,
        "rates": [rate],
        "url": url,
    }


def build(raw, out):
    raw_sources = [
        (raw / "pe-2022.pdf", BASE),
        (raw / "pe-163.pdf", AMEND_163),
        (raw / "pe-194.pdf", AMEND_194),
    ]
    tariff = {}
    for page, page_text in enumerate(pdf_text(raw_sources[0][0]).split("\f"), 1):
        for row in page_text.splitlines():
            match = BASE_ROW.match(row)
            if match:
                code, value = match.groups()
                assert code not in tariff, f"Duplicate tariff line {code}"
                tariff[code] = record(code, value, f"D.S. 404-2021-EF, PDF page {page}", BASE)
    assert len(tariff) == 8015
    assert sum(code.startswith("98") for code in tariff) == 13
    assert tariff["0101.29.10.00"]["rates"][0]["expression"] == "6%"
    assert tariff["2204.30.00.00"]["rates"][0]["expression"] == "0%"

    amend_163_text = pdf_text(raw_sources[1][0])
    assert re.search(r"9811\.00\.00\.00\s+Material de guerra\s+0\b", amend_163_text)
    tariff["9811.00.00.00"] = record(
        "9811.00.00.00", 0, "D.S. 163-2022-EF, articles 1 and 2", AMEND_163,
        condition="War materiel under D.S. 052-2001-PCM art. 2, consigned to the specified Peruvian defence or police authorities and entered under the special customs regime.",
    )
    amend_194_text = pdf_text(raw_sources[2][0])
    original = tariff.pop("0208.90.00.00")
    assert original["rates"][0]["expression"] == "6%"
    for code in ("0208.90.00.10", "0208.90.00.90"):
        assert re.search(rf"{re.escape(code)}[^\n]+ {{3,}}6\b", amend_194_text), code
        tariff[code] = record(code, 6, "D.S. 194-2022-EF, article 1", AMEND_194)
    assert len(tariff) == 8017
    assert sum(code.startswith("98") for code in tariff) == 14

    lines = [tariff[code] for code in sorted(tariff)]
    assert Counter(row["rates"][0]["expression"] for row in lines) == {
        "0%": 5661, "6%": 1677, "11%": 676, "4%": 3,
    }
    snapshot = {
        "id": ID,
        "jurisdiction": "PE",
        "countries": ["PE"],
        "zone": "standard",
        "edition": "Arancel de Aduanas 2022, D.S. 404-2021-EF as amended by D.S. 163-2022-EF and 194-2022-EF",
        "hsEdition": "HS2022",
        "availableFrom": "2022-08-26",
        "availableThrough": "2026-11-11",
        "checkedOn": "2026-11-11",
        "scope": "national_schedule",
        "authority": "SUNAT and Ministerio de Economía y Finanzas del Perú",
        "sourceUrl": POLICY,
        "terms": "Peru Legislative Decree 822 article 9(b) and (d), official legislative texts and factual data. Source references retained.",
        "termsUrl": TERMS,
        "inputFiles": [
            {"name": file.name, "url": url, "sha256": sha256(file.read_bytes()).hexdigest()}
            for file, url in raw_sources
        ],
        "limitations": [
            "Published 10-digit general ad valorem tariff and Chapter 98 schedule. Chapter 98 requires separate regime eligibility.",
            "MEF confirms the current 8,017-subheading structure. Preferential, agricultural price band, trade-remedy, internal tax and customs relief measures require separate verification.",
        ],
    }
    out.mkdir(parents=True, exist_ok=True)
    path = out / f"{ID}.json.gz"
    data = json.dumps({"id": ID, "lines": lines}, ensure_ascii=False, separators=(",", ":")).encode()
    path.write_bytes(gzip.compress(data, compresslevel=9, mtime=0))
    snapshot.update(
        file=path.name,
        sha256=sha256(path.read_bytes()).hexdigest(),
        statistics={
            "lines": len(lines), "uniqueCodes": len(lines), "codesWithRates": len(lines),
            "rates": len(lines), "chapters": sorted({row["code"][:2] for row in lines}),
        },
    )
    (out / "manifest.json").write_text(json.dumps({"version": 1, "snapshots": [snapshot]}, ensure_ascii=False, indent=2) + "\n")
    print(ID, snapshot["statistics"])


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("raw", type=Path)
    parser.add_argument("out", type=Path)
    args = parser.parse_args()
    build(args.raw, args.out)
