#!/usr/bin/env python3
"""Extract ordinary import duty and VAT from the Cook Islands HS 2022 tariff."""
import argparse
import json
from pathlib import Path
import re
import subprocess

from rebuild import digest, line, rate, schedule, write_pack

INDEX = "https://www.mfem.gov.ck/post/cook-islands-customs-tariff-hs2022"
PDF = "https://www.mfem.gov.ck/_files/ugd/dbdf40_02d6ca6a6ae54d3fbd45b2d4cce2cf23.pdf"
TERMS = "https://parliament.gov.ck/wp-content/uploads/2020/02/Copyright-No.-8.pdf"
ITEM = re.compile(r"^ *(\d{4}\.\d{2}\.\d{2})\b")
HEADER = re.compile(r"EXCISE +IMPORT +IMPORT")
IMPORT_COLUMNS = re.compile(r"(?<!\S)(Free|\d+(?:\.\d+)?%) {2,}(15%)\s*$")
AMBIGUOUS_ITEMS = {"8703.21.41", "8703.21.42", "8703.21.43"}
UNIT = re.compile(r"^ {2,}(\S+(?: [a-z]{1,3})?) {2,}(?=[–-])")


def extract(pdf):
    text = subprocess.check_output(["pdftotext", "-layout", str(pdf), "-"], text=True)
    pages = text.split("\f")
    assert len(pages) == 469
    assert "Customs Tariff Order 2025" in pages[1] and "Cook Islands Customs Service" in pages[2]
    assert "0101.21.00" in pages[15] and "9706.90.00" in pages[454]

    customs = {}
    taxes = {}
    for page_number, page in enumerate(pages[15:455], 16):
        if HEADER.search(page) is None:
            continue
        for row in page.splitlines():
            item = ITEM.match(row)
            if item is None or item[1] in AMBIGUOUS_ITEMS:
                continue
            columns = IMPORT_COLUMNS.search(row[item.end():])
            if columns is None:
                continue
            code = item[1].replace(".", "")
            assert code not in customs, code
            duty, vat = columns.groups()
            reference = f"Part 1, item {item[1]}, PDF page {page_number}"
            details = {"url": f"{PDF}#page={page_number}"}
            unit = UNIT.match(row[item.end():])
            if unit:
                details["units"] = [unit[1]]
            customs[code] = line(code, reference, [rate("general", "Import duty", duty)], **details)
            taxes[code] = line(code, reference, [
                rate("general", "Import VAT", vat, charge="import_vat"),
            ], **details)

    assert len(customs) >= 6800
    assert customs["09012100"]["rates"][0]["expression"] == "Free"
    assert taxes["09012100"]["rates"][0]["expression"] == "15%"
    assert customs["97069000"]["rates"][0]["expression"] == "Free"

    base = schedule(
        "ck-customs-hs2022-2025", "CK", ["CK"], "Cook Islands Customs Tariff HS 2022 (10 December 2025)",
        "2025-12-10", "national_schedule", "Cook Islands Customs Service",
        INDEX, "Official statutory tariff and numeric facts. Cook Islands Copyright Act 2013, section 7.",
        TERMS, [{"name": "Cook Islands Customs Tariff HS 2022", "sha256": digest(pdf), "url": PDF}],
        [
            "Chapters 1–97. Includes clear, complete single-line general duty cells.",
            "Specific, multiline and compound duty rates and Chapter 99 special procedures require the original table.",
            "Repeated motor vehicle codes 8703.21.41–43 require review in the original table.",
            "Check excise, eligibility for concessions, preferential origin and later amendments separately.",
        ],
    )
    vat = {
        **base,
        "id": "ck-import-vat-hs2022-2025",
        "role": "measures",
        "limitations": [
            "Import VAT rates printed alongside the selected general duty cells.",
            "Check statutory VAT exemptions, tax base and special concessions separately.",
        ],
    }
    return [(base, list(customs.values())), (vat, list(taxes.values()))]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    packs = [write_pack(args.output, meta, rows) for meta, rows in extract(args.pdf)]
    (args.output / "manifest.json").write_text(
        json.dumps({"version": 1, "snapshots": packs}, indent=2, ensure_ascii=False) + "\n"
    )


if __name__ == "__main__":
    main()
