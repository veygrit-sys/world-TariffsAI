#!/usr/bin/env python3
"""Normalize New Caledonia's licensed daily tariff dataset."""
import argparse
import json
from pathlib import Path
import re
from urllib.parse import urlencode

from rebuild import CHECKED, digest, line, rate, schedule, write_pack

DATASET = "referentiel-douanier-tarif-douanier-compilation"
INDEX = f"https://data.gouv.nc/explore/dataset/{DATASET}/"
API = f"https://data.gouv.nc/api/explore/v2.1/catalog/datasets/{DATASET}"
FIELDS = "codification_statistique,position_ordre,unite_supp,dd,tci,tspa,tat,tap,tpp,tapp,tgc,tte,trm"
EXPORT = f"{API}/exports/json?" + urlencode({
    "select": FIELDS,
    "where": "codification_statistique is not null",
    "order_by": "position_ordre",
})
TERMS = "https://www.etalab.gouv.fr/wp-content/uploads/2017/04/ETALAB-Licence-Ouverte-v2.0.pdf"
AUTHOR = "Government of New Caledonia, Direction Régionale des Douanes (DRDNC)"
ITEM = re.compile(r"\d{4}\.\d{2}\.\d{2}")
VALUE = re.compile(r"\d+(?:[.,]\d+)?(?:%|F/[A-Z]+)")
MEASURES = {
    "tgc": ("import_vat", "Taxe générale sur la consommation (TGC)"),
    "tci": ("excise", "Taxe de consommation intérieure (TCI)"),
    "tat": ("excise", "Taxe sur les alcools et tabacs (TAT3S)"),
    "tspa": ("levy", "Taxe de soutien aux productions agricoles et alimentaires (TSPA)"),
    "tap": ("levy", "Taxe anti-pollution (TAP)"),
    "tpp": ("levy", "Taxe sur les produits pétroliers (TPP)"),
    "tapp": ("levy", "Taxe additionnelle sur les produits pétroliers (TAPP)"),
    "tte": ("levy", "Taxe pour la transition énergétique (TTE)"),
    "trm": ("levy", "Taxe de régulation de marché (TRM)"),
}


def normalize_rate(raw):
    if raw == "EX":
        return "Free"
    assert VALUE.fullmatch(raw), raw
    return raw


def extract(export_path, metadata_path):
    catalog = json.loads(metadata_path.read_text())
    meta = catalog["metas"]["default"]
    assert catalog["dataset_id"] == DATASET
    assert meta["license"] == "Licence Ouverte v2.0"
    assert meta["data_processed"] == "2026-11-10T18:33:18+00:00"
    rows = json.loads(export_path.read_text())
    assert len(rows) == 6376

    customs = {}
    measures = {}
    for row in rows:
        item = row["codification_statistique"]
        assert ITEM.fullmatch(item), item
        if item[:2] in {"98", "99"}:
            continue
        code = item.replace(".", "")
        assert code not in customs, code
        reference = f"Statistical code {item}, tariff record {row['position_ordre']}"
        details = {"url": f"{API}/records?" + urlencode({"where": f'codification_statistique = "{item}"'})}
        if row["unite_supp"]:
            details["units"] = [row["unite_supp"]]
        duty = row["dd"]
        customs[code] = line(code, reference, [
            rate("general", "Droits de douane (DD)", normalize_rate(duty)),
        ] if duty is not None else [], **details)
        charges = [
            rate("general", label, normalize_rate(row[field]), charge=charge)
            for field, (charge, label) in MEASURES.items()
            if row[field] is not None
        ]
        if charges:
            measures[code] = line(code, reference, charges, **details)

    assert len(customs) > 6300 and len(measures) > 6300
    assert customs["09012121"]["rates"][0]["expression"] == "15%"
    assert {r["expression"] for r in measures["09012121"]["rates"]} == {"3%", "18%"}
    assert customs["01012100"]["rates"][0]["expression"] == "Free"

    metadata = schedule(
        "nc-drdnc-tariff-2026-11-11", "NC", ["NC"], "New Caledonia customs tariff, 11 November 2026",
        CHECKED, "national_schedule", AUTHOR, INDEX,
        "Licence Ouverte v2.0. Source and data date retained. Official data normalized to numeric codes and rate expressions.",
        TERMS, [
            {"name": "Tariff statistical lines export", "sha256": digest(export_path), "url": EXPORT},
            {"name": "Open Data NC catalog metadata", "sha256": digest(metadata_path), "url": API},
        ],
        [
            "Daily source snapshot processed on 10 November 2026 at 18:33 UTC (11 November in New Caledonia).",
            "General import duty for chapters 1–97. EX is the published exemption marker. A blank duty remains unreported.",
            "Preferential origin, qualifying goods, special regimes and tariff notes require the source and official legal instruments.",
        ],
    )
    taxes = {
        **metadata,
        "id": "nc-drdnc-import-taxes-2026-11-11",
        "role": "measures",
        "limitations": [
            "General tariff-line TGC and published product taxes. Blank fields remain unreported.",
            "Specific rates are kept as printed. F denotes CFP francs and units are the source abbreviations.",
            "Check TGC exceptions, valuation, statutory notes and the applicable Sydonia additional code.",
            "Use the source to check exemptions and the applicable tax base for landed-cost calculations.",
        ],
    }
    return [(metadata, list(customs.values())), (taxes, list(measures.values()))]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("export", type=Path)
    parser.add_argument("metadata", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    entries = [write_pack(args.output, data, lines) for data, lines in extract(args.export, args.metadata)]
    (args.output / "manifest.json").write_text(
        json.dumps({"version": 1, "snapshots": entries}, indent=2, ensure_ascii=False) + "\n"
    )


if __name__ == "__main__":
    main()
