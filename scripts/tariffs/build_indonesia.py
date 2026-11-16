#!/usr/bin/env python3
"""Normalize Indonesia's legal BTKI tariff and current amendments."""
from argparse import ArgumentParser
import gzip
from hashlib import sha256
import json
from pathlib import Path
import re
import subprocess

SOURCE = "https://jdih.kemenkeu.go.id"
SOURCES = {
    26: ("26/PMK.010/2022", "04d90736-33d5-4b72-92a3-0d2b7c6bb8bd/26~PMK.010~2022Per.pdf"),
    10: ("10/2024", "f81eaacb-b3f2-478f-945f-40b3a640b0bc/2024pmkeuangan010.pdf"),
    62: ("62/2025", "68f2717a-1383-48a2-a7e0-8a624030550a/2025pmkeuangan062.pdf"),
    50: ("50/2026", "11a0ec3c-7cde-4dac-a02a-9f06d7e650f0/2026pmkeuangan050.pdf"),
    68: ("68/2026", "ad3eaf94-d53c-46c7-98c4-dddd0cc4c2d6/2026pmkeuangan068.pdf"),
}
PLASTICS = {"39011012","39011019","39011099","39021030","39021090","39023030"}
LPG = {"98451000","98452000"}
IT = {"85176210","85176249","85176269"}
ANNEX = re.compile(r"(?m)^ +LAMPIRAN III *$")
ROW = re.compile(r"^ *(?:(\d{1,5}) +)?(\d{4}[.,]\d{2}[.,]\d{2})(?: +|$)")
PERCENT = re.compile(r"(\d{1,3})[,.](\d{2})(?:%|°/o|0/o)[,;.]?")
SPECIFIC = re.compile(r"Rp\.\s*([\d.]+),-/((?:kg|liter|menit|mcnit|unit|batang))",re.I)


def pdf_url(n, page=None):
    url = SOURCE + "/api/download/" + SOURCES[n][1]
    return url if not page else f"{url}#page={page}"


def text(raw, n):
    return subprocess.check_output(["pdftotext","-layout",str(raw / f"id-{n}.pdf"),"-"], text=True)


def rows(full):
    start = ANNEX.search(full).start()
    first = full[:start].count("\f") + 1
    for page, content in enumerate(full[start:].split("\f"),first):
        for line in content.splitlines():
            match = ROW.match(line)
            if match:
                number, heading = match.groups()
                cells = re.split(r" {2,}",line[match.end():].strip())
                # The legal rate cell stands to the right of the description.
                tail = cells[-1] if len(cells) >= 2 or line.rfind(cells[-1]) > 72 else ""
                yield number, re.sub(r"\D","",heading), tail, page


def expression(cell):
    if match := PERCENT.fullmatch(cell):
        return f"{match[1]}.{match[2]}%"
    if match := SPECIFIC.fullmatch(cell):
        unit = {"kg":"kg","liter":"litre","menit":"minute","mcnit":"minute",
                "unit":"unit","batang":"stick"}[match[2].lower()]
        return f"IDR {match[1].replace('.','')} per {unit}"
    return None


def rate(code, expr, treatment="general", condition=None):
    item = {"charge":"customs_duty","treatment":treatment,
            "label":"Indonesian import duty", "expression":expr,"sourceCode":code}
    if condition:
        item["condition"] = condition
    return item


def build(raw, output):
    base_text = text(raw,26)
    amend10 = text(raw,10)
    amend62 = text(raw,62)
    amend50 = text(raw,50)
    amend68 = text(raw,68)
    assert "31 Desember 2025" in amend10
    base = {}
    for number,code,cell,page in rows(base_text):
        if not (expr := expression(cell)):
            continue
        assert code not in base,(code,page)
        base[code]=(expr,page)
    current = {}
    for number,code,cell,page in rows(amend62):
        if not number:
            continue
        assert code not in current,(code,page)
        current[code]=(int(number),cell,page)
    assert len(current)==11552 and list(x[0] for x in current.values())==list(range(1,11553))
    changed = {code for code,(_,cell,_) in current.items() if cell!="Tetap"}
    assert changed==IT
    assert all(expression(current[code][1])=="0.00%" for code in IT)
    latest = {}
    for number,code,cell,page in rows(amend50):
        if not number:
            continue
        assert code not in latest,(code,page)
        latest[code]=(int(number),cell,page)
    assert len(latest)==11702 and list(x[0] for x in latest.values())==list(range(1,11703))
    additions = set(latest)-set(current)
    assert len(additions)==150 and all(code.startswith("98") for code in additions)
    assert all(expression(latest[code][1])=="0.00%" for code in additions)
    assert set(current)<=set(latest)
    assert all(cell=="Tetap" for code,(_,cell,_) in latest.items() if code not in additions)
    assert all(code in latest for code in PLASTICS | LPG)
    plastics_section = amend68.split("Pasal 4B")[-1].split("Pasal II")[0]
    assert PLASTICS == {code.replace(".","") for code in re.findall(r"\d{4}\.\d{2}\.\d{2}",plastics_section)}
    assert re.search(r"selama 6 \(enam\) bulan", plastics_section)
    assert "0%" in plastics_section
    assert all(code[:4]+"."+code[4:6]+"."+code[6:] in amend50.split("Pasal II",1)[1].split("-4-")[0] for code in LPG)
    records = []
    for code, (number,_,page) in sorted(latest.items()):
        notes=[]
        rates=[]
        source_n=50
        special = "Chapter 98 requires the use and import eligibility stated in its national notes." if code.startswith("98") else (
            "Chapter 99 national conditions apply." if code.startswith("99") else None
        )
        if code in additions:
            expr=expression(latest[code][1])
        elif code in IT:
            source_n=62
            _,cell,page=current[code]
            expr=expression(cell)
        elif code in base:
            source_n=26
            expr,page=base[code]
        else:
            expr=None
            notes.append("Current tariff line is listed. The rate cell in the original Annex III was not reliably legible in the extraction.")
        if code in LPG:
            notes.append("PMK 50/2026 Article II grants 0% import duty on these LPG lines for six months from 28 July 2026.")
        if code in PLASTICS:
            notes.append("PMK 68/2026 Article 4B grants 0% on the listed plastic raw materials for six months from 9 October 2026.")
            rates.append(rate(code,"0%","temporary","PMK 68/2026 Article 4B for listed plastic raw materials. Check qualifying product and date."))
        if expr:
            if code in PLASTICS:
                special = "Published Annex III rate when the PMK 68/2026 Article 4B temporary treatment does not apply."
            if code in LPG:
                special += " See also the temporary LPG provision in PMK 50/2026 Article II."
            rates.append(rate(code,expr,condition=special))
        record={"code":code,"reference":f"PMK {SOURCES[source_n][0]} Annex III, p. {page}",
                "url":pdf_url(source_n,page),"rates":rates}
        if notes:
            record["notes"]=notes
        records.append(record)
    pack_id="id-btki-pmk68-2026"
    output.mkdir(parents=True,exist_ok=True)
    filename=pack_id+".json.gz"
    packed=gzip.compress(json.dumps({"id":pack_id,"lines":records},ensure_ascii=False,separators=(",",":")).encode(),mtime=0)
    (output/filename).write_bytes(packed)
    metadata={
        "id":pack_id,"file":filename,"sha256":sha256(packed).hexdigest(),
        "jurisdiction":"ID","countries":["ID"],"zone":"standard",
        "edition":"BTKI 2022, PMK 26/2022 as amended through PMK 68/2026",
        "hsEdition":"AHTN2022","availableFrom":"2026-10-09","availableThrough":"2026-11-11","checkedOn":"2026-11-11",
        "scope":"national_schedule","authority":"Indonesia Ministry of Finance, JDIH",
        "sourceUrl":SOURCE+"/dok/26-pmk-010-2022",
        "terms":"Statutory tariff numbers and numeric duties from Indonesian ministerial regulations. Indonesian Copyright Act 28/2014 Article 42 excludes legislation from copyright.",
        "termsUrl":"https://www.wipo.int/wipolex/en/text/370377",
        "inputFiles":[{"name":f"id-{n}.pdf","url":pdf_url(n),"sha256":sha256((raw/f"id-{n}.pdf").read_bytes()).hexdigest()} for n in SOURCES],
        "limitations":[
            "Eight-digit statutory BTKI import tariff candidates. Check legal descriptions, preferential agreements, safeguards, exemptions, quotas and Chapter 98 eligibility independently.",
            "2024 amendment special EV temporary treatment ended on 31 December 2025. PMK 62/2025 changes three IT tariff rates. PMK 50/2026 adds 150 Chapter 98 lines. PMK 68/2026 provides temporary duty relief for six plastic raw material codes.",
            "Unclear or missing original rate cells are kept empty. A missing rate never implies zero duty.",
        ],
        "statistics":{"lines":len(records),"uniqueCodes":len(records),"codesWithRates":sum(bool(r["rates"]) for r in records),"rates":sum(len(r["rates"]) for r in records),"chapters":sorted({r["code"][:2] for r in records}),"charges":["customs_duty"]},
    }
    (output/"manifest.json").write_text(json.dumps({"version":1,"snapshots":[metadata]},ensure_ascii=False,indent=2)+"\n")
    print(metadata["statistics"])


if __name__=="__main__":
    parser=ArgumentParser()
    parser.add_argument("raw",type=Path)
    parser.add_argument("output",type=Path)
    args=parser.parse_args()
    build(args.raw,args.output)
