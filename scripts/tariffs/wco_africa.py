#!/usr/bin/env python3
"""Build HS 2022 references from OTR's Togo CET and the Nigeria Customs CET API."""

import argparse
from bisect import bisect_right
from decimal import Decimal
import json
from pathlib import Path
import re

from rebuild import digest, schedule, write_pack

TG_INDEX = "https://anciensite.otr.tg/index.php/fr/documentation/sur-la-douane-togolaise/tarifs-des-douanes.html"
TG_PDF = TG_INDEX.removesuffix(".html") + "/605-tec-cedeao-actualise/file.html"
TG_TAXES_INDEX = "https://togotrade.gouv.tg/menu/6"
TG_TAXES_PDF = (
    "https://togotrade.gouv.tg/media/TAUX%20DES%20DROITS%2C%20TAXES%20ET%20REDEVANCES"
    "%20APPLIQUES%20A%20L'IMPORTATION%20OU%20A%20L'EXPORTATION.pdf"
)
TG_CODE = re.compile(r"[0-9]{4}\.[0-9]{2}\.[0-9]{2}\.[0-9]{2}")
TG_CET_RATES = {"0", "5", "10", "20", "35"}
NG_INDEX = "https://demo-cet.customs.gov.ng/"
NG_API = "https://cet-backend.customs.gov.ng/api/harmonized-system/tariff-lines"
NG_QUERY = NG_API + "?edition=2026&page=1&per_page=all"
NG_LEGISLATION = "https://www.copyright.gov.ng/wp-content/uploads/2023/04/CopyrightAct2023FinalPublication1.pdf"
NG_ORDER_INDEX = "https://customs.gov.ng/publications/circulars/customs-excise-tariff-etc-variation-order2026."
NG_ORDER_PDF = (
    "https://cms.customs.gov.ng/wp-content/uploads/2026/07/"
    "TT-2026-CIRCULAR-NO-10-APPROVAL-FOR-THE-IMPLEMENT-OF-THE-2026-FISCAL-POLICY-"
    "MEASURES-AND-TARIFF-AMENDMENTS_0001-3-25.pdf"
)
# Manual transcription of First Schedule pages B 252, B 256 and B 257.
# Each tuple gives the exact HS code, CET duty, IAT and implementation tariff.
NG_IAT = {
    (4, "252", 1): [
        ("3004200000", "0", "20", "20"),
        ("3004400000", "0", "20", "20"),
        ("3004500000", "0", "20", "20"),
        ("3004600000", "0", "20", "20"),
        ("1006301000", "10", "37.5", "47.5"),
        ("1006309000", "10", "37.5", "47.5"),
        ("1006400000", "10", "20", "30"),
        ("1101000000", "20", "50", "70"),
        ("1511100000", "10", "18.75", "28.75"),
        ("1511901000", "10", "25", "35"),
        ("1517100000", "20", "20", "40"),
        ("1701120000", "20", "37.5", "57.5"),
        ("1701130000", "10", "45", "55"),
        ("1701911090", "20", "37.5", "57.5"),
        ("1701919000", "20", "37.5", "57.5"),
        ("1701991000", "20", "37.5", "57.5"),
        ("1701999000", "20", "37.5", "57.5"),
        ("1901903000", "5", "25", "30"),
        ("1902190000", "20", "10", "30"),
    ],
    (7, "256", 70): [
        ("4820100000", "20", "10", "30"),
        ("4821100000", "10", "50", "60"),
        ("5208511000", "35", "10", "45"),
        ("5209511000", "35", "10", "45"),
        ("5210511000", "35", "10", "45"),
        ("5210519000", "35", "10", "45"),
        ("5211511000", "35", "10", "45"),
        ("5211519000", "35", "10", "45"),
        ("5407440000", "20", "15", "35"),
    ],
    (7, "257", 79): [
        ("5408240000", "20", "15", "35"),
        ("5513410000", "20", "15", "35"),
        ("5514410000", "20", "15", "35"),
        ("5607410000", "10", "10", "20"),
        ("5607490000", "10", "10", "20"),
        ("5607500000", "10", "10", "20"),
        ("5607900000", "10", "10", "20"),
        ("6907400000", "20", "15", "35"),
        ("6907900000", "20", "15", "35"),
        ("6914100000", "20", "26.25", "46.25"),
        ("6914900000", "20", "15", "35"),
        ("6910900000", "20", "20", "40"),
    ],
}
ZW_INDEX = "https://www.zimra.co.zw/customs/classification-of-goods/tariff-handbook"
ZW_PDF = ZW_INDEX + "?download=393:download-tariff-handbook"
ZW_CODE = re.compile(r"[0-9]{4}\.[0-9]{2}\.[0-9]{2}")
ZW_SPECIFIC = r"(?:US)?\$\s*\d+(?:[.,]\d+)?\s*/\s*(?:1000\s+(?:cigarettes|sticks)|kg|LAA|L|pr|t|m2|m3|u|piece|dozen|liter|litre)\b"
ZW_COMPONENT = rf"(?:\d+(?:[.,]\d+)?\s*%|{ZW_SPECIFIC}|Excise\b)"
ZW_EXPRESSION = re.compile(
    rf"{ZW_COMPONENT}(?:\s*(?:\+|or\b|and\b)\s*{ZW_COMPONENT})*",
    re.IGNORECASE,
)
ZW_REVIEWED_CELLS = {
    # Multiline product headings extend into the nominal rate columns on these pages.
    (23, "02032900"): "40%",
    (56, "03057990"): "0%",
    (77, "04015000"): "US$0.50/L",
    (129, "12102000"): "5%",
    # The printed rates start one text baseline before these code anchors.
    (437, "40112010"): "15%",
    (437, "40112090"): "15% + US$5.00/Kg",
    (720, "70159000"): "10%",
    (835, "82042000"): "5%",
    (847, "83017090"): "20%",
    (882, "84239090"): "10%",
    (906, "84509000"): "5%",
    (963, "85149000"): "0%",
    (982, "85340000"): "5%",
    (989, "85409900"): "5%",
}


def source(path, url):
    return [{"name": path.name, "url": url, "sha256": digest(path)}]


def rate(charge, label, percentage):
    number = Decimal(str(percentage))
    if not number.is_finite() or number < 0:
        raise ValueError(f"Invalid percentage: {percentage!r}")
    return {
        "charge": charge,
        "treatment": "general",
        "label": label,
        "expression": f"{number.normalize():f}%",
    }


def togo(raw, out):
    import fitz

    path = raw / "tg-alt.pdf"
    lines = []
    fees = []
    continued_trout = None
    with fitz.open(path) as pdf:
        for page in pdf:
            number = page.number + 1
            words = page.get_text("words")
            codes = sorted(
                (w for w in words if 95 < w[0] < 140 and TG_CODE.fullmatch(w[4])),
                key=lambda word: word[1],
            )
            if not codes:
                continue
            headers = sorted(
                (w for w in words if 480 < w[0] < 530 and w[4] == "D.D."),
                key=lambda word: word[1],
            )
            if not headers:
                # The headings in these continuation tables are text from the preceding page.
                headers = [({72: 509.1, 73: 509.1, 86: 494.1}[number], 0)]
            header_heights = [word[1] for word in headers]
            for index, anchor in enumerate(codes):
                code = anchor[4].replace(".", "")
                next_header = bisect_right(header_heights, anchor[1])
                duty_left = headers[max(0, next_header - 1)][0]
                next_code = codes[index + 1][1] - 2 if index + 1 < len(codes) else 800
                next_table = header_heights[next_header] if next_header < len(headers) else 800
                stop = min(next_code, next_table)
                candidates = [
                    w for w in words
                    if duty_left - 2 < w[0] < duty_left + 8
                    and anchor[1] - 2 < w[1] < stop
                    and w[4] in TG_CET_RATES
                ]
                rs_values = {
                    w[4] for w in words
                    if duty_left + 28 < w[0] < duty_left + 42
                    and anchor[1] - 2 < w[1] < stop
                    and w[4] in {"0", "1", "l", "I"}
                }
                duty_page = number
                if code == "0304810000":
                    # The last pair of cells on p. 22 belongs to the trout line
                    # whose code is printed after the page break on p. 23.
                    assert number == 22 and [w[4] for w in candidates] == ["20", "20"]
                    assert rs_values == {"1"}
                    continued_trout = candidates.pop(), rs_values
                if code == "0304820000":
                    assert number == 23 and not candidates and not rs_values and continued_trout
                    continued_duty, rs_values = continued_trout
                    candidates = [continued_duty]
                    duty_page = 22
                values = {w[4] for w in candidates}
                if len(values) != 1:
                    raise ValueError(f"Ambiguous or absent Togo duty, PDF page {number}, {code}")
                reference = f"OTR TEC CEDEAO actualisé, PDF p. {number}, {anchor[4]}, D.D."
                if duty_page != number:
                    reference += f" (rate cell p. {duty_page})"
                lines.append({
                    "code": code, "reference": reference,
                    "url": f"{TG_PDF}#page={number}",
                    "rates": [rate("customs_duty", "ECOWAS CET customs duty (D.D.)", values.pop())],
                })
                if number == 467 and code in {"9405910000", "9405920000", "9405990000"}:
                    # These three cells render as a lowercase l in the PDF text layer.
                    # The national Trade Portal's tariff sheet independently gives 1%.
                    assert rs_values == {"l"}
                    rs_values = {"1"}
                if rs_values != {"1"}:
                    raise ValueError(f"Unresolved Togo R.S. cell, PDF page {number}, {code}")
                fees.append({
                    "code": code,
                    "reference": reference.replace(", D.D.", ", R.S."),
                    "url": f"{TG_PDF}#page={number}",
                    "rates": [rate("levy", "Statistical levy (R.S.)", "1")],
                })
    if len(lines) != 6379 or len({line["code"] for line in lines}) != 6379:
        raise ValueError("Togo CET extraction did not reproduce the published 6,379 unique lines")
    meta = schedule(
        "tg-otr-cet-2025", "TG", ["TG"], "OTR TEC CEDEAO actualisé (2025-11-10)",
        "2025-11-10", "published_baseline", "Office Togolais des Recettes (OTR)",
        TG_INDEX,
        "Numeric tariff facts extracted from the official published schedule; "
        "original document, product wording and notes are not redistributed.",
        TG_INDEX, source(path, TG_PDF), [
            "Publication date bounds this reference edition; it is not the commencement date of every legal rate.",
            "The D.D. customs-duty column is a baseline. Check the official source "
            "for VAT, other levies, preferences, restrictions and subsequent changes.",
        ],
    )
    fee_meta = {
        **meta,
        "id": "tg-otr-cet-2025-measures",
        "role": "measures",
        "inputFiles": [*meta["inputFiles"], *source(raw / "tg-taxes.pdf", TG_TAXES_PDF)],
        "limitations": [
            "R.S. statistical-levy cells from the updated CET. The government trade "
            f"portal corroborates the published 1% rate ({TG_TAXES_INDEX}).",
            "Exemptions, VAT, other levies and conditions require separate verification.",
        ],
    }
    return [write_pack(out, meta, lines), write_pack(out, fee_meta, fees)]


def nigeria(raw, out):
    path = raw / "ng-2026-all.json"
    payload = json.loads(path.read_bytes())
    entries = payload["data"]
    count = payload["meta"]["total"]
    if (payload["meta"]["edition"] != "2026" or count != 6514 or len(entries) != count
            or len({entry["code"] for entry in entries}) != count):
        raise ValueError("Nigeria CET response was incomplete or changed edition")
    lines = []
    measures = []
    for entry in entries:
        code = entry["code"]
        if not re.fullmatch(r"[0-9]{10}", code):
            raise ValueError(f"Invalid Nigeria tariff code: {code!r}")
        reference = f"Nigeria Customs Service CET Edition 2026, {code}"
        url = NG_API + f"?edition=2026&search={code}&field=code&match=exact"
        line = {"code": code, "reference": reference, "url": url}
        duty = entry["duty_rate"]
        lines.append({**line, "rates": [] if duty is None else [
            rate("customs_duty", "ECOWAS CET customs duty", duty),
        ]})
        vat = entry["vat"]
        if vat is not None:
            measures.append({**line, "rates": [rate("import_vat", "Import VAT (CET)", vat)]})
    metadata = schedule(
        "ng-ncs-cet-2026", "NG", ["NG"], "Nigeria Customs Service CET Edition 2026",
        "2026-11-11", "published_baseline", "Nigeria Customs Service (NCS)",
        NG_INDEX,
        "Numeric CET tariff facts only; source documents and descriptions are not "
        "redistributed. Nigeria Copyright Act 2022 s.3(a)–(b) excludes mere data and official "
        "legislative or administrative texts, except compilations of the latter.",
        NG_LEGISLATION, source(path, NG_QUERY), [
            "Public NCS CET lookup snapshot with an observation-date window. "
            "The portal is hosted at demo-cet.customs.gov.ng; check the effective legal "
            "schedule and applicable instruments before using the rate for a declaration.",
            "Blank duty is unavailable, including for some national codes. "
            "Verify supplementary protection, origin preferences and restrictions separately.",
        ],
    )
    measures_metadata = {
        **metadata,
        "id": "ng-ncs-cet-2026-measures",
        "role": "measures",
        "limitations": [
            "Import VAT column reproduced where a numeric value is published. "
            "A blank column is omitted and does not establish an exemption.",
            "Portal levy and excise fields are omitted after finding discrepancies with S.I. 29 "
            "of 2026. Check current law for taxes, reliefs, origin-specific measures and prohibitions.",
        ],
    }
    iat = []
    for (pdf_page, gazette_page, first_row), rows in NG_IAT.items():
        for index, (code, duty, additional, total) in enumerate(rows, first_row):
            if Decimal(duty) + Decimal(additional) != Decimal(total):
                raise ValueError(f"Invalid Nigeria IAT transcription at B {gazette_page}, row {index}")
            reference = f"Nigeria S.I. 29 of 2026, First Schedule, B {gazette_page}, row {index}"
            iat.append({
                "code": code,
                "reference": reference,
                "url": f"{NG_ORDER_PDF}#page={pdf_page}",
                "rates": [{
                    **rate("additional_duty", "Import Adjustment Tax (IAT)", additional),
                    "condition": (
                        f"The 2026 schedule shows {duty}% CET duty plus {additional}% IAT "
                        f"for a combined tariff of {total}%. Verify any applicable relief."
                    ),
                }],
            })
    iat_meta = schedule(
        "ng-si29-2026-iat", "NG", ["NG"], "Nigeria S.I. 29 of 2026 (selected IAT rows)",
        "2026-05-01", "published_baseline", "Federal Republic of Nigeria / Nigeria Customs Service",
        NG_ORDER_INDEX, metadata["terms"], NG_LEGISLATION,
        source(raw / "ng-order-2026.pdf", NG_ORDER_PDF), [
            "Section 7(i) brings the First Schedule into force on 1 May 2026.",
            "Contains 40 manually checked exact-code rows from gazette pages B 252, B 256 and B 257. "
            "The rest of the IAT schedule, excise and other measures require separate verification.",
        ],
    )
    return [
        write_pack(out, metadata, lines),
        write_pack(out, measures_metadata, measures),
        write_pack(out, {**iat_meta, "role": "measures"}, iat),
    ]


def zimbabwe_expression(value):
    match = ZW_EXPRESSION.match(value)
    if not match or re.match(r"^\s*(?:or\b|and\b|\+|/)", value[match.end():], re.IGNORECASE):
        return None
    expression = re.sub(r"\s+%", "%", match[0])
    return re.sub(r"\s*/\s*", "/", expression).strip()


def zimbabwe(raw, out):
    import fitz

    path = raw / "zw-2022.pdf"
    lines = {}
    with fitz.open(path) as pdf:
        if len(pdf) != 1162:
            raise ValueError("Unexpected Zimbabwe statutory tariff handbook edition")
        for page in pdf[16:1129]:
            number = page.number + 1
            words = page.get_text("words")
            codes = sorted(
                (w for w in words if 98 < w[0] < 165 and ZW_CODE.fullmatch(w[4])),
                key=lambda word: word[1],
            )
            for index, anchor in enumerate(codes):
                code = anchor[4].replace(".", "")
                stop = codes[index + 1][1] - 2 if index + 1 < len(codes) else 740
                row = sorted(
                    (w for w in words if 372 < w[0] < 520 and anchor[1] - 2 < w[1] < stop),
                    key=lambda word: (round(word[1], 1), word[0]),
                )
                general = " ".join(w[4] for w in row if w[0] < 433)
                mfn = " ".join(w[4] for w in row if w[0] >= 433)
                expression = ZW_REVIEWED_CELLS.get((number, code))
                if expression is None:
                    expression = zimbabwe_expression(general)
                    if expression is None or expression != zimbabwe_expression(mfn):
                        raise ValueError(f"Unresolved Zimbabwe rates, p. {number}, {code}")
                charges = [{
                    "charge": "customs_duty",
                    "treatment": "general",
                    "label": "General and MFN customs duty",
                    "expression": expression,
                    **({"condition": "Use the component yielding the higher duty (Part I, 3(2))."}
                       if " or " in expression.lower() else {}),
                }]
                if code in lines:
                    if lines[code]["rates"] != charges:
                        raise ValueError(f"Conflicting repeated Zimbabwe code {code}")
                    continue
                lines[code] = {
                    "code": code,
                    "reference": f"S.I. 203 of 2022, First Schedule Part II, p. {number}, {anchor[4]}",
                    "url": f"{ZW_PDF}#page={number}",
                    "rates": charges,
                }
    if len(lines) != 6633:
        raise ValueError("Zimbabwe tariff extraction did not reproduce 6,633 unique lines")
    meta = schedule(
        "zw-zimra-si203-2022", "ZW", ["ZW"], "Zimbabwe S.I. 203 of 2022 (First Schedule)",
        "2022-11-28", "published_baseline", "Zimbabwe Revenue Authority (ZIMRA)",
        ZW_INDEX,
        "Numeric and formula facts from a published legislative instrument; "
        "its text, product wording and PDF are not redistributed.",
        ZW_INDEX, source(path, ZW_PDF), [
            "Original statutory edition currently linked by ZIMRA. The reference "
            "window does not indicate consolidation of subsequent tariff amendments.",
            "This extract reports matching General and M.F.N. columns and preserves "
            "specific and compound duties as expressions. Consult current amendments, "
            "preferences, tariff treatment and applicable taxes before declaration.",
            "An Excise cross-reference does not establish a numeric customs or excise rate.",
        ],
    )
    return [write_pack(out, meta, list(lines.values()))]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raw", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    snapshots = togo(args.raw, args.out) + nigeria(args.raw, args.out) + zimbabwe(args.raw, args.out)
    (args.out / "manifest.json").write_text(
        json.dumps({"version": 1, "snapshots": snapshots}, indent=2) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
