#!/usr/bin/env python3
"""Build the WCO membership crosswalk from the cited official PDF snapshots."""

import argparse
import hashlib
import json
import re
import subprocess
from datetime import datetime
from pathlib import Path

WCO_PAGE = "https://www.wcoomd.org/en/about-us/wco-members/membership.aspx"
WCO_PDF = "https://www.wcoomd.org/-/media/wco/public/global/pdf/about-us/wco-members/list-of-members-with-membership-date.pdf?db=web"
MOF_PDF = "https://www.mof.go.jp/policy/customs_tariff/trade/international/wco/members.pdf"
WCO_DIGEST = "307ded4ab503bc2d4ffecbd1e4314bfa664a3dc4d64c5be856af0d5d09a53ac5"
MOF_DIGEST = "82f119e96cde5a7468de1f19b19001de9ea1f2ebf99881ab66231323f517835c"

WCO_ALIASES = {
    "Afghanistan (Islamic Republic of)": "AF",
    "Bolivia": "BO",
    "Cape Verde": "CV",
    "Congo (Republic of the)": "CG",
    "Czech Republic": "CZ",
    "Democratic Republic of the Congo": "CD",
    "Hong Kong, China": "HK",
    "Iran (Islamic Republic of)": "IR",
    "Korea (Republic of)": "KR",
    "Kosovo": "XK",
    "Lao People’s Democratic Republic": "LA",
    "Macao, China": "MO",
    "Moldova": "MD",
    "Myanmar (The Republic of the Union of)": "MM",
    "Palestine": "PS",
    "Tanzania": "TZ",
    "Türkiye (Republic of)": "TR",
    "Venezuela": "VE",
    "Vietnam": "VN",
}
MOF_ALIASES = {
    "イラン": "IR",
    "エリトリア": "ER",
    "オーストラリア": "AU",
    "カーボベルデ": "CV",
    "キルギス": "KG",
    "コソボ": "XK",
    "コンゴ共和国": "CG",
    "ジョージア": "GE",
    "シリア": "SY",
    "セントビンセント及びグレナディーン諸島": "VC",
    "タンザニア": "TZ",
    "バミューダ": "BM",
    "ブルネイ": "BN",
    "ベネズエラ": "VE",
    "ボリビア": "BO",
    "モルドバ": "MD",
    "モンゴル": "MN",
    "ラオス": "LA",
    "ロシア": "RU",
    "中央アフリカ": "CF",
    "韓国": "KR",
}
SEPARATE_TERRITORIES = {"BM", "CW", "HK", "MO"}


def pdf_text(path, expected_digest):
    actual_digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if actual_digest != expected_digest:
        raise ValueError(f"{path} is a different snapshot. Review before updating this crosswalk.")
    return subprocess.check_output(["pdftotext", "-layout", str(path), "-"], encoding="utf-8")


def wco_members(text, codes_by_name):
    records = {}
    for line in text.splitlines():
        match = re.fullmatch(r" *(\S.*?)\s{2,}(\d{2}/\d{2}/\d{4}) *", line)
        if not match:
            continue
        name, date = match.groups()
        code = codes_by_name[name]
        if code in records:
            raise ValueError(f"Duplicate WCO code: {code}")
        records[code] = (name, datetime.strptime(date, "%d/%m/%Y").date().isoformat())
    if len(records) != 187 or "EU" in records or "European Union**" not in text:
        raise ValueError("WCO list should contain 187 dated members and the separate EU entry.")
    return records


def mof_members(text, codes_by_name):
    # The St Vincent label wraps across two lines of the fourth PDF column.
    text = re.sub(
        r"^ *セ\s*ン\s*ト\s*ビ\s*ン\s*セ\s*ン\s*ト\s*及\s*び *\n",
        "",
        text,
        flags=re.MULTILINE,
    ).replace("187 グ レ ナ デ ィ ー ン 諸 島", "187 セントビンセント及びグレナディーン諸島")
    records = {}
    pattern = r"\b(\d{1,3}) +([^0-9]+?) +(\d{4} *\. *\d{1,2} *\. *\d{1,2})(?=\s|$)"
    for index, name, date in re.findall(pattern, text):
        name = re.sub(r"\s", "", name)
        code = codes_by_name[name]
        if code in records:
            raise ValueError(f"Duplicate MOF code: {code}")
        deposit_date = datetime.strptime(date.replace(" ", ""), "%Y.%m.%d").date().isoformat()
        records[code] = (int(index), name, deposit_date)
    if {index for index, _, _ in records.values()} != set(range(1, 188)):
        raise ValueError("MOF list should be numbered 1 through 187.")
    return records


def build(args):
    countries = json.loads(args.countries.read_text(encoding="utf-8"))
    codes_by_wco_name = {row["name"]: row["code"] for row in countries}
    codes_by_mof_name = {re.sub(r"\s", "", row["nameJa"]): row["code"] for row in countries}
    wco = wco_members(pdf_text(args.wco_pdf, WCO_DIGEST), codes_by_wco_name | WCO_ALIASES)
    mof = mof_members(pdf_text(args.mof_pdf, MOF_DIGEST), codes_by_mof_name | MOF_ALIASES)
    if wco.keys() != mof.keys():
        raise ValueError(f"Different membership sets: WCO-only {wco.keys() - mof.keys()}, MOF-only {mof.keys() - wco.keys()}")

    members = []
    differences = []
    for code, (name, joined_on) in sorted(wco.items()):
        mof_number, name_ja, deposit_date = mof[code]
        members.append({
            "memberId": code,
            "iso2": None if code == "XK" else code,
            "name": name,
            "nameJa": name_ja,
            "kind": "customs_territory" if code in SEPARATE_TERRITORIES else "country_or_territory",
            "joinedOn": joined_on,
            "mofRosterNumber": mof_number,
        })
        if joined_on != deposit_date:
            differences.append({"memberId": code, "wcoJoinedOn": joined_on, "mofDepositDate": deposit_date})

    return {
        "schemaVersion": 1,
        "checkedOn": "2026-11-11",
        "memberCount": len(members),
        "sources": [
            {
                "id": "wco-membership",
                "authority": "World Customs Organization",
                "title": "WCO Members",
                "url": WCO_PAGE,
                "role": "Published membership count",
            },
            {
                "id": "wco-membership-dates",
                "authority": "World Customs Organization",
                "title": "List of Members with membership date",
                "url": WCO_PDF,
                "referenceDate": "2025-10-16",
                "sha256": WCO_DIGEST,
                "role": "Canonical membership labels, membership dates and EU participation status",
            },
            {
                "id": "japan-mof-wco-roster",
                "authority": "Ministry of Finance, Japan",
                "title": "WCO（世界税関機構）メンバー一覧表（加入順）",
                "url": MOF_PDF,
                "referenceDate": "2026-07-01",
                "sha256": MOF_DIGEST,
                "termsUrl": "https://www.mof.go.jp/about_mof/notice/index.html",
                "role": "Independent cross-check of all 187 members, Japanese names and deposit dates",
            },
            {
                "id": "eurostat-xk",
                "authority": "Eurostat",
                "title": "NUTS correspondence tables",
                "url": "https://ec.europa.eu/eurostat/web/nuts/correspondence-tables",
                "role": "Reference for the use of XK for Kosovo",
            },
        ],
        "members": members,
        "affiliates": [{
            "memberId": "EU",
            "iso2": None,
            "name": "European Union",
            "nameJa": "欧州連合",
            "kind": "customs_union",
            "status": "akin_to_wco_membership",
            "joinedOn": None,
            "countsAsMember": False,
        }],
        "dateDifferences": differences,
        "notes": [
            "joinedOn is the WCO roster’s membership date. The Japanese roster records ratification or accession instrument deposit dates.",
            "XK is a user-assigned destination code for Kosovo. EU is a customs-union identifier. Neither is an assigned ISO 3166-1 alpha-2 country code.",
            "Membership rows are independent of tariff, tax and declaration coverage. Puerto Rico (PR) is not separately listed as a WCO member.",
            "This crosswalk records factual identifiers, names, membership and dates; the source publications are not included.",
        ],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--countries", type=Path, required=True)
    parser.add_argument("--wco-pdf", type=Path, required=True)
    parser.add_argument("--mof-pdf", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    args.output.write_text(json.dumps(build(args), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
