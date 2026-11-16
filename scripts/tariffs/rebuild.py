#!/usr/bin/env python3
"""Convert official tariff snapshots into the catalog format. See docs/TARIFF_DATA.md."""
import argparse
import csv
from datetime import datetime
from decimal import Decimal
import gzip
import hashlib
import io
import json
from pathlib import Path
import re
import tarfile
import zipfile
from collections import Counter, defaultdict
from lxml import etree, html

CHECKED = '2026-11-11'
EU = 'AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE'.split()
DIGITS = re.compile(r'^[0-9]{6,12}$')
NS = '{http://www.w3.org/1999/xhtml}'


def clean(value):
    return ' '.join(str(value if value is not None else '').split())


def number(value):
    return clean(value).replace('.', '').replace(' ', '')


def rate(treatment, label, value, **details):
    return {'charge': 'customs_duty', 'treatment': treatment, 'label': label,
            'expression': clean(value), **details}


def line(code, reference, rates, **details):
    return {'code': code, 'reference': reference, 'rates': rates, **details}


def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def schedule(id, jurisdiction, countries, edition, start, scope, authority,
             url, terms, terms_url, inputs, limits, *, through=CHECKED):
    return {'id': id, 'jurisdiction': jurisdiction, 'countries': countries,
            'zone': 'standard', 'edition': edition, 'hsEdition': 'HS2022',
            'availableFrom': start, 'availableThrough': through,
            'checkedOn': CHECKED, 'scope': scope, 'authority': authority,
            'sourceUrl': url, 'terms': terms, 'termsUrl': terms_url,
            'inputFiles': inputs, 'limitations': limits}


def write_pack(out, metadata, lines):
    assert lines and all(DIGITS.fullmatch(r['code']) or (
        metadata.get('role') == 'measures' and r.get('matchPrefix')
        and re.fullmatch(r'[0-9]{2,5}', r['code'])
    ) for r in lines)
    lines.sort(key=lambda row: row['code'])
    content = {'id': metadata['id'], 'lines': lines}
    encoded = json.dumps(content, ensure_ascii=False, separators=(',', ':')).encode()
    path = out / (metadata['id'] + '.json.gz')
    path.write_bytes(gzip.compress(encoded, compresslevel=9, mtime=0))
    stats = {'lines': len(lines), 'uniqueCodes': len({r['code'] for r in lines}),
             'codesWithRates': len({r['code'] for r in lines if r['rates']}),
             'rates': sum(len(r['rates']) for r in lines),
             'chapters': sorted({r['code'][:2] for r in lines})}
    if metadata.get('role') == 'measures':
        stats['charges'] = sorted({rate['charge'] for row in lines for rate in row['rates']})
    return {**metadata, 'file': path.name, 'sha256': digest(path), 'statistics': stats}


def us(raw):
    path = raw / 'us-2026-23.json'
    rows = json.loads(path.read_text())
    assert len(rows) == 35805
    indexed = {}
    records = []
    for index, row in enumerate(rows, 1):
        code = number(row['htsno'])
        if len(code) not in (8, 10) or not DIGITS.fullmatch(code):
            continue
        source_rates = [(kind, label, row[key]) for kind, label, key in (
            ('mfn', 'Column 1 General', 'general'),
            ('preferential', 'Column 1 Special', 'special'),
            ('general', 'Column 2', 'other')) if clean(row[key])]
        rates = [rate(*data) for data in source_rates]
        notes = []
        for footnote in row['footnotes'] or []:
            if isinstance(footnote, dict) and clean(footnote.get('value')):
                notes.append(clean(footnote['value']))
        if row['quotaQuantity'] is not None:
            notes.append('Quota field present in the source.')
        if row.get('additionalDuties') or row.get('addiitionalDuties'):
            notes.append('Additional duties field present in the source.')
        parent = indexed.get(code[:8]) if len(code) == 10 else None
        source_code = code
        if not rates and parent is not None and parent['rates']:
            rates = parent['rates']
            notes.extend(parent.get('notes', []))
            source_code = parent['code']
        record = line(code, f'HTS {row["htsno"]}, record {index}', rates,
                      rateCode=source_code, units=[clean(v) for v in (row['units'] or []) if clean(v)])
        if notes:
            record['notes'] = list(dict.fromkeys(notes))
        records.append(record)
        if len(code) == 8:
            indexed[code] = record
    return schedule('us-hts-2026-r23', 'US', ['US', 'PR'], '2026 HTS Revision 23',
                    '2026-11-10', 'national_schedule', 'USITC',
                    'https://www.usitc.gov/harmonized_tariff_information/hts/archive/list',
                    'United States Government tariff schedule, 17 U.S.C. § 105',
                    'https://uscode.house.gov/us/usc/119-124/t17/s105/',
                    [{'name':path.name,'sha256':digest(path),'url':'https://www.usitc.gov/sites/default/files/tata/hts/hts_2026_revision_23_json.json'}],
                    ['Chapter 98 and 99 entries require their legal notes. A Chapter 1–97 lookup does not select additional measures.',
                     'Statistical suffixes may refer to their published eight-digit duty line.',
                     'Puerto Rico is part of the U.S. customs territory under 19 CFR 101.1. Puerto Rico local taxes and inland shipments require separate treatment.']), records


def ca(raw):
    path = raw / 'ca-2026-2.json'
    rows = json.loads(path.read_text())
    assert len(rows) == 22461
    records = []
    indexed = {}
    for index, row in enumerate(rows, 1):
        code = number(row['TARIFF'])
        if len(code) not in (8, 10) or not DIGITS.fullmatch(code):
            continue
        rates = []
        for key, value in row.items():
            if not clean(value):
                continue
            if key == 'MFN':
                rates.append(rate('mfn', key, value))
            elif key == 'General Tariff':
                rates.append(rate('general', key, value))
            elif key in {'AUT','NZT','CCCT','LDCT','GPT','UST','MXT','CIAT','CT','CRT',
                        'IT','NT','SLT','PT','COLT','JT','PAT','HNT','KRT','CEUT','CPTPT',
                        'UKT','UAT','CPUKT'}:
                rates.append(rate('preferential', key, value))
        direct_treatments = {r['label'] for r in rates}
        source_code = code
        parent = indexed.get(code[:8]) if len(code) == 10 else None
        # Statistical suffixes repeat some rates and leave other parent treatments blank.
        if parent is not None:
            inherited = [dict(r, sourceCode=parent['code']) for r in parent['rates']
                         if r['label'] not in direct_treatments]
            rates.extend(inherited)
            if not direct_treatments and inherited:
                source_code = parent['code']
        notes = [v for v in [clean(row['FOOTNOTE'])] if v]
        if parent is not None:
            notes.extend(parent.get('notes', []))
        units = [clean(row['UOM'])] if clean(row['UOM']) else []
        record = line(code, f'TPHS record {index}: {row["TARIFF"]}', rates,
                      rateCode=source_code, units=units)
        if notes:
            record['notes'] = list(dict.fromkeys(notes))
        records.append(record)
        if len(code) == 8:
            indexed[code] = record
    archive = raw / 'ca-2026-2.zip'
    return schedule('ca-t2026-2', 'CA', ['CA'], 'T2026-2', '2026-09-01',
                    'national_schedule', 'Canada Border Services Agency',
                    'https://www.cbsa-asfc.gc.ca/trade-commerce/tariff-tarif/2026/',
                    'Reproduction of Federal Law Order (SI/97-5), adapted schedule data',
                    'https://laws-lois.justice.gc.ca/eng/regulations/si-97-5/FullText.html',
                    [{'name':archive.name,'sha256':digest(archive),'url':'https://www.cbsa-asfc.gc.ca/trade-commerce/tariff-tarif/2026/01-99/01-99-2026-2-eng.zip'}],
                    ['Tariff treatments use the CBSA abbreviations. Eligibility and separate surtax orders require verification.',
                     'This transformation is a reference copy of the departmental consolidation.']), records


def jp(raw):
    folder = raw / 'jp-chapters'
    files = json.loads((folder/'files.json').read_text())
    assert len(files) == 96
    records = []
    seen_chapters = set()
    for file in files:
        path = folder / file['file']
        assert digest(path) == file['sha256']
        chapter = path.stem[-2:]
        root = html.fromstring(path.read_bytes().decode('cp932', errors='strict'))
        tables = [t for t in root.xpath('//table') if t.xpath('.//th[contains(., "WTO")]')]
        assert len(tables) == 1, (path, len(tables))
        rows = tables[0].xpath('.//tr')
        header = [clean(c.text_content()) for c in rows[1].xpath('./td|./th')]
        assert header[2:7] == ['基本General','暫定Temporary','WTO協定WTO','特恵GSP','特別特恵LDC']
        assert len(header) == 31, (path, header)
        last_hs = ''
        ancestor_rates = []
        for i, row in enumerate(rows[2:], 3):
            cells = row.xpath('./td|./th')
            if not cells:
                continue
            values = [clean(c.text_content()) for c in cells]
            if len(values) != 33:
                raise ValueError((path.name, i, len(values)))
            new_hs, suffix = number(values[0]), values[1]
            if re.fullmatch(r'\d{6}',new_hs):
                last_hs = new_hs
                ancestor_rates = []
            elif new_hs:
                last_hs = ''
                ancestor_rates = []
            if not last_hs:
                continue
            amounts = []
            for col in range(3,30):
                value = values[col]
                if value:
                    kind = {3:'general',4:'temporary',5:'mfn'}.get(col,'preferential')
                    amounts.append(rate(kind,header[col-1],value))
            if not suffix:
                if amounts:
                    ancestor_rates = amounts
                continue
            assert re.fullmatch(r'\d{3}', suffix), (path.name,i,suffix)
            inherited = not amounts and bool(ancestor_rates)
            # Undisplayed rates at a statistical subdivision remain an adjacent source reference.
            final_rates = [dict(r, sourceCode=last_hs) for r in ancestor_rates] if inherited else amounts
            rec = line(last_hs+suffix, f'{path.name}, table row {i}', final_rates,
                       rateCode=last_hs if inherited else last_hs+suffix,
                       units=[v for v in values[30:32] if v], url=file['url'])
            if values[32]:
                rec['notes'] = [values[32]]
            records.append(rec)
            seen_chapters.add(chapter)
    assert len(seen_chapters) == 96 and len(records) > 8500
    return schedule('jp-tariff-2026-10-31','JP',['JP'],'実行関税率表 2026年10月31日版','2026-10-31',
                    'national_schedule','Japan Customs','https://www.customs.go.jp/tariff/2026_10_31/index.htm',
                    'Japan Customs website terms of use','https://www.customs.go.jp/kiyaku.htm',files,
                    ['General, Temporary, WTO and preferential columns retain their original roles. Verify the rate selection order and source footnotes.',
                     'An empty WTO cell does not mean zero. Other-law markers and specific rate expressions are retained.']),records


def pdf_pages(path):
    for _, page in etree.iterparse(str(path), events=('end',), tag=NS+'page', recover=False):
        yield page
        page.clear()
        while page.getprevious() is not None:
            del page.getparent()[0]


def words_on(page):
    return [(float(w.get('xMin')),float(w.get('xMax')),float(w.get('yMin')),clean(w.text))
            for w in page.iter(NS+'word') if clean(w.text)]


def words_in(words, left, right, top, bottom):
    selected = [w for w in words if left <= (w[0]+w[1])/2 < right and top <= w[2] < bottom]
    return ' '.join(w[3] for w in sorted(selected,key=lambda w:(round(w[2]/3),w[0])))


def percent_text(value):
    return value.replace(',','.')+'%' if re.fullmatch(r'\d+(?:[.,]\d+)?',value) else value


def cn(raw):
    records = []
    seqs = []
    for page_num, page in enumerate(pdf_pages(raw/'cn-2026-bbox.html'),1):
        if not 17 <= page_num <= 1487:
            continue
        words = words_on(page)
        code_words = [w for w in words if 52 < w[0] < 72 and re.fullmatch(r'\d{4}\.\d{4}',w[3])]
        code_words.sort(key=lambda w:w[2])
        for index,w in enumerate(code_words):
            y = w[2]
            end = code_words[index+1][2]-3 if index+1 < len(code_words) else float(page.get('height'))-35
            seq = words_in(words,27,57,y-2,y+2)
            assert seq.isdigit(), (page_num,w,seq)
            seqs.append(int(seq))
            mfn = words_in(words,225,273,y-3,y+4)
            general = words_in(words,505,561,y-3,y+4)
            rates = []
            for kind,label,value in [('mfn','最惠国税率',mfn),('general','普通税率',general)]:
                if value:
                    rates.append(rate(kind,label,percent_text(value)))
            # The source lists each agreement rate next to its labelled partner group.
            anchors = sorted({word[2] for word in words
                              if 272 <= (word[0]+word[1])/2 < 303
                              and y-3 <= word[2] < end
                              and re.fullmatch(r'\d+(?:\.\d+)?',word[3])})
            for j,anchor in enumerate(anchors):
                upper = min(end, anchors[j+1]-2) if j+1 < len(anchors) else end
                value = words_in(words,272,303,anchor-2,anchor+3)
                origin = words_in(words,303,467,anchor-2,upper)
                if re.fullmatch(r'\d+(?:\.\d+)?',value) and origin:
                    rates.append(rate('preferential','协定税率',percent_text(value),origin=origin))
            special = words_in(words,468,483,y-3,y+4)
            special_origin = words_in(words,483,505,y-3,y+4)
            if re.fullmatch(r'\d+(?:\.\d+)?',special) and special_origin:
                rates.append(rate('preferential','特惠税率',percent_text(special),origin=special_origin))
            records.append(line(number(w[3]),f'PDF p. {page_num}, item {seq}',rates))
    assert seqs == list(range(1,8973)), (len(seqs),seqs[:8],seqs[-8:])
    path = raw/'cn-2026.pdf'
    return schedule('cn-import-tariff-2026','CN',['CN'],'中华人民共和国进出口税则（2026）','2026-01-01',
                    'published_baseline','State Council Customs Tariff Commission',
                    'https://gss.mof.gov.cn/gzdt/zhengcefabu/202512/t20251231_3981044.htm',
                    'Official administrative schedule and numerical facts, PRC Copyright Law Article 5',
                    'https://www.ncac.gov.cn/xxfb/flfg/flfg_532/202103/t20210309_50530.html',
                    [{'name':path.name,'sha256':digest(path),'url':'https://gss.mof.gov.cn/gzdt/zhengcefabu/202512/P020251231607833453633.pdf'}],
                    ['Annual MFN, ordinary and labelled preferential columns. Check temporary duties, agreement eligibility, quotas and later measures.',
                     'A footnote or missing rate requires the source page.']),records


def eu(raw):
    records = []
    for page_num,page in enumerate(pdf_pages(raw/'eu-2026-bbox.html'),1):
        if not 30 <= page_num < 723:
            continue
        words = words_on(page)
        header = next((w for w in words if w[3]=='Conventional' and w[0]>360),None)
        unit_header = next((w for w in words if w[3]=='Supplementary' and w[0]>440),None)
        if not header or not unit_header:
            continue
        # The print edition mirrors page margins. Use the heading coordinates on each page.
        left = header[0]-8.2
        right = unit_header[0]-12.8
        starts = []
        boundaries = []
        for pdf_line in page.iter(NS+'line'):
            parts = [clean(w.text) for w in pdf_line if w.tag == NS+'word']
            text = ' '.join(parts)
            x = float(pdf_line.get('xMin'))
            y = float(pdf_line.get('yMin'))
            if x < 95 and re.fullmatch(r'\d{4}(?: \d{2}){0,2}',text):
                boundaries.append(y)
                if len(number(text)) == 8:
                    starts.append((number(text),y))
            elif (x < 100 and re.match(r'^\(\s*\d+\s*\)',text)) or text.startswith(('CHAPTER ', 'Conventional rate')):
                boundaries.append(y)
        for code,y in sorted(starts,key=lambda s:s[1]):
            end = min((b for b in boundaries if b > y+3), default=float(page.get('height'))-30)
            cell = words_in(words,left,right,y-3,end-2)
            units = words_in(words,right,550,y-3,end-2)
            rates = [rate('mfn','CCT conventional duty',percent_text(cell))] if cell else []
            record = line(code,f'OJ PDF p. {page_num}, CN {code}',rates)
            if units and units != '—':
                record['units'] = [units]
            records.append(record)
    assert len({r['code'] for r in records}) > 9300, len(records)
    path=raw/'eu-2026.pdf'
    return schedule('eu-cn-2026','EU',EU,'Combined Nomenclature 2026, EU 2025/1926','2026-01-01',
                    'published_baseline','European Commission',
                    'https://eur-lex.europa.eu/eli/reg_impl/2025/1926/oj/eng',
                    'EUR-Lex legal document reuse under Decision 2011/833/EU',
                    'https://eur-lex.europa.eu/content/legal-notice/legal-notice.html?locale=en',
                    [{'name':path.name,'sha256':digest(path),'url':'https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=OJ:L_202501926'}],
                    ['Eight-digit CN base schedule. Confirm ten-digit TARIC and the measure effective on the import date.',
                     'Country VAT, preferences, suspensions, quotas and trade remedies are separate.']),records


def nz(raw):
    path=raw/'nz-tariff.tar.gz'
    stamp=CHECKED
    def date(value):
        return datetime.strptime(' '.join(value.split()),'%b %d %Y %I:%M%p').date().isoformat()
    def active(row,start,end):
        return date(row[start]) <= stamp <= date(row[end])
    def lines(archive,name):
        file=archive.extractfile(name)
        assert file is not None
        with io.TextIOWrapper(file,encoding='latin1',newline='') as stream:
            rows=csv.reader(stream,delimiter='~',quoting=csv.QUOTE_NONE)
            next(rows)
            yield from rows
    records={}
    with tarfile.open(path,'r:gz') as archive:
        stamp_file=archive.extractfile('time_stamp.txt')
        assert stamp_file is not None
        assert stamp_file.read().decode('ascii').strip()=='Wed Nov 11 04:00:01 AM NZDT 2026'
        for row in lines(archive,'Tariff_Details.csv'):
            code=''.join(row[:5])
            if len(row)<15 or len(code)!=10 or not DIGITS.fullmatch(code) or not active(row,12,13):
                continue
            rec=line(code,f'CusMod tariff item {code}{row[5]}',[],units=[v for v in row[7:9] if v])
            if row[11]=='Y':
                rec['notes']=['GST exemption indicator is Y in the source item record.']
            records[code]=rec
        for row in lines(archive,'Tariff_Rates.csv'):
            code=''.join(row[:5])
            if len(row)<11 or code not in records or not active(row,6,7):
                continue
            group, formula = row[5],row[9]
            factors = [f'{name}={value}' for name,value in zip('ABCDEF',row[10:16]) if value]
            if formula in {'1','01'}:
                expression='Free'
            elif formula in {'3','03'} and re.fullmatch(r'\d+(?:\.\d+)?',row[10]):
                expression=f'{Decimal(row[10]):f}%'
            else:
                expression='CusMod formula '+formula+(' · '+', '.join(factors) if factors else '')
            detail={'from':date(row[6]),'through':date(row[7])}
            if row[8]:
                detail['condition']='Source excise factor: '+row[8]
            records[code]['rates'].append(rate('mfn' if group=='NML' else 'preferential',group,expression,**detail))
        levies={row[0]:row[1] for row in lines(archive,'Tariff_Levy_Formulas.csv') if len(row)>=2}
        for row in lines(archive,'Tariff_Levies.csv'):
            code=''.join(row[:5])
            if len(row)<9 or code not in records or not active(row,7,8):
                continue
            formula=row[6]
            expression=f'CusMod levy formula {formula}'
            if formula in levies:
                expression+=f' · factor {levies[formula]}'
            records[code]['rates'].append(rate('other',row[5],expression,charge='levy',from_=date(row[7]),through=date(row[8])))
    for rec in records.values():
        # Coalesce repeated source entries without conflating different date intervals.
        for item in rec['rates']:
            if 'from_' in item:
                item['from']=item.pop('from_')
        rec['rates']=list({json.dumps(r,sort_keys=True):r for r in rec['rates']}.values())
    assert len(records)>6500
    return schedule('nz-cusmod-2026-11-11','NZ',['NZ'],'CusMod 2026-11-11 04:00 NZDT',stamp,
                    'national_schedule','New Zealand Customs Service',
                    'https://www.customs.govt.nz/business/tariffs/tariff-classifications-and-rates',
                    'Dataset page states no known rights on the tariff data',
                    'https://www.customs.govt.nz/about-us/using-our-website/using-this-website/',
                    [{'name':path.name,'sha256':digest(path),'url':'https://www.customs.govt.nz/media/0nmaamqd/tariff.tar.gz'}],
                    ['Tariff and levy rates active on the snapshot day. Rate groups and formula factors follow CusMod documentation.',
                     'Concessions, GST amounts, units and agreement eligibility need separate review.']),list(records.values())


def gb(raw):
    path = raw / 'gb-2026-v1.34.docx'
    ns = {'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
    with zipfile.ZipFile(path) as archive:
        document = etree.fromstring(archive.read('word/document.xml'))
    classification_codes = set()
    published = defaultdict(list)
    tariff_tables = 0
    for table_number, table in enumerate(document.xpath('//w:tbl',namespaces=ns),1):
        rows = table.xpath('./w:tr',namespaces=ns)
        if not rows:
            continue
        def cells(row):
            return [clean(''.join(c.xpath('.//w:t/text()',namespaces=ns)))
                    for c in row.xpath('./w:tc',namespaces=ns)]
        headers = cells(rows[0])
        if [h.lower() for h in headers[:3]] == ['commodity code','duty expression','notes']:
            tariff_tables += 1
            for row_number,row in enumerate(rows[1:],2):
                values=cells(row)
                if len(values) != 4:
                    continue
                code=number(values[0])
                if re.fullmatch(r'\d{4,10}',code) and values[1]:
                    details = {'condition':values[2]} if values[2] else {}
                    item=rate('mfn','UK Global Tariff base duty',values[1],**details)
                    published[code].append((item,f'Part Three, table {table_number}, row {row_number}'))
        elif len(headers) == 2 and re.fullmatch(r'\d{10}',number(headers[0])):
            for row in rows:
                values=cells(row)
                if len(values) == 2 and re.fullmatch(r'\d{10}',number(values[0])):
                    classification_codes.add(number(values[0]))
    assert tariff_tables == 96 and len(classification_codes)>12000, (tariff_tables,len(classification_codes))
    records=[]
    for code in sorted(classification_codes | {c for c in published if len(c) >= 6}):
        prefix = next((code[:n] for n in (10,8,6,4) if len(code)>=n and code[:n] in published),None)
        if prefix:
            found = published[prefix]
            rec = line(code,found[0][1],[dict(item,sourceCode=prefix) for item,_ in found],rateCode=prefix)
            if len(found)>1:
                rec['notes'] = [ref for _,ref in found]
            records.append(rec)
        else:
            records.append(line(code,'Part Two, goods classification table',[]))
    return schedule('gb-ukgt-2026-v134','GB',['GB'],'Tariff of the United Kingdom v1.34','2026-10-01',
                    'published_baseline','HM Revenue & Customs and HM Treasury',
                    'https://www.gov.uk/government/publications/reference-document-for-the-customs-tariff-establishment-eu-exit-regulations-2020',
                    'Open Government Licence v3.0','https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/',
                    [{'name':path.name,'sha256':digest(path),'url':'https://assets.publishing.service.gov.uk/media/6aa0148a62ec7fe7bedf5177/Tariff_of_the_United_Kingdom_v1.34.docx'}],
                    ['Great Britain reference. Northern Ireland needs its own territorial rules.',
                     'Part Two code hierarchy linked to the longest matching Part Three tariff prefix. Verify declarability, tariff notes and subsequent measures.',
                     'Preference rates, quota availability and VAT need separate sources.']),records


def br(raw):
    from openpyxl import load_workbook
    path=raw/'br-2026.xlsx'
    workbook=load_workbook(path,read_only=True,data_only=True)
    records={}
    for sheet in workbook.worksheets:
        prefix=sheet.title.split(' - ')[0]
        header=None
        for row_number,row in enumerate(sheet.values,1):
            if not row:
                continue
            if clean(row[0]).upper()=='NCM':
                header=[clean(cell).lower() for cell in row]
                continue
            if header is None or not re.fullmatch(r'\d{4}\.\d{2}\.\d{2}',clean(row[0])):
                continue
            code=number(row[0])
            def column(*prefixes):
                index=next((i for i,field in enumerate(header) if any(field.startswith(p) for p in prefixes)),None)
                return row[index] if index is not None else None
            ref=f'{sheet.title}, row {row_number}'
            items=[]
            if prefix=='Anexo I':
                base=column('tec (%)')
                if base is not None and clean(base) not in ('','-','—'):
                    items.append(rate('general','TEC',percent_text(clean(base)),condition=ref))
            elif prefix=='Anexo II':
                applied=column('alíquota aplicada (%)')
                if applied is not None and clean(applied) not in ('','-','—'):
                    basis=clean(column('fundamentação'))
                    condition='; '.join(v for v in [ref,basis,clean(column('atos de inclusão'))] if v)
                    items.append(rate('mfn','Alíquota aplicada',percent_text(clean(applied)),condition=condition))
            else:
                applied=column('alíquota (%)')
                if applied is not None and clean(applied) not in ('','-','—'):
                    scope=[ref]
                    ex=clean(column('nº ex'))
                    quota=column('quota')
                    if ex and ex not in ('-','—'):
                        scope.append('Ex '+ex)
                    if isinstance(quota,(int,float)):
                        scope.append(f'Quota {quota} {clean(column("unidade"))}'.strip())
                    scope.extend(v for v in [clean(column('ato de inclusão')),clean(column('observaç'))] if v and v not in ('-','—'))
                    details={'condition':'; '.join(scope)}
                    for key,value in [('from',column('início')),('through',column('término'))]:
                        if isinstance(value,datetime):
                            details[key]=value.date().isoformat()
                        elif re.fullmatch(r'\d{2}/\d{2}/\d{4}',clean(value)):
                            details[key]=datetime.strptime(clean(value),'%d/%m/%Y').date().isoformat()
                    items.append(rate('quota' if isinstance(quota,(int,float)) else 'temporary',prefix,percent_text(clean(applied)),**details))
            if items:
                rec=records.setdefault(code,line(code,ref,[]))
                rec['rates'].extend(items)
    workbook.close()
    assert len(records)>8500
    return schedule('br-gecex-272-2026-11-04','BR',['BR'],'Resolução Gecex 272, 2026-11-04 compilation','2026-11-04',
                    'national_schedule','Brazil Ministry of Development, Industry, Trade and Services',
                    'https://www.gov.br/mdic/pt-br/assuntos/camex/se-camex/strat/tarifas/vigentes',
                    'Numerical tariff provisions from official acts, Lei 9.610/1998 art. 8 IV',
                    'https://www2.camara.leg.br/legin/fed/lei/1998/lei-9610-19-fevereiro-1998-365399-normaatualizada-pl.html',
                    [{'name':path.name,'sha256':digest(path),'url':'https://www.gov.br/mdic/pt-br/assuntos/camex/estrategia-comercial/arquivos-listas/04-11-2026-anexos-i-a-x-resolucao-gecex-272-21.xlsx'}],
                    ['Brazilian applied and TEC reference columns, plus machine-readable exception rates from the annexes.',
                     'Check Ex descriptions, quotas and related resolutions before choosing a duty. IPI, ICMS, PIS and COFINS are outside this schedule.']),list(records.values())


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('raw_directory',type=Path)
    parser.add_argument('output_directory',type=Path)
    args=parser.parse_args()
    args.output_directory.mkdir(parents=True,exist_ok=True)
    snapshots=[]
    for builder in [us,ca,jp,cn,eu,nz,gb,br]:
        metadata,records=builder(args.raw_directory)
        pack=write_pack(args.output_directory,metadata,records)
        print(pack['id'],pack['statistics'],flush=True)
        snapshots.append(pack)
    (args.output_directory/'manifest.json').write_text(json.dumps({'version':1,'snapshots':snapshots},
                                                                 ensure_ascii=False,indent=2)+'\n')


if __name__ == '__main__':
    main()
