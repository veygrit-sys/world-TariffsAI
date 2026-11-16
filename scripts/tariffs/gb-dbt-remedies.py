"""Build a dated Great Britain trade-measure reference from the DBT declarable CSV."""
from argparse import ArgumentParser
from collections import defaultdict
import csv
import gzip
from hashlib import sha256
import json
from pathlib import Path
import re

VERSION = "v4.0.1652"
DATE = "2026-11-11"
SNAPSHOT = "gb-dbt-trade-measures-2026-11-11"
SOURCE = f"https://data.api.trade.gov.uk/v1/datasets/uk-tariff-2021-01-01/versions/{VERSION}"
CSV_URL = SOURCE + "/tables/measures-on-declarable-commodities/data?format=csv&download"
METADATA_URL = SOURCE + "/metadata?format=csvw"
OGL = "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/"
MEASURES = {
    "551": "trade_remedy", "552": "trade_remedy",
    "553": "trade_remedy", "554": "trade_remedy",
    "695": "additional_duty", "696": "additional_duty",
}


def extract(input_path, countries):
    rows = defaultdict(list)
    with input_path.open(newline="", encoding="utf-8-sig") as stream:
        reader = csv.DictReader(stream)
        assert len(reader.fieldnames) == 24
        for entry in reader:
            kind = entry["measure__type__id"]
            expression = entry["measure__duty_expression"]
            if kind not in MEASURES or expression in ("", "#NA"):
                continue
            start = entry["measure__effective_start_date"]
            end = entry["measure__effective_end_date"]
            if start > DATE or (end != "#NA" and end < DATE):
                continue
            code = entry["commodity__code"]
            assert re.fullmatch(r"[0-9]{10}", code)
            geo = entry["measure__geographical_area__id"]
            region = entry["measure__geographical_area__description"]
            if geo in countries:
                origin = {"originCountries": [geo]}
            elif geo == "1011" and region == "ERGA OMNES":
                origin = {}
            else:
                continue
            excluded = entry["measure__excluded_geographical_areas__ids"]
            excluded_ids = re.findall(r"(?<![A-Z0-9])[A-Z]{2}(?![A-Z0-9])", excluded)
            recognized_exclusions = sorted(set(excluded_ids) & countries)
            if recognized_exclusions:
                origin["excludedOriginCountries"] = recognized_exclusions
            label = entry["measure__type__description"]
            condition = ["Confirm the legal product definition, origin, exporter and documentary conditions."]
            for key, title in (
                ("additional_code__code", "Additional code"),
                ("additional_code__description", "Additional code description"),
                ("excluded_geographical_areas__descriptions", "Geographical exclusions"),
                ("conditions", "Published conditions"),
                ("footnotes", "Footnotes"),
                ("regulation__id", "Regulation"),
                ("regulation__url", "Regulation URL"),
            ):
                value = entry[f"measure__{key}"]
                if value not in ("", "#NA"):
                    condition.append(f"{title} {value}.")
            result = {
                "charge": MEASURES[kind],
                "treatment": "other",
                "label": label,
                "expression": expression,
                "origin": region,
                "condition": " ".join(condition),
                "from": start,
                **({"through": end} if end != "#NA" else {}),
                **origin,
            }
            assert len(result["condition"]) <= 3000, (code, entry["measure__sid"])
            rows[code].append(result)

    return [
        {
            "code": code,
            "reference": f"DBT {VERSION}, declarable commodity {code}",
            "url": f"https://www.trade-tariff.service.gov.uk/commodities/{code}",
            "rates": list({json.dumps(rate, sort_keys=True): rate for rate in rates}.values()),
        }
        for code, rates in sorted(rows.items())
    ]


def main():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("raw", type=Path)
    parser.add_argument("registry", type=Path)
    parser.add_argument("out", type=Path)
    args = parser.parse_args()
    countries = {item["code"] for item in json.loads(args.registry.read_text()) if item["inScope"]}
    declarable = args.raw / "declarable.csv"
    metadata = args.raw / "metadata.json"
    document = json.loads(metadata.read_text())
    assert document["dc:license"] == OGL
    assert declarable.stat().st_size == 360681060
    lines = extract(declarable, countries)
    assert len(lines) > 500
    stats = {
        "lines": len(lines),
        "uniqueCodes": len(lines),
        "codesWithRates": len(lines),
        "rates": sum(len(line["rates"]) for line in lines),
        "chapters": sorted({line["code"][:2] for line in lines}),
        "charges": sorted(set(MEASURES.values())),
    }
    args.out.mkdir(parents=True, exist_ok=True)
    filename = SNAPSHOT + ".json.gz"
    encoded = gzip.compress(json.dumps({"id": SNAPSHOT, "lines": lines}, ensure_ascii=False, separators=(",", ":")).encode(), mtime=0)
    (args.out / filename).write_bytes(encoded)
    snapshot = {
        "id": SNAPSHOT,
        "jurisdiction": "GB",
        "countries": ["GB"],
        "zone": "standard",
        "edition": f"DBT UK tariff {VERSION}, 10 November 2026 release",
        "hsEdition": "HS 2022",
        "availableFrom": DATE,
        "availableThrough": DATE,
        "checkedOn": DATE,
        "scope": "national_schedule",
        "role": "measures",
        "authority": "Department for Business and Trade",
        "sourceUrl": SOURCE + "/metadata?format=html",
        "terms": "Contains public sector information licensed under the Open Government Licence v3.0. DBT measures adapted by Veygrit.",
        "termsUrl": OGL,
        "inputFiles": [
            {"name": path.name, "url": url, "sha256": sha256(path.read_bytes()).hexdigest()}
            for path, url in [(declarable, CSV_URL), (metadata, METADATA_URL)]
        ],
        "limitations": [
            "Great Britain, exact declarable 10-digit commodity codes.",
            "Published numeric anti-dumping, countervailing and additional duty expressions. Registration and rows without a published duty expression are omitted.",
            "Single-country and erga omnes scopes are included. Producer, documentary, product and legal exclusions require separate checks.",
        ],
        "file": filename,
        "sha256": sha256(encoded).hexdigest(),
        "statistics": stats,
    }
    (args.out / "manifest.json").write_text(json.dumps({"version": 1, "snapshots": [snapshot]}, ensure_ascii=False, indent=2) + "\n")
    print(SNAPSHOT, stats)


if __name__ == "__main__":
    main()
