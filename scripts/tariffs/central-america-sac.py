#!/usr/bin/env python3
"""Normalize SIECA's 2025 SAC Annex I with Parts II and III country overrides."""

import argparse
import gzip
from hashlib import sha256
import json
from pathlib import Path
import re
import subprocess

DOCUMENT = "https://www.sieca.int/recursos/arancel-centroamericano-importacion/"
PDF = DOCUMENT + "?wpdmdl=47049&ind=1757371835197&refresh=1922bf97&filename=SACVIIENM-WORD-VERSION6-AGOSTO25-COMPRIMIDO.pdf"
ROW = re.compile(r"^\s*(\d{4}\.\d{2}\.\d{2}\.\d{2})\s+(.*)$")
NUMBER = re.compile(r"[0-9]+(?:\.[0-9]+)?")
PART_I_RATE = re.compile(r"(?:[0-9]+|II)\s*\*?")
FOOTNOTES = {
    ("GT", "151"): ("15", "1", "Published out-of-quota reference for yellow maize. The scheduled within-quota reference is 0%."),
    ("GT", "201"): ("20", "1", "Published out-of-quota reference for white maize. The scheduled within-quota reference is 0%."),
    ("GT", "23.71"): ("23.7", "1", "Published out-of-quota reference for rice. The scheduled within-quota reference is 0%."),
    ("GT", "101"): ("10", "1", "The table marks this line with note 1. Check Guatemala's applicable national quota provisions."),
    ("HN", "152"): ("15", "2", "Honduras price-band treatment may affect the actual duty."),
    ("NI", "153"): ("15", "3", "Nicaragua applies a tariff quota. Check the current quota and the applicable rate."),
    ("NI", "453"): ("45", "3", "Nicaragua applies a tariff quota. Check the current quota and the applicable rate."),
}
COUNTRIES = ("GT", "SV", "HN", "NI", "CR")
COPYRIGHT = {
    "GT": "https://www.wipo.int/wipolex/en/text/127668",
    "CR": "https://sice.oas.org/int_prop/nat_leg/Costa/l6683b.asp",
}


def source_cells(pages, begin, end, part):
    data = {}
    for page_index in range(begin, end):
        for row in pages[page_index].splitlines():
            match = ROW.match(row)
            if not match:
                continue
            code, rest = match.groups()
            cells = re.split(r" {2,}", rest.strip())
            if part == "II":
                assert len(cells) == 6, (page_index + 1, row)
                values = cells[1:]
            elif len(cells) < 2:
                continue
            else:
                value = cells[-1]
                valid = PART_I_RATE if part == "I" else NUMBER
                if not valid.fullmatch(value):
                    continue
                values = [value]
            assert code not in data, (part, code)
            data[code] = (page_index + 1, values)
    return data


def selected_rate(country, value, part):
    treatment = "general"
    condition = None
    footnote = FOOTNOTES.get((country, value)) if part == "II" else None
    if footnote:
        value, note, condition = footnote
        if note in {"1", "3"}:
            treatment = "quota"
    value = value.rstrip("*").strip()
    alternatives = value.split("/")
    assert all(NUMBER.fullmatch(item) for item in alternatives), (country, value)
    if len(alternatives) > 1:
        condition = "The national column lists alternative rates. Verify the applicable conditions in the cited schedule and national rules."
    rate = {
        "charge": "customs_duty",
        "treatment": treatment,
        "label": "SIECA SAC DAI, Part " + part,
        "expression": " / ".join(f"{item}%" for item in alternatives),
    }
    if condition:
        rate["condition"] = condition
    return rate


def build(raw_pdf, out):
    text = subprocess.check_output(["pdftotext", "-layout", raw_pdf, "-"], text=True)
    assert "Versión 6" in text and "AGOSTO 2025" in text
    pages = text.split("\f")
    part_ii = next(i for i, page in enumerate(pages) if re.search(r"^ +PARTE II$", page, re.M))
    part_iii = next(i for i, page in enumerate(pages) if re.search(r"^ +NICARAGUA PARTE III$", page, re.M))
    panama = next(i for i, page in enumerate(pages) if re.search(r"^ +Panamá$", page, re.M))
    common = source_cells(pages, 0, part_ii, "I")
    exceptions = source_cells(pages, part_ii, part_iii, "II")
    nicaragua = source_cells(pages, part_iii, panama, "III")
    assert (len(common), len(exceptions), len(nicaragua)) == (7539, 516, 189)
    assert {code for code, (_, cells) in common.items() if cells[0].startswith("II")} - exceptions.keys() == {
        "8703.21.99.10", "8703.24.91.10",
    }
    assert {code for code, (_, cells) in exceptions.items() if cells[3] == "III"} <= nicaragua.keys()

    out.mkdir(parents=True, exist_ok=True)
    source_hash = sha256(raw_pdf.read_bytes()).hexdigest()
    snapshots = []
    for position, country in enumerate(COUNTRIES):
        lines = []
        for code, (page, cells) in sorted(common.items()):
            part = "I"
            value = cells[0]
            if code in exceptions:
                page, cells = exceptions[code]
                value = cells[position]
                part = "II"
            if country == "NI" and code in nicaragua:
                page, cells = nicaragua[code]
                value = cells[0]
                part = "III"
            rate_known = not value.startswith("II")
            assert rate_known or code in {"8703.21.99.10", "8703.24.91.10"}
            line = {
                "code": code.replace(".", ""),
                "reference": f"SIECA ACI v6, Part {part}, PDF page {page}",
                "rates": [selected_rate(country, value, part)] if rate_known else [],
                "url": PDF,
            }
            if not rate_known:
                line["notes"] = ["Part I refers to Part II. This edition supplies no rate in the selected country column."]
            lines.append(line)
        populated = sum(bool(row["rates"]) for row in lines)
        assert populated == (7539 if country == "NI" else 7537), country
        assert len({row["code"] for row in lines}) == len(lines)
        id = f"{country.lower()}-sieca-sac-v6"
        pack = out / f"{id}.json.gz"
        payload = json.dumps({"id": id, "lines": lines}, ensure_ascii=False, separators=(",", ":")).encode()
        pack.write_bytes(gzip.compress(payload, compresslevel=9, mtime=0))
        snapshot = {
            "id": id,
            "jurisdiction": country,
            "countries": [country],
            "zone": "standard",
            "edition": "SIECA Arancel Centroamericano de Importación, SAC VII Enmienda, version 6 (August 2025)",
            "hsEdition": "HS2022",
            "availableFrom": "2025-09-08",
            "availableThrough": "2026-11-11",
            "checkedOn": "2026-11-11",
            "scope": "published_baseline",
            "authority": "Secretaría de Integración Económica Centroamericana and COMIECO",
            "sourceUrl": DOCUMENT,
            "terms": "Numeric code and rate facts extracted from the official COMIECO legislative annex. Official publication and source locations cited.",
            "termsUrl": COPYRIGHT.get(country, DOCUMENT),
            "inputFiles": [{"name": raw_pdf.name, "url": PDF, "sha256": source_hash}],
            "limitations": [
                "Latest regional SIECA edition located for the reference date. Coverage reflects the published regional baseline and national columns in Parts II and III.",
                "Check national changes, quota availability, temporary duty relief, sector-specific measures, and origin preferences for the shipment.",
                "SIECA Part II has no printed rate for two tariff codes in Guatemala, El Salvador, Honduras and Costa Rica. Those entries report no rate.",
            ],
            "file": pack.name,
            "sha256": sha256(pack.read_bytes()).hexdigest(),
            "statistics": {
                "lines": len(lines), "uniqueCodes": len(lines), "codesWithRates": populated,
                "rates": populated, "chapters": sorted({row["code"][:2] for row in lines}),
            },
        }
        snapshots.append(snapshot)
        print(country, len(lines), populated)
    (out / "manifest.json").write_text(json.dumps({"version": 1, "snapshots": snapshots}, ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pdf", type=Path)
    parser.add_argument("out", type=Path)
    args = parser.parse_args()
    build(args.pdf, args.out)
