#!/usr/bin/env python3
"""Build an observation-only Mozambique customs tariff reference from the checked originals."""

import argparse
from collections import Counter
from datetime import date
from hashlib import sha256
import json
from pathlib import Path
import re

from openpyxl import load_workbook

WORKBOOK_URL = (
    "https://www.at.gov.mz/api/webdav?path=%2FSERVI%C3%87OS%20ADUANEIROS"
    "%2FPAUTA%20ADUANEIRA%2FPAUTA%20ADUANEIRA%202026.xlsx"
)
WORKBOOK_SHA256 = "5abc2f58d8277281e4c2e3deb35679d4791f2a93fb660f78ce07d38882b78336"
GAZETTE_URL = "https://e-viajante.at.gov.mz/legislacao/lei_8_2025.pdf"
GAZETTE_SHA256 = "8c6a4b68cd5b4a8d17a9ec1c81c3623ddbdf855d41bdcd5fa466f053f542184d"
SOURCE_PAGE = "https://www.at.gov.mz/servicos/pauta-aduaneira"
OBSERVED_DATE = date(2026, 11, 13)
EXCLUDED_HEADINGS = frozenset(
    "3506 3810 3920 7007 7408 7604 7612 8451 8461 8479 8486 8536 8541 8702 8703 8704 8716 9031 9507".split()
)
EXPECTED_RATES = frozenset({0, 2.5, 5, 7.5, 20})
EXPECTED_ROWS = 5822
SHEET = "Export Worksheet"


def checked_input(path: Path, expected: str, url: str) -> dict:
    digest = sha256(path.read_bytes()).hexdigest()
    if digest != expected:
        raise ValueError(f"{path.name}: original digest changed. Review the source and update the normalizer.")
    return {"name": path.name, "url": url, "sha256": digest}


def normalized_rows(workbook: Path) -> tuple[list[dict], dict]:
    book = load_workbook(workbook, read_only=True, data_only=True)
    try:
        sheet = book[SHEET]
        rows = sheet.iter_rows(values_only=True)
        next(rows)
        header = next(rows)
        if header[4] != "PPAUTAL" or header[7] != "DIREITOS_GERAL":
            raise ValueError("Tariff workbook columns changed.")
        lines = []
        held = Counter()
        rates = Counter()
        codes = set()
        for row_number, row in enumerate(rows, start=3):
            code = row[4]
            value = row[7]
            if (
                not isinstance(code, str)
                or re.fullmatch(r"[0-9]{8}", code) is None
                or code in codes
                or row[0] != code[:2]
                or row[2] != code[:4]
                or type(value) not in (int, float)
                or value not in EXPECTED_RATES
            ):
                raise ValueError(f"Invalid or ambiguous worksheet row {row_number}.")
            codes.add(code)
            if code[:4] in EXCLUDED_HEADINGS or code[:2] in ("98", "99"):
                held[code[:4]] += 1
                continue
            expression = f"{value:g}%"
            rates[expression] += 1
            lines.append({
                "code": code,
                "reference": f"{SHEET}!H{row_number}",
                "rates": [{
                    "charge": "customs_duty",
                    "treatment": "general",
                    "label": "Published general duty",
                    "expression": expression,
                    "sourceCode": code,
                }],
            })
        if len(codes) != EXPECTED_ROWS or set(held) != EXCLUDED_HEADINGS:
            raise ValueError("The observed tariff codes do not match this reviewed workbook edition.")
        qa = {
            "officialWorkbookRows": len(codes),
            "includedGeneralDutyRows": len(lines),
            "withheldRows": sum(held.values()),
            "withheldHeadings": dict(sorted(held.items())),
            "rateDistribution": dict(sorted(rates.items())),
            "workbookMetadataCreated": book.properties.created.isoformat(),
        }
        return lines, qa
    finally:
        book.close()


def write_json(path: Path, data: object) -> None:
    with path.open("x", encoding="utf-8") as stream:
        json.dump(data, stream, ensure_ascii=False, indent=2)
        stream.write("\n")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("workbook", type=Path)
    parser.add_argument("gazette", type=Path)
    parser.add_argument("output", type=Path)
    arguments = parser.parse_args()
    inputs = [
        checked_input(arguments.workbook, WORKBOOK_SHA256, WORKBOOK_URL),
        checked_input(arguments.gazette, GAZETTE_SHA256, GAZETTE_URL),
    ]
    lines, qa = normalized_rows(arguments.workbook)
    day = OBSERVED_DATE.isoformat()
    source = {
        "id": f"mz-at-pauta-general-observed-{day}",
        "jurisdiction": "MZ",
        "countries": ["MZ"],
        "zone": "standard",
        "edition": "Pauta Aduaneira 2026 workbook, limited review reference",
        "hsEdition": "HS2022",
        "availableFrom": day,
        "availableThrough": day,
        "checkedOn": day,
        "scope": "compiled_reference",
        "authority": "Autoridade Tributária de Moçambique",
        "sourceUrl": SOURCE_PAGE,
        "terms": "Numerical tariff facts and code references only. Law 9/2022, Article 7 excludes simple facts and official texts from copyright protection.",
        "termsUrl": "https://ts.gov.mz/wp-content/uploads/2023/09/Lei-no-9-2022-de-22-de-Junho-Lei-dos-Direitos-do-Autor-e-Direitos-Conexos-e-revoga-a-Lei-no.-4-2001-de-27-de-Fevereiro.pdf",
        "inputFiles": inputs,
        "limitations": [
            "The date is the observation day. The source does not establish a verified legal applicability period.",
            "The authority hosts this workbook as its current schedule, but workbook metadata predates the 2025 amending law and unsplit codes remain.",
            "All 19 headings affected by Law 8/2025 Article 2 are withheld. The law applies from 2026-01-01 under Article 4.",
            "Only the DIREITOS_GERAL column for exact eight-digit rows was extracted. Preferential rates, exemptions conditioned on the importer or goods, VAT, excise, surtaxes, fees and permits require separate review.",
            "Compiled review reference. No approved automatic duty calculation or checkout total.",
        ],
    }
    qa.update({
        "observedDate": day,
        "legalAmendmentEffectiveDate": "2026-01-01",
        "legalAmendmentScope": "Law 8/2025 Articles 2 and 4, published 2025-12-29 in Boletim da República I Série 248, supplement 1.",
        "workbookVersionCaveat": "Workbook metadata predates the law. Published general duty is an observation rather than verified current legal applicability.",
        "status": "awaiting_approval",
        "originals": inputs,
    })
    arguments.output.mkdir(parents=True, exist_ok=False)
    write_json(arguments.output / "source.json", source)
    write_json(arguments.output / "lines.json", lines)
    write_json(arguments.output / "qa.json", qa)


if __name__ == "__main__":
    main()
