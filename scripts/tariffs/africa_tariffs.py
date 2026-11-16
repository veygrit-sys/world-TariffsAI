"""Build official African customs schedule references with Poppler."""

import argparse
from bisect import bisect_right
from collections import defaultdict
from decimal import Decimal
import gzip
from hashlib import sha256
import json
from pathlib import Path
import re
import subprocess

CHECKED = "2026-11-11"
CI_PAGE = "https://www.douanes.ci/info/tec"
CI_PDF = "https://www.douanes.ci/sites/default/files/tec/le_tec_cedeao_enrichi_des_principaux_droits_et_taxes_relevant_de_la_taxation_nationale_-_27-03-2026.pdf"
CI_LAW = "https://www.wipo.int/wipolex/fr/legislation/details/16840"
CI_COLUMNS = {
    "DD": ((297, 316), "customs_duty", "Customs duty (DD)"),
    "TVA": ((354, 377), "import_vat", "Import VAT (TVA)"),
    "PCC": ((498, 518), "levy", "ECOWAS community levy (PCC)"),
    "PCS": ((519, 539), "levy", "UEMOA solidarity levy (PCS)"),
    "PUA": ((539, 560), "levy", "African Union levy (PUA)"),
    "RST": ((581, 602), "levy", "Statistical charge (RST)"),
}


def digest(path):
    return sha256(path.read_bytes()).hexdigest()


def rate(charge, label, amount, condition=None):
    return {
        "charge": charge,
        "treatment": "general",
        "label": label,
        "expression": amount,
        **({"condition": condition} if condition else {}),
    }


def metadata(identifier, jurisdiction, countries, edition, start, through, authority,
             source_page, inputs, terms, terms_url, limitations, measures=False):
    return {
        "id": identifier,
        "jurisdiction": jurisdiction,
        "countries": countries,
        "zone": "standard",
        "edition": edition,
        "hsEdition": "HS2022",
        "availableFrom": start,
        "availableThrough": through,
        "checkedOn": CHECKED,
        "scope": "published_baseline",
        **({"role": "measures"} if measures else {}),
        "authority": authority,
        "sourceUrl": source_page,
        "terms": terms,
        "termsUrl": terms_url,
        "inputFiles": [{"name": path.name, "url": url, "sha256": digest(path)}
                       for path, url in inputs],
        "limitations": limitations,
    }


def write(out, meta, lines):
    lines = sorted(lines, key=lambda line: line["code"])
    pack = out / (meta["id"] + ".json.gz")
    payload = json.dumps({"id": meta["id"], "lines": lines}, ensure_ascii=False,
                         separators=(",", ":")).encode()
    pack.write_bytes(gzip.compress(payload, compresslevel=9, mtime=0))
    return {
        **meta,
        "file": pack.name,
        "sha256": digest(pack),
        "statistics": {
            "lines": len(lines),
            "uniqueCodes": len({line["code"] for line in lines}),
            "codesWithRates": sum(bool(line["rates"]) for line in lines),
            "rates": sum(len(line["rates"]) for line in lines),
            "chapters": sorted({line["code"][:2] for line in lines}),
            "charges": sorted({rate["charge"] for line in lines for rate in line["rates"]}),
        },
    }


def positioned_words(pdf):
    pages = defaultdict(list)
    extracted = subprocess.check_output(["pdftotext", "-tsv", pdf, "-"], text=True)
    for line in extracted.splitlines():
        if not line.startswith("5\t"):
            continue
        cells = line.split("\t", 11)
        if len(cells) != 12:
            continue
        _, page, _, _, _, _, x, y, width, _, _, word = cells
        pages[int(page)].append((float(x), float(y), float(width), word))
    return pages


def percent(raw):
    return f"{Decimal(raw.replace(',', '.')).normalize():f}%"


def ivoire(raw, out):
    pdf = raw / "ci-tec.pdf"
    code_pattern = re.compile(r"[0-9]{10}")
    number = re.compile(r"[0-9]+(?:[.,][0-9]+)?")
    duty_lines, measure_lines = [], []
    expected_levies = {"PCC": "0,5", "PCS": "0,8", "PUA": "0,2", "RST": "1"}
    for page, words in positioned_words(pdf).items():
        anchors = [(y, code) for x, y, _, code in words
                   if 30 < x < 100 and code_pattern.fullmatch(code)]
        for y, code in anchors:
            cells = {}
            for column, ((left, right), _, _) in CI_COLUMNS.items():
                candidates = [value for x, top, width, value in words
                              if left < x + width / 2 < right and abs(top - y) < 1.0
                              and number.fullmatch(value)]
                assert len(candidates) <= 1, (page, code, column, candidates)
                if candidates:
                    cells[column] = candidates[0]
            assert all(cells[column] == value for column, value in expected_levies.items())
            assert Decimal(cells["DD"]) in {0, 5, 10, 20, 35}
            reference = {
                "code": code,
                "reference": f"Côte d’Ivoire Customs SYDAM World TEC, PDF page {page}",
                "url": CI_PDF + f"#page={page}",
            }
            duty_lines.append({**reference, "rates": [rate(
                "customs_duty", "CET customs duty (DD)", percent(cells["DD"]),
                "Published ordinary tariff. Confirm the applicable origin preference, national relief, and subsequent amendments.",
            )]})
            measure_lines.append({**reference, "rates": [
                rate(CI_COLUMNS[column][1], CI_COLUMNS[column][2], percent(value),
                     "Published import tax or levy column. Check the shipment regime, tax base, exemptions, and subsequent amendments.")
                for column, value in cells.items() if column != "DD"
            ]})
    assert len(duty_lines) == len({line["code"] for line in duty_lines}) == 6381
    assert sum(any(entry["charge"] == "import_vat" for entry in line["rates"])
               for line in measure_lines) == 6320
    base = ("CI", ["CI"], "SYDAM World TEC CEDEAO HS2022, 27 March 2026 edition",
            "2026-03-27", CHECKED, "Direction générale des douanes de Côte d’Ivoire",
            CI_PAGE, [(pdf, CI_PDF)],
            "Statutory data and numerical facts extracted from the official tariff schedule. Law 2016-555 Article 10.",
            CI_LAW)
    return [
        write(out, metadata("ci-cet-sydam-2026-03", *base, [
            "Latest edition listed on Côte d’Ivoire Customs' TEC page on the check date. Confirm any national measures effective after the edition date.",
            "Ordinary CET rates from the DD column. Preferences and conditional additional duties require separate verification.",
        ]), duty_lines),
        write(out, metadata("ci-sydam-import-taxes-2026-03", *base, [
            "Selected printed TVA, PCC, PCS, PUA and RST columns. The 61 blank VAT cells remain unreported.",
            "Each percentage is a separate published reference. Applicability, exemptions and assessment base depend on the transaction.",
        ], measures=True), measure_lines),
    ]


MU_PAGE = "https://mra.mu/index.php/customs1/tariff-information"
MU_PDF = "https://www.mra.mu/download/TariffInf011026.pdf"
MU_LAW = "https://www.wipo.int/wipolex/en/legislation/details/15447"
MU_PREFS = {
    3: ("COMESA Group I", None),
    4: ("COMESA Group II", None),
    5: ("SADC", None),
    6: ("IOC", None),
    7: ("India CECPA", "IN"),
    8: ("Pakistan PTA", "PK"),
    9: ("EC EPA", None),
    10: ("Türkiye FTA", "TR"),
    11: ("UK EPA", "GB"),
    12: ("China FTA", "CN"),
    13: ("AfCFTA", None),
    14: ("UAE CEPA", "AE"),
}


def mauritius(raw, out):
    import fitz

    pdf = raw / "mu-tariff-www.pdf"
    document = fitz.open(pdf)
    assert len(document) == 810 and "01 October 2026" in document[0].get_text()
    code_pattern = re.compile(r"[0-9]{4}\.[0-9]{2}\.[0-9]{2}")
    numeric = re.compile(r"[0-9]+(?:[,.][0-9]+)?")
    general_heading = re.compile(r"Gen(?:e(?:r(?:a(?:l)?)?)?)?")
    duties, measures = [], []
    for page in document:
        words = page.get_text("words", sort=True)
        anchors = [word for word in words
                   if word[0] < 155 and code_pattern.fullmatch(word[4])]
        if not anchors:
            continue
        header = next((word for word in words
                       if word[4] == "Excise" and word[0] > 180
                       and any(abs(word[1] - other[1]) < 1
                               and general_heading.fullmatch(other[4])
                               and word[0] - 95 < other[0] < word[0] for other in words)), None)
        if not header:
            continue
        verticals = [
            (round(a.x, 2), round(min(a.y, b.y), 2), round(max(a.y, b.y), 2))
            for path in page.get_drawings() for op, a, b, *_ in path["items"]
            if op == "l" and a.x == b.x and abs(a.y - b.y) > 4
        ]
        for anchor in anchors:
            center_y = (anchor[1] + anchor[3]) / 2
            center_x = (anchor[0] + anchor[2]) / 2
            if center_y <= header[1]:
                continue
            grid = sorted({(x, top, bottom) for x, top, bottom in verticals
                           if top < center_y < bottom})
            boundaries = sorted({x for x, _, _ in grid})
            code_column = bisect_right(boundaries, center_x) - 1
            general_column = code_column + 3
            if code_column not in (0, 1) or len(boundaries) < 19 or general_column + 15 >= len(boundaries):
                continue
            top, bottom = next((top, bottom) for x, top, bottom in grid
                               if x == boundaries[general_column])
            raw_cells = defaultdict(list)
            for x0, y0, x1, y1, value, *_ in words:
                x, y = (x0 + x1) / 2, (y0 + y1) / 2
                if top - 0.15 < y < bottom + 0.15:
                    col = bisect_right(boundaries, x) - 1 - general_column
                    raw_cells[col].append(value)
            cells = {col: " ".join(items) for col, items in raw_cells.items()}
            general = cells.get(0, "")
            if not numeric.fullmatch(general):
                continue
            assert cells[-3].split()[0] == anchor[4], (page.number + 1, cells)
            code = anchor[4].replace(".", "")
            unit = cells.get(-1)
            ref = {
                "code": code,
                "reference": f"MRA First Schedule, PDF page {page.number + 1}",
                "url": MU_PDF + f"#page={page.number + 1}",
                **({"units": [unit]} if unit else {}),
            }
            base = [rate("customs_duty", "General customs duty", percent(general))]
            for index, (label, origin) in MU_PREFS.items():
                value = cells.get(index)
                # The source also shows tariff-rate quotas and other qualified values.
                # Leave those cells to their legal source rather than guessing an expression.
                if value and numeric.fullmatch(value):
                    base.append({
                        **rate("customs_duty", label, percent(value),
                               "Published preferential tariff. Verify origin evidence, applicable schedule notes, and any quota."),
                        "treatment": "preferential",
                        **({"originCountries": [origin]} if origin else {}),
                    })
            duties.append({**ref, "rates": base})
            tax = []
            for index, label, charge in [(1, "Excise duty", "excise"), (2, "Import VAT", "import_vat")]:
                value = cells.get(index)
                if not value:
                    continue
                if re.sub(r"\s+", "", value) == "EXM":
                    value = "EXM (exempt)"
                elif numeric.fullmatch(value):
                    value = percent(value)
                tax.append(rate(charge, label, value,
                                "Published product rate or exemption. Check the relevant regime, assessment base, and latest legislation."))
            if tax:
                measures.append({**ref, "rates": tax})

    assert len(duties) == len({row["code"] for row in duties}) == 6350
    assert sum(any(r["charge"] == "import_vat" for r in row["rates"]) for row in measures) == 6305
    common = ("MU", ["MU"], "MRA Integrated Customs Tariff, HS2022, 1 October 2026",
              "2026-10-01", CHECKED, "Mauritius Revenue Authority Customs Department",
              MU_PAGE, [(pdf, MU_PDF)],
              "Numerical facts and statutory provisions extracted from the official schedule. Copyright Act 2014 Section 5.",
              MU_LAW)
    return [
        write(out, metadata("mu-mra-integrated-tariff-2026-10", *common, [
            "Latest MRA edition listed on the check date. Confirm subsequent amendments, exceptions and the legal texts for a shipment.",
            "Eight-digit schedule rows with confidently parsed general rates. The pack excludes cross-reference text, unresolved table cells, and non-numeric preferential cells.",
            "Preferential columns with no single-country filter are regional agreement references. Verify origin eligibility under the applicable agreement.",
        ]), duties),
        write(out, metadata("mu-mra-import-taxes-2026-10", *common, [
            "Published VAT and excise columns for the parsed tariff lines. Blank cells remain unreported. EXM records an explicit exemption marker.",
            "Specific-rate formulas are retained as printed. Asterisk references and eligibility must be checked in the cited schedule.",
        ], measures=True), measures),
    ]


BJ_PAGE = "https://douanes.gouv.bj/tarif-douane/"
BJ_PDF = "https://douanes.gouv.bj/wp-content/uploads/2024/11/BJ-Tarif-Douanier-SH2022-a-jour_2.0.pdf"
BJ_LAW = "https://www.wipo.int/wipolex/fr/legislation/details/7585"


def benin(raw, out):
    pdf = raw / "bj-tec.pdf"
    code_pattern = re.compile(r"[0-9]{4}(?:\.[0-9]{2}){3}")
    duty_lines, measure_lines = [], []
    for page, words in positioned_words(pdf).items():
        for x, y, _, printed_code in words:
            if not 60 < x < 170 or not code_pattern.fullmatch(printed_code):
                continue
            ref = {
                "code": printed_code.replace(".", ""),
                "reference": f"Benin Customs HS2022 tariff, PDF page {page}",
                "url": BJ_PDF + f"#page={page}",
            }
            for left, right, charge, label, allowed, lines in [
                (715, 745, "customs_duty", "CET customs duty (DD)", {0, 5, 10, 20, 35}, duty_lines),
                (753, 779, "levy", "Statistical charge (RS)", {1}, measure_lines),
            ]:
                values = [value for col, top, width, value in words
                          if left < col + width / 2 < right and abs(top - y) < 1.1
                          and value.isascii() and value.isdigit()]
                assert len(values) <= 1, (page, printed_code, charge, values)
                assert all(int(value) in allowed for value in values)
                if not values and charge == "levy":
                    continue
                lines.append({**ref, "rates": [rate(
                    charge, label, percent(value),
                    "Published baseline. Check the applicable regime, origin preference, exemptions, and subsequent amendments.",
                ) for value in values]})
    assert len(duty_lines) == len({row["code"] for row in duty_lines}) == 6381
    assert sum(bool(row["rates"]) for row in duty_lines) == 5738
    assert len(measure_lines) == 6378
    base = ("BJ", ["BJ"], "Benin Customs tariff SH2022, 2.0 edition",
            "2025-06-02", CHECKED, "Direction générale des douanes du Bénin",
            BJ_PAGE, [(pdf, BJ_PDF)],
            "Factual numerical data extracted from the published customs schedule. Law 2005-30 Article 9.", BJ_LAW)
    return [
        write(out, metadata("bj-customs-tariff-hs2022-v2", *base, [
            "Official published baseline. Verify subsequent legal amendments and transaction-specific measures.",
            "643 tariff lines have no unambiguously aligned numeric DD cell in the source extraction. Those duty rates remain unreported.",
        ]), duty_lines),
        write(out, metadata("bj-customs-statistical-levy-hs2022-v2", *base, [
            "The printed RS column supplies the statistical levy. Three unaligned cells remain unreported.",
            "This schedule does not supply product VAT or other national measures.",
        ], measures=True), measure_lines),
    ]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("raw", type=Path)
    parser.add_argument("out", type=Path)
    builders = {"ci": ivoire, "mu": mauritius, "bj": benin}
    parser.add_argument("--only", nargs="+", choices=builders, default=list(builders))
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    snapshots = []
    for kind in args.only:
        snapshots.extend(builders[kind](args.raw, args.out))
    (args.out / "manifest.json").write_text(
        json.dumps({"version": 1, "snapshots": snapshots}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    for snapshot in snapshots:
        print(snapshot["id"], snapshot["statistics"]["lines"], snapshot["statistics"]["rates"])


if __name__ == "__main__":
    main()
