#!/usr/bin/env python3
"""Build Azerbaijan Decision No. 500's consolidated 10-digit import tariff."""
import argparse
from collections import defaultdict
import json
from pathlib import Path
import re

from lxml import html

from rebuild import CHECKED, clean, digest, line, rate, schedule, write_pack

SOURCE_URL = "https://e-qanun.az/framework/37035"
HTML_URL = "https://frameworks.e-qanun.az/37/f_37035.html"
TERMS_URL = "https://frameworks.e-qanun.az/4/f_4167.html"
SOURCE_DIGEST = "ee4c72fdb327a900498d7212e4996da94303bc7a3192919313621d2a41262b82"
CODE = re.compile(r"[0-9]{10}")
PLAIN_PERCENT = re.compile(r"[0-9]+(?:[.,][0-9]+)?")
AMENDMENT_NOTE = re.compile(r"\[\d+\]")
CHAPTERS = {f"{chapter:02}" for chapter in range(1, 98)} - {"77"}


def rows(table):
    return [
        [clean(cell.text_content()) for cell in row.xpath("./td|./th")]
        for row in table.xpath("./tr|./tbody/tr")
    ]


def import_tables(root):
    for table in root.xpath("//table[not(ancestor::table)]"):
        table_rows = rows(table)
        for index, row in enumerate(table_rows):
            if len(row) >= 4 and row[3].startswith("Tarif dərəcəsi ("):
                yield table_rows[index + 1:]
                break


def tariff_lines(source):
    if digest(source) != SOURCE_DIGEST:
        raise ValueError("Azerbaijan consolidated law changed; review the legal text before refreshing.")
    document = html.parse(str(source))
    rows_by_code = defaultdict(list)
    for table_rows in import_tables(document):
        for row in table_rows:
            if len(row) < 4:
                continue
            raw_code, description, unit, expression = [clean(AMENDMENT_NOTE.sub("", value)) for value in row[:4]]
            code = raw_code.replace(" ", "")
            if not CODE.fullmatch(code):
                continue
            if any(row[4:]):
                raise ValueError(f"Unrecognized supplementary column at {code}")
            if PLAIN_PERCENT.fullmatch(expression):
                expression = expression.replace(",", ".") + "%"
            if unit in {"-", "–", "—"}:
                unit = ""
            record = (description, unit, expression)
            if record not in rows_by_code[code]:
                rows_by_code[code].append(record)

    if len(rows_by_code) != 10900 or {code[:2] for code in rows_by_code} != CHAPTERS:
        raise ValueError("Unexpected Azerbaijani tariff code and chapter coverage")
    copper_amendment = rows_by_code["7415330000"][0][2]
    if "31.12.2029" not in copper_amendment or "300 ABŞ dolları" not in copper_amendment:
        raise ValueError("Azerbaijan Decision No. 311 amendment is missing")

    results = []
    for code, records in rows_by_code.items():
        for description, unit, expression in records:
            reference = description or f"Azerbaijan Decision No. 500, tariff line {code}"
            details = {}
            if unit:
                details["units"] = [unit]
            if len(reference) > 400:
                details["notes"] = [reference]
                reference = reference[:397] + "…"
            rates = [rate("general", "Published Azerbaijani customs duty", expression)] if expression else []
            results.append(line(code, reference, rates, **details))
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    lines = tariff_lines(args.input)
    args.out.mkdir(parents=True, exist_ok=True)
    metadata = schedule(
        "az-cabinet-decision-500-2026-11-11", "AZ", ["AZ"],
        "Azerbaijan Cabinet Decision No. 500, consolidated 2026-11-11",
        CHECKED, "national_schedule", "Cabinet of Ministers of the Republic of Azerbaijan, via E-Qanun",
        SOURCE_URL, "Official legal act and tariff tables, Copyright and Related Rights Law Article 7.",
        TERMS_URL, [{"name": "f_37035.html", "url": HTML_URL, "sha256": SOURCE_DIGEST}],
        [
            "Consolidated statutory import tariff lines in chapters 01–97, checked on 2026-11-11.",
            "Mixed, specific, origin-dependent and time-limited rates retain the published expression and require review of the legal conditions.",
            "The source contains duplicate descriptions for some national tariff codes. One published national line has no stated rate.",
            "Special procedures, agreement rates outside the schedule, VAT and excises are not included.",
        ],
    )
    snapshot = write_pack(args.out, metadata, lines)
    (args.out / "manifest.json").write_text(
        json.dumps({"version": 1, "snapshots": [snapshot]}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
