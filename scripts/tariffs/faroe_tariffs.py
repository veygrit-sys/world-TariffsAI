#!/usr/bin/env python3
"""Build Faroese customs and import tax data from official TAKS section reports."""
import argparse
import json
from pathlib import Path
import re

import fitz

from rebuild import CHECKED, digest, line, rate, schedule, write_pack

SECTIONS = "I II III IV V VI VII VIII IX X XI XII XIII XIV XV XVI XVII XVIII XIX XX XXI".split()
SOURCE_URL = "https://voruskra.taks.fo/en/Sections"
REPORT_URL = "https://voruskra.taks.fo/PDFReports/Show?sectionNr="
TARIFF_LAW = "https://www.logir.fo/Logtingslog/219-fra-22-12-2025-um-broyting-i-logtingslog-um-toll"
REPORT_DATE = "-".join(reversed(CHECKED.split("-")))
TARIFF_CODE = re.compile(r"[0-9]{4}\.[0-9]{2}\.[0-9]{2}")
PERCENT = re.compile(r"[0-9]+(?:[.,][0-9]+)?%")
SEPARATOR = " | "


def read_rates(path):
    with fitz.open(path) as pdf:
        for page in pdf:
            words = page.get_text("words")
            if REPORT_DATE not in {word[4].replace("\xad", "-") for word in words}:
                raise ValueError(f"{path.name} page {page.number + 1} has a different publication date.")
            for x0, y0, _, _, source_code, *_ in words:
                if x0 >= 45 or not TARIFF_CODE.fullmatch(source_code):
                    continue
                columns = [[], [], [], []]
                for left, baseline, _, _, value, *_ in words:
                    if abs(baseline - y0) >= 3:
                        continue
                    if 345 <= left < 386:
                        columns[0].append((left, value))
                    elif 386 <= left < 420:
                        columns[1].append((left, value))
                    elif 420 <= left < 467:
                        columns[2].append((left, value))
                    elif 535 <= left:
                        columns[3].append((left, value))
                duty, excise_percent, excise_amount, vat = [
                    " ".join(value for _, value in sorted(column)) for column in columns
                ]
                for amount in (duty, excise_percent, vat):
                    if amount and not PERCENT.fullmatch(amount):
                        raise ValueError(f"{path.name} page {page.number + 1} {source_code}: {columns}")
                if not duty and not vat:
                    raise ValueError(f"{path.name} page {page.number + 1} {source_code} has no tax data.")
                yield source_code.replace(".", ""), (duty, excise_percent, excise_amount, vat)


def packs(source, out):
    records = {}
    inputs = []
    for section in SECTIONS:
        path = source / f"{section}.pdf"
        inputs.append({"name": path.name, "url": REPORT_URL + section, "sha256": digest(path)})
        for code, fields in read_rates(path):
            if code in records and records[code] != fields:
                raise ValueError(f"Conflicting Faroese rates for {code}")
            records[code] = fields
    if len(records) < 8500 or not any(fields[0] == "0%" for fields in records.values()):
        raise ValueError("Faroese section reports are incomplete or lack explicit zero duty.")

    base = []
    measures = []
    for code, (duty, excise_percent, excise_amount, vat) in records.items():
        reference = f"Faroese Customs Tariff, {code[:4]}.{code[4:6]}.{code[6:]}"
        base_rates = [rate("general", "Faroese customs duty (Gatt)", duty)] if duty else []
        base.append(line(code, reference, base_rates))
        taxes = []
        if vat:
            taxes.append({**rate("general", "Faroese import VAT (Mvg)", vat), "charge": "import_vat"})
        excise = SEPARATOR.join(value for value in (excise_percent, excise_amount) if value)
        if excise:
            taxes.append({
                **rate("general", "Faroese excise duty (Punktgjald)", excise),
                "charge": "excise",
                "condition": "Consult applicable excise legislation for the amount basis and relationship between published percentage and amount columns.",
            })
        if taxes:
            measures.append(line(code, reference, taxes))

    limitations = [
        "Contains published numerical tariff entries as printed by TAKS on 2026-11-11.",
        "Faroese tariff codes are eight digits. Verify headings, classification notes and any origin relief in the tariff and applicable law.",
        "VAT and excise references do not resolve import tax bases, exemptions or additional measures.",
    ]
    base_metadata = schedule(
        "fo-taks-customs-tariff-2026-11-11", "FO", ["FO"], "TAKS Faroese tariff reports, 2026-11-11",
        CHECKED, "national_schedule", "TAKS, Faroe Islands", SOURCE_URL,
        "Derived factual tariff codes and published rates from official statutory tariff reports.",
        TARIFF_LAW, inputs, limitations,
    )
    base_metadata["hsEdition"] = "Faroese 8-digit"
    measure_metadata = {
        **base_metadata,
        "id": "fo-taks-import-taxes-2026-11-11",
        "edition": "TAKS Faroese import VAT and excise reports, 2026-11-11",
        "role": "measures",
    }
    out.mkdir(parents=True, exist_ok=True)
    return [write_pack(out, base_metadata, base), write_pack(out, measure_metadata, measures)]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-dir", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    snapshots = packs(args.input_dir, args.out)
    (args.out / "manifest.json").write_text(
        json.dumps({"version": 1, "snapshots": snapshots}, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
