"""Download dated CN-linked VAT information from the public Commission TEDB SOAP service."""
from argparse import ArgumentParser
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path
from urllib.request import Request, urlopen
from xml.etree import ElementTree as ET

ENDPOINT = "https://ec.europa.eu/taxation_customs/tedb/ws/"
SERVICE = "urn:ec.europa.eu:taxud:tedb:services:v1:"
MESSAGE = f"{SERVICE}IVatRetrievalService"
TYPES = f"{MESSAGE}:types"
SOAP = "http://schemas.xmlsoap.org/soap/envelope/"
MEMBERS = "AT BE BG CY CZ DE DK EE EL ES FI FR HR HU IE IT LT LU LV MT NL PL PT RO SE SI SK".split()


def fetch(country, as_of, out):
    envelope = ET.Element(f"{{{SOAP}}}Envelope")
    body = ET.SubElement(envelope, f"{{{SOAP}}}Body")
    query = ET.SubElement(body, f"{{{MESSAGE}}}retrieveVatRatesReqMsg")
    members = ET.SubElement(query, f"{{{TYPES}}}memberStates")
    ET.SubElement(members, f"{{{TYPES}}}isoCode").text = country
    ET.SubElement(query, f"{{{TYPES}}}situationOn").text = as_of
    request = Request(ENDPOINT, data=ET.tostring(envelope, encoding="utf-8"), headers={
        "Content-Type": "text/xml; charset=UTF-8",
        "SOAPAction": f'"{SERVICE}VatRetrievalService/RetrieveVatRates"',
    })
    with urlopen(request, timeout=27) as response:
        content = response.read(12_000_001)
    if len(content) > 12_000_000:
        raise ValueError(f"Oversized TEDB response for {country}")
    root = ET.fromstring(content)
    results = root.findall(".//{*}vatRateResults")
    if not results or {r.findtext("{*}memberState") for r in results} != {country}:
        raise ValueError(f"Missing or inconsistent TEDB response for {country}")
    (out / f"tedb_{country.lower()}.xml").write_bytes(content)
    return country, len(results), sum(len(r.findall("{*}cnCodes/{*}code")) for r in results)


def main():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    parser.add_argument("--date", default="2026-11-11", type=lambda value: date.fromisoformat(value).isoformat())
    parser.add_argument("--countries", nargs="+", choices=MEMBERS, default=MEMBERS)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = {country: pool.submit(fetch, country, args.date, args.output) for country in args.countries}
        failed = []
        for country, future in futures.items():
            try:
                print(*future.result(), flush=True)
            except (ValueError, OSError, ET.ParseError) as error:
                print(country, str(error), flush=True)
                failed.append(country)
        if failed:
            raise SystemExit(f"TEDB fetch failed: {', '.join(failed)}")


if __name__ == "__main__":
    main()
