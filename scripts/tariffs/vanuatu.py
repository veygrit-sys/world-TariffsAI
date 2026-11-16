#!/usr/bin/env python3
"""Extract unambiguous numeric rate rows from Vanuatu's official tariff."""
import argparse
import json
from pathlib import Path
import re
import subprocess

from rebuild import CHECKED, digest, line, rate, schedule, write_pack

INDEX = "https://vanuatucustoms.gov.vu/index.php/customs/hs-nomenclature"
PDF = "https://vanuatucustoms.gov.vu/images/Customs_Tariff/HS2022_English_Version_Final_V4.pdf"
TERMS = "https://www.wipo.int/wipolex/en/text/475492"
ITEM = re.compile(r"^ *(\d{4}\.\d{2}\.\d{2})\b")
UNIT = r"(?:[0-9,]*u|kg|m[²³23]|kWh?|l|g|carat|pair)"
EXPRESSION = r"(?:Free|\d{1,3}(?:\.\d+)? *%|[\d,]+(?:\.\d+)? ?VT */ *[a-z]+)"
SITC = r"(?:[0-9O]{3,4}\.\d{1,3})"
END = r"(?:Free|Feee|\d{1,3}% *(?:plus *[\d,]+VT)?)"
COLUMNS = re.compile(
    rf"\s+({UNIT})\s+({EXPRESSION})\s+({EXPRESSION})\s+(Free|15%)"
    rf"\s+(?:{SITC}\s+)?{END} *$",
    re.IGNORECASE,
)


def extract(path):
    document = subprocess.check_output(["pdftotext", "-layout", str(path), "-"], text=True)
    pages = document.split("\f")
    assert "THE REPUBLIC OF VANUATU" in pages[0]
    assert "SCHEDULE 1" in pages[0] and "HS2022" in pages[0]
    assert len(pages) == 571 and "9706.90.00" in pages[568]

    customs = {}
    measures = {}
    assert "0101.21.00" in pages[11]
    for page_number, page in enumerate(pages[11:569], 12):
        for row in page.splitlines():
            item = ITEM.match(row)
            if item is None:
                continue
            columns = COLUMNS.search(row[item.end():])
            if columns is None:
                continue
            unit, duty, excise, vat = columns.groups()
            code = item[1].replace(".", "")
            assert code not in customs, code
            reference = f"Schedule 1, item {item[1]}, PDF page {page_number}"
            details = {"url": f"{PDF}#page={page_number}", "units": [unit]}
            customs[code] = line(code, reference, [
                rate("general", "Import duty", duty),
            ], **details)
            measures[code] = line(code, reference, [
                rate("general", "Import excise", excise, charge="excise"),
                rate("general", "Import VAT", vat, charge="import_vat"),
            ], **details)

    assert len(customs) >= 5600
    assert customs["09012100"]["rates"][0]["expression"] == "30%"
    assert measures["09012100"]["rates"][1]["expression"] == "15%"
    assert customs["97069000"]["rates"][0]["expression"] == "Free"

    metadata = schedule(
        "vu-customs-hs2022-v4", "VU", ["VU"], "Vanuatu HS 2022 Schedule 1 (English V4)",
        CHECKED, "national_schedule", "Vanuatu Department of Customs and Inland Revenue",
        INDEX, "Numeric tariff facts only. Vanuatu Copyright and Related Rights Act, section 7.",
        TERMS, [{"name": "HS2022_English_Version_Final_V4.pdf", "sha256": digest(path), "url": PDF}],
        [
            "Schedule 1 numeric rates observed in the published English V4 on the reference date.",
            "Complete single-line numeric entries are included. Multiline and compound rates require the original table.",
            "Check applicable exemptions, origin preferences, later amendments, and customs valuation separately.",
        ],
    )
    return [
        (metadata, list(customs.values())),
        ({**metadata, "id": "vu-import-vat-excise-hs2022-v4", "role": "measures"}, list(measures.values())),
    ]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    packs = [write_pack(args.output, metadata, lines) for metadata, lines in extract(args.pdf)]
    (args.output / "manifest.json").write_text(
        json.dumps({"version": 1, "snapshots": packs}, indent=2, ensure_ascii=False) + "\n"
    )


if __name__ == "__main__":
    main()
