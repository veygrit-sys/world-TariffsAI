#!/usr/bin/env python3
"""Extract unambiguous ad valorem cells from Nepal's FY 2083/84 import schedule."""
import argparse
from collections import Counter
import json
from pathlib import Path
import re
import subprocess
from xml.etree import ElementTree

from rebuild import CHECKED, digest, line, rate, schedule, write_pack


INDEX = "https://customs.gov.np/content/46/integrated-tariff-rate/"
PDF = "https://giwmscdnone.gov.np/media/files/%E0%A4%8F%E0%A4%95%E0%A5%80%E0%A4%95%E0%A5%83%E0%A4%A4%20%E0%A4%AD%E0%A4%A8%E0%A5%8D%E0%A4%B8%E0%A4%BE%E0%A4%B0%20%E0%A4%AE%E0%A4%B9%E0%A4%B8%E0%A5%81%E0%A4%B2%20%E0%A4%A6%E0%A4%B0%E0%A4%AC%E0%A4%A8%E0%A5%8D%E0%A4%A6%E0%A5%80%20%E0%A5%A8%E0%A5%A6%E0%A5%AE%E0%A5%A9%E0%A5%A4%E0%A5%A6%E0%A5%AE%E0%A5%AA_qv4xx54.pdf"
TERMS = "https://www.wipo.int/en/web/traditional-knowledge/w/tklaws/article_0131"
NUMERALS = str.maketrans("०१२३४५६७८९", "0123456789")
CODE = re.compile(r"[0-9]{4}\.[0-9]{2}\.[0-9]{2}")
PERCENT = re.compile(r"[0-9]+(?:\.[0-9]+)?")
TOTAL = re.compile(r"[0-9]+\.[0-9]{2}")


def columns(positioned_words):
    anchors = []
    for x, y, text in positioned_words:
        if text != "साका" or x >= 375:
            continue
        same_row = sorted((xx, word) for xx, yy, word in positioned_words
                          if xx > x + 12 and abs(yy - y) < 1 and word in {"अन्र्", "भारत", "गतब्बत"})
        if [word for _, word in same_row] != ["अन्र्", "भारत", "अन्र्", "गतब्बत", "अन्र्"]:
            continue
        vat = [xx for xx, yy, word in positioned_words if 410 < xx < 455 and 5 < y - yy < 26
               and word in {"कर", ".अ.कर", "मू.अ.कर"}]
        anchors.append((y, same_row[0][0], same_row[-1][0], vat[0] if len(vat) == 1 else None))
    return anchors[0] if len(anchors) == 1 else None


def exact_cell(positioned_words, x, start, end):
    if x is None:
        return None
    nearby = [(y, text) for xx, y, text in positioned_words if abs(xx - x) < 7 and start <= y < end]
    return nearby[0] if len(nearby) == 1 else None


def nepal(raw):
    path = raw / "np-2083-84.pdf"
    xml = subprocess.check_output(["pdftotext", "-bbox-layout", str(path), "-"])
    pages = ElementTree.fromstring(xml).findall(".//{*}page")
    assert len(pages) == 683
    customs = {}
    measures = {}
    for page_number, page in enumerate(pages[12:567], 13):
        positioned_words = [((float(w.get("xMin")) + float(w.get("xMax"))) / 2,
                             float(w.get("yMin")), (w.text or "").translate(NUMERALS))
                            for w in page.findall(".//{*}word")]
        header = columns(positioned_words)
        if header is None:
            continue
        heading_y, customs_x, total_x, vat_x = header
        candidates = sorted((y, x, text) for x, y, text in positioned_words
                            if y > heading_y and x < 175 and CODE.fullmatch(text))
        if not candidates:
            continue
        main_x = Counter(round(x, 1) for _, x, _ in candidates).most_common(1)[0][0]
        printed_rows = [(y, text) for y, x, text in candidates if abs(x - main_x) < 6]
        for index, (y, printed_code) in enumerate(printed_rows):
            end = min(y + 85, printed_rows[index + 1][0] - 1.5 if index + 1 < len(printed_rows) else 800)
            combined = exact_cell(positioned_words, total_x, y - 1.5, end)
            if not combined or TOTAL.fullmatch(combined[1]) is None:
                continue
            combined_y, _ = combined
            start = max(y - 1.5, combined_y - 4.5)
            end = min(end, combined_y + 4.5)
            duty = exact_cell(positioned_words, customs_x, start, end)
            vat = exact_cell(positioned_words, vat_x, start, end)
            code = printed_code.replace(".", "")
            details = {"url": f"{PDF}#page={page_number}"}
            reference = f"Integrated import tariff, PDF page {page_number}, item {printed_code}"
            if duty and PERCENT.fullmatch(duty[1]):
                entry = line(code, reference, [rate("general", "General customs duty, other origins", f"{duty[1]}%")], **details)
                assert code not in customs or customs[code]["rates"] == entry["rates"], code
                customs.setdefault(code, entry)
            if vat and vat[1] in {"0", "13"}:
                entry = line(code, reference, [rate("general", "Import VAT", f"{vat[1]}%", charge="import_vat")], **details)
                assert code not in measures or measures[code]["rates"] == entry["rates"], code
                measures.setdefault(code, entry)
    assert len(customs) >= 5600 and len(measures) >= 5000, (len(customs), len(measures))
    assert customs["01012100"]["rates"][0]["expression"] == "10%"
    assert customs["09012100"]["rates"][0]["expression"] == "30%"
    assert measures["09012100"]["rates"][0]["expression"] == "13%"
    assert customs["97069000"]["rates"][0]["expression"] == "10%"
    base = schedule(
        "np-customs-integrated-fy-2083-84", "NP", ["NP"], "Nepal integrated import tariff, FY 2083/84",
        CHECKED, "national_schedule", "Department of Customs, Ministry of Finance, Government of Nepal", INDEX,
        "Numeric statutory facts. Nepal Copyright Act 2059 (2002) section 4 addresses general data.", TERMS,
        [{"name": path.name, "sha256": digest(path), "url": PDF}], [
            "Selected unambiguous percentages in the ordinary customs duty column for other origins. The document reproduces the Customs Tariff Act 2081 as amended and Finance Act 2083.",
            "Confirm statutory footnotes, specific rates, conditional exemptions, preferential rates and other import charges in the original schedule.",
        ],
    )
    return [
        (base, list(customs.values())),
        ({**base, "id": "np-customs-import-vat-fy-2083-84", "role": "measures", "limitations": [
            "Selected unambiguous percentages printed in the import VAT column. Missing or footnoted cells require the original schedule.",
            "The printed total effective rate includes several other charges and is not used as the VAT rate.",
        ]}, list(measures.values())),
    ]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("raw", type=Path)
    parser.add_argument("out", type=Path)
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    items = [write_pack(args.out, *pack) for pack in nepal(args.raw)]
    (args.out / "manifest.json").write_text(json.dumps({"version": 1, "snapshots": items},
                                                       ensure_ascii=False, indent=2) + "\n")
    for item in items:
        print(item["id"], item["statistics"]["codesWithRates"], item["statistics"]["rates"])


if __name__ == "__main__":
    main()
