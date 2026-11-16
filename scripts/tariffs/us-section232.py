"""Build conditional U.S. Section 232 and Section 301 references from HTSUS 2026 Rev. 23."""

import argparse
from collections import defaultdict
import gzip
from hashlib import sha256
import json
from pathlib import Path
import re
import subprocess


USITC = "https://www.usitc.gov/harmonized_tariff_information/hts/archive/list"
CH99 = "https://hts.usitc.gov/reststop/file?release=2026HTSRev23&filename=Chapter%2099"
HTS_JSON = "https://www.usitc.gov/sites/default/files/tata/hts/hts_2026_revision_23_json.json"
TERMS = "https://uscode.house.gov/us/usc/119-124/t17/s105/"
METALS = "https://www.whitehouse.gov/presidential-actions/2026/06/further-adjusting-the-tariff-regimes-for-imports-of-aluminum-steel-and-copper-into-the-united-states/"
METALS_CBP = "https://content.govdelivery.com/accounts/USDHSCBP/bulletins/41aa83d"
PHARMA_CBP = "https://content.govdelivery.com/bulletins/gd/USDHSCBP-42cf077"
USTR_REVIEW = "https://ustr.gov/trade-topics/enforcement/section-301-investigations/section-301-china-technology-transfer/china-section-301-tariff-actions-and-exclusion-process/four-year-review"
EU = "AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE".split()
MOBILE_ORIGINS = sorted(EU + "AR EC SV GT JP KR LI CH TW GB".split())
SPECIALTY_ORIGINS = sorted(EU + "AR BD KH EC SV GT IN ID JP JO MY MK KR CH LI TW TH GB VN".split())
PATENT_ORIGINS = sorted(EU + "JP KR CH LI".split())
CODE = r"[0-9]{4}(?:\.[0-9]{2}(?:\.[0-9]{2}(?:\.?[0-9]{2})?)?)?"
TABLE = re.compile(rf"{CODE}(?: +{CODE})*")


def clean(text):
    return " ".join(text.split())


def normalized(text):
    return text.replace(".", "")


def code_list(text):
    """Accept only rows consisting entirely of printed HTS identifiers."""
    return {
        normalized(code)
        for raw in text.splitlines()
        if TABLE.fullmatch(raw.strip())
        for code in raw.split()
    }


def extract_note(text, start, end):
    return re.search(rf"(?ms)^{start}.*?^(?={end})", text)[0]


def reference_rate(hts, source_code, label, condition, *, origin=(), expression=None, column="general"):
    row = hts[source_code]
    published = clean(row[column])
    assert published
    rate = {
        "charge": "additional_duty",
        "treatment": "temporary",
        "label": f"Section 232 {label} · {source_code}",
        "expression": expression or published,
        "sourceCode": normalized(source_code),
        "condition": condition,
    }
    if origin:
        rate["originCountries"] = sorted(origin)
    return rate


def measure_line(code, rates, reference, notes=()):
    line = {"code": code, "reference": reference, "rates": rates, "url": CH99}
    if len(code) < 10:
        line["matchPrefix"] = True
    if notes:
        line["notes"] = list(notes)
    return line


def metals(text, hts, valid):
    note = extract_note(text, r"16\. \(a\) +Except as provided in headings 9903\.82\.01", r"17\. \(a\)")
    groups = list(re.finditer(r"(?m)^ +\(([ivx]+)\) +(Articles of|Derivative) [^:\n]+:", note))
    counts = (9, 17, 39, 139, 76, 101, 242, 4, 18, 69, 28)
    members = defaultdict(set)
    retired = set()
    for index, group in enumerate(groups):
        start = group.end()
        end = groups[index + 1].start() if index + 1 < len(groups) else re.search(
            r"(?m)^ +\(d\) +Headings 9903\.82\.04", note
        ).start()
        codes = code_list(note[start:end])
        assert len(codes) == counts[index], (group[1], len(codes))
        retired.update(codes - valid)
        for code in codes & valid:
            members[code].add(index + 1)
    assert len(groups) == 11
    assert retired == {"8413919055", "8413919060", "8413919096",
                       "8479899599", "8479909596", "8708295160"}, retired

    threshold = ("For codes outside chapters 72, 73, 74 and 76, the listed metal or aggregate "
                 "listed metals must account for at least 15% of article weight under Note 16(c).")
    us_metal = ("Under Note 16(e), the U.S.-processed share of each listed metal must meet 85%. "
                "Aluminum and copper require U.S. smelting and casting. Steel requires U.S. melting and pouring.")
    uk_metal = ("UK origin with the relevant metal processing in the UK accounting for at least 95% "
                "under Note 16(d).")
    full_value = "Where the provision applies, the duty base is full customs value under Note 16(c) except for an express split-value provision."
    column2 = ("BY", "CU", "KP", "RU")
    parts = ("Parts in Chapters 84, 85 or 87 exclusively for manufacturing qualifying agricultural, fixed "
             "industrial or mobile industrial equipment under Note 16(k). General Note 3(b) origins are excluded.")
    records = []
    for code, group_ids in sorted(members.items()):
        rates = []
        uses = group_ids.intersection

        def add(suffix, condition, *, origin=(), expression=None, column="general"):
            rates.append(reference_rate(
                hts, f"9903.82.{suffix:02}", "metals", condition,
                origin=origin, expression=expression, column=column
            ))

        add(1, "Article contains none of aluminum, steel or copper. Note 16(a).")
        if code[:2] not in {"72", "73", "74", "76"}:
            add(3, "Outside chapters 72, 73, 74 and 76. The aggregate share of the applicable metal or metals is below 15% of weight.")
        if uses({1, 2, 3, 4, 5}):
            add(2, f"{threshold} Ordinary branch under Note 16(c)(i)–(v). Other Chapter 99 headings can displace this candidate, including UK processing and Russian metal provisions.")
        if uses({1, 2, 3, 4}):
            add(4, f"{threshold} {uk_metal} Applies to Note 16(c)(i)–(iv).", origin=("GB",))
        if uses({6, 7}):
            add(5, f"{threshold} {uk_metal} Applies to Note 16(c)(vi)–(vii).", origin=("GB",))
        if uses({2, 4, 6, 7, 8, 11}):
            add(6, f"{threshold} {us_metal} Subject to 9903.82.15 and 9903.85.68.")
        if uses({9, 10}):
            for suffix, floor, precondition in [
                (7, 10, us_metal),
                (10, 15, "The article does not qualify for the U.S. metal branch under Note 16(e)."),
            ]:
                add(suffix, f"{threshold} {precondition} Column 1 is below {floor}%. Check exceptions in 9903.82.12, 9903.82.17 and 9903.85.68.",
                    expression=f"Combined Column 1 and Section 232 rate of {floor}%")
                add(suffix + 1, f"{threshold} {precondition} Column 1 is at least {floor}%. Check exceptions in 9903.82.12, 9903.82.17 and 9903.85.68.")
            add(12, f"{threshold} Product of a General Note 3(b) country. Check 9903.82.17 and 9903.85.68.", origin=column2)
        if uses({6, 7, 8, 11}):
            add(9, f"{threshold} Ordinary derivative branch under Note 16(c)(vi)–(viii) or (xi). Check lower and special treatments in Note 16(d)–(k) and 9903.85.68.")
            if code[:2] in {"84", "85", "87"}:
                add(13, "Qualifying motorcycle part in Chapter 84, 85 or 87 used in manufacturing motorcycles in the United States under Note 16(g).")
        if uses({3, 4, 5}):
            add(14, f"{threshold} Russian-origin steel, copper or derivative steel. Note 16(c)(iii)–(v).", origin=("RU",))
        if uses({4, 7, 8, 11}):
            add(15, f"{threshold} {us_metal} Russian-origin copper or derivative steel under Note 16(e).", origin=("RU",))
        if uses({7, 8, 11}):
            add(16, f"{threshold} Russian-origin copper or derivative steel under Note 16(c)(vii)–(viii) or (xi). Verify the U.S. metal alternative.", origin=("RU",))
        if uses({10}):
            add(17, f"{threshold} Russian-origin derivative steel under Note 16(c)(x).", origin=("RU",))
        if uses({1, 3}):
            for group, suffix, metal in [(3, 18, "steel melted and poured"), (1, 19, "aluminum smelted and cast")]:
                if group in group_ids:
                    add(suffix, f"Limited quantity of {metal} in Canada or Mexico. USMCA eligibility and Secretary of Commerce authorization are required. Confirm operational eligibility and CBP filing instructions.",
                        origin=("CA", "MX"), column="special")
        if uses({11}):
            add(20, f"{threshold} USMCA-eligible derivative steel. Apply 25% to non-U.S. value plus U.S. value exceeding 40% of the total article value under Note 16(j).",
                origin=("CA", "MX"), expression="Base duty plus 25% on the chargeable value under Note 16(j)")
            add(21, f"{threshold} USMCA-eligible derivative steel. Applies to U.S. content up to 40% of the total article value under Note 16(j).",
                origin=("CA", "MX"))
            add(22, f"{threshold} Eligible origin and mobile equipment under Note 16(c)(xi). Proclamation clause 2(b) adds only the amount needed to reach 15% combined duty. Check the applicable Column 1 rate.",
                origin=MOBILE_ORIGINS, expression="Combined Column 1 and Section 232 duty floor of 15%")
        if uses({6, 7, 8}) and code[:2] in {"84", "85", "87"}:
            for suffix, floor, precondition in [
                (23, 10, us_metal),
                (25, 15, "The article does not qualify for the U.S. metal branch under Note 16(e)."),
            ]:
                add(suffix, f"{threshold} {parts} {precondition} Column 1 is below {floor}%. Check 9903.85.68.",
                    expression=f"Combined Column 1 and Section 232 rate of {floor}%")
                add(suffix + 1, f"{threshold} {parts} {precondition} Column 1 is at least {floor}%. Check 9903.85.68.")
        references = ("i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x", "xi")
        listed = ", ".join(f"({references[i - 1]})" for i in sorted(group_ids))
        records.append(measure_line(
            code, rates, f"HTSUS Chapter 99 Subchapter III, U.S. note 16(c) {listed}",
            ("These are conditional alternative provisions. Verify Note 16(a)–(k), other Chapter 99 rules and reporting before applying any rate.",
             full_value)
        ))
    return records


def pharmaceuticals(text, hts, valid):
    note = extract_note(text, r"40\.", r"41\.")
    start = re.search(r"(?m)^ +\(c\) +The headings provided", note).start()
    end = re.search(r"(?m)^ +For the purposes of this note:", note[start:]).start() + start
    codes = code_list(note[start:end])
    assert len(codes) >= 120 and codes <= valid and all(len(code) == 10 for code in codes)
    results = []
    for code in sorted(codes):
        rates = []

        def add(suffix, condition, *, origin=(), expression=None):
            rates.append(reference_rate(
                hts, f"9903.04.{suffix}", "pharmaceuticals", condition,
                origin=origin, expression=expression
            ))

        add(60, "Patented pharmaceutical article meeting Note 40(c) and (d). Add only the amount needed to reach the combined rate. Lower applicable treatment controls. U.S.-origin pharmaceuticals are excluded.",
            expression="Combined Column 1 and Section 232 duty floor of 100%")
        add(62, "Qualifying patented pharmaceutical article from a listed origin under Note 40(f). Add only the amount needed to reach the combined rate.",
            origin=PATENT_ORIGINS, expression="Combined Column 1 and Section 232 duty floor of 15%")
        add(63, "Qualifying patented pharmaceutical article from the United Kingdom under Note 40(g).",
            origin=("GB",))
        add(64, "Qualifying patented pharmaceutical article from a company with a Secretary of Commerce-approved onshoring plan under Note 40(h)(i).")
        add(65, "Qualifying company with the approved onshoring plan and a Most-Favored-Nation pharmaceutical pricing agreement under Note 40(h)(ii).")
        add(66, "Qualifying orphan drug or other specialty pharmaceutical or ingredient in Note 40(h)(iii) and 91 FR 60360. Product eligibility and applicable jurisdiction must both be confirmed.",
            origin=SPECIALTY_ORIGINS)
        add(67, "Qualifying generic pharmaceutical article under Note 40(c)(iii).")
        add(68, "Pharmaceutical product with a U.S.-origin active pharmaceutical ingredient packaged in dosage form.")
        add(69, "Listed classification that falls outside the pharmaceutical definition, or a pharmaceutical that is neither patented nor generic under Note 40(i).")
        add(70, "Qualifying pharmaceutical article or associated ingredient used solely for clinical trials, research and development or another noncommercial application.")
        results.append(measure_line(
            code, rates, "HTSUS Chapter 99 Subchapter III, U.S. note 40(c)",
            ("Coverage is product-specific within the listed 10-digit classifications. Verify the patent, FDA authorization, company and end-use conditions.",
             "If several rates under Proclamation 11020 apply, CBP guidance specifies using the lowest applicable rate.")
        ))
    return results


def four_year_review(text, hts, valid):
    note = extract_note(text, r"31\. \(a\) +As provided in headings 9903\.91\.01", r"32\. ")
    common = ("Goods of China under Note 31. Verify any Chapter 98 treatment and exceptions in Note 31(a), "
              "the Chapter 99 provision, and interactions with other Section 301 entries.")
    rules = (
        ("b", "c", 1, "2024-09-27", None, 348),
        ("c", "d", 2, "2024-09-27", None, 2),
        ("d", "e", 3, "2024-09-27", None, 10),
        ("f", "g", 5, "2025-01-01", "2027-06-22", 18),
        ("g", "h", 6, "2026-01-01", None, 5),
        ("h", "i", 7, "2026-01-01", None, 5),
        ("j", "k", 11, "2025-01-01", None, 3),
    )
    extra = {
        "6307909842": "Only N95 textile respirators within the statistical number.",
        "6307909844": "Only N95 textile respirators within the statistical number.",
        "6307909850": "Only non-N95 textile respirators within the statistical number.",
        "6307909870": "Only textile face masks within the statistical number.",
        "6307909875": "Only textile face masks within the statistical number.",
    }
    records = []
    for subdivision, following, number, effective, last_day, count in rules:
        beginning = re.search(rf"(?m)^ +\({subdivision}\)(?: +|$)", note).start()
        end = re.search(rf"(?m)^ +\({following}\)(?: +|$)", note[beginning + 1:]).start() + beginning + 1
        passage = note[beginning:end]
        if subdivision == "b":
            codes = code_list(passage)
        else:
            lines = re.findall(r"(?m)^ +\([0-9]+\) +([^\n]+)", passage)
            codes = {
                normalized(code) for line in lines
                for code in re.findall(r"[0-9]{4}\.[0-9]{2}\.[0-9]{2,4}", line)
            }
        assert len(codes) == count, (subdivision, len(codes))
        source_code = f"9903.91.{number:02}"
        expression = clean(hts[source_code]["general"])
        assert re.fullmatch(r"The duty provided in the applicable subheading \+ [0-9.]+%", expression)
        for code in sorted(codes & valid):
            qualifier = extra.get(code)
            if last_day:
                qualifier = "Note 31(f)(ii) schedules an increase on June 23, 2027. The future amount is outside this reference."
            rate = {
                "charge": "additional_duty",
                "treatment": "other",
                "label": f"Section 301 four-year review · {source_code}",
                "expression": expression,
                "sourceCode": normalized(source_code),
                "from": effective,
                "originCountries": ["CN"],
                "condition": f"{common} {qualifier}" if qualifier else common,
            }
            if last_day:
                rate["through"] = last_day
            records.append(measure_line(
                code, [rate], f"HTSUS Chapter 99 Subchapter III, U.S. note 31({subdivision})"
            ))
    assert len(records) > 300
    return sorted(records, key=lambda row: row["code"])


def write_json(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_pack(out, snap_id, records, paths, limitations, edition):
    body = json.dumps({"id": snap_id, "lines": records}, ensure_ascii=False,
                      separators=(",", ":")).encode()
    data = gzip.compress(body, compresslevel=9, mtime=0)
    name = f"{snap_id}.json.gz"
    (out / name).write_bytes(data)
    stats = {
        "lines": len(records),
        "uniqueCodes": len({line["code"] for line in records}),
        "codesWithRates": len(records),
        "rates": sum(len(line["rates"]) for line in records),
        "chapters": sorted({line["code"][:2] for line in records}),
        "charges": ["additional_duty"],
    }
    return {
        "id": snap_id,
        "file": name,
        "sha256": sha256(data).hexdigest(),
        "jurisdiction": "US",
        "countries": ["US"],
        "zone": "standard",
        "edition": edition,
        "hsEdition": "HS 2022",
        "availableFrom": "2026-11-10",
        "availableThrough": "2026-11-11",
        "checkedOn": "2026-11-11",
        "scope": "national_schedule",
        "role": "measures",
        "authority": "U.S. International Trade Commission",
        "sourceUrl": USITC,
        "terms": "U.S. Government tariff schedule, 17 U.S.C. § 105",
        "termsUrl": TERMS,
        "inputFiles": [
            {"name": path.name, "url": url, "sha256": sha256(path.read_bytes()).hexdigest()}
            for path, url in paths
        ],
        "limitations": limitations,
        "statistics": stats,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("hts_json", type=Path)
    parser.add_argument("chapter99_pdf", type=Path)
    parser.add_argument("out", type=Path)
    parser.add_argument("--metals-proclamation", type=Path)
    parser.add_argument("--pharma-guidance", type=Path)
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    hts = {
        row["htsno"]: row
        for row in json.loads(args.hts_json.read_bytes())
        if re.fullmatch(CODE, row["htsno"])
    }
    prefixes = {
        normalized(code)[:size] for code in hts
        for size in (4, 6, 8, 10)
        if len(normalized(code)) >= size and not code.startswith("99")
    }
    notes = subprocess.check_output(
        ["pdftotext", "-layout", str(args.chapter99_pdf), "-"], text=True
    )
    assert "Harmonized Tariff Schedule of the United States Revision 23 (2026)" in notes
    paths = [(args.chapter99_pdf, CH99), (args.hts_json, HTS_JSON)]
    snapshots = [
        write_pack(
            args.out, "us-hts-r23-section232-metals", metals(notes, hts, prefixes),
            paths + ([(args.metals_proclamation, METALS)] if args.metals_proclamation else []),
            [
                "Chapter 99 Note 16(c)(i)–(xi) and 9903.82.01–26. Mixed origin and composition conditions require transaction evidence.",
                "Six printed statistical numbers with no match in the same revision's ordinary schedule are omitted.",
                "Russian aluminum 9903.85.67/68 and other Chapter 99 exceptions can supersede listed alternatives. This pack references these without indexing the separate Note 19 lists.",
                "Heading 9903.82.22 uses Proclamation clause 2(b) for the combined duty floor. The June CBP bulletin describes the 15% amount differently.",
                METALS,
                METALS_CBP,
            ],
            "2026 HTSUS Revision 23, Chapter 99 Note 16",
        ),
        write_pack(
            args.out, "us-hts-r23-section232-pharma", pharmaceuticals(notes, hts, prefixes),
            paths + ([(args.pharma_guidance, PHARMA_CBP)] if args.pharma_guidance else []),
            [
                "Chapter 99 Note 40(c) and active headings 9903.04.60 and 9903.04.62–70. Use exact 10-digit classifications and product, firm and origin evidence.",
                "The 9903.04.60 and 9903.04.62 amounts are combined rate floors. Earlier company phase-ins and later changes are outside this dated snapshot.",
                PHARMA_CBP,
            ],
            "2026 HTSUS Revision 23, Chapter 99 Note 40",
        ),
        write_pack(
            args.out, "us-hts-r23-section301-note31", four_year_review(notes, hts, prefixes),
            paths,
            [
                "Current China entries under Note 31(b), (c), (d), (f), (g), (h) and (j) with product codes verified in the same revision's ordinary schedule.",
                "Note 31(i) is available in the separate Section 301 pack. Expired and future scheduled provisions are outside this snapshot.",
                USTR_REVIEW,
            ],
            "2026 HTSUS Revision 23, Chapter 99 Note 31",
        ),
    ]
    write_json(args.out / "manifest.json", {"version": 1, "snapshots": snapshots})
    for snap in snapshots:
        print(snap["id"], snap["statistics"])


if __name__ == "__main__":
    main()
