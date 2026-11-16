#!/usr/bin/env python3
"""Normalize Sri Lanka Customs' November 2026 import tariff archive with PyMuPDF."""
import argparse
from concurrent.futures import ProcessPoolExecutor
import json
from pathlib import Path
import re
from zipfile import ZipFile

import fitz
from rebuild import CHECKED, clean, digest, line, rate, schedule, write_pack


INDEX = "https://www.customs.gov.lk/customs-tariff/import-tariff/"
ARCHIVE = "https://www.customs.gov.lk/wp-content/uploads/2026/11/Tariff-Guide-Updated-03.11.2026.zip"
SCL = "https://www.customs.gov.lk/wp-content/uploads/2026/11/Complete-SCL-Chart-03.11.2026.pdf"
TERMS = "https://www.parliament.lk/en/business-of-parliament/act-details/G3726"
CHAPTER_FILE = re.compile(r"chap[ _]+(\d{2})n?\.pdf", re.IGNORECASE)
HS_CODE = re.compile(r"[0-9]{4}\.[0-9]{2}(?:\.[0-9]{2})?")
PERCENTAGE = r"[0-9]+(?:\.[0-9]+)? *%"
MONEY = r"Rs\.? *[0-9]+(?:,[0-9]{2,3})*(?:\.[0-9]+)? *(?:/ *[=-]?)? *"
UNIT = r"(?:kg(?: gross weight)?|g|grams?|l|lit(?:er|re)s?|unit|u|pair|sets?|pieces?|cm[³ᶾ3]|m[²2³3]?|kW|publication)"
SPECIFIC = rf"{MONEY}(?:per +|/ *){UNIT}"
DUTY = re.compile(rf"(?:free|ex|{PERCENTAGE}(?: +or +{SPECIFIC})?|{SPECIFIC})", re.IGNORECASE)
MEASURES = {
    "vat": ("Import VAT", "import_vat", re.compile(r"(?:0|18) *%|ex", re.IGNORECASE)),
    "pal": ("General Ports and Airports Development Levy", "levy", re.compile(rf"{PERCENTAGE}|ex", re.IGNORECASE)),
    "cess": ("Import Cess", "levy", DUTY),
    "excise(s.p.d)": ("Excise (Special Provisions Duty)", "excise", DUTY),
    "surchargeoncustomsduty": ("Surcharge on customs duty", "additional_duty", re.compile(PERCENTAGE)),
    "surchageoncustomsduty": ("Surcharge on customs duty", "additional_duty", re.compile(PERCENTAGE)),
    "sscl": ("Social Security Contribution Levy", "levy", re.compile(r"2\.50? *%|ex", re.IGNORECASE)),
}


def extract_chapter(task):
    chapter, data = task
    results = []
    with fitz.open(stream=data, filetype="pdf") as document:
        for page_number, page in enumerate(document, 1):
            for table in page.find_tables().tables:
                rows = table.extract()
                for row_number, row in enumerate(rows):
                    headers = ["".join(clean(cell).lower().split()) for cell in row]
                    if not {"genduty", "hscode", "vat", "pal", "sscl"}.issubset(headers):
                        continue
                    hs = headers.index("hscode")
                    gen = headers.index("genduty")
                    for item in rows[row_number + 1:]:
                        printed_code = "".join(clean(item[hs]).split())
                        if HS_CODE.fullmatch(printed_code) is None or printed_code[:2] != chapter:
                            continue
                        code = printed_code.replace(".", "")
                        reference = f"Chapter {chapter}, PDF page {page_number}, item {printed_code}"
                        general = clean(item[gen])
                        customs = [rate("general", "General import duty", general)] if DUTY.fullmatch(general) else []
                        measures = []
                        for position, label in enumerate(headers):
                            if label not in MEASURES:
                                continue
                            description, charge, recognized = MEASURES[label]
                            cell = clean(item[position])
                            if recognized.fullmatch(cell):
                                measures.append(rate("general", description, cell, charge=charge))
                        results.append((line(code, reference, customs, url=ARCHIVE),
                                        line(code, reference, measures, url=ARCHIVE)))
                    break
    return results


def sri_lanka(raw):
    path = raw / "lk-2026-11-03.zip"
    with ZipFile(path) as source:
        tasks = []
        for name in source.namelist():
            chapter = CHAPTER_FILE.search(Path(name).name)
            if chapter is not None:
                tasks.append((chapter[1], source.read(name)))
    assert sorted(chapter for chapter, _ in tasks) == [f"{i:02}" for i in range(1, 98)]
    with ProcessPoolExecutor(max_workers=4) as pool:
        entries = [pair for chapter in pool.map(extract_chapter, tasks) for pair in chapter]
    customs = {custom["code"]: custom for custom, _ in entries}
    assert len(customs) == len(entries) == 9005, (len(customs), len(entries))
    assert sum(bool(item["rates"]) for item in customs.values()) >= 7700
    measures = {other["code"]: other for _, other in entries if other["rates"]}
    assert customs["090121"]["rates"][0]["expression"] == "20%"
    assert {r["charge"]: r["expression"] for r in measures["090121"]["rates"]}["import_vat"] == "18%"
    assert customs["22011010"]["rates"][0]["expression"] == "20% or Rs.190/= per l"
    assert customs["22030010"]["rates"][0]["expression"] == "Rs.550/= per l"
    base = schedule(
        "lk-customs-tariff-2026-11-03", "LK", ["LK"], "Sri Lanka Customs National Imports Tariff Guide, 3 November 2026",
        CHECKED, "national_schedule", "Sri Lanka Customs", INDEX,
        "Factual rates only. Sri Lanka Intellectual Property Act No. 36 of 2003 section 8(a)–(b).", TERMS,
        [{"name": path.name, "sha256": digest(path), "url": ARCHIVE}], [
            "Snapshot of chapter PDFs from the archive labelled 3 November 2026. Confirm applicable provisions in the relevant Gazette.",
            "Unambiguous General Duty entries, including certain specific and alternative rates. Blank or unclear cells and conditional subrows require the source.",
            "Check preferences, Special Commodity Levy, luxury tax, conditions, exemptions and trade remedies separately.",
        ],
    )
    return [
        (base, list(customs.values())),
        ({**base, "id": "lk-customs-import-taxes-2026-11-03", "role": "measures", "limitations": [
            "Unambiguous rates and exemptions printed in the VAT, general PAL, general Cess, excise, customs duty surcharge and SSCL columns.",
            "A missing measure rate may be blank, conditional, complex or unclear in the extract. Check the chapter PDF and the relevant Gazette.",
            f"The Special Commodity Levy is published separately at {SCL}",
        ]}, list(measures.values())),
    ]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("raw", type=Path)
    parser.add_argument("out", type=Path)
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    items = [write_pack(args.out, *pack) for pack in sri_lanka(args.raw)]
    (args.out / "manifest.json").write_text(json.dumps({"version": 1, "snapshots": items},
                                                       ensure_ascii=False, indent=2) + "\n")
    for item in items:
        print(item["id"], item["statistics"]["codesWithRates"], item["statistics"]["rates"])


if __name__ == "__main__":
    main()
