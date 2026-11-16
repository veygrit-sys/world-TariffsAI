"""Build Japan import consumption-tax candidates and selected liquor excise rates."""
from argparse import ArgumentParser
from datetime import date
import gzip
import json
from pathlib import Path
import re

from build_tedb_vat import source_file, write_snapshot

CUSTOMS = "https://www.customs.go.jp/"
TARIFF = f"{CUSTOMS}tariff/2026_10_31/index.htm"
FOOD = f"{CUSTOMS}news/news/consumptiontax2019/consumptiontax_annex03.pdf"
GENERAL = f"{CUSTOMS}english/c-answer_e/imtsukan/1111_e.htm"
ALCOHOL = f"{CUSTOMS}english/c-answer_e/kojin/3105_e.htm"
NTA = "https://www.nta.go.jp/taxes/sake/shiori-gaikyo/shiori/2026/pdf/05-1.pdf"
TERMS = f"{CUSTOMS}kyotsu/rules.htm"

# These anchors identify categories that may include food. The declared use controls eligibility.
FOOD_CHAPTERS = frozenset("02 03 04 07 08 09 10 11 16 17 18 19 20 21".split())
FOOD_HEADINGS = frozenset(
    "1201 1202 1204 1205 1206 1207 1208 1212 1302 1501 1502 1503 1504 "
    "1506 1507 1508 1509 1510 1511 1512 1513 1514 1515 1516 1517 "
    "2201 2202 2209 2501".split()
)
SPIRITS_HEADINGS = ("220820", "220830", "220840", "220850", "220860")
WINE_HEADINGS = ("220410", "220421", "220422", "220429")


def rate(kind, label, expression, condition):
    return {
        "charge": kind,
        "treatment": "general",
        "label": label,
        "expression": expression,
        "condition": condition,
    }


def consumption_candidates(code):
    if code.startswith(("030111", "030119")):
        return
    if code[:2] in FOOD_CHAPTERS or code[:4] in FOOD_HEADINGS:
        yield rate(
            "import_vat",
            "Japan reduced import consumption tax",
            "8%",
            "Combined national 6.24% and local 1.76%. Apply when imported and declared for human "
            "food or drink under the food labelling law. Excludes alcoholic liquor, medicines and "
            "non-food use. Combined food/non-food goods need separate value and composition checks.",
        )
        yield rate(
            "import_vat",
            "Japan standard import consumption tax",
            "10%",
            "Combined national 7.8% and local 2.2%. Apply to taxable imports classified here "
            "when reduced treatment does not apply. Check import exemptions, end use and the declaration.",
        )
    elif code.startswith(("2203", *WINE_HEADINGS, "2205", "2206", "2208")):
        yield rate(
            "import_vat",
            "Japan standard consumption tax on alcoholic liquor",
            "10%",
            "Combined national 7.8% and local 2.2%. Apply to taxable alcoholic liquor as defined "
            "by the Liquor Tax Act. Check exemptions, alcoholic content and the declaration.",
        )


def liquor_candidates(code):
    if code == "220300000":
        yield rate("excise", "Japan beer liquor tax", "JPY 155000 per kL",
                   "Apply to beer under Liquor Tax Act Article 23. Beer rate effective 2026-10-01.")
    elif code.startswith(WINE_HEADINGS):
        yield rate("excise", "Japan fruit wine liquor tax", "JPY 100000 per kL",
                   "Apply where classified as fruit wine and not a separate sparkling liquor category. "
                   "Check fortification, added sugars and statutory wine classification.")
        yield rate("excise", "Japan other sparkling liquor tax", "JPY 100000 per kL",
                   "Apply where classified as other sparkling liquor under Liquor Tax Act Article 23. "
                   "Requires effervescence and less than 11% alcohol, excluding beer and happoshu.")
    elif code == "220600210":
        yield rate("excise", "Japan sake liquor tax", "JPY 100000 per kL",
                   "Apply to sake where classified as brewed liquor. Check other sparkling liquor treatment.")
    elif code.startswith(SPIRITS_HEADINGS):
        distillate = "Apply to whisky, brandy or spirits, excluding the other sparkling category. "
        yield rate("excise", "Japan distilled liquor tax", "JPY 370000 per kL",
                   distillate + "Alcohol strength 13% to 37%.")
        yield rate("excise", "Japan distilled liquor tax", "JPY 370000 + JPY 10000 per kL per degree over 37%",
                   distillate + "Alcohol strength above 37%. Verify statutory rounding.")
        yield rate("excise", "Japan low-strength distilled liquor tax", "JPY 100000 per kL",
                   distillate + "Non-sparkling liquor with alcohol strength below 11%.")
        yield rate("excise", "Japan low-strength distilled liquor tax",
                   "JPY 100000 + JPY 10000 per kL per degree over 10%",
                   distillate + "Non-sparkling liquor with alcohol strength at least 11% and below 13%.")
    elif code == "220870000":
        yield rate("excise", "Japan liqueur tax", "JPY 120000 per kL",
                   "Apply to liqueurs with alcohol strength 12% to below 13%, excluding the other sparkling category.")
        yield rate("excise", "Japan liqueur tax", "JPY 120000 + JPY 10000 per kL per degree over 12%",
                   "Apply to liqueurs with alcohol strength at least 13%, excluding the other sparkling category.")
        yield rate("excise", "Japan low-strength liqueur tax", "JPY 100000 per kL",
                   "Apply to non-sparkling liqueurs with alcohol strength below 11%.")
        yield rate("excise", "Japan low-strength liqueur tax", "JPY 100000 + JPY 10000 per kL per degree over 10%",
                   "Apply to non-sparkling liqueurs with alcohol strength at least 11% and below 12%.")


def build(raw, tariff_pack, out, as_of):
    tariff = json.loads(gzip.decompress(tariff_pack.read_bytes()))
    if tariff["id"] != "jp-tariff-2026-10-31":
        raise ValueError("Expected the verified Japan Customs 2026-10-31 nomenclature pack")
    sources = {row["code"]: row for row in tariff["lines"]}
    if not all(re.fullmatch(r"\d{9}", code) for code in sources):
        raise ValueError("Invalid Japan Customs commodity identifier")
    snapshots = []
    for suffix, derive, source_url, files, notes in [
        (
            "consumption", consumption_candidates, FOOD,
            [("jp-import-food.pdf", FOOD), ("jp-rates.html", GENERAL)],
            [
                "Food-related HS anchors are selected from the Japan Customs 2026-10-31 classification. "
                "They are candidate goods categories and do not confer eligibility by HS code alone.",
                "Declared human food or drink use and the national food definition govern the reduced rate. "
                "Alcohol, medicines, exemptions and combination goods require separate checks.",
                "Selected food categories and alcoholic liquor, with no automatic default rate for unlisted codes.",
            ],
        ),
        (
            "liquor-excise", liquor_candidates, NTA,
            [("jp-liquor-2026.pdf", NTA), ("jp-alcohol.html", ALCOHOL)],
            [
                "Selected beer, wine, sake, distilled liquor and liqueur references. "
                "The product must match the domestic liquor classification and strength condition.",
                "The NTA table effective 2026-10-01 supplies the rates and fractional-strength conditions. "
                "Additional beverage categories and special exemptions require separate verification.",
            ],
        ),
    ]:
        lines = []
        for code, row in sources.items():
            rates = list(derive(code))
            if rates:
                lines.append({
                    "code": code,
                    "reference": f"Japan Customs 2026-10-31 {row['reference']}, import {suffix} reference",
                    "url": row["url"],
                    "rates": rates,
                })
        if not lines:
            raise ValueError("No Japanese rates built")
        lines.sort(key=lambda row: row["code"])
        metadata = {
            "id": f"jp-import-{suffix}-2026-11",
            "jurisdiction": "JP",
            "countries": ["JP"],
            "zone": "standard",
            "edition": f"Japan Customs 2026-10-31 HS anchors, verified {as_of}",
            "hsEdition": "HS2022",
            "availableFrom": "2026-10-31",
            "availableThrough": as_of,
            "checkedOn": as_of,
            "scope": "published_baseline",
            "role": "measures",
            "authority": "Japan Customs and National Tax Agency",
            "sourceUrl": source_url,
            "terms": "Japan Customs public data terms PDL1.0. Statutory numerical rates and identifiers adapted from the official sources.",
            "termsUrl": TERMS,
            "inputFiles": [
                source_file(tariff_pack, TARIFF),
                *(source_file(raw / filename, url) for filename, url in files),
            ],
            "limitations": notes,
        }
        snapshot = write_snapshot(out, metadata, lines)
        snapshot["statistics"]["charges"] = sorted({
            item["charge"] for line in lines for item in line["rates"]
        })
        snapshots.append(snapshot)
    (out / "manifest.json").write_text(
        json.dumps({"version": 1, "snapshots": snapshots}, ensure_ascii=False, indent=2) + "\n"
    )
    for snapshot in snapshots:
        print(snapshot["id"], snapshot["statistics"]["lines"], snapshot["statistics"]["rates"])


def main():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("raw", type=Path)
    parser.add_argument("tariff_pack", type=Path)
    parser.add_argument("out", type=Path)
    parser.add_argument("--date", default="2026-11-11", type=lambda value: date.fromisoformat(value).isoformat())
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    build(args.raw, args.tariff_pack, args.out, args.date)


if __name__ == "__main__":
    main()
