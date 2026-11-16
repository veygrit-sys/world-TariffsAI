"""Extract current Canadian steel surtax schedules from Justice Laws consolidations."""
from collections import defaultdict
from hashlib import sha256
import json
from pathlib import Path
import re
import sys

from lxml import html

BASE = "https://laws-lois.justice.gc.ca/eng/regulations/"
CURRENT_EDITION = "2026-10-19"
CHECKED = "2026-11-11"
TERMS = BASE + "SI-97-5/FullText.html"
FTA_PARTNERS = dict(zip(
    ("Australia|Austria|Belgium|Brunei Darussalam|Bulgaria|Chile|Colombia|Costa Rica|"
     "Croatia|Cyprus|Czechia|Denmark|Estonia|Finland|France|Germany|Greece|Honduras|"
     "Hungary|Iceland|Ireland|Israel|Italy|Japan|Jordan|Korea|Latvia|Liechtenstein|"
     "Lithuania|Luxembourg|Malaysia|Malta|Netherlands|New Zealand|Norway|Panama|Peru|"
     "Poland|Portugal|Romania|Singapore|Slovakia|Slovenia|Spain|Sweden|Switzerland|"
     "Ukraine|United Kingdom|Vietnam").split("|"),
    "AU AT BE BN BG CL CO CR HR CY CZ DK EE FI FR DE GR HN HU IS IE IL IT JP JO KR LV LI LT LU MY MT NL NZ NO PA PE PL PT RO SG SK SI ES SE CH UA GB VN".split(),
    strict=True,
))


def normalized(element):
    return " ".join(element.text_content().split())


def source(raw, order, title, limitations):
    filename = f"SOR-{order}.html"
    data = (raw / filename).read_bytes()
    document = html.fromstring(data)
    url = f"{BASE}SOR-{order}/FullText.html"
    assert f"Regulations are current to {CURRENT_EDITION}" in normalized(document)
    assert title in normalized(document.xpath("//h1")[0])
    metadata = {
        "id": f"ca-steel-sor-{order}-2026-11-11",
        "jurisdiction": "CA",
        "countries": ["CA"],
        "zone": "standard",
        "edition": f"SOR/{order} consolidation through {CURRENT_EDITION}",
        "hsEdition": "HS2022",
        "availableFrom": CURRENT_EDITION,
        "availableThrough": CHECKED,
        "checkedOn": CHECKED,
        "scope": "national_schedule",
        "role": "measures",
        "authority": "Justice Laws Website, Canada",
        "sourceUrl": url,
        "terms": "Reproduction of Federal Law Order, SI/97-5",
        "termsUrl": TERMS,
        "inputFiles": [{"name": filename, "url": url, "sha256": sha256(data).hexdigest()}],
        "limitations": limitations,
    }
    schedules = document.xpath('//main//div[contains(concat(" ",normalize-space(@class)," ")," Schedule ")]')
    return metadata, schedules


def charge(label, rate, condition, **origins):
    return {
        "charge": "additional_duty",
        "treatment": "quota" if rate == "50%" else "temporary",
        "label": label,
        "expression": rate,
        "condition": condition,
        **origins,
    }


def line(raw_code, metadata, reference, rate):
    code = raw_code.replace(".", "")
    return {
        "code": code,
        "reference": reference,
        "url": metadata["sourceUrl"],
        **({"matchPrefix": True} if len(code) == 8 else {}),
        "rates": [rate],
    }


def item_codes(root, element):
    pattern = re.compile(r"\d{4}\.\d{2}\.\d{2}")
    return [value for node in root.xpath(f".//{element}") if pattern.fullmatch(value := normalized(node))]


def extract(raw):
    metadata, schedules = source(raw, "2024-187", "China Surtax Order (2024)", [
        "Schedule 2 covers steel and aluminum. Schedule 1 on electric vehicles was repealed effective 2026-03-01.",
        "See sections 1–3.1 for origin, transit and Chapter 98/99 treatment. Check competing surtax orders and remission.",
    ])
    codes = item_codes(schedules[1], "td")
    assert len(codes) == 182 == len(set(codes))
    yield metadata, [line(code, metadata, "SOR/2024-187 Schedule 2", charge(
        "China-origin steel and aluminum surtax", "25%",
        "Apply to value for duty. Check marking origin, Chapter 98/99 and repair exceptions, remission and precedence of out-of-quota steel surtax.",
        originCountries=["CN"],
    )) for code in codes]

    metadata, schedules = source(raw, "2025-154", "Steel Goods and Aluminum Goods Surtax Order", [
        "Origin filters exclude US-origin imports. Material processing in China is a separate product attribute.",
        "Apply sections 2–5 for certificates, declaration value, casual goods, Chapter 98, transit and China Surtax Order exclusions.",
    ])
    parts = schedules[0].xpath(".//ol")
    if len(parts) != 2:
        parts = schedules[0].xpath(".//ul")
    assert len(parts) == 2
    lines = []
    for index, part in enumerate(parts, 1):
        codes = item_codes(part, "li")
        material = ("steel melted and poured in China", "aluminum smelted and cast in China")[index - 1]
        for code in codes:
            lines.append(line(code, metadata, f"SOR/2025-154 Schedule Part {index}", charge(
                f"Goods containing {material}", "25%",
                f"Requires {material} or deemed presence under the certificate rules. Apply to value for duty. Section 5 exceptions include a single declaration totaling CAD 5,000 or less. Check priority and remission.",
                excludedOriginCountries=["US"],
            )))
    assert len(lines) == 182 == len({item["code"] for item in lines})
    yield metadata, lines

    metadata, schedules = source(raw, "2025-267", "Steel Derivative Goods Surtax Order", [
        "Check section 2 and remission instruments including SOR/2026-227.",
        "The steel derivative surtax is subordinate to listed competing surtaxes. Verify all exclusions before assessment.",
    ])
    remission = "SOR-2026-227.html"
    metadata["inputFiles"].append({
        "name": remission,
        "url": "https://gazette.gc.ca/rp-pr/p2/2026/2026-11-04/html/sor-dors227-eng.html",
        "sha256": sha256((raw / remission).read_bytes()).hexdigest(),
    })
    codes = item_codes(schedules[0], "li")
    assert len(codes) == 61 == len(set(codes))
    yield metadata, [line(code, metadata, "SOR/2025-267 Schedule", charge(
        "Steel derivative goods surtax", "25%",
        "Apply to value for duty. Section 2 excludes certain competing surtaxes, casual goods, Chapter 98, qualifying auto and aerospace uses, specified wind towers, and qualifying in-transit imports. Check remission.",
        excludedOriginCountries=["CA"],
    )) for code in codes]

    metadata, schedules = source(raw, "2025-148", "Order Imposing a Surtax on the Importation of Certain Steel Goods", [
        "Schedules 1–2 use exact ten-digit Canadian classifications. Quota levels and permit availability require contemporaneous checks.",
        "Section 3.1 gives an applicable steel quota surtax precedence over other surtaxes. Section 4 repeals the order on its second anniversary.",
    ])
    countries = [normalized(item) for item in schedules[2].xpath(".//li") if not normalized(item).startswith("SOR/")]
    assert set(countries) == set(FTA_PARTNERS)
    partners = sorted(FTA_PARTNERS[name] for name in countries)
    lines = defaultdict(list)
    for index, schedule in enumerate(schedules[:2], 1):
        for row in schedule.xpath(".//tbody/tr"):
            cells = row.xpath("./th|./td")
            if len(cells) != 5:
                continue
            item, product, total, per_country = map(normalized, cells[:4])
            if not item.isdigit():
                continue
            origins = {"excludedOriginCountries": sorted({*partners, "CA", "US", "MX"})} if index == 1 else {"originCountries": partners}
            for entry in cells[4].xpath(".//li"):
                code = normalized(entry)
                assert re.fullmatch(r"\d{4}\.\d{2}\.\d{2}\.\d{2}", code), code
                lines[code].append(line(code, metadata, f"SOR/2025-148 Schedule {index} item {item}", charge(
                    f"Above-quota steel surtax, Schedule {index}", "50%",
                    f"{product}. Quarterly total {total} tonnes. Country cap {per_country} of that total. Verify the quarterly balance and permit under section 2 or 2.1. A valid permit is required to claim within-quota treatment. Review section 3 exceptions and section 3.1 priority.",
                    **origins,
                )))
    assert len(lines) > 550
    result = []
    for entries in lines.values():
        result.append({
            **entries[0],
            "reference": " / ".join(entry["reference"] for entry in entries),
            "rates": [rate for entry in entries for rate in entry["rates"]],
        })
    yield metadata, result


def main():
    raw, output = map(Path, sys.argv[1:])
    output.mkdir(parents=True, exist_ok=True)
    for metadata, lines in extract(raw):
        identifier = metadata["id"]
        for label, value in (("source", metadata), ("lines", lines)):
            (output / f"{identifier}.{label}.json").write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")
        print(identifier, len(lines), sum(len(line["rates"]) for line in lines))


if __name__ == "__main__":
    main()
