#!/usr/bin/env python3
"""Normalize the EEC's common external tariff chapter PDFs into a reference pack."""
from argparse import ArgumentParser
from bisect import bisect_right
from collections import Counter
import json
from pathlib import Path
import re

import fitz
from rebuild import CHECKED, digest, line, rate, schedule, write_pack

INDEX = "https://eec.eaeunion.org/comission/department/catr/ett/"
TERMS_URL = "https://insecure.zan.kz/eng/docs/Z960000006_"
CHAPTERS = {f"{n:02d}" for n in range(1, 98) if n != 77}
NOTE = re.compile(r"\^\s*(\d+)[СC]\)")
TEMPORARY = {
    "800": "15%, minimum EUR 2.25/kg",
    "801": "15%, minimum EUR 1.88/kg",
    "802": "15%, minimum EUR 1.90/kg",
    "803": "15%, minimum EUR 1.50/kg",
    "804": "5%",
    "805": "10%",
    "806": "15%",
    "807": "11%",
    "808": "13%",
}
BASE_CONDITION = "Published common external tariff. Check national departures, preferences and quota or measure conditions."


def clustered(values):
    groups = []
    for value in sorted(values):
        if groups and value - groups[-1][-1] <= 1.5:
            groups[-1].append(value)
        else:
            groups.append([value])
    return [sum(group) / len(group) for group in groups]


def center_x(box):
    return (box[0] + box[2]) / 2


def center_y(box):
    return (box[1] + box[3]) / 2


def parse_page(page, chapter):
    words = page.get_text("words")
    header_start = next((w for w in words if w[4] == "Ставка" and 435 < w[0] < 550), None)
    if header_start is None or not any(w[4] == "ТН" for w in words):
        return
    header_end = next(w[3] for w in words if w[4] == "США)" and 435 < w[0] < 550
                      and header_start[1] < w[1] <= header_start[1] + 150)
    boundaries = ((90, 100), (175, 190), (390, 410), (433, 445), (548, 556))
    vertical = Counter()
    for drawing in page.get_drawings():
        rect = drawing["rect"]
        if rect.width <= 2 and rect.height >= 5:
            vertical[round(center_x(rect), 1)] += rect.height
    bounds = clustered(x for x, height in vertical.items() if height >= 45
                       and any(low <= x <= high for low, high in boundaries))
    assert len(bounds) == 5, (chapter, page.number, bounds)

    code_words = {}
    for word in words:
        if bounds[0] <= center_x(word) < bounds[1] and center_y(word) > header_end:
            code_words.setdefault(round(center_y(word), 1), []).append(word)

    headings = []
    for y, words_at_y in sorted(code_words.items()):
        raw = " ".join(w[4] for w in sorted(words_at_y, key=lambda w: w[0]))
        if raw.startswith(chapter) and re.fullmatch(r"\d{4}(?: +\d{2}(?: +\d{1,3}(?: +\d)?)?)?", raw):
            headings.append((y, re.sub(r"\s", "", raw)))
    if not headings:
        return

    rows = [[[], []] for _ in headings]
    cuts = [y - 4 for y, _ in headings]
    for block in page.get_text("dict")["blocks"]:
        for text_line in block.get("lines", []):
            spans = text_line["spans"]
            nominal = next((span for span in spans if not span["flags"] & 1 and span["text"].strip()), spans[0])
            y = center_y(nominal["bbox"])
            row = bisect_right(cuts, y) - 1
            if row < 0:
                continue
            for span in spans:
                box = span["bbox"]
                column = bisect_right(bounds, center_x(box)) - 1
                content = span["text"].strip()
                if column in (2, 3) and content:
                    if span["flags"] & 1:
                        content = "^" + content
                    rows[row][column - 2].append((y, box[0], content))

    for (_, code), (unit, duty) in zip(headings, rows):
        if len(code) == 10:
            yield code, joined(unit), joined(duty), page.number + 1


def joined(cell):
    return " ".join(content for _, _, content in sorted(cell))


def expression(text):
    raw = re.sub(r"\s*\^\s*([23])\b", lambda m: {"2": "²", "3": "³"}[m[1]], text)
    assert "^" not in raw and re.match(r"^\d|^из ", raw), raw
    if re.fullmatch(r"\d+(?:[.,]\d+)?", raw):
        return raw.replace(",", ".") + "%"
    return re.sub(r"(\d+(?:[.,]\d+)?)(, (?:но|либо))", r"\1%\2", raw)


def unit_expression(raw):
    chemical = {"кг K 2 O": "кг K₂O", "кг P 2 O 5": "кг P₂O₅", "кг H 2 O 2": "кг H₂O₂"}
    if raw in chemical:
        return chemical[raw]
    return re.sub(r"\s+\^?([23])\b", lambda m: {"2": "²", "3": "³"}[m[1]], raw)


def build(raw):
    urls = dict(row.split("\t", 1) for row in (raw / "eaeu_urls.tsv").read_text().splitlines())
    assert set(urls) == CHAPTERS | {"notes"}
    inputs = []
    rows = {}
    for chapter, url in sorted(urls.items()):
        path = raw / f"eaeu-{chapter}.pdf"
        inputs.append({"name": path.name, "url": url, "sha256": digest(path)})
        if chapter == "notes":
            continue
        with fitz.open(path) as document:
            for page in document:
                for code, unit, duty, page_number in parse_page(page, chapter):
                    note_ids = list(dict.fromkeys(NOTE.findall(duty)))
                    condition = BASE_CONDITION
                    if note_ids:
                        condition += " Read EEC CET notes " + ", ".join(n + "C" for n in note_ids) + " before applying the table rate."
                    reference = f"EEC CET chapter {chapter}, PDF page {page_number}"
                    rates = [
                        rate("temporary", f"Temporary EAEU CET, note {n}C", TEMPORARY[n],
                             through="2027-09-30", condition=BASE_CONDITION, **{"from": "2026-11-01"})
                        for n in note_ids if n in TEMPORARY
                    ]
                    rates.append(rate("general", "EAEU common external tariff table rate",
                                      expression(NOTE.sub("", duty).strip()), condition=condition))
                    assert code not in rows, code
                    rows[code] = line(code, reference, rates, url=f"{url}#page={page_number}")
                    if unit and unit != "–":
                        rows[code]["units"] = [unit_expression(unit)]
                    if note_ids:
                        rows[code]["notes"] = [f"Consolidated EEC tariff notes: {urls['notes']}"]
    assert len(rows) == 13294 and {code[:2] for code in rows} == CHAPTERS
    assert rows["0101210000"]["rates"][0]["expression"] == "0%"
    assert rows["4408393002"]["rates"][0]["expression"] == "10%"
    assert rows["3103110000"]["units"] == ["кг P₂O₅"]
    assert sum(r["treatment"] == "temporary" for row in rows.values() for r in row["rates"]) == 23
    metadata = schedule(
        "eaeu-cet-2026-11-11", "EAEU", ["AM", "BY", "KG", "KZ", "RU"],
        "Decision No. 80 common external tariff, EEC chapter tables", CHECKED, "published_baseline",
        "Eurasian Economic Commission", INDEX,
        "Statutory tariff facts extracted from published legal documents. Kazakhstan Copyright Law Article 8 excludes official documents.",
        TERMS_URL, inputs,
        ["Common external tariff reference for third-country imports into standard territory. Intra-union movements and special territories require separate rules.",
         "Verify national departures such as Kazakhstan WTO rates and local relief, preferential tariffs, quotas, trade remedies and all separate tax or regulatory measures.",
         "The general entries reproduce the rate column. Legal footnote identifiers are retained and most exceptions remain in the linked source notes. Notes 800C–808C also have dated rate references.",
         "Snapshot covers the observation date only. A listed rate requires product classification and confirmation of effective legal conditions."])
    return metadata, list(rows.values())


if __name__ == "__main__":
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("raw", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    snapshot = write_pack(args.output, *build(args.raw))
    (args.output / "manifest.json").write_text(json.dumps({"version": 1, "snapshots": [snapshot]}, ensure_ascii=False, indent=2) + "\n")
    print(snapshot["id"], snapshot["statistics"]["lines"], snapshot["statistics"]["rates"])
