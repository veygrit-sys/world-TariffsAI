"""Create a one-day, review-only duty snapshot from official Israeli Customs Book CSVs."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
from collections import Counter
from datetime import date
from decimal import Decimal
from pathlib import Path


_DATASET_ID = "3de0e7f0-03e1-4665-b078-da6e87543ed7"
_HEBREW_RESOURCE = "5536eaa1-2e51-406b-aff6-b9ca02801b7c"
_ENGLISH_RESOURCE = "c96d99fe-fd3a-4e86-a767-4119dd8b723e"
_CODE = re.compile(r"([0-9]{10})/([0-9])")
_HEBREW_PERCENT = re.compile(r"שיעור ([0-9]+(?:\.[0-9]+)?)%")
_ENGLISH_PERCENT = re.compile(r"([0-9]+(?:\.[0-9]+)?)%")
_ID_FIELDS = (
    "CustomsBookTypeID",
    "CustomsItem_2_Digits",
    "CustomsItem_4_Digits",
    "CustomsItem_6_Digits",
    "CustomsItemCategoryID",
    "CustomsItemEndDate",
    "CustomsTariffEndDate",
    "PercentageCapAdditionTariff",
)
_REQUIRED_FIELDS = {"CustomsItemFullClassification", "CustomsTariff", *_ID_FIELDS}


def original_url(resource_id: str) -> str:
    return f"https://data.gov.il/dataset/{_DATASET_ID}/resource/{resource_id}/download/{resource_id}.csv"


def read_customs_book(path: Path) -> dict[str, tuple[int, dict[str, str]]]:
    with path.open(encoding="utf-8-sig", newline="") as file:
        reader = csv.DictReader(file)
        if not _REQUIRED_FIELDS <= set(reader.fieldnames or []):
            raise ValueError(f"Missing required Customs Book columns in {path}")
        records = {}
        for record_number, record in enumerate(reader, start=2):
            if None in record or any(value is None for value in record.values()):
                raise ValueError(f"Inconsistent CSV record {record_number} in {path}")
            code = record["CustomsItemFullClassification"].strip()
            if not code or code in records or record["CustomsBookTypeID"] != "1":
                raise ValueError(f"Unexpected classification in CSV record {record_number} of {path}")
            records[code] = (record_number, record)
    if not records:
        raise ValueError(f"Empty Customs Book CSV {path}")
    return records


def check_digit_matches(full_code: str) -> bool:
    total = 0
    for index, character in enumerate(reversed(full_code)):
        digit = int(character)
        contribution = digit * 2 if index % 2 else digit
        total += contribution - 9 if contribution > 9 else contribution
    return total % 10 == 0


def percent(cell: str, pattern: re.Pattern[str], exemption: str) -> Decimal | None:
    cell = cell.strip()
    if cell == exemption:
        return Decimal(0)
    match = pattern.fullmatch(cell)
    return Decimal(match[1]) if match else None


def normalize(hebrew_path: Path, english_path: Path, observation_day: date):
    hebrew = read_customs_book(hebrew_path)
    english = read_customs_book(english_path)
    if hebrew.keys() != english.keys():
        raise ValueError("Hebrew and English Customs Book classifications differ")
    lines = []
    counts = Counter()
    rates = Counter()
    observed_codes = set()
    for full_code, (hebrew_record_number, hebrew_record) in hebrew.items():
        english_record_number, english_record = english[full_code]
        if any(hebrew_record[field] != english_record[field] for field in _ID_FIELDS):
            raise ValueError(f"Hebrew and English Customs Book metadata differs for {full_code}")
        match = _CODE.fullmatch(full_code)
        if not match:
            counts["withoutTenDigitCheckSuffixedCode"] += 1
            continue
        code, check_digit = match.groups()
        if not check_digit_matches(code + check_digit):
            raise ValueError(f"Invalid check digit for {full_code}")
        if hebrew_record["CustomsItemCategoryID"] != "1" or not 1 <= int(code[:2]) <= 97:
            counts["outsideStandardSchedule"] += 1
            continue
        if any(
            hebrew_record[f"CustomsItem_{size}_Digits"] != code[:size]
            for size in (2, 4, 6)
        ):
            raise ValueError(f"Classification hierarchy differs for {full_code}")
        if any(
            value and date.fromisoformat(value) <= observation_day
            for value in (hebrew_record["CustomsItemEndDate"], hebrew_record["CustomsTariffEndDate"])
        ):
            counts["endsOnOrBeforeObservation"] += 1
            continue
        if hebrew_record["PercentageCapAdditionTariff"].strip():
            counts["withPercentageCapField"] += 1
            continue
        observed_percent = percent(hebrew_record["CustomsTariff"], _HEBREW_PERCENT, "פטור")
        if observed_percent is None:
            counts["missingOrComplexHebrewRate"] += 1
            continue
        if english_record["CustomsTariff"].strip() and observed_percent != percent(
            english_record["CustomsTariff"], _ENGLISH_PERCENT, "Tax Free"
        ):
            counts["uncorroboratedPopulatedEnglishRate"] += 1
            continue
        if code in observed_codes:
            raise ValueError(f"Ambiguous ten-digit tariff code {code}")
        observed_codes.add(code)
        normalized_percent = format(observed_percent.normalize(), "f")
        rates[normalized_percent] += 1
        lines.append({
            "code": code,
            "reference": (
                f"Hebrew CSV record {hebrew_record_number}, English CSV record {english_record_number}"
                f" (header counted as record 1), tariff item {full_code}"
            ),
            "rates": [{
                "charge": "customs_duty",
                "treatment": "general",
                "label": "Observed general customs duty",
                "expression": f"{normalized_percent}%",
                "sourceCode": code + check_digit,
            }],
        })
    if not lines or sum(counts.values()) + len(lines) != len(hebrew):
        raise ValueError("Incomplete Customs Book reconciliation")
    return sorted(lines, key=lambda line: line["code"]), {
        "sourceRecords": len(hebrew),
        "classificationAndMetadataMatches": len(english),
        "hebrewPublishedCustomsDutyCells": sum(bool(record["CustomsTariff"].strip()) for _, record in hebrew.values()),
        "englishPublishedCustomsDutyCells": sum(bool(record["CustomsTariff"].strip()) for _, record in english.values()),
        "includedLines": len(lines),
        "explicitDutyFreeLines": rates["0"],
        "nonZeroAdValoremLines": len(lines) - rates["0"],
        "omittedByReason": dict(sorted(counts.items())),
    }


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("hebrew", type=Path)
    parser.add_argument("english", type=Path)
    parser.add_argument("observation_day", type=date.fromisoformat, help="Date of observation in Asia/Tokyo")
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    lines, counts = normalize(args.hebrew, args.english, args.observation_day)
    day = args.observation_day.isoformat()
    source = {
        "id": f"il-customs-book-general-duty-observed-{day}",
        "jurisdiction": "IL",
        "countries": ["IL"],
        "zone": "standard",
        "edition": f"Israel Customs Book HE and EN open data observed {day} JST",
        "hsEdition": "Israel Customs Book HS",
        "availableFrom": day,
        "availableThrough": day,
        "checkedOn": day,
        "scope": "compiled_reference",
        "authority": "Israel Tax Authority",
        "sourceUrl": f"https://data.gov.il/he/datasets/taxes-authority/customsbook/{_HEBREW_RESOURCE}",
        "terms": "Israel Tax Authority via data.gov.il Government Data Repository License. Transformed numerical duty observations and row locators only.",
        "termsUrl": "https://data.gov.il/he/terms-of-use",
        "inputFiles": [
            {"name": f"Israel Customs Book {lang}", "url": original_url(resource), "sha256": sha256(path)}
            for lang, resource, path in (
                ("Hebrew CSV", _HEBREW_RESOURCE, args.hebrew),
                ("English CSV", _ENGLISH_RESOURCE, args.english),
            )
        ],
        "limitations": [
            "Observation only. The downloads contain end dates but do not publish start dates. The snapshot date records capture in Asia/Tokyo and establishes no legal effective period.",
            "Only explicit Hebrew duty-free or single-percentage general customs duty cells for exact standard ten-digit codes are included. Populated English cells must corroborate the amount. Blank English cells are permitted.",
            "Excludes purchase tax, VAT, preferential duties, quotas, specific and complex expressions, and records with an additional-percentage-cap field. Independently verify the applicable law, origin and conditions.",
        ],
    }
    args.output.mkdir(parents=True, exist_ok=False)
    for name, document in (("source.json", source), ("lines.json", lines), ("normalization-qa.json", counts)):
        (args.output / name).write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(counts))


if __name__ == "__main__":
    main()
