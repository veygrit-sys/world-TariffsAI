#!/usr/bin/env python3
"""Normalize Palau HS lines whose duty and PGST match current statutory rates."""
import argparse
import json
from pathlib import Path
import re
import subprocess

from rebuild import CHECKED, digest, line, rate, schedule, write_pack

HS_PDF = "https://bcbp.pw/wp-content/uploads/2024/02/PALAU-HS2022.pdf"
CODE_INDEX = "https://www.palaulaw.gov.pw/palau-national-code"
TITLE_40 = "https://www.palaulaw.gov.pw/view/recsEBwJfyb2r7jaF?source=documents"
TERMS = "https://www.wipo.int/wipolex/en/text/201049"
ITEM = re.compile(r"^ *(\d{4}\.\d{2}\.\d{2})\b")
UNIT = r"(?:[0-9,]*u|kg|m[²³23]|kWh?|l|g|carat|pair)"
EXCISE = r"(?:Free|[\d,]+(?:\.\d+)? *%?|\.\d+)"
SITC = r"(?:[0-9O]{3,4}\.\d{1,3})"
END = r"(?:Free|0)"
COLUMNS = re.compile(
    rf"\s+({UNIT})\s+(0%?|Free)\s+{EXCISE}\s+(0%|10%|15%)\s+(?:{SITC}\s+)?{END} *$",
    re.IGNORECASE,
)
PGST_CONDITION = "Taxable imports only. Exemptions under 40 PNC § 1215 and valuation under § 1239 apply."


def read_pdf(path):
    return subprocess.check_output(["pdftotext", "-layout", str(path), "-"], text=True)


def extract(tariff_path, law_path):
    title_40 = read_pdf(law_path).split("\f")
    assert len(title_40) == 285
    assert "The rate of import tax is zero (0) percent." in title_40[194]
    assert "09/30/2026" in title_40[194]
    assert "Palau Goods and Services Tax is imposed at the rate of ten percent (10%)" in title_40[166]
    assert "Exempt imports" in title_40[166]
    assert any(
        "§ 1239. Value of import." in page
        and "the cost of all freight, insurance, and other charges" in page
        for page in title_40
    )

    pages = read_pdf(tariff_path).split("\f")
    assert "THE REPUBLIC OF PALAU" in pages[0]
    assert "SCHEDULE 1" in pages[0] and "HS2022" in pages[0]
    assert len(pages) == 593 and "9706.90.00" in pages[574]
    assert "0101.21.00" in pages[12]

    customs = {}
    measures = {}
    for page_number, page in enumerate(pages[12:575], 13):
        for row in page.splitlines():
            item = ITEM.match(row)
            if item is None:
                continue
            columns = COLUMNS.search(row[item.end():])
            if columns is None:
                continue
            unit, _, pgst = columns.groups()
            code = item[1].replace(".", "")
            assert code not in customs, code
            reference = f"HS 2022 item {item[1]}, PDF page {page_number}"
            details = {"url": f"{HS_PDF}#page={page_number}", "units": [unit]}
            customs[code] = line(code, f"{reference}; 40 PNC § 1301(b)", [
                rate("general", "Ordinary import tax", "0%"),
            ], **details)
            if pgst == "10%":
                measures[code] = line(code, f"{reference}; 40 PNC § 1214", [
                    rate("general", "PGST on taxable imports", pgst, charge="import_gst", condition=PGST_CONDITION),
                ], **details)

    assert len(customs) >= 5400
    assert len(measures) >= 5400
    assert "09012100" in customs and "09012100" in measures
    assert "97069000" in customs and "97069000" in measures
    assert "33030000" not in customs and "33030000" not in measures

    metadata = schedule(
        "pw-ordinary-import-tax-2026", "PW", ["PW"], "Palau HS 2022 and Title 40 (2026-09-30)",
        CHECKED, "national_schedule", "Palau Bureau of Customs and Border Protection and Palau Code Commission",
        CODE_INDEX,
        "Numeric tariff facts and statutory provisions only. Palau Copyright Act of 2003, section 3(b)(2).",
        TERMS, [
            {"name": "PALAU-HS2022.pdf", "sha256": digest(tariff_path), "url": HS_PDF},
            {"name": "Palau National Code, Title 40, 2026-09-30", "sha256": digest(law_path), "url": TITLE_40},
        ],
        [
            "Includes ordinary import tax rows with a clearly parsed zero rate matching Title 40 § 1301(b).",
            "Unparseable or conflicting rows require review against the current law and tariff publication.",
            "PGST, excise, carbon taxes, fees and exemptions have separate statutory rules.",
        ],
    )
    pgst = {
        **metadata,
        "id": "pw-taxable-import-pgst-2026",
        "role": "measures",
        "limitations": [
            "Includes rows where the customs tariff's PGST column agrees with the 10% rate in Title 40 § 1214.",
            "PGST applies to taxable imports subject to the exemptions in § 1215. The value of import is defined by § 1239.",
            "The statutory valuation includes applicable fiscal charges, relevant services, freight and insurance. Re-imported goods after repairs can have a different basis.",
            "Printed PGST rates conflicting with the standard statute and excise rates are excluded from this extract.",
        ],
    }
    return [(metadata, list(customs.values())), (pgst, list(measures.values()))]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("tariff_pdf", type=Path)
    parser.add_argument("title_40_pdf", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    packs = [
        write_pack(args.output, metadata, lines)
        for metadata, lines in extract(args.tariff_pdf, args.title_40_pdf)
    ]
    (args.output / "manifest.json").write_text(
        json.dumps({"version": 1, "snapshots": packs}, indent=2, ensure_ascii=False) + "\n"
    )


if __name__ == "__main__":
    main()
