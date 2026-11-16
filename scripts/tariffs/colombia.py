#!/usr/bin/env python3
"""Normalize the numeric base tariff in the DIAN consolidated Decreto 1881."""

import argparse
import gzip
from hashlib import sha256
import json
from pathlib import Path
import re
from urllib.parse import quote, urljoin

from lxml import html

ID = "co-dian-decree-1881-2026-11"
SOURCE = "https://normograma.dian.gov.co/dian/compilacion/docs/decreto_1881_2021.htm"
TERMS = "https://cancilleria.gov.co/normograma/compilacion/docs/ley_0023_1982.htm"
CODE = re.compile(r"\d{4}(?:\.\d{2}){3}")
RATE = re.compile(r"(?P<before>(?:<NV\d+>\s*)*)(?P<value>\d+(?:[.,]\d+)?)\s*%?\s*(?P<notes>(?:(?:<?(?:NV\d+|CC\d*|DC)>|\*)\s*)*)", re.I)


def normalized_text(element):
    return " ".join(element.text_content().split())


def build(raw, out):
    document = html.parse(raw)
    assert "Decreto 1881 de 2021" in normalized_text(document.getroot())
    lines = []
    current_chapter = None
    for node in document.getroot().iter():
        if node.tag == "a" and node.get("name", "").startswith("Capítulo "):
            current_chapter = node.get("name")
        if node.tag != "tr":
            continue
        cells = node.xpath("./td")
        if not cells:
            continue
        code = normalized_text(cells[0])
        if not CODE.fullmatch(code):
            continue
        assert current_chapter == f"Capítulo {int(code[:2])}", (code, current_chapter)
        chapter_url = SOURCE + "#" + quote(current_chapter)
        record = {
            "code": code.replace(".", ""),
            "reference": f"DIAN Decreto 1881, {current_chapter}, {code}, Grv column",
            "rates": [],
            "url": chapter_url,
        }
        if len(cells) == 2:
            assert cells[1].get("colspan") == "2", code
            record["notes"] = ["The DIAN schedule shows no independent Grv value for this heading. Check its national subdivisions."]
        else:
            assert len(cells) == 3, code
            value = RATE.fullmatch(normalized_text(cells[2]))
            assert value, (code, normalized_text(cells[2]))
            notes = []
            for anchor in node.xpath(".//a[@href]"):
                url = urljoin(SOURCE, anchor.get("href"))
                if url.startswith("https://normograma.dian.gov.co/"):
                    notes.append(f"DIAN linked legal provision {normalized_text(anchor)}: {url}")
            markers = " ".join((value["before"] + " " + value["notes"]).split())
            if markers:
                notes.append(f"DIAN reference markers in the rate column: {markers}")
            condition = None
            if code.startswith("98"):
                condition = "Chapter 98 special customs treatment. Check the cited regime, valuation basis, and eligibility."
            elif markers or notes:
                condition = "Base duty in the DIAN schedule. Follow the linked amendments and footnotes for temporary, conditional, or origin-specific treatment."
            rate = {
                "charge": "customs_duty",
                "treatment": "other" if code.startswith("98") else "general",
                "label": "DIAN published base Grv",
                "expression": value["value"].replace(",", ".") + "%",
            }
            if condition:
                rate["condition"] = condition
            record["rates"] = [rate]
            if notes:
                record["notes"] = list(dict.fromkeys(notes))
        lines.append(record)

    lines.sort(key=lambda row: row["code"])
    by_code = {row["code"]: row for row in lines}
    assert len(lines) == len(by_code) == 7995
    assert sum(bool(row["rates"]) for row in lines) == 7990
    assert by_code["0101210000"]["rates"][0]["expression"] == "5%"
    assert by_code["9801200000"]["rates"][0]["expression"] == "3%"
    assert any("decreto_1131_2026" in note for note in by_code["9801200000"]["notes"])
    assert any("decreto_0265_2026" in note for note in by_code["6907210000"]["notes"])
    out.mkdir(parents=True, exist_ok=True)
    pack = out / f"{ID}.json.gz"
    data = json.dumps({"id": ID, "lines": lines}, ensure_ascii=False, separators=(",", ":")).encode()
    pack.write_bytes(gzip.compress(data, compresslevel=9, mtime=0))
    snapshot = {
        "id": ID,
        "jurisdiction": "CO",
        "countries": ["CO"],
        "zone": "standard",
        "edition": "DIAN consolidated Decreto 1881 de 2021, reference captured November 2026",
        "hsEdition": "HS2022",
        "availableFrom": "2026-11-11",
        "availableThrough": "2026-11-11",
        "checkedOn": "2026-11-11",
        "scope": "published_baseline",
        "authority": "Dirección de Impuestos y Aduanas Nacionales de Colombia",
        "sourceUrl": SOURCE,
        "terms": "Numeric code and rate facts of Colombia Decreto 1881 as shown in the official DIAN compilation. Ley 23 de 1982 art. 41 provides for accurate reproduction of official legal acts.",
        "termsUrl": TERMS,
        "inputFiles": [{"name": raw.name, "url": SOURCE, "sha256": sha256(raw.read_bytes()).hexdigest()}],
        "limitations": [
            "Numeric base values in the Grv column. DIAN notes and linked decrees can temporarily replace a base value. Verify those provisions and eligibility before applying a rate.",
            "Five printed heading codes carry no independent duty rate. The snapshot represents the captured DIAN text on the check date.",
            "Preferential rates, trade remedies, duties in temporary decrees, VAT, and special-regime eligibility require separate verification.",
        ],
        "file": pack.name,
        "sha256": sha256(pack.read_bytes()).hexdigest(),
        "statistics": {
            "lines": len(lines), "uniqueCodes": len(lines), "codesWithRates": 7990,
            "rates": 7990, "chapters": sorted({row["code"][:2] for row in lines}),
        },
    }
    (out / "manifest.json").write_text(json.dumps({"version": 1, "snapshots": [snapshot]}, ensure_ascii=False, indent=2) + "\n")
    print(ID, len(lines), snapshot["statistics"]["rates"])


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("html", type=Path)
    parser.add_argument("out", type=Path)
    args = parser.parse_args()
    build(args.html, args.out)
