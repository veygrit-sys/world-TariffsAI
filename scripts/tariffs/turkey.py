#!/usr/bin/env python3
"""Normalize Türkiye's official 2026 import duty and additional customs duty annexes."""
from argparse import ArgumentParser
from decimal import Decimal
from io import BytesIO
import json
from pathlib import Path
import re
from zipfile import ZipFile

from openpyxl import load_workbook
from rebuild import clean, digest, line, rate, schedule, write_pack

CHECKED = "2026-11-11"
AUTHORITY = "Republic of Türkiye Ministry of Trade"
INDEX = "https://ticaret.gov.tr/ithalat/ithalat-mevzuati/ithalat-rejimi-karari-igv-karari-ve-ithalat-tebligleri/"
BASE_URL = INDEX + "1-ithalat-rejimi-kararikarar-sayisi3350karar-metni-ve-tablolar-konsolide-edilmis-olup-gunceldir"
ADDITIONAL_URL = INDEX + "2-ithalatta-ilave-gumruk-vergisi-uygulanmasina-iliskin-karar-karar-sayisi-3351-karar-metni-ve-tablolar-konsolide-edilmis-olup-gunceldir"
BASE_ZIP = "https://ticaret.gov.tr/data/68d2951f13b876c2509a480b/rejim%202026%20%2827-08-2026%29.zip"
ADDITIONAL_ZIP = "https://ticaret.gov.tr/data/63bd486013b8763b44f9da6c/%C4%B0GV.zip"
TERMS_URL = "https://www.wipo.int/wipolex/en/legislation/details/22507"
TERMS = "Published statutory tariff facts. Türkiye Law 5846 art. 31 permits reuse of officially published legislation."
BASE_CONDITION = "Other Countries column. Verify applicable origin, preferential status, section notes and published derogations."
ADDITIONAL_CONDITION = "Other Countries column. Check Article 2 for A.TR, eligible origin and cumulation, applicable tariff ceiling, and product-specific exemptions."

def code(value):
    if isinstance(value, int) and 10**10 <= value < 10**12:
        return f"{value:012d}"
    text = re.sub(r"[.\s]", "", str(value))
    return text if re.fullmatch(r"[0-9]{12}", text) else None

def expression(value):
    if isinstance(value, (float, int)):
        return f"{Decimal(str(value)).normalize():f}%", ""
    raw = clean(value)
    if not raw:
        raise ValueError("Missing rate expression")
    m = re.fullmatch(r"([0-9]+(?:[.,][0-9]+)?)\s*((?:\([0-9]+\)\s*)+)", raw)
    if m:
        return m[1].replace(",", ".") + "%", m[2].strip()
    if re.fullmatch(r"[0-9]+(?:[.,][0-9]+)?%?", raw):
        return raw.replace(",", ".").rstrip("%") + "%", ""
    return raw, ""

def input_file(path, url):
    return {"name": path.name, "url": url, "sha256": digest(path)}

def base(raw):
    path = raw / "tr-tables.zip"
    rows = {}
    with ZipFile(path) as archive:
        for filename in archive.namelist():
            list_no = filename.split()[0].upper()
            if list_no not in {"I", "II", "III", "IV"} or not filename.endswith(".xlsx"):
                continue
            general_column = {"I": 13, "II": 10 if "04-24" in filename else 8, "III": 13, "IV": 12}[list_no]
            with BytesIO(archive.read(filename)) as source:
                wb = load_workbook(source, read_only=True, data_only=True)
                for sheet in wb:
                    assert any(
                        clean(row[general_column]).replace(".", "") in {"DÜ", "7"}
                        for row in sheet.iter_rows(max_row=6, max_col=general_column+1, values_only=True)
                    ) or sheet.title == "Module1", (filename, sheet.title)
                    for number, row in enumerate(sheet.iter_rows(max_col=general_column + 1, values_only=True), 1):
                        tariff_code = code(row[0])
                        if not tariff_code:
                            continue
                        duty, rate_note = expression(row[general_column])
                        note = ", ".join(filter(None, [clean(row[1]), rate_note]))
                        assert tariff_code not in rows, tariff_code
                        rows[tariff_code] = line(tariff_code, f"Türkiye Decision 3350 List {list_no}, {sheet.title}, row {number}", [
                            rate("general", "Other Countries (DÜ) base customs duty", duty,
                                 condition=BASE_CONDITION + (f" Source footnote identifiers: {note}." if note else "")),
                        ], url=BASE_URL)
                wb.close()
    assert len(rows) == 15749 and len({x[:2] for x in rows}) == 96
    assert rows["010121000000"]["rates"][0]["expression"] == "0%"
    metadata = schedule("tr-mot-decision-3350-2026", "TR", ["TR"], "2026 Ministry of Trade consolidated Lists I–IV", CHECKED,
                        "national_schedule", AUTHORITY, BASE_URL, TERMS, TERMS_URL, [input_file(path, BASE_ZIP)],
                        ["Selected statutory base duty column (DÜ / Other Countries). The source also lists preferential origin groups.",
                         "Temporary suspensions, agricultural components, other financial liabilities, trade remedies and tax rates require separate checks.",
                         "The source has 12-digit GTİP codes and inline footnotes. This snapshot represents the observation date."])
    return metadata, list(rows.values())

def additional(raw):
    path = raw / "tr-extra.zip"
    rows = {}
    with ZipFile(path) as archive:
        for filename in archive.namelist():
            if not filename.endswith(".xlsx"):
                continue
            with BytesIO(archive.read(filename)) as source:
                wb = load_workbook(source, read_only=True, data_only=True)
                for sheet in wb:
                    configs = {"EK-1": (1, 8), "Nihai İGV Ek 2": (2, 10), "Nihai İGV Ek 3": (3, 13)}
                    if sheet.title not in configs:
                        assert sheet.title.startswith("Çalışma")
                        continue
                    annex, general_column = configs[sheet.title]
                    assert any(
                        clean(row[general_column]).replace(".", "") in {"DÜ", "7"}
                        for row in sheet.iter_rows(max_row=6, max_col=general_column+1, values_only=True)
                    ), sheet.title
                    for number, row in enumerate(sheet.iter_rows(max_col=general_column+1, values_only=True), 1):
                        tariff_code = code(row[0])
                        if not tariff_code:
                            continue
                        duty, rate_note = expression(row[general_column])
                        note = ", ".join(filter(None, [clean(row[1]), rate_note]))
                        assert tariff_code not in rows, tariff_code
                        rows[tariff_code] = line(tariff_code, f"Türkiye Decision 3351 Annex {annex}, row {number}", [
                            rate("general", "Other Countries (DÜ) additional customs duty", duty, charge="additional_duty",
                                 condition=ADDITIONAL_CONDITION + (f" Source footnote identifiers: {note}." if note else "")),
                        ], url=ADDITIONAL_URL)
                wb.close()
    assert len(rows) == 4618 and rows["251511000000"]["rates"][0]["expression"] == "25%"
    metadata = schedule("tr-mot-decision-3351-2026", "TR", ["TR"], "2026 Ministry of Trade consolidated Annexes 1–3", CHECKED,
                        "national_schedule", AUTHORITY, ADDITIONAL_URL, TERMS, TERMS_URL, [input_file(path, ADDITIONAL_ZIP)],
                        ["Selected statutory additional duty column (DÜ / Other Countries) only. Verify origin eligibility and whether the charge applies.",
                         "Article 2 includes distinct rules for A.TR, preferential origin and a ceiling on the sum of base and additional duties.",
                         "Footnote identifiers are preserved. Check linked tables for relief, source-specific conditions and other columns."])
    return {**metadata, "role": "measures"}, list(rows.values())

if __name__ == "__main__":
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("raw", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    snapshots = [write_pack(args.output, *fn(args.raw)) for fn in (base, additional)]
    (args.output / "manifest.json").write_text(json.dumps({"version": 1, "snapshots": snapshots}, ensure_ascii=False, indent=2) + "\n")
    print([(entry["id"], entry["statistics"]["lines"]) for entry in snapshots])
