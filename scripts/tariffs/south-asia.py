#!/usr/bin/env python3
"""Normalize factual rates from verified South Asian national tariff publications."""
import argparse
import json
from pathlib import Path
import re
import subprocess
from xml.etree import ElementTree

from rebuild import CHECKED, digest, line, rate, schedule, write_pack


PK_INDEX = "https://www.fbr.gov.pk/categ/laws/144"
PK_PDF = "https://download1.fbr.gov.pk/Docs/20268251181330180Tariff-2026-27.pdf"
PK_TERMS = "https://pakistancode.gov.pk/pdffiles/administrator5d255d1f44b50b65d6a3e87a2e0d3fee.pdf"
PK_CODE = re.compile(r"\d{4}\.\d{4}")
PK_AD_VALOREM = {"0", "5", "10", "15", "20", "25", "30", "35", "40", "45", "50", "90"}
PK_SPECIFIC = re.compile(r"Rs\.(\d+)/(MT|Kg|set)")

PK_SRO_INDEX = "https://www.fbr.gov.pk/Activesrosimport"
PK_ACD_PDF = "https://download1.fbr.gov.pk/SROs/20266301763307131063-2026.pdf"
PK_ACD_HASH = "876f4f885f127b62a10f8a757b5a9383042ab22436d74823c2e5257b8fd3e3ed"

# PCT numbers verified against the two signed pages of S.R.O. 1063(I)/2026.
PK_ACD_FOUR = """
01031000 01039100 01039200 02031100 02031200 02031900
02032100 02032200 02032900 02063000 02064100 02064900
02091000 02099000 02101100 02101200 02101900 05021000
15011000 15012000 15030010 16024100 16024200 16024900 41132000
27079990 27101919 27101942 27101949 27101951 27101952
27101953 27101992 27101994 27109100 27139020
""".split()
PK_ACD_TWO_NAMED = """
12019000 27075000 27101290 27101941 27101999 27109900
27129010 27129090 27139090 28151100 28363000 34023900
39011000 39012000 39013000 39014000 39019000 39021000
39022000 39023000 39029000 39151000 39152000 39153000
39159000 39162000 39169000 39172390 39172900 39173100
39173990 39174000 39181000 39203000 39204300 39204910
39205900 39206100 39206390 39207900 39209400 39209900
39233010 39235000 39252000 39253000 39259000 39269099
48101310 48101320 48101390 48101400 48101910 48101990
48102200 48102900 48103100 48103200 48103900 53110000
55012000 55014000 55019000 55032010 55032020 55032090
55034000 55039000 55062000 55069000 68053000 69022010
73121020 76109000 84135000 84198990 84199090 84219990
84484210 84834090 84836099 84839090 85015230 85015290
85042100 85042300 85043300 85043400 85241100 85322900
85353010 85354010 85362090 85369090 85372000 85469000 96200000
""".split()
PK_ACD_SIX = """
22030000 22041000 22042100 22042200 22042900 22043000
22051000 22059000 22060000 22071000 22082000 22083000
22084000 22085000 22086000 22087000 22089000
""".split()
PK_ACD_TWO_EXCEPTIONS = """
15071000 15079000 15111000 15119010 15119020 15119030
15121100 15121900 15122100 15122900 15141100 15141900 15149100 15149900
""".split()
PK_ACD_EXEMPT = "87038030 87116040 87116060".split()


def bbox_pages(path):
    document = subprocess.check_output(["pdftotext", "-bbox-layout", str(path), "-"])
    return ElementTree.fromstring(document).findall(".//{*}page")


def words(page):
    return [(float(word.get("xMin")), float(word.get("yMin")), word.text or "")
            for word in page.findall(".//{*}word")]


def pakistan(raw):
    path = raw / "pk-2026-27.pdf"
    pages = bbox_pages(path)
    assert len(pages) == 345 and "2026-27" in " ".join(pages[0].itertext())
    entries = {}
    for page_number, page in enumerate(pages, 1):
        positioned_words = words(page)
        duty_column = [(x, y, value) for x, y, value in positioned_words if 395 <= x <= 450]
        for x, y, printed_code in positioned_words:
            if abs(x - 52.8) > 0.01 or PK_CODE.fullmatch(printed_code) is None:
                continue
            cell = "".join(value for _, value in sorted(
                (rate_x, value) for rate_x, rate_y, value in duty_column if abs(rate_y - y) < 1.5))
            specific = PK_SPECIFIC.fullmatch(cell)
            if cell in PK_AD_VALOREM:
                expression = cell + "%"
            elif specific:
                expression = f"Rs. {specific[1]}/{specific[2]}"
            elif cell == "Rs.5per" and printed_code in {"3706.1000", "3706.9000"}:
                assert any(value == "meter" and 395 <= rate_x <= 450 and 10 < rate_y - y < 14
                           for rate_x, rate_y, value in positioned_words)
                expression = "Rs. 5 per meter"
            else:
                raise ValueError(f"Unverified rate cell on page {page_number}, PCT {printed_code}: {cell!r}")
            code = printed_code.replace(".", "")
            assert code not in entries, code
            entries[code] = line(code, f"First Schedule, PCT {printed_code}, PDF page {page_number}",
                                 [rate("general", "First Schedule customs duty", expression)],
                                 url=f"{PK_PDF}#page={page_number}")
    assert len(entries) == 7605
    for code, expression in {"09012100": "10%", "15111000": "Rs. 8000/MT", "37061000": "Rs. 5 per meter",
                             "85171390": "Rs. 250/set", "97069000": "0%"}.items():
        assert entries[code]["rates"][0]["expression"] == expression, code
    return schedule(
        "pk-fbr-first-schedule-fy-2026-27", "PK", ["PK"], "Pakistan Customs Tariff FY 2026–27", CHECKED,
        "national_schedule", "Federal Board of Revenue, Government of Pakistan", PK_INDEX,
        "Extracted statutory tariff facts. Copyright Ordinance 1962 section 57(1)(q)(i) addresses publication of official Gazette material.",
        PK_TERMS, [{"name": path.name, "sha256": digest(path), "url": PK_PDF}], [
            "First Schedule customs duty for the FY 2026–27 edition observed on the snapshot date. Includes printed specific rates in Pakistani rupees.",
            "Conditional provisions, concessions, preferential treatment, customs valuation, sales tax, additional customs duty and regulatory duty require separate sources.",
            "Special conditional headings printed with only four digits require the original schedule.",
        ],
    ), list(entries.values())


def additional_duty(raw):
    sro = raw / "pk-sro-1063.pdf"
    assert digest(sro) == PK_ACD_HASH
    base, first_schedule = pakistan(raw)
    known = {entry["code"] for entry in first_schedule}
    explicit = {}
    for codes, expression, clause, page in (
        (PK_ACD_FOUR, "4%", "1(i)(a)", 1),
        (PK_ACD_TWO_NAMED, "2%", "1(i)(b)", 1),
        (PK_ACD_SIX, "6%", "1(ii)(a)", 2),
        (PK_ACD_TWO_EXCEPTIONS, "2%", "1(ii)(b)(i)", 2),
        (PK_ACD_EXEMPT, "Exempt", "3(xi)", 2),
    ):
        assert len(codes) == len(set(codes)) and not (explicit.keys() & set(codes))
        assert set(codes) <= known, set(codes) - known
        explicit.update({code: (expression, clause, page) for code in codes})
    entries = {}
    for item in first_schedule:
        code = item["code"]
        duty = item["rates"][0]["expression"]
        if code in explicit:
            expression, clause, page = explicit[code]
        elif code.startswith("87"):
            continue
        elif duty == "20%":
            expression, clause, page = "2%", "1(i)(a)", 1
        elif duty.startswith("Rs.") or (duty.endswith("%") and int(duty[:-1]) >= 25):
            expression, clause, page = "4%", "1(ii)", 1
        else:
            continue
        condition = "Check the exemptions in paragraph 3 and any import-specific provisions under paragraph 1 before applying the rate."
        if clause == "3(xi)":
            condition = "Exemption for this PCT code under paragraph 3(xi)."
        entries[code] = line(
            code, f"S.R.O. 1063(I)/2026, paragraph {clause}, PCT {code}, PDF page {page}",
            [rate("general", "Additional customs duty", expression, charge="additional_duty", condition=condition)],
            url=f"{PK_ACD_PDF}#page={page}",
        )
    assert len(entries) >= 2200, len(entries)
    assert entries["01031000"]["rates"][0]["expression"] == "4%"
    assert entries["15111000"]["rates"][0]["expression"] == "2%"
    assert entries["22030000"]["rates"][0]["expression"] == "6%"
    assert entries["87038030"]["rates"][0]["expression"] == "Exempt"
    source = schedule(
        "pk-fbr-additional-duty-sro-1063-2026", "PK", ["PK"], "Additional Customs Duty S.R.O. 1063(I)/2026",
        CHECKED, "national_schedule", "Federal Board of Revenue, Government of Pakistan", PK_SRO_INDEX,
        "Factual rates and conditions from a statutory notification. Copyright Ordinance 1962 section 57(1)(q)(i).",
        PK_TERMS, [*base["inputFiles"], {"name": sro.name, "sha256": digest(sro), "url": PK_ACD_PDF}], [
            "Published additional duty rates from paragraphs 1(i) and 1(ii), checked against the FY 2026–27 First Schedule. S.R.O. 1063(I)/2026 took effect 1 July 2026.",
            "The code-linked results require paragraph 3 exemption and paragraph 1 import-condition checks. Other Chapter 87 vehicle rates require CKD or CBU, engine capacity and other facts.",
            "Regulatory duty under S.R.O. 1064(I)/2026 and other vehicle regulatory duty require separate review.",
        ],
    )
    return {**source, "role": "measures"}, list(entries.values())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("raw", type=Path)
    parser.add_argument("out", type=Path)
    parser.add_argument("--only", choices=("first-schedule", "additional-duty"), default="first-schedule")
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    builder = pakistan if args.only == "first-schedule" else additional_duty
    items = [write_pack(args.out, *builder(args.raw))]
    (args.out / "manifest.json").write_text(json.dumps({"version": 1, "snapshots": items},
                                                      ensure_ascii=False, indent=2) + "\n")
    for item in items:
        print(item["id"], item["statistics"]["lines"], item["statistics"]["rates"])


if __name__ == "__main__":
    main()
