"""Build dated CN-linked member-state VAT candidates from saved TEDB SOAP responses."""
from argparse import ArgumentParser
from collections import defaultdict
from datetime import date
from decimal import Decimal
import gzip
from hashlib import sha256
import json
from pathlib import Path
import re
from xml.etree import ElementTree as ET

from fetch_tedb import ENDPOINT, MEMBERS

DIRECTIVE = "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:02006L0112-20250414"
LANDING = "https://ec.europa.eu/taxation_customs/tedb/index.html"
TERMS = "https://commission.europa.eu/legal-notice_en"
WSDL = f"{ENDPOINT}VatRetrievalService.wsdl"
PUBLISHED_RATES = {
    "REDUCED_RATE", "SUPER_REDUCED_RATE", "PARKING_RATE", "ZERO_RATE", "STANDARD_RATE",
}
# Germany, Poland and Slovakia already have separately maintained statutory imports.
LOCAL_STATUTORY_PACKS = {"DE", "PL", "SK"}


def source_file(path, url):
    return {"name": path.name, "url": url, "sha256": sha256(path.read_bytes()).hexdigest()}


def build_country(path, as_of, country):
    rows = ET.parse(path).getroot().findall(".//{*}vatRateResults")
    if not rows or {r.findtext("{*}memberState") for r in rows} != {country}:
        raise ValueError(f"Invalid TEDB response: {path.name}")

    by_code = defaultdict(dict)
    editions = set()
    for item in rows:
        rate_kind = item.findtext("{*}rate/{*}type")
        raw_rate = item.findtext("{*}rate/{*}value")
        category = item.findtext("{*}category/{*}identifier")
        if rate_kind not in PUBLISHED_RATES or raw_rate is None or not category:
            continue
        numeric = Decimal(raw_rate)
        if not numeric.is_finite() or not 0 <= numeric <= 100:
            raise ValueError(f"Unexpected TEDB rate: {country} {raw_rate}")
        source_day = date.fromisoformat(item.findtext("{*}situationOn")[:10]).isoformat()
        if source_day > as_of:
            raise ValueError(f"TEDB submission postdates requested date: {country}")
        comment = " ".join((item.findtext("{*}comment") or "").split())
        condition = (
            "Apply only when the goods and import meet the national product and transaction conditions. "
            "Check territorial rules, exemptions and derogations under VAT Directive Article 94."
        )
        if comment:
            condition += f" National submission qualifier: {comment}"
        rate = {
            "charge": "import_vat",
            "treatment": "general",
            "label": f"TEDB {category} / {rate_kind}",
            "expression": f"{numeric:f}%",
            "condition": condition,
        }
        for code_row in item.findall("{*}cnCodes/{*}code"):
            code = re.sub(r"\s+", "", code_row.findtext("{*}value") or "")
            if not re.fullmatch(r"(?:[0-9]{2}){1,4}", code):
                raise ValueError(f"Unexpected TEDB CN code: {country} {code!r}")
            editions.add(source_day)
            by_code[code][tuple(rate.items())] = rate

    if not by_code:
        return None
    iso2 = "GR" if country == "EL" else country
    lines = [
        {
            "code": code,
            "matchPrefix": True,
            "reference": f"TEDB member-state VAT submission {country}, CN {code}, queried {as_of}",
            "url": LANDING,
            "rates": list(rates.values()),
        }
        for code, rates in sorted(by_code.items())
    ]
    identifier = f"{iso2.lower()}-tedb-vat-{as_of}"
    metadata = {
        "id": identifier,
        "jurisdiction": iso2,
        "countries": [iso2],
        "zone": "standard",
        "edition": f"TEDB SOAP observation {as_of}, source situation(s) {', '.join(sorted(editions))}",
        "hsEdition": "HS2022",
        "availableFrom": as_of,
        "availableThrough": as_of,
        "checkedOn": as_of,
        "scope": "published_baseline",
        "role": "measures",
        "authority": "European Commission DG TAXUD, national VAT submissions",
        "sourceUrl": LANDING,
        "terms": "European Commission legal notice and Decision 2011/833/EU. Adapted tabular rates, CN identifiers and scope qualifiers from TEDB national submissions. © European Union, 2026.",
        "termsUrl": TERMS,
        "inputFiles": [source_file(path, ENDPOINT), source_file(path.parent / "tedb.wsdl", WSDL)],
        "limitations": [
            "Only expressly published numeric VAT rates linked to CN goods codes are extracted. "
            "The rate applicable to imports generally follows the supply of like goods under Directive 2006/112/EC Article 94.",
            "A code match is a conditional candidate. Interpret exclusions and national product, "
            "transaction and territory qualifications before use. Check import-specific exemptions and derogations.",
            "No CPA services, uncoded standard rates or VAT exemption records are expanded into goods codes.",
            "TEDB dates and comments reflect national submissions. Check the governing national law on the relevant date.",
        ],
    }
    return metadata, lines


def write_snapshot(out, metadata, lines):
    identifier = metadata["id"]
    payload = {"id": identifier, "lines": lines}
    filename = identifier + ".json.gz"
    binary = gzip.compress(json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode(), compresslevel=9, mtime=0)
    (out / filename).write_bytes(binary)
    return {
        **metadata,
        "file": filename,
        "sha256": sha256(binary).hexdigest(),
        "statistics": {
            "lines": len(lines),
            "uniqueCodes": len(lines),
            "codesWithRates": len(lines),
            "rates": sum(len(row["rates"]) for row in lines),
            "chapters": sorted({row["code"][:2] for row in lines}),
            "charges": ["import_vat"],
        },
    }


def main():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("raw", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--date", default="2026-11-11", type=lambda value: date.fromisoformat(value).isoformat())
    parser.add_argument("--countries", nargs="+", choices=MEMBERS, default=MEMBERS)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    snapshots = []
    for country in args.countries:
        if country in LOCAL_STATUTORY_PACKS:
            continue
        result = build_country(args.raw / f"tedb_{country.lower()}.xml", args.date, country)
        if result is not None:
            snapshots.append(write_snapshot(args.output, *result))
    (args.output / "manifest.json").write_text(
        json.dumps({"version": 1, "snapshots": snapshots}, ensure_ascii=False, indent=2) + "\n"
    )
    print(len(snapshots), sum(s["statistics"]["lines"] for s in snapshots), sum(s["statistics"]["rates"] for s in snapshots))


if __name__ == "__main__":
    main()
