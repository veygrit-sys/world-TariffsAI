#!/usr/bin/env python3
"""Normalize Singapore Customs (Duties) Order First Schedule and Gazette amendments."""
from argparse import ArgumentParser
from collections import defaultdict
import gzip
from hashlib import sha256
import json
from pathlib import Path
import re
import subprocess

from lxml import etree

START = "2026-10-28"
CHECKED = "2026-11-11"
GAZETTE = "https://assets.egazette.gov.sg"
SSO = "https://sso.agc.gov.sg/SL/CA1960-OR4"
CODE = re.compile(r"[0-9]{4}\.[0-9]{2}\.[0-9]{2}")
ANCHOR = re.compile(r"(?:[0-9]{2}\.[0-9]{2}|[0-9]{4}\.[0-9]{2}(?:\.[0-9]{2})?)")
SOURCES = {}
for year, notice in [(2022,483),(2022,789),(2022,1036),(2023,67),(2025,274),(2025,323),
                     (2026,49),(2026,67),(2026,785),(2026,809)]:
    stem = f"{notice:03}" if notice < 785 or year < 2026 else f"26sls{notice}"
    SOURCES[f"sg-s{notice:03}-{year}.pdf"] = (
        f"{GAZETTE}/{year}/Legislative%20Supplements/Subsidiary%20Legislation%20Supplement/{stem}.pdf"
    )

def document_text(path):
    return subprocess.check_output(["pdftotext","-layout",str(path),"-"], text=True)

def source_page(raw, name, page=None):
    return SOURCES[name] + (f"#page={page}" if page else "")

def schedule_rows(path):
    """Read the explicit 8-digit rate rows using the printed column positions."""
    xml = subprocess.check_output(["pdftotext", "-bbox-layout", str(path), "-"])
    root = etree.fromstring(xml)
    pages = root.xpath("//*[local-name()='page']")
    seen = set()
    for page_number, page in enumerate(pages, start=1):
        words = []
        for node in page.xpath(".//*[local-name()='word']"):
            if node.text:
                words.append((float(node.get("xMin")), float(node.get("xMax")), float(node.get("yMin")), node.text))
        headers = {w[3]:w for w in words if 130 < w[2] < 183 and w[3] in {
            "Subheading","Description","Quantity","Full","Pref","Excise","GST"
        }}
        anchors = []
        subheading_x = headers.get("Subheading", (155,))[0]
        for x,_,y,token in words:
            if y > 180 and 115 < x < subheading_x + 7 and ANCHOR.fullmatch(token):
                anchors.append((y,token))
        anchors.sort()
        if not any(CODE.fullmatch(code) for _,code in anchors):
            continue
        assert len(headers) == 7, (page_number, headers)
        def midpoint(name):
            w = headers[name]
            return (w[0] + w[1]) / 2
        full_start = (midpoint("Quantity") + midpoint("Full")) / 2
        pref_start = (midpoint("Full") + midpoint("Pref")) / 2 + 1
        excise_start = (midpoint("Pref") + midpoint("Excise")) / 2
        gst_start = headers["GST"][0] - 4
        for index, (y, printed) in enumerate(anchors):
            if not CODE.fullmatch(printed):
                continue
            code = printed.replace(".","")
            assert code not in seen, (page_number, code)
            seen.add(code)
            through_y = anchors[index+1][0] - 0.3 if index+1<len(anchors) else y+80
            cols = defaultdict(list)
            for x,x2,yw,token in words:
                if yw < y-0.25 or yw >= through_y:
                    continue
                center = (x+x2)/2
                if not x >= headers["Quantity"][0] - 6:
                    continue
                if center < full_start:
                    if abs(yw-y)<0.3:
                        cols["units"].append((yw,x,token))
                elif center < pref_start:
                    cols["full"].append((yw,x,token))
                elif center < excise_start:
                    cols["pref"].append((yw,x,token))
                elif x < gst_start:
                    cols["excise"].append((yw,x,token))
            output = {key:" ".join(t for _,_,t in sorted(items,key=lambda w:(round(w[0],1),w[1])))
                      for key,items in cols.items() if min(item[0] for item in items) <= y+0.25}
            # Some rate cells are blank. Ignore prose outside the rate-bearing rows.
            for key in ("full","pref","excise"):
                value = output.get(key,"")
                if value and not re.match(r"^(?:\$|[0-9]|Free\b)",value):
                    raise ValueError((page_number,code,key,value))
            yield code, page_number, output
    assert len(seen) == 11424, len(seen)

def apply_amendments(raw, records):
    diesel_rates = {
        "27101971": "$2.00 per dal of diesel fuel conforming to the standard for sulphur for such diesel fuel specified in Part 1 of the Eighth Schedule to the Environmental Protection and Management (Vehicular Emissions) Regulations (Rg 6)",
        "27101972": "$2.00 per dal of diesel fuel conforming to the standard for sulphur for such diesel fuel specified in Part 1 of the Eighth Schedule to the Environmental Protection and Management (Vehicular Emissions) Regulations (as if such diesel fuel were automotive)",
    }
    # Preserve two unusually tall diesel rows whose wrapped text extends past normal cells.
    schedule = document_text(raw/"sg-s483-2022.pdf")
    for code, expression in diesel_rates.items():
        assert records[code]["excise"].startswith("$2.00 per dal")
        assert "were automotive)" in schedule or "were automotive)" in schedule
        records[code]["excise"] = expression

    a22 = document_text(raw/"sg-s789-2022.pdf")
    assert "insert\n             “$8.00 per litre of alcohol”" in a22
    insert = re.findall(r"H\.S\. Code (2208\.90\.[1-4]0)",a22)
    assert len(insert)==8
    for printed in set(insert):
        code = printed.replace(".","")
        records[code]["full"]="$8.00 per litre of alcohol"
        records[code]["pref"]="Free"
        records[code]["dutyAmendment"]="sg-s789-2022.pdf"
    assert "H.S. Code 8711.90.40, in column (7), delete “12%”" in a22
    assert records["87119040"].pop("excise") == "12%"

    # S 1036/2022 removed the GST column. Standalone import GST applies under the GST Act.
    assert "column (8)" in document_text(raw/"sg-s1036-2022.pdf")
    for year in (2023,2026):
        name = f"sg-s067-{year}.pdf"
        source = document_text(raw/name)
        source = source.split("Amendment of First Schedule",1)[1].split("[G.N. Nos.",1)[0]
        matches = list(re.finditer(r"replace\s+“([^”]+)” with “([^”]+)”",source))
        assert len(matches)==4
        count=0
        for i, m in enumerate(matches):
            region = source[m.end():matches[i+1].start() if i+1<len(matches) else len(source)]
            old,new=m.groups()
            for printed in re.findall(r"H\.S\. Code (\d{4}\.\d{2}\.\d{2})",region):
                code=printed.replace(".","")
                old_rate=records[code]["excise"]
                assert old in old_rate, (code,old,old_rate)
                records[code]["excise"]=old_rate.replace(old,new,1)
                records[code]["exciseAmendment"]=name
                count+=1
        assert count==34,(year,count)
    a25=document_text(raw/"sg-s274-2025.pdf")
    assert "delete H.S. Code 8536.50.92" in a25
    assert not records.pop("85365092").get("full")
    assert records["84718090"]["units"]=="NMB"
    records["84718090"]["units"]="KGM"
    assert "Amendment of First Schedule" not in document_text(raw/"sg-s785-2026.pdf")

def money_expr(expression):
    return expression.replace("$","SGD ").replace(" cents", " Singapore cents")

def pack(raw, output, pack_id, lines, role=None):
    target = output / f"{pack_id}.json.gz"
    target.write_bytes(gzip.compress(json.dumps({"id":pack_id,"lines":lines},ensure_ascii=False,separators=(",",":")).encode(),mtime=0))
    charges = sorted({rate["charge"] for row in lines for rate in row["rates"]})
    snapshot = {
        "id":pack_id,"file":target.name,"sha256":sha256(target.read_bytes()).hexdigest(),
        "jurisdiction":"SG","countries":["SG"],"zone":"standard",
        "edition":"Customs (Duties) Order First Schedule, Gazette S483/2022 consolidated through S785/2026",
        "hsEdition":"AHTN2022","availableFrom":START,"availableThrough":CHECKED,"checkedOn":CHECKED,
        "scope":"national_schedule","authority":"Singapore Ministry of Finance, Government Gazette",
        "sourceUrl":SSO,
        "terms":"Singapore Government copyright. e-Gazette statutory rates reproduced with Singapore Government permission under e-Gazette Terms of Use clause 11. Check Singapore e-Gazette for the latest legislation. Veygrit is independent.",
        "termsUrl":"https://www.egazette.gov.sg/terms-of-use/",
        "inputFiles":[{"name":name,"url":url,"sha256":sha256((raw/name).read_bytes()).hexdigest()} for name,url in SOURCES.items()],
        "limitations":[
            "First Schedule columns 5 to 7 provide duty references. A blank full customs duty cell is shown as 0% basic customs duty. Excise, GST, prohibitions and permit requirements are separate.",
            "Preferential rates require a qualifying agreement and origin evidence under paragraph 4 as amended by S785/2026.",
            "S1036/2022 removed the old GST column. Import GST is governed by the separate GST regime.",
            "This data records statutory rates and code/unit changes. Consult current official product descriptions, exclusions and exemptions including the exemption order S809/2026.",
        ],
        "statistics":{"lines":len(lines),"uniqueCodes":len(lines),"codesWithRates":len(lines),
                      "rates":sum(len(r["rates"]) for r in lines),"chapters":sorted({r["code"][:2] for r in lines}),
                      "charges":charges},
    }
    if role: snapshot["role"]=role
    (output/f"{pack_id}.snapshot.json").write_text(json.dumps(snapshot,indent=2,ensure_ascii=False)+"\n")
    print(pack_id, snapshot["statistics"]["lines"],snapshot["statistics"]["rates"])

def build(raw, output):
    base_file="sg-s483-2022.pdf"
    records={}
    for code,page,fields in schedule_rows(raw/base_file):
        records[code]={"page":page,**fields}
    apply_amendments(raw,records)
    base=[]
    excise=[]
    for code,values in sorted(records.items()):
        page=values["page"]
        base_url=source_page(raw,base_file,page)
        reference=f"Singapore Customs (Duties) Order First Schedule, Gazette S483/2022 p. {page}"
        row={"code":code,"reference":reference,"url":base_url,"rates":[]}
        if values.get("units"):
            row["units"]=[values["units"]]
        if "dutyAmendment" in values:
            row["reference"] += ", as amended by S789/2022"
            row["url"]=source_page(raw,values["dutyAmendment"])
        full=money_expr(values.get("full") or "0%")
        row["rates"].append({"charge":"customs_duty","treatment":"general","label":"Full customs duty",
                             "expression":full,"sourceCode":code})
        if values.get("pref"):
            row["rates"].append({"charge":"customs_duty","treatment":"preferential","label":"Preferential customs duty",
                                 "expression":money_expr(values["pref"]),"sourceCode":code,
                                 "condition":"Verify agreement and product eligibility, origin and documentation under paragraph 4."})
        base.append(row)
        if values.get("excise"):
            amend=values.get("exciseAmendment")
            ex_ref=reference
            if amend:
                ex_ref += ", as amended by S67/2026"
            excise.append({"code":code,"reference":ex_ref,"url":source_page(raw,amend) if amend else base_url,
                "rates":[{"charge":"excise","treatment":"general","label":"Singapore excise duty",
                          "expression":money_expr(values["excise"]),"sourceCode":code,
                          "condition":"Apply the statutory description, quantity unit, exemptions and other conditions."}]})
    assert len(base)==11423
    assert len([r for r in base if r["rates"][0]["expression"]!="0%"])==8
    assert len(excise)==597, len(excise)
    assert next(r for r in excise if r["code"]=="24011010")["rates"][0]["expression"]=="SGD 535.00 per kgm"
    assert next(r for r in base if r["code"]=="22030011")["rates"][0]["expression"]=="SGD 16.00 per litre of alcohol"
    output.mkdir(parents=True,exist_ok=True)
    pack(raw,output,"sg-customs-first-schedule-2026-10",base)
    pack(raw,output,"sg-excise-first-schedule-2026-10",excise,"measures")

if __name__=="__main__":
    parser=ArgumentParser(description=__doc__)
    parser.add_argument("raw",type=Path)
    parser.add_argument("output",type=Path)
    args=parser.parse_args()
    build(args.raw,args.output)
