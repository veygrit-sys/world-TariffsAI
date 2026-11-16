"""Extract independently dated general duty rows for selected Israel Customs items."""

import argparse
import hashlib
import json
import re
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from lxml import html


_ITEM_URL = "https://shaarolami-query.customs.mof.gov.il/CustomspilotWeb/he/CustomsBook/Import/ImportCustomsItemDetails"
_SELECTED = {"5073": "6912000000/0", "29581": "8711609000/9"}


def extract_item(file: Path, item_id: str, full_code: str, expected_day: date):
    body = file.read_bytes()
    if not body.rstrip().lower().endswith(b"</html>"):
        raise ValueError(f"Incomplete HTML: {file}")
    page = html.fromstring(body, parser=html.HTMLParser(encoding="UTF-8", no_network=True))
    expected_label = expected_day.strftime("%d/%m/%Y")
    date_labels = page.xpath("//div[starts-with(normalize-space(text()), 'נכון לתאריך')]/text()")
    if len(date_labels) != 1 or date_labels[0].split()[-1] != expected_label:
        raise ValueError(f"Unexpected tariff as-of date: {file}")
    code_links = [
        span.text_content().strip()
        for span in page.xpath("//span[contains(@class, 'treeTitle') and @data-url]")
        if parse_qs(urlparse(span.get("data-url")).query).get("customsItemId") == [item_id]
    ]
    if code_links != [full_code]:
        raise ValueError(f"Unexpected classification for customs item {item_id}")
    tables = page.xpath("//table[thead/tr/th[normalize-space(.)='שיעור מכס']]")
    if len(tables) != 1:
        raise ValueError(f"Expected one customs-duty table: {file}")
    general_rows = []
    for row in tables[0].xpath("./tbody/tr"):
        cells = [" ".join(cell.text_content().split()) for cell in row.xpath("./td")]
        if len(cells) >= 2 and cells[1] == "כללי":
            general_rows.append(cells)
    if len(general_rows) != 1 or len(general_rows[0]) != 8:
        raise ValueError(f"Expected one general customs duty row: {file}")
    _, _, expression, quota_rate, quota_id, _, start, end = general_rows[0]
    if quota_rate or quota_id:
        raise ValueError(f"Unexpected quota on the general customs duty row: {file}")
    if expression == "פטור":
        percent = "0"
    elif re.fullmatch(r"[0-9]+(?:\.[0-9]+)?%", expression):
        percent = format(Decimal(expression[:-1]).normalize(), "f")
    else:
        raise ValueError(f"Expected explicit exemption or one percentage: {file}")
    start = datetime.strptime(start, "%d/%m/%Y").date()
    end = datetime.strptime(end, "%d/%m/%Y").date()
    if not start <= expected_day <= end:
        raise ValueError(f"Rate date range does not cover requested local date: {file}")
    url = f"{_ITEM_URL}?customsItemId={item_id}"
    code, check_digit = full_code.split("/")
    line = {
        "code": code,
        "url": url,
        "reference": f"Israel Tax Authority item {full_code}, general customs duty row, local as-of {expected_day}",
        "rates": [{
            "charge": "customs_duty",
            "treatment": "general",
            "label": "Published general customs duty",
            "expression": f"{percent}%",
            "sourceCode": code + check_digit,
            "from": start.isoformat(),
            "through": end.isoformat(),
        }],
    }
    original = {
        "name": f"Israel Tax Authority customs item {full_code}",
        "url": url,
        "sha256": hashlib.sha256(body).hexdigest(),
    }
    return line, original


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("evidence", type=Path, help="Directory containing the selected item pages as ITEM_ID.html")
    parser.add_argument("local_date", type=date.fromisoformat)
    parser.add_argument("checked_on_jst", type=date.fromisoformat)
    parser.add_argument("output", type=Path)
    parser.add_argument("--item-id", choices=_SELECTED, action="append", help="Repeat to select exact items. Defaults to both.")
    args = parser.parse_args()
    if args.checked_on_jst < args.local_date:
        raise ValueError("Review date predates source coverage")
    item_ids = list(dict.fromkeys(args.item_id or _SELECTED))
    lines, inputs = map(list, zip(*[
        extract_item(args.evidence / f"{item_id}.html", item_id, _SELECTED[item_id], args.local_date)
        for item_id in item_ids
    ]))
    day = args.local_date.isoformat()
    count = len(item_ids)
    page_count = "One Israel Tax Authority Customs Book item page" if count == 1 else "Two Israel Tax Authority Customs Book item pages"
    coverage_limit = (
        "One exact code only. The item page explicitly shows the general customs duty and its stated line validity. Snapshot availability is limited to the Israel-local date displayed on the source page."
        if count == 1 else
        "Two selected exact codes only. The item pages explicitly show the general customs duty and its stated line validity. Snapshot availability is limited to the Israel-local date displayed on both source pages."
    )
    source = {
        "id": f"il-customs-book-selected-general-duty-{day}",
        "jurisdiction": "IL",
        "countries": ["IL"],
        "zone": "standard",
        "edition": f"{page_count} as of {day} Israel local time",
        "hsEdition": "Israel Customs Book HS",
        "availableFrom": day,
        "availableThrough": day,
        "checkedOn": args.checked_on_jst.isoformat(),
        "scope": "published_baseline",
        "authority": "Israel Tax Authority",
        "sourceUrl": "https://www.gov.il/en/service/customs-tariff",
        "terms": "Israel Tax Authority public tariff book. Derived numerical rates, date fields and identifiers only, with source attribution. Original HTML is not redistributed.",
        "termsUrl": "https://www.gov.il/es/pages/gov_terms_of_use",
        "inputFiles": inputs,
        "limitations": [
            coverage_limit,
            "Only the ordinary general customs duty is represented. Separately check classification, valuation, preferences, import VAT, purchase tax, other charges, import controls and legal requirements.",
            "If an official web item and the legal instruments differ, the legal instruments prevail.",
        ],
    }
    args.output.mkdir(parents=True, exist_ok=False)
    for name, document in (("source.json", source), ("lines.json", lines)):
        (args.output / name).write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
