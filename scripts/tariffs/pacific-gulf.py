#!/usr/bin/env python3
"""Convert verified government tariff PDFs into Veygrit snapshot packs."""
import argparse
import json
from pathlib import Path
import re
import subprocess

from rebuild import digest, line, rate, schedule, write_pack


FIJI_INDEX = "https://frcs.org.fj/our-services/customs/trade-business/customs-tariff/hs/"
FIJI_PDF = "https://frcs.org.fj/files/2026/09/HS-2022-with-2026-2027-Budget-Amendments.pdf"
FIJI_TERMS = "https://www.wipo.int/wipolex/en/text/591141"
FIJI_CODE = re.compile(r"^[ \uf020]*(\d{4}\.\d{2}\.\d{2}) +")
FIJI_HEADER = re.compile(r"\(3\)\s*\(4\)\s*\(5\)")
SIMPLE_RATE = r"(?:[0-9]+(?:\.[0-9]+)? *%|[`']?Free)"
FIJI_UNIT = r"(?:kg|u|m[²³23]?|l|la|[12]u|carat|no\.?|1000 +(?:kwh|u)|GB|12 +u|1)"
FIJI_COLUMNS = re.compile(
    rf" +({SIMPLE_RATE}) +({SIMPLE_RATE}) +({SIMPLE_RATE}) +({SIMPLE_RATE})"
    rf"(?: +\d{{2,3}}[.,]\d+)?(?: +({FIJI_UNIT}))? *$",
    re.IGNORECASE,
)


def pdf_text(path):
    return subprocess.check_output(["pdftotext", "-layout", str(path), "-"], text=True)


def fiji(raw):
    path = raw / "fiji2026.pdf"
    document = pdf_text(path)
    assert "amendments operative" in document and "from 26/06/2026" in document
    standard = document.split("LIST OF COMMODITIES AND TRANSACTIONS\n                     NOT CLASSIFIED", 1)[0]
    assert len(standard) < len(document)
    customs = {}
    measures = {}
    for page, content in enumerate(standard.split("\f"), 1):
        header = FIJI_HEADER.search(content)
        if header is None or "Description" not in content[:header.start()]:
            continue
        for row in content[header.end():].splitlines():
            match = FIJI_CODE.match(row)
            if match is None:
                continue
            columns = FIJI_COLUMNS.search(row[match.end():])
            if columns is None:
                continue
            fiscal, excise, vat, _, unit = columns.groups()
            fiscal, excise, vat = (text.strip("`'").replace(" ", "") for text in (fiscal, excise, vat))
            if fiscal not in {"5%", "15%", "32%", "12.5%", "Free"} or vat not in {"12.5%", "Free"}:
                continue
            if excise not in {"5%", "10%", "15%", "Free"}:
                continue
            code = match[1].replace(".", "")
            reference = f"Schedule 2 Part 1, item {match[1]}, PDF page {page}"
            source = f"{FIJI_PDF}#page={page}"
            custom = line(code, reference, [rate("general", "Fiscal import duty", fiscal)], url=source)
            other = line(code, reference, [
                rate("general", "Import excise", excise, charge="excise"),
                rate("general", "Import VAT", vat, charge="import_vat"),
            ], url=source)
            if unit and unit != "1":
                for entry in (custom, other):
                    entry["units"] = [" ".join(unit.split())]
            if code in customs:
                assert customs[code]["rates"] == custom["rates"] and measures[code]["rates"] == other["rates"], code
                continue
            customs[code] = custom
            measures[code] = other
    assert len(customs) >= 5800
    assert customs["01012900"]["rates"][0]["expression"] == "5%"
    assert customs["09012100"]["rates"][0]["expression"] == "15%"
    assert measures["09012100"]["rates"][1]["expression"] == "12.5%"
    limits = [
        "Extracted complete simple-rate rows from the 2026–2027 Schedule 2 Part 1 reference. Multiline specific and compound amounts and inconsistent rows require the original table.",
        "Check preferential origin, Part 2 and Part 3 concessions, exemptions and later changes separately.",
    ]
    base = schedule(
        "fj-frcs-standard-2026-budget", "FJ", ["FJ"], "HS 2022 with 2026/2027 National Budget Amendments",
        "2026-11-11", "national_schedule", "Fiji Revenue and Customs Service", FIJI_INDEX,
        "Numeric statutory provisions from Schedule 2 of the Customs Tariff Act. Fiji Copyright Act 1999 section 27.",
        FIJI_TERMS, [{"name": path.name, "sha256": digest(path), "url": FIJI_PDF}], limits,
    )
    return [
        (base, list(customs.values())),
        ({**base, "id": "fj-frcs-import-vat-excise-2026-budget", "role": "measures"}, list(measures.values())),
    ]


OMAN_INDEX = "https://www.customs.gov.om/en/user-guides/"
OMAN_PDF = "https://www.customs.gov.om/media/gmglqkjb/2026-4.pdf"
OMAN_TERMS = "https://www.wipo.int/wipolex/en/legislation/details/5832"
OMAN_BIDI = re.compile(r"[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]")
OMAN_CODE = re.compile(r"(?<!\d)(\d{2}(?: +\d{2}){5}) *$")
OMAN_RATE = re.compile(r"^(?: *(?:[A-Z][A-Z0-9]?|-) +){0,4} *(\d+(?:\.\d+)? *%)(?=\s|$)")


def oman(raw):
    path = raw / "oman2026.pdf"
    document = pdf_text(path)
    assert "Oman's Customs Tariff for 2026,Will be valid" in document[:1000]
    assert "january 2026" in document[:1000]
    pages = document.split("\f")
    assert len(pages) == 316 and "Chapter 97" in pages[312]
    items = {}
    for page_number, page in enumerate(pages[:314], 1):
        if page_number == 314:
            page = page.split("Annex", 1)[0]
        for row in page.splitlines():
            row = OMAN_BIDI.sub("", row)
            code_cell = OMAN_CODE.search(row)
            if code_cell is None:
                continue
            code = code_cell[1].replace(" ", "")
            rate_cell = OMAN_RATE.match(row[:code_cell.start()])
            rates = []
            if rate_cell:
                expression = rate_cell[1].replace(" ", "")
                assert expression in {"0%", "5%", "10%", "100%"} and 12 <= rate_cell.start(1) <= 33, row
                rates.append(rate("general", "Ordinary import duty", expression))
            entry = line(
                code, f"Oman Customs Tariff 2026, PDF page {page_number}", rates,
                url=f"{OMAN_PDF}#page={page_number}",
            )
            if code in items:
                assert items[code]["rates"] == rates, code
                continue
            items[code] = entry
    assert len(items) == 14229 and sum(bool(item["rates"]) for item in items.values()) == 14075
    assert items["090121000000"]["rates"][0]["expression"] == "0%"
    base = schedule(
        "om-royal-oman-police-2026", "OM", ["OM"], "Oman's Customs Tariff for 2026",
        "2026-11-11", "national_schedule", "Royal Oman Police, Directorate General of Customs", OMAN_INDEX,
        "Numeric facts and official legal rates. Oman Copyright and Neighboring Rights Law, Article 4.",
        OMAN_TERMS, [{"name": path.name, "sha256": digest(path), "url": OMAN_PDF}], [
            "Ordinary ad valorem duty column for Oman only, observed from the official 2026 tariff on the reference date.",
            "A tariff line with no printed ordinary rate is retained as rate not reported.",
            "Check trade agreement rates, product restrictions, specific applicability, VAT and trade remedies in the source. Preference codes and anti-dumping rates are not imported here.",
        ],
    )
    return [(base, list(items.values()))]


PNG_INDEX = "https://www.customs.gov.pg/tev/tariff"
PNG_PDF = "https://customs.gov.pg/uploads/HS%202022%20Import%20%26%20Export%20Tariff%20Act.pdf"
PNG_TERMS = "https://www.wipo.int/wipolex/en/legislation/details/3427"
PNG_CODE = re.compile(r"^ *(\d{4}\.\d{2}\.\d{2}) +")
PNG_RATE = re.compile(
    r"(?<!\S)(?:Free|\d{1,3}(?:\.\d+)? *%|K *\d+(?:\.\d+)? */ *(?:kg|litre|tonne|l))(?=\s|$)",
    re.IGNORECASE,
)


def png_pair(row, old_column, new_column, iepa_column):
    rates = list(PNG_RATE.finditer(row))
    old = [r for r in rates if old_column - 2 <= r.start() < new_column - 2 and r.end() < new_column + 2]
    new = [r for r in rates if new_column - 1 <= r.start() and r.end() < iepa_column + 1]
    if len(old) == len(new) == 1 and row[old[0].end():new[0].start()].isspace():
        return " ".join(new[0][0].split())
    return None


def png(raw):
    path = raw / "png2022.pdf"
    document = pdf_text(path)
    assert "come into operation retrospectively on 1 st January 2022" in document[:2000]
    imports = document.split("\f                                                           SCHEDULE 2", 1)[0]
    assert len(imports) < len(document)
    items = {}
    for page_number, page in enumerate(imports.split("\f"), 1):
        old = re.search(r"^ +(Duty Rate) *$", page, re.MULTILINE)
        new = re.search(r"^ +(Duty Rate From) *$", page, re.MULTILINE)
        iepa = re.search(r"^.*?1st Jan 2022 +IEPA", page, re.MULTILINE)
        if old is None or new is None or iepa is None:
            continue
        old_column = old.start(1) - old.start()
        new_column = new.start(1) - new.start()
        iepa_column = iepa[0].index("IEPA")
        for row in page[iepa.end():].splitlines():
            code = PNG_CODE.match(row)
            if code is None:
                continue
            expression = png_pair(row, old_column, new_column, iepa_column)
            if not expression:
                continue
            number = code[1].replace(".", "")
            if number in items:
                assert items[number]["rates"][0]["expression"] == expression, number
                continue
            items[number] = line(
                number, f"Customs Tariff Act Schedule 1, item {code[1]}, PDF page {page_number}",
                [rate("general", "Ordinary import duty from 1 January 2022", expression)],
                url=f"{PNG_PDF}#page={page_number}",
            )
    assert len(items) >= 5000
    assert items["02011000"]["rates"][0]["expression"] == "12.5%"
    assert items["01012100"]["rates"][0]["expression"] == "Free"
    base = schedule(
        "pg-customs-tariff-act-hs2022-historical", "PG", ["PG"], "PNG Customs Tariff Act Schedule 1, HS 2022",
        "2022-01-01", "published_baseline", "Papua New Guinea Customs Service", PNG_INDEX,
        "Numeric provisions of an official legislative text. Copyright and Neighbouring Rights Act 2000 section 5.",
        PNG_TERMS, [{"name": path.name, "sha256": digest(path), "url": PNG_PDF}], [
            "Historical reference for the 2022 commencement date only. Subsequent legal changes require a newer schedule.",
            "Selected unambiguous rates printed in the ordinary 2022 column. Multi-line and unresolved rows, preferential rates and export duties are excluded.",
        ], through="2022-01-01",
    )
    return [(base, list(items.values()))]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("raw", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--only", choices=("fj", "om", "pg"), required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    packs = [write_pack(args.output, metadata, entries) for metadata, entries in {"fj": fiji, "om": oman, "pg": png}[args.only](args.raw)]
    (args.output / "manifest.json").write_text(json.dumps({"version": 1, "snapshots": packs}, ensure_ascii=False, indent=2) + "\n")
    for item in packs:
        print(item["id"], item["statistics"]["lines"], item["statistics"]["rates"])


if __name__ == "__main__":
    main()
