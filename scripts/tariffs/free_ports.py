#!/usr/bin/env python3
"""Pair official HK/Macao commodity codes with the respective general free-port duty rules."""
import argparse
import json
from pathlib import Path
import re
import subprocess
from xml.etree import ElementTree

from rebuild import digest, line, rate, schedule, write_pack


HK_CLASSIFICATION = "https://www.censtatd.gov.hk/en/page_1364.html"
HK_WORKBOOK = "https://www.censtatd.gov.hk/en/data/stat_report/product/B2XX0023/att/B2XX00232026XXXXB0100.xlsx"
HK_POLICY = "https://www.customs.gov.hk/en/service-enforcement-information/cargo-clearance/"
HK_TERMS = "https://www.censtatd.gov.hk/en/page_31.html"
MO_PDF = "https://www.dsec.gov.mo/getdoc/cdc315c4-da4f-4db4-b087-852a3ceb4617/HS2020.aspx"
MO_POLICY = "https://www.ipim.gov.mo/en/invest-here/foreign-trade"
MO_TERMS = "https://www.dsec.gov.mo/getdoc/cdc315c4-da4f-4db4-b087-852a3ceb4617/HS2020.aspx#page=2"


def source_file(path, url):
    return {"name": path.name, "url": url, "sha256": digest(path)}


def hong_kong(raw):
    from openpyxl import load_workbook

    file = raw / "hk-hs2026.xlsx"
    policy = raw / "hk-customs.html"
    assert "does not levy any Customs tariff" in policy.read_text()
    with file.open("rb") as handle:
        workbook = load_workbook(handle, read_only=True, data_only=True)
        sheet = workbook["HsItem"]
        codes = [
            row[0] for row in sheet.iter_rows(values_only=True)
            if isinstance(row[0], str) and re.fullmatch(r"\d{8}", row[0])
        ]
        workbook.close()
    assert len(codes) == len(set(codes)) == 7822
    assert codes == sorted(codes) and codes[0] == "01012100" and codes[-1] == "98010020"
    duty = rate("general", "Free-port general customs duty", "0%")
    return schedule(
        "hk-free-port-hkhs-2026", "HK", ["HK"], "2026 HKHS / free-port duty",
        "2026-01-01", "published_baseline",
        "Census and Statistics Department and Customs and Excise Department, Hong Kong SAR",
        HK_POLICY,
        "HKHS codes adapted from the Census and Statistics Department website. Intellectual property rights owner: Government of the Hong Kong Special Administrative Region. Veygrit extracted the numeric codes and paired them with the general customs duty rule.",
        HK_TERMS, [source_file(file, HK_WORKBOOK), source_file(policy, HK_POLICY)], [
            "General customs duty only, paired with official 8-digit Hong Kong Harmonized System codes effective 2026-01-01.",
            "Liquor, tobacco, hydrocarbon oil and methyl alcohol may incur separate excise. Check declarations, controlled goods, licensing and fees separately.",
        ],
    ), [line(code, f"2026 HKHS {code}; Hong Kong Customs Cargo Clearance", [duty], url=HK_CLASSIFICATION)
        for code in codes]


def macao_codes(file):
    document = subprocess.check_output(["pdftotext", "-bbox-layout", str(file), "-"])
    pages = ElementTree.fromstring(document).findall(".//{*}page")
    assert len(pages) == 768
    heading = subheading = ""
    entries = {}
    for index, page in enumerate(pages, 1):
        if index < 26 or "NCEM/HS" not in " ".join(page.itertext()):
            continue
        columns = []
        for word in page.findall(".//{*}word"):
            x, y = float(word.get("xMin")), float(word.get("yMin"))
            value = word.text or ""
            if 59 <= x <= 67 and re.fullmatch(r"\d{4}", value):
                column = 0
            elif 80 <= x <= 91 and re.fullmatch(r"\d{2}", value):
                column = 1
            elif 94 <= x <= 103 and re.fullmatch(r"\d{2}", value):
                column = 2
            else:
                continue
            columns.append((round(y), column, value))
        for _, column, value in sorted(columns):
            if column == 0:
                heading, subheading = value, ""
            elif column == 1:
                subheading = value
            else:
                assert heading and subheading
                code = heading + subheading + value
                assert code not in entries and (not entries or code > next(reversed(entries))), code
                entries[code] = index
    assert len(entries) == 6958 and min(entries) == "01012100" and max(entries) == "97069090"
    return entries


def macao(raw):
    file = raw / "macao-ncem.pdf"
    policy = raw / "macao-trade.html"
    assert "No duties are levied on imported goods" in policy.read_text()
    duty = rate(
        "general", "Free-port general customs duty", "0%",
        condition="Ordinary import duty under the free-port rule, subject to exceptions prescribed by law.",
    )
    return schedule(
        "mo-free-port-ncem-hs2022", "MO", ["MO"], "NCEM/HS 7th revision / free-port duty",
        "2022-01-01", "published_baseline",
        "Statistics and Census Service and Commerce and Investment Promotion Institute, Macao SAR",
        MO_POLICY,
        "Numeric NCEM/HS codes extracted from the 7th revision by the Statistics and Census Service, Macao SAR. Reproduction of these data is allowed with source acknowledgement, per the publication. Veygrit paired the extracted codes with the general free-port duty rule.",
        MO_TERMS, [source_file(file, MO_PDF), source_file(policy, MO_POLICY)], [
            "General customs duty reference under Macao Basic Law Article 110. NCEM/HS 7th revision was effective 2022-01-01.",
            "Consumption tax on covered alcohol and tobacco, import licensing, sanitary requirements and restrictions must be checked separately.",
        ],
    ), [line(code, f"NCEM/HS 7th revision, code {code}, page {page}; free-port ordinary duty", [duty],
            url=f"{MO_PDF}#page={page}") for code, page in macao_codes(file).items()]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("raw", type=Path)
    parser.add_argument("out", type=Path)
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    snapshots = [write_pack(args.out, *builder(args.raw)) for builder in (hong_kong, macao)]
    (args.out / "manifest.json").write_text(
        json.dumps({"version": 1, "snapshots": snapshots}, ensure_ascii=False, indent=2) + "\n"
    )


if __name__ == "__main__":
    main()
