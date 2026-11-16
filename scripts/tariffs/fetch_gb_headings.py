"""Download selected HMRC Trade Tariff heading responses for a fixed date."""
import argparse
import concurrent.futures
import json
import re
import threading
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

DATE = "2026-11-11"
BASE = "https://www.trade-tariff.service.gov.uk/uk/api/headings/"
HEADINGS = """
0101 0201 0202 0203 0204 0207 0301 0302 0303 0304 0305 0401 0402 0403 0404 0405 0406 0407 0408 0409
0701 0702 0703 0704 0705 0706 0707 0708 0709 0710 0711 0712 0713 0714
0801 0802 0803 0804 0805 0806 0807 0808 0809 0810 0811 0812 0813 0814
0901 0902 0903 0904 0905 0906 0907 0908 0909 0910 1001 1005 1006 1101 1102 1103 1104
1507 1509 1511 1512 1515 1601 1602 1603 1604 1605 1701 1702 1703 1704 1801 1802 1803 1804 1805 1806
1901 1902 1903 1904 1905 2001 2002 2003 2004 2005 2006 2007 2008 2009 2101 2102 2103 2104 2105 2106
2201 2202 2203 2204 2205 2206 2207 2208 2209 2309 2402 2716 3002 3003 3004 3005 3006
3303 3304 3305 3306 3307 3401 3402 3924 3926 4202 4203 4901 4902 4903 4904 4905 4911
6101 6102 6103 6104 6105 6106 6107 6108 6109 6110 6111 6112 6113 6114 6115 6116 6117
6201 6202 6203 6204 6205 6206 6207 6208 6209 6210 6211 6212 6213 6214 6215 6216 6217 6301 6302 6303 6304 6307 6309
6401 6402 6403 6404 6405 6505 6602 7113 7117 8414 8471 8504 8507 8517 8518 8523 8528 8544 8711 8712 8713 9001 9004 9021 9101 9102 9401 9403 9404 9405 9503 9504 9505 9506 9507 9608 9619
""".split()
lock = threading.Lock()
not_before = 0.0

def source_url(code):
    return f"{BASE}{code}?as_of={DATE}"

def fetch(code, root):
    global not_before
    output = root / f"gb-heading-{code}-{DATE}.json"
    if output.exists():
        return
    url = source_url(code)
    for attempt in range(2):
        with lock:
            now = time.monotonic()
            delay = max(0, not_before - now)
            not_before = max(now, not_before) + 0.33
        time.sleep(delay)
        try:
            request = Request(url, headers={"Accept": "application/json"})
            with urlopen(request, timeout=16) as response:
                raw = response.read()
            document = json.loads(raw)
            actual = document["data"]["attributes"]["goods_nomenclature_item_id"]
            if actual != code + "000000":
                raise ValueError((code, actual))
            output.write_bytes(raw)
            return
        except HTTPError as error:
            if error.code == 429:
                with lock:
                    not_before = max(not_before, time.monotonic() + 12)
            elif error.code < 500:
                print(code, str(error), flush=True)
                return
        except (URLError, TimeoutError, ValueError, KeyError) as error:
            print(code, str(error), flush=True)
    print(code, "download incomplete", flush=True)

def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("raw_dir", type=Path)
    cli.add_argument("--limit", type=int, default=len(HEADINGS))
    args = cli.parse_args()
    args.raw_dir.mkdir(parents=True, exist_ok=True)
    assert len(HEADINGS) == len(set(HEADINGS))
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        list(executor.map(lambda code: fetch(code, args.raw_dir), HEADINGS[:args.limit]))
    print("Downloaded", len(list(args.raw_dir.glob(f"gb-heading-*-{DATE}.json"))), "heading responses.")

if __name__ == "__main__":
    main()
