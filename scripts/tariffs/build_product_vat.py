"""Build official product VAT snapshots from pinned VAT schedules and HMRC API responses."""
import argparse
from collections import defaultdict
import gzip
import hashlib
import json
from pathlib import Path
import re
import subprocess

from fetch_gb_headings import DATE, HEADINGS, source_url

PL_ACT = "https://eli.gov.pl/eli/DU/2026/1263/ogl"
PL_PDF = "https://api.sejm.gov.pl/eli/acts/DU/2026/1263/text.pdf"
PL_1446 = "https://eli.gov.pl/api/acts/DU/2026/1446/text.pdf"
PL_TERMS = "https://eli.gov.pl/eli/DU/2025/24/ogl"
PL_RATES = "https://podatki.gov.pl/en/information-for-entrepreneurs/value-added-tax/general-vat-rules-and-rates"
SK_ACT = "https://static.slov-lex.sk/static/SK/ZZ/2004/222/20260101.print.html"
SK_PDF = "https://static.slov-lex.sk/pdf/prilohy/SK/ZZ/2004/222/20260101_5815198-2.pdf"
SK_TERMS = "https://static.slov-lex.sk/static/SK/ZZ/2015/185/20260901.print.html"
GB_SOURCE = "https://www.api.gov.uk/hmrc/gov-uk-trade-tariff-api/"
GB_TERMS = "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/"

def compact(value):
    return " ".join(value.split())

def pdf_text(path):
    return subprocess.check_output(["pdftotext", "-layout", path, "-"], text=True)

def file_source(path, url):
    return {"name": path.name, "url": url, "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}

def source(snapshot_id, country, edition, start, authority, url, terms, terms_url, files, notes, scope="national_schedule"):
    return {
        "id": snapshot_id, "jurisdiction": country, "countries": [country], "zone": "standard",
        "edition": edition, "hsEdition": "HS 2022", "availableFrom": start, "availableThrough": DATE,
        "checkedOn": DATE, "scope": scope, "role": "measures", "authority": authority,
        "sourceUrl": url, "terms": terms, "termsUrl": terms_url, "inputFiles": files, "limitations": notes,
    }

def vat(rate, label, condition):
    return {"charge": "import_vat", "treatment": "general", "label": label,
            "expression": rate, "condition": condition}

def statutory_line(code, label, rate, description, url, condition):
    return {"code": code, "matchPrefix": True, "reference": label, "url": url,
            "rates": [vat(rate, label, condition + " " + compact(description))]}

PL_ROW = re.compile(r"^\s*(\d{1,2}[a-c]?) {2,}(.+)")
PL_CODE = re.compile(r"^((?:ex )?\d{2,4}(?: \d{2}){0,2}) {2,}(\S.*)")
PL_CHILD = re.compile(r"^\s*\d\)\s+(?:ex )?(\d{4}(?: \d{2}){0,2})\b[ –]+(.*)")
PL_NESTED = {(3, "7"), (3, "17"), (10, "19")}
PL_EXPLICIT = {
    (3, "1"): ["0904", "0905", "0906", "0907", "0908", "0909", "0910"],
    (3, "2"): ["1701", "1702", "1703"],
    (3, "8"): ["0601", "0602", "0603"],
    (10, "2"): ["0301", "0302", "0303", "0304", "0305", "0309"],
}

def pl_items(body):
    items = []
    current = None
    for line in body.splitlines():
        if re.search(r"PKWiU\s+Usługi \(grupa usług\)", line):
            break
        if line.startswith("Dziennik Ustaw") or re.match(r"^\d+\)", line) or not line.strip():
            continue
        match = PL_ROW.match(line)
        if match:
            number, rest = match.groups()
            found = PL_CODE.match(rest)
            current = [number, [], []]
            if found:
                current[1].append(found[1])
                current[2].append(found[2])
                items.append(current)
            continue
        if current and current[1]:
            if match := re.fullmatch(r"\s*(ex \d{4}(?: \d{2}){1,2})\s*", line):
                current[1].append(match[1])
            else:
                current[2].append(line.strip())
    return items

def poland(raw):
    path = raw / "pl-vat-2026-sejm.pdf"
    amendment = raw / "pl-1446.pdf"
    rates_path = raw / "pl-vat-rates.html"
    document = pdf_text(path)
    assert "Art. 146ef." in document
    assert "tytule załącznika nr 3 do ustawy, wynosi 8 %;" in document
    assert "załącznik nr 3" not in pdf_text(amendment).lower()
    files = [file_source(path, PL_PDF), file_source(amendment, PL_1446)]
    if rates_path.exists():
        files.append(file_source(rates_path, PL_RATES))
    lines = []
    for annex, rate in [(3, "8%"), (10, "5%")]:
        body = re.search(rf"^\s*Załącznik nr {annex}\s*$([\s\S]*?)^\s*Załącznik nr {annex + 1}\s*$",
                         document, re.MULTILINE)
        assert body, annex
        for number, code_cells, description_rows in pl_items(body[1]):
            key = (annex, number)
            description = " ".join(description_rows)
            codes = [value.removeprefix("ex ").replace(" ", "") for value in code_cells]
            if key in PL_NESTED:
                codes = [match[1].replace(" ", "") for row in description_rows
                         if (match := PL_CHILD.match(row))]
                assert len(codes) in {2, 6}, (key, codes)
            elif key in PL_EXPLICIT:
                codes = PL_EXPLICIT[key]
            for code in codes:
                label = f"Poland VAT Act Annex {annex}, item {number}, CN {code}"
                lines.append(statutory_line(code, label, rate, description, PL_ACT,
                             "Apply only to the statutory goods and conditions in this entry. Check any import exemption or special scheme."))
    assert len(lines) == 60, (len(lines), [(l["code"], l["reference"]) for l in lines])
    return source("pl-vat-annexes-2026-11", "PL", "VAT Act 2026 consolidated text, Annexes 3 and 10",
                  DATE, "Sejm of the Republic of Poland / Ministry of Finance", PL_ACT,
                  "Legislative acts and official materials are excluded from copyright under Article 4 of the Polish Copyright Act.",
                  PL_TERMS, files,
                  ["Selected goods indexed by statutory CN references. Entries defined independently of CN and service codes are excluded.",
                   "Annex 3 uses the effective 8% rate under Article 146ef rather than the 7% in its heading.",
                   "CN entries preceded by ex apply to only part of the code. Read the original statutory description and exceptions."]), lines

SK_ROW = re.compile(r"^\s*(?:(?P<group>[123])\. +)?(?P<code>(?:ex )?\d{1,4}(?: \d{2}){0,2}) {2,}(?P<description>\S.*)$")

def slovakia(raw):
    path = raw / "sk-annex7-2026.pdf"
    act = raw / "sk-vat-2026.html"
    document = pdf_text(path)
    assert "ZOZNAM TOVAROV SO ZNÍŽENOU SADZBOU DANE" in document
    assert "19 %" in act.read_text() and "68cb" in act.read_text()
    doc, endnote = document.split("\n1\n", 1)
    assert "Nariadenie Rady" in endnote
    rows = []
    current = None
    group = 0
    split_description = ""
    for line in doc.splitlines():
        if re.match(r"^1\. +ex 2, ex 4, ex 7, ex 8, ex\s+", line):
            group = 1
            current = (group, [f"{chapter:02}" for chapter in (2, 4, 7, 8, 9, 10, 11, 12, 13, 15, 16)],
                       [re.split(r" {2,}", line, maxsplit=2)[2]])
            rows.append(current)
            continue
        if not group or not line.strip():
            continue
        if current and len(current[1]) > 1 and re.match(r"^\s*(?:9, ex 10|ex 13, ex 15)", line):
            current[2].append(re.split(r" {2,}", line.strip(), maxsplit=1)[1])
            continue
        if line.lstrip().startswith("Kakao a prípravky z kakaa"):
            split_description = line.strip()
            continue
        match = SK_ROW.match(line)
        if match:
            if match["group"]:
                group = int(match["group"])
            code = match["code"].removeprefix("ex ").replace(" ", "").zfill(2)
            descriptions = [split_description, match["description"]] if split_description else [match["description"]]
            split_description = ""
            current = (group, [code], descriptions)
            rows.append(current)
        elif current:
            current[2].append(line.strip())
    assert not split_description
    lines = []
    for group, codes, description in rows:
        for code in codes:
            rate = "19%" if group == 1 else "5%"
            label = f"Slovakia VAT Act §27, Annex 7 point {group}, CN {code}"
            lines.append(statutory_line(code, label, rate, " ".join(description), SK_PDF,
                         "Applies only to the goods described by Annex 7. Excludes import VAT accounted for under §68cb."))
    assert len(lines) == 91, (len(lines), [(l["code"], l["reference"]) for l in lines])
    return source("sk-vat-annex7-2026", "SK", "Act 222/2004, consolidated 2026 Annex 7",
                  "2026-01-01", "Ministry of Justice of the Slovak Republic / Slov-Lex", SK_ACT,
                  "Legislative text is excluded from copyright under §5(b) of Slovak Copyright Act 185/2015.",
                  SK_TERMS, [file_source(path, SK_PDF), file_source(act, SK_ACT)],
                  ["Selected reduced import VAT provisions under §27 and Annex 7.",
                   "19% and 5% candidates can both match the same CN prefix. Point 1 excludes goods qualifying under point 2 where stated. Apply the published text to resolve eligibility.",
                   "Entries marked ex cover only part of the listed nomenclature code. Special arrangement §68cb is excluded."]), lines

def uk(raw):
    rates_by_code = defaultdict(dict)
    files = []
    for heading in HEADINGS:
        path = raw / f"gb-heading-{heading}-{DATE}.json"
        if not path.exists():
            continue
        doc = json.loads(path.read_bytes())
        assert doc["data"]["attributes"]["goods_nomenclature_item_id"] == heading + "000000"
        files.append(file_source(path, source_url(heading)))
        entities = {(e["type"], e["id"]): e for e in doc["included"]}
        for entity in entities.values():
            if entity["type"] != "commodity" or not entity["attributes"]["declarable"]:
                continue
            code = entity["attributes"]["goods_nomenclature_item_id"]
            assert re.fullmatch(r"\d{10}", code)
            for link in entity["relationships"]["overview_measures"]["data"]:
                m = entities[link["type"], link["id"]]
                if not m["attributes"].get("vat"):
                    continue
                relations = m["relationships"]
                assert relations["measure_type"]["data"]["id"] == "305"
                expression_link = relations["duty_expression"]["data"]
                expression = entities[expression_link["type"], expression_link["id"]]["attributes"]["verbose_duty"]
                assert re.fullmatch(r"\d+(?:\.\d+)?%", expression)
                additional = relations.get("additional_code", {}).get("data")
                category = "standard VAT"
                if additional:
                    attrs = entities[additional["type"], additional["id"]]["attributes"]
                    category = f'{attrs["description"]} ({attrs["code"]})'
                label = f"HMRC measure 305, {category}"
                condition = "Check the dated commodity detail for product conditions, applicable additional codes, reliefs and import context. The heading API provides overview rates."
                rates_by_code[code][(label, expression)] = vat(expression, label, condition)
    lines = [{"code": code, "reference": f"HMRC commodity {code} overview VAT measure 305",
              "url": f"https://www.trade-tariff.service.gov.uk/uk/api/commodities/{code}?as_of={DATE}",
              "rates": list(rates.values())} for code, rates in sorted(rates_by_code.items())]
    assert len(files) == len(HEADINGS) and len(lines) > 4000
    return source("gb-hmrc-vat-2026-11-11", "GB", f"HMRC heading VAT overview for {len(files)} selected headings",
                  DATE, "HM Revenue & Customs / UK Integrated Online Tariff", GB_SOURCE,
                  "Contains public sector information licensed under the Open Government Licence v3.0.",
                  GB_TERMS, files,
                  ["Great Britain only. Selected heading responses, declarable 10-digit commodity codes and VAT measure type 305.",
                   "The heading API includes overview rate and VAT additional-code information. Consult commodity detail and legislation for conditions and reliefs.",
                   "Several rates may be returned for one code when product details determine eligibility.",
                   "Dated observation only. Unindexed codes and dates require a fresh authoritative lookup."],
                  scope="published_baseline"), lines

def save(out, metadata, lines):
    snapshot_id = metadata["id"]
    lines.sort(key=lambda l: (l["code"], l["reference"]))
    data = gzip.compress(json.dumps({"id": snapshot_id, "lines": lines}, ensure_ascii=False,
                                   separators=(",", ":")).encode(), mtime=0)
    name = f"{snapshot_id}.json.gz"
    (out / name).write_bytes(data)
    counts = {"lines": len(lines), "uniqueCodes": len({l["code"] for l in lines}),
              "codesWithRates": len({l["code"] for l in lines if l["rates"]}),
              "rates": sum(len(l["rates"]) for l in lines),
              "chapters": sorted({l["code"][:2] for l in lines}), "charges": ["import_vat"]}
    snapshot = metadata | {"file": name, "sha256": hashlib.sha256(data).hexdigest(), "statistics": counts}
    print(snapshot_id, counts)
    return snapshot

def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("raw", type=Path)
    cli.add_argument("output", type=Path)
    cli.add_argument("--countries", nargs="+", choices=("PL", "SK", "GB"), default=("PL", "SK", "GB"))
    args = cli.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    builders = {"PL": poland, "SK": slovakia, "GB": uk}
    manifest = {"version": 1, "snapshots": [save(args.output, *builders[c](args.raw)) for c in args.countries]}
    (args.output / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")

if __name__ == "__main__":
    main()
