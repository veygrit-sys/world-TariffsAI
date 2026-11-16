#!/usr/bin/env python3
"""Normalize dated tariff code and rate facts from MERCOSUR and Uruguay."""
import argparse
from collections import defaultdict
from decimal import Decimal
import gzip
from hashlib import sha256
import json
from pathlib import Path
import re

from openpyxl import load_workbook

CHECKED = "2026-11-11"
POLCOM = "https://polcom.mercosur.int/public/ncm/vigente"
MERCOSUR_LEGAL = "https://normas.mercosur.int/public/normativas/4334"
URUGUAY = "https://www.gub.uy/ministerio-economia-finanzas/nomenclatura-aranceles-uruguay-0"
URUGUAY_FILE = (
    "https://www.gub.uy/ministerio-economia-finanzas/sites/ministerio-economia-finanzas/"
    "files/2025-05/Arancel%20Nacional_10%20d%C3%ADgitos_Febrero%202025%20-final.xlsx"
)
URUGUAY_TERMS = (
    "https://www.gub.uy/agencia-gobierno-electronico-sociedad-informacion-conocimiento/"
    "institucional/normativa/decreto-ley-19355015-art-82-licencia-datos-abiertos-uruguay"
)

def rate(treatment, label, value, **fields):
    value = Decimal(str(value).replace(",", "."))
    assert value.is_finite() and 0 <= value <= 100
    return {
        "charge": "customs_duty",
        "treatment": treatment,
        "label": label,
        "expression": f"{value:f}%",
        **fields,
    }


def source(id, jurisdiction, countries, date, edition, authority, url, terms, terms_url, inputs, limits):
    return {
        "id": id,
        "jurisdiction": jurisdiction,
        "countries": countries,
        "zone": "standard",
        "edition": edition,
        "hsEdition": "HS2022 / NCM",
        "availableFrom": date,
        "availableThrough": date,
        "checkedOn": CHECKED,
        "scope": "published_baseline",
        "authority": authority,
        "sourceUrl": url,
        "terms": terms,
        "termsUrl": terms_url,
        "inputFiles": [
            {"name": path.name, "url": source_url, "sha256": sha256(path.read_bytes()).hexdigest()}
            for path, source_url in inputs
        ],
        "limitations": limits,
    }


def save(snapshot, lines, out):
    out.mkdir(parents=True, exist_ok=True)
    id = snapshot["id"]
    packed = out / (id + ".json.gz")
    lines.sort(key=lambda row: row["code"])
    raw = json.dumps({"id": id, "lines": lines}, ensure_ascii=False, separators=(",", ":")).encode()
    packed.write_bytes(gzip.compress(raw, compresslevel=9, mtime=0))
    snapshot.update({
        "file": packed.name,
        "sha256": sha256(packed.read_bytes()).hexdigest(),
        "statistics": {
            "lines": len(lines),
            "uniqueCodes": len({row["code"] for row in lines}),
            "codesWithRates": sum(bool(row["rates"]) for row in lines),
            "rates": sum(len(row["rates"]) for row in lines),
            "chapters": sorted({row["code"][:2] for row in lines}),
        },
    })
    manifest = {"version": 1, "snapshots": [snapshot]}
    (out / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    print(id, snapshot["statistics"])


def uruguay(path):
    sheet = load_workbook(path, read_only=True, data_only=True).active
    records = {}
    all_rows = 0
    for row_no, row in enumerate(sheet.values, 1):
        item, _, aec, _, external, internal, _, _ = row
        if not isinstance(item, str) or not re.fullmatch(r"\d{4}(?:\.\d{2}){3}", item):
            continue
        all_rows += 1
        code = item.replace(".", "")
        rates = []
        if external is not None:
            rates.append(rate("mfn", "Uruguay TGA extra zona", external,
                              condition="MEF national MFN tariff in the February 2025 reference workbook. Confirm the applicable legal instrument and exceptions."))
        if internal is not None:
            rates.append(rate("preferential", "Uruguay TGA intra zona", internal,
                              originCountries=["AR", "BR", "PY"],
                              condition="Qualifying MERCOSUR intra-zone imports. Verify origin, excluded goods and applicable trade arrangements."))
        record = records.setdefault(code, {"code": code, "reference": f"MEF February 2025, Hoja1 row {row_no}, {item}",
                                           "url": URUGUAY, "rates": []})
        if record["rates"] and rates != record["rates"]:
            record.setdefault("notes", []).append(f"Hoja1 row {row_no} also lists {item} with a different TGA value. The workbook provides both entries.")
        for value in rates:
            if value not in record["rates"]:
                record["rates"].append(value)
        assert aec is not None
    assert all_rows == 12242 and len(records) == 12240
    assert records["0402101000"]["rates"][0]["expression"] == "28%"
    assert sorted(item["expression"] for item in records["3207109000"]["rates"] if item["treatment"] == "mfn") == ["0%", "10.8%"]
    return source(
        "uy-mef-tga-2025-02", "UY", ["UY"], "2025-02-28",
        "MEF Arancel Nacional, February 2025",
        "Ministerio de Economía y Finanzas, Uruguay", URUGUAY,
        "Numeric TGA rate facts and tariff code identifiers from the official MEF public workbook. Attribution to MEF. Uruguay open data policy, Law 19.355 art. 82.",
        URUGUAY_TERMS, [(path, URUGUAY_FILE)],
        [
            "February 2025 published reference. The date marker represents the end of the reference month.",
            "Includes the extra-zone national MFN and intra-zone TGA columns. National decrees and subsequent modifications control legal application.",
            "The source has two repeated codes, including one with two distinct MFN values. The conflicting values and source row references are retained.",
        ],
    ), list(records.values())


def polcom(path):
    entries = json.loads(path.read_text())["data"]
    assert len(entries) == len({row["codigo"] for row in entries}) == 15160
    records = []
    for entry in entries:
        code = entry["codigo"]
        assert entry["nomenclatura_version_id"] == 30 and entry["codigo_completo"] == "NCM_202611_" + code
        if not re.fullmatch(r"\d{8}", code) or not entry["aec"]:
            continue
        rates = []
        for item in entry["aec"]:
            value = item["porcentaje_aec_es"]
            if isinstance(value, (str, int, float)):
                value = str(value).replace(",", ".")
                if re.fullmatch(r"\d+(?:\.\d+)?", value):
                    rates.append(rate("general", "MERCOSUR AEC", value,
                                      condition="Regional common external tariff reference. Verify the national applied rate, national tariff exceptions, quotas, and preferential eligibility."))
                else:
                    raise ValueError((code, value))
        record = {"code": code, "reference": f"POLCOM NCM 202611, item {entry['codigoConFormato']}",
                  "url": POLCOM, "rates": rates}
        if entry["nomenclatura_familia"]:
            record["notes"] = [f"POLCOM tariff family {entry['nomenclatura_familia']['nombre_corto']}. Verify national treatment."]
        records.append(record)
    assert len(records) > 10000
    assert any(row["code"] == "01013000" and row["rates"][0]["expression"] == "3.6%" for row in records)
    return source(
        "mercosur-aec-polcom-2026-11", "MERCOSUR", ["AR", "PY", "UY"], "2026-11-01",
        "MERCOSUR POLCOM NCM and AEC at 1 November 2026",
        "Secretaría del MERCOSUR, Sector de Asesoría Técnica", POLCOM,
        "Numeric legal tariff values and code identifiers from the official Secretariat schedule. Source descriptions, classifications commentary and raw response are excluded.",
        MERCOSUR_LEGAL, [(path, POLCOM + "/lista")],
        [
            "The date is the official POLCOM reference date. AEC values represent the common regional tariff only.",
            "Country-specific tariffs, national exceptions, preferences, temporary measures and later amendments can change the actual applicable duty.",
            "Member destinations here are Argentina, Paraguay and Uruguay. Brazil has its separately sourced national snapshot.",
        ],
    ), records


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("kind", choices=["uruguay", "polcom"])
    parser.add_argument("input", type=Path)
    parser.add_argument("out", type=Path)
    args = parser.parse_args()
    build = {"uruguay": uruguay, "polcom": polcom}[args.kind]
    save(*build(args.input), args.out)
