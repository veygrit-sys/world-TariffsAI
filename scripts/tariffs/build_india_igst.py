#!/usr/bin/env python3
"""Normalize India Gazette IGST notification tables from their consolidated PDF copies.

Requires pdfplumber. Fetch input PDFs listed in SOURCES into the input directory.
Only statutory tariff rows are extracted from the consolidated print copies.
"""
from argparse import ArgumentParser
from collections import defaultdict
import gzip
from hashlib import sha256
import json
from pathlib import Path
import re

import pdfplumber

SOURCES = {
    "in-igst-092025.pdf": "https://d348t3gez84jj8.cloudfront.net/download/gstlaw/NOTIFICATION%20NO.%209_2025-INTEGRATED%20TAX%20(RATE)%20-1793611247.pdf",
    "in-igst-102025.pdf": "https://d348t3gez84jj8.cloudfront.net/download/gstlaw/NOTIFICATION%20NO.%20102025-INTEGRATED%20TAX%20%20-%20(RATE)1793611274.pdf",
    "in-igst-original.pdf": "https://courier.cbic.gov.in/ECCS/advisory/2025/NOTIFICATION%20NO.%209_2025-INTEGRATED%20TAX%20%28RATE%29%20-1759486719.pdf",
    "in-igst-012026.pdf": "https://gst.karnataka.gov.in/Documents/General/ITR014426.pdf",
    "in-igst-012026-corr.pdf": "https://d23z1tp9il9etb.cloudfront.net/download/gstlaw/ITR-E-updated1778562979.pdf",
    "in-igst-022026.pdf": "https://gst.karnataka.gov.in/Documents/General/ITR0231126.pdf",
    "in-igst-032026.pdf": "https://gst.karnataka.gov.in/Documents/General/ITR0331126.pdf",
}
ID = "in-igst-2026-11"
SCHEDULE_RATES = {"I":"5%", "II":"18%", "III":"40%", "IV":"3%", "V":"0.25%", "VI":"1.50%", "EXEMPT":"0%"}
SCHEDULE_HEADER = re.compile(r"Schedule\s+([IVX]+)\s*[—–-]\s*[0-9.]+\s*%")
ITEM = re.compile(r"^\[?\s*(\d+)\s*([A-Z]?)\s*\.?$")
LABEL_NOTE = re.compile(r"^\d{1,2}\s*\[")
CODE = re.compile(r"[0-9]{2}(?:[ .]?[0-9]{2}){0,3}")
SPECIAL_SCOPE = re.compile(r"\b(?:except|other than|excluding)\b", re.I)

def cell(value):
    return " ".join((value or "").split())

def strip_reference_mark(text):
    return LABEL_NOTE.sub("[", text)

def table_rows(path, exempt):
    """Return active schedule rows, including continued cells on following pages."""
    schedule = "EXEMPT" if exempt else None
    rows = defaultdict(list)
    with pdfplumber.open(path) as document:
        for page_number, page in enumerate(document.pages, start=1):
            headers = []
            stop = False
            for line in page.extract_text_lines():
                text = line["text"].strip()
                m = SCHEDULE_HEADER.fullmatch(text)
                if m and m.group(1) in SCHEDULE_RATES:
                    headers.append((line["top"], m.group(1)))
                if re.match(r"Explanation\.[—–-]\s*For the purposes of this notification", text):
                    headers.append((line["top"], "STOP"))
            for _, table in sorted(
                headers + [(t.bbox[1], t.extract()) for t in page.find_tables()],
                key=lambda item: item[0],
            ):
                if isinstance(table, str):
                    if table == "STOP":
                        stop = True
                        break
                    schedule = table
                    continue
                if schedule is None:
                    continue
                for raw_row in table:
                    if len(raw_row) < 3:
                        continue
                    serial, code_scope, description = (cell(v) for v in raw_row[:3])
                    match = ITEM.fullmatch(strip_reference_mark(serial))
                    if match and code_scope and description:
                        item = "".join(match.groups())
                        if exempt and page_number >= 12 and item == "68":
                            # The table on page 12 prints a continuation of no-code entry 168.
                            assert code_scope == "-"
                            item = "168"
                        rows[schedule].append([item, strip_reference_mark(code_scope), description, page_number])
                    elif not serial and not code_scope and description and rows[schedule]:
                        rows[schedule][-1][2] += " " + description
            if stop:
                break
    return rows

def covered_codes(code_scope):
    """Return the stated positive code anchors. Keep other words as conditions."""
    candidate = code_scope.strip("[] ,.")
    if candidate.lower().startswith("any") or candidate in {"-", "—"}:
        return []
    matched = SPECIAL_SCOPE.search(candidate)
    if matched:
        candidate = candidate[:matched.start()].strip(" (,[")
    candidate = re.split(r"\bor\s+any\b", candidate, maxsplit=1, flags=re.I)[0]
    candidate = re.sub(r"\b(?:chapter|heading|sub-heading|tariff item)\b", "", candidate, flags=re.I)
    parts = re.split(r"\s*,\s*|\s*/\s*|\s*\b(?:or|and)(?=\W|\d)\s*", candidate, flags=re.I)
    found = set()
    for part in parts:
        part = part.strip(" .[]()")
        if not part:
            continue
        if CODE.fullmatch(part):
            found.add(re.sub(r"\D", "", part))
            continue
        span = re.fullmatch(r"("+CODE.pattern+r")\s*(?:to|[-–])\s*("+CODE.pattern+r")",part, re.I)
        if span:
            start, end = [re.sub(r"\D", "", token) for token in span.groups()]
            if len(start) == len(end) == 2 and 0 <= int(end) - int(start) <= 98:
                found.update(f"{chapter:02}" for chapter in range(int(start), int(end) + 1))
                continue
            if len(start) == len(end) == 4 and start[:2] == end[:2] and 0 <= int(end) - int(start) <= 98:
                found.update(f"{heading:04}" for heading in range(int(start), int(end) + 1))
                continue
        print(f"Skipped ambiguous HS expression {code_scope!r}")
        return []
    return sorted(found)

def build(raw, out):
    main = table_rows(raw / "in-igst-092025.pdf", False)
    main.update(table_rows(raw / "in-igst-102025.pdf", True))
    by_item = {(schedule, serial): (scope, description, page)
               for schedule, entries in main.items() for serial,scope,description,page in entries}
    assert len(by_item) == sum(map(len,main.values())), "Duplicate statutory serial numbers"
    for schedule, expected in {"I":517,"II":641,"III":19,"IV":15,"V":3,"VI":2,"EXEMPT":172}.items():
        assert len(main[schedule]) == expected, (schedule, len(main[schedule]))
    assert by_item["I","272A"][0] == "4012"
    assert "2403 19 21" in by_item["II","4A"][0]
    assert by_item["III","14"][0] == "2106 90 20"
    assert "2202 91 00" in by_item["III","2"][0]
    assert "retreaded tractor tyres" in by_item["II","138"][1]
    assert by_item["EXEMPT","87A"][0] == "1211 90 13"
    assert "All dutiable articles intended for personal use" in by_item["II","640"][1]

    lines = []
    for (schedule, serial), (scope, description, page) in by_item.items():
        exempt = schedule == "EXEMPT"
        notification = "10/2025" if exempt else "09/2025"
        reference = f"India IGST Notification {notification} Schedule {schedule} S.No. {serial}, consolidated PDF p. {page}"
        condition = (
            f"Subject to the import treatment and the statutory product description. "
            f"Schedule code scope {scope}. {description}"
        )
        if len(condition)>3000:
            print(f"Skipped long conditional entry {schedule} {serial}")
            continue
        source = SOURCES[f"in-igst-{'10' if exempt else '09'}2025.pdf"] + f"#page={page}"
        for code in covered_codes(scope):
            rate = {"charge":"import_gst", "treatment":"other", "label":"India IGST exemption" if exempt else "India IGST",
                    "expression":SCHEDULE_RATES[schedule], "from":"2026-11-01", "condition":condition}
            if len(code) >= 4:
                rate["sourceCode"] = code
            row = {"code":code,"reference":reference,"url":source,"rates":[rate]}
            if len(code)<8:
                row["matchPrefix"] = True
            lines.append(row)
    lines.sort(key=lambda row: row["code"])
    pack = {"id":ID,"lines":lines}
    out.mkdir(parents=True,exist_ok=True)
    target = out / f"{ID}.json.gz"
    target.write_bytes(gzip.compress(json.dumps(pack,ensure_ascii=False,separators=(",",":")).encode(), mtime=0))
    metadata = {
        "id":ID,"file":target.name,"sha256":sha256(target.read_bytes()).hexdigest(),
        "jurisdiction":"IN","countries":["IN"],"zone":"standard","role":"measures",
        "edition":"Notifications 09/2025 and 10/2025, consolidated 2026-11-01",
        "hsEdition":"HS2022","availableFrom":"2026-11-01","availableThrough":"2026-11-11","checkedOn":"2026-11-11",
        "scope":"published_baseline","authority":"India Ministry of Finance, Department of Revenue",
        "sourceUrl":"https://gst.karnataka.gov.in/Igstaxrate.aspx?lang=EN",
        "terms":"Official Gazette notifications, statutory excerpts. India Copyright Act 1957 s.52(1)(q)(i). Consolidation attributed to ICAI.",
        "termsUrl":"https://www.indiacode.nic.in/bitstream/123456789/1367/5/a1957-14.pdf",
        "inputFiles":[{"name":name,"url":url,"sha256":sha256((raw/name).read_bytes()).hexdigest()} for name,url in SOURCES.items()],
        "limitations":[
            "Reference only. The Gazette controls and the IGST import charging provision is Customs Tariff Act 1975 s.3(7).",
            "The schedules apply by both code and statutory product description, packaging, use, value and other qualifiers. Multiple conditional candidates may apply to a code.",
            "Sources include the ICAI consolidated statutory tables and Government of Karnataka copies of central amendments. No catch-all Any Chapter rows, uncoded exemptions, unresolved code expressions or long conditions are imputed.",
            "The effective window uses the most recent incorporated amendments 02/2026 and 03/2026, effective 1 November 2026.",
            "Separate duties, customs exemptions, compensation cess and other notifications require independent review.",
        ],
        "statistics":{"lines":len(lines),"uniqueCodes":len({r["code"] for r in lines}),
                      "codesWithRates":len({r["code"] for r in lines}),"rates":len(lines),
                      "chapters":sorted({r["code"][:2] for r in lines}),"charges":["import_gst"]},
    }
    (out/f"{ID}.snapshot.json").write_text(json.dumps(metadata,indent=2,ensure_ascii=False)+"\n")
    print(json.dumps(metadata["statistics"]))

if __name__ == "__main__":
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("raw",type=Path)
    parser.add_argument("output",type=Path)
    args=parser.parse_args()
    build(args.raw,args.output)
