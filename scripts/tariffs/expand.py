#!/usr/bin/env python3
"""Build the additional official schedule and measure snapshots from local source files."""
import argparse
from collections import defaultdict
import csv
from datetime import datetime
from decimal import Decimal
import io
import json
from pathlib import Path
from itertools import chain
import re
import subprocess
import tarfile
import zipfile
from hashlib import sha256

from lxml import etree, html
from openpyxl import load_workbook

from rebuild import CHECKED, EU, clean, digest, line, number, rate, schedule, write_pack

TW_SOURCE = 'https://data.gov.tw/dataset/80871'
TW_CSV = 'https://opendata.customs.gov.tw/data/80871/csv.csv'
MX_SOURCE = 'https://www.snice.gob.mx/cs/avi/snice/ligie.info22.ligiebibjur.html'
MX_XLSX = 'https://www.snice.gob.mx/~oracle/SNICE_DOCS/FRACCIONESARANCELARIAS-LIGIE_20261014-20261014.xlsx'
MX_TERMS = 'https://www.diputados.gob.mx/LeyesBiblio/pdf/LFDA.pdf'
SARS_SOURCE = 'https://www.sars.gov.za/legal-counsel/primary-legislation/schedules-to-the-customs-and-excise-act-1964/'
SARS_PDF = 'https://www.sars.gov.za/wp-content/uploads/Legal/SCEA1964/Legal-LPrim-CE-Sch1P1Chpt1-to-99-Schedule-No-1-Part-1-Chapters-1-to-99.pdf'
SARS_TERMS = 'https://www.gov.za/sites/default/files/gcis_document/201504/act-98-1978.pdf'
AU_SOURCE = 'https://www.abf.gov.au/importing-exporting-and-manufacturing/tariff-classification/current-tariff/schedule-3'
AU_TERMS = 'https://www.homeaffairs.gov.au/access-and-accountability/using-our-website/copyright-and-disclaimer'
EAC_SOURCE = 'https://www.kra.go.ke/news-center/public-notices/1733-implementation-of-the-2022-harmonized-system-the-2022-east-african-community-common-external-tariff'
EAC_PDF = 'https://www.kra.go.ke/images/publications/CET-2022-VERSION-260722.pdf'
NZ_SOURCE = 'https://www.customs.govt.nz/business/tariffs/tariff-classifications-and-rates'
NZ_ARCHIVE = 'https://www.customs.govt.nz/media/0nmaamqd/tariff.tar.gz'
NZ_GST = 'https://www.customs.govt.nz/sending-and-receiving/duty-and-gst'
DE_VAT = 'https://www.gesetze-im-internet.de/ustg_1980/anlage_2.html'
DE_VAT_LAW = 'https://www.gesetze-im-internet.de/ustg_1980/__12.html'
CA_ORDER = 'https://laws-lois.justice.gc.ca/eng/regulations/SOR-2026-186/FullText.html'
CA_TERMS = 'https://laws-lois.justice.gc.ca/eng/regulations/SI-97-5/page-1.html'
CA_LIST = 'https://www.canada.ca/en/department-finance/programs/international-trade-finance-policy/canadas-response-us-tariffs/complete-list-us-products-subject-to-counter-tariffs.html'
EU_EV = 'https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:02024R2754-20260211'
EU_EV_UNDERTAKING = 'https://eur-lex.europa.eu/eli/dec_impl/2026/328/oj/eng'
EU_TERMS = 'https://eur-lex.europa.eu/content/legal-notice/legal-notice.html'
BR_IPI = 'https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/legislacao/documentos-e-arquivos/tipi.xlsx'
BR_TERMS = 'https://www2.camara.leg.br/legin/fed/lei/1998/lei-9610-19-fevereiro-1998-365399-normaatualizada-pl.html'
HTS_URL = 'https://www.usitc.gov/sites/default/files/tata/hts/hts_2026_revision_23_json.json'
HTS_SOURCE = 'https://www.usitc.gov/harmonized_tariff_information/hts/archive/list'
HTS_TERMS = 'https://uscode.house.gov/us/usc/119-124/t17/s105/'
HTS_CH99 = 'https://hts.usitc.gov/reststop/file?release=2026HTSRev23&filename=Chapter%2099'
KCS_TARIFF = 'https://www.data.go.kr/data/15051179/fileData.do'
KCS_WORLD = 'https://www.data.go.kr/data/15051176/fileData.do'
KCS_TERMS = 'https://www.kogl.or.kr/info/licenseType1.do'


def source_file(path, url):
    return {'name': path.name, 'sha256': digest(path), 'url': url}


def measures(*args, **kwargs):
    return {**schedule(*args, **kwargs), 'role': 'measures'}


def taiwan(raw):
    path = raw / 'tw-rates.csv'
    records = []
    with path.open(encoding='utf-8-sig', newline='') as stream:
        rows = csv.reader(stream)
        assert next(rows)[:6] == ['貨品分類號列','中文貨名','英文貨名','第一欄稅率','第二欄稅率','第三欄稅率']
        for row in rows:
            code = clean(row[0])
            if not re.fullmatch(r'[0-9]{11}', code):
                continue
            rates = [rate(treatment, label, expression) for treatment, label, expression in zip(
                ('mfn', 'preferential', 'general'), ('Column I', 'Column II', 'Column III'),
                row[3:6]) if clean(expression)]
            records.append(line(code, f'Taiwan Customs CCC {code}', rates,
                                units=[v for v in map(clean, row[6:8]) if v]))
    assert len(records) > 10000
    return schedule('tw-ccc-2026-11-11', 'TW', ['TW'], 'Taiwan Customs CCC CSV',
                    CHECKED, 'national_schedule', 'Customs Administration, Ministry of Finance, Taiwan',
                    TW_SOURCE, 'Government Data Open License, version 1.0',
                    'https://data.gov.tw/license', [source_file(path, TW_CSV)],
                    ['Eleven-digit CCC includes a check digit. Columns I, II and III are published reference expressions.',
                     'Use the original export and import provisions for restrictions and check origin conditions.']), records


def mexico(raw):
    path = raw / 'mx-ligie.xlsx'
    records = {}
    with path.open('rb') as stream:
        workbook = load_workbook(stream, read_only=True, data_only=True)
        for row in workbook['FA'].values:
            code = number(row[2])
            if not re.fullmatch(r'[0-9]{8}', code):
                continue
            value = row[5]
            expression = f'{value}%' if isinstance(value, (int, float)) else clean(value)
            rates = [rate('mfn', 'LIGIE import duty', 'Free' if expression == 'Ex.' else expression)] if expression and expression != 'Prohibida' else []
            extra = {'notes': ['Source import column: Prohibida. Review legal scope.']} if expression == 'Prohibida' else {}
            records[code] = line(code, f'SNICE LIGIE {row[2]}', rates,
                                 units=[clean(row[4])] if clean(row[4]) else [], **extra)
        nico = []
        for row in workbook['NICO'].values:
            code = number(row[3])
            suffix = clean(row[4]).zfill(2)
            if code in records and re.fullmatch(r'[0-9]{2}', suffix) and row[4] is not None:
                nico.append({**records[code], 'code': code + suffix, 'rateCode': code,
                             'reference': f'SNICE LIGIE {row[3]} NICO {suffix}'})
    assert len(records) > 8000 and len(nico) > 10000
    return schedule('mx-ligie-2026-10-14', 'MX', ['MX'], 'SNICE LIGIE / NICO workbook dated 2026-10-14',
                    '2026-10-14', 'published_baseline', 'Secretaría de Economía, SNICE',
                    MX_SOURCE, 'Numeric provisions from Mexican tariff legislation under LFDA article 14(VIII)',
                    MX_TERMS, [source_file(path, MX_XLSX)],
                    ['SNICE publishes this workbook as a reference. Check applicable Diario Oficial decrees and temporary measures.',
                     'NICO statistical subdivisions inherit the 8-digit tariff item rate. Export duties are omitted.',
                     'The workbook contains a legacy 2021 cover label. Coverage date refers to the published file revision.'],
                    through='2026-10-14'), [*records.values(), *nico]


def sars(raw):
    path = raw / 'sacu.pdf'
    namespace = '{http://www.w3.org/1999/xhtml}'
    source = etree.fromstring(subprocess.check_output(['pdftotext', '-bbox-layout', str(path), '-']))
    records = []
    for page_number, page in enumerate(source.iter(namespace + 'page'), 1):
        rows = defaultdict(list)
        for cell in page.iter(namespace + 'line'):
            rows[float(cell.get('yMin'))].append(cell)

        def content(cell):
            return clean(' '.join(cell.itertext()))

        def position(cell):
            return (float(cell.get('xMin')) + float(cell.get('xMax'))) / 2

        header = next((cells for cells in rows.values()
                       if {'Unit','General','EFTA'} <= {content(cell) for cell in cells}), None)
        if header is None:
            continue
        positions = {content(cell): position(cell) for cell in header}
        left = (positions['Unit'] + positions['General']) / 2
        right = (positions['General'] + positions['EU / UK']) / 2
        active = None
        for y, cells in sorted(rows.items()):
            if y <= float(header[0].get('yMin')):
                continue
            codes = [content(cell) for cell in cells if float(cell.get('xMin')) < 60]
            expression = clean(' '.join(content(cell) for cell in sorted(cells, key=position)
                                        if float(cell.get('xMin')) > positions['Unit'] + 10
                                        and left < position(cell) < right))
            if codes:
                code = number(codes[0])
                active = None
                if re.fullmatch(r'[0-9]{6}(?:[0-9]{2})?', code) and expression:
                    active = line(code, f'SARS Schedule 1 Part 1, PDF p. {page_number}, {codes[0]}',
                                  [rate('mfn', 'General', expression)])
                    records.append(active)
            elif active and expression and any(position(cell) > 400 for cell in cells):
                active['rates'][0]['expression'] += ' ' + expression
    assert len(records) > 6500 and len({r['code'][:2] for r in records}) >= 95
    assert any(r['code']=='090121' and r['rates'][0]['expression']=='6c/kg' for r in records)
    assert not any(r['code'] in {'030554', '591110'} for r in records)
    return schedule('sacu-sars-general-2026-11-06', 'SACU', 'BW LS NA SZ ZA'.split(),
                    'SARS Schedule 1 Part 1, 2026-11-06', '2026-11-06', 'published_baseline',
                    'South African Revenue Service / Southern African Customs Union',
                    SARS_SOURCE, 'Numeric general tariff provisions under the South Africa Copyright Act §12(8)(a)',
                    SARS_TERMS, [source_file(path, SARS_PDF)],
                    ['General column as a SACU common external tariff reference. Member-specific measures, rebates and preferences need separate review.',
                     'Six-digit provisions can be national rate lines in the published source. CD check digits are omitted.']), records


def australia(raw):
    records = []
    inputs = []
    for entry in (raw / 'au' / 'chapters.tsv').read_text().splitlines():
        url, name = entry.split('\t')
        path = raw / 'au' / name
        chapter = int(name.removeprefix('ch').removesuffix('.html'))
        inputs.append(source_file(path, url))
        document = html.parse(path)
        chapter_rows = []
        parent = None
        for row in document.xpath('//table//tr'):
            cells = row.xpath('./th|./td')
            if len(cells) < 5:
                continue
            values = [clean(cell.text_content()) for cell in cells]
            code, statistical, unit, _, expression = values[:5]
            code = number(code)
            if re.fullmatch(r'[0-9]{8}', code) and code.startswith(f'{chapter:02}'):
                expression = ' / '.join(filter(None, (clean(p.text_content()) for p in cells[4].xpath('./p')))) or expression
                rates = [rate('mfn', 'Schedule 3 general duty', expression)] if expression else []
                parent = line(code, f'ABF Schedule 3, Chapter {chapter}, {values[0]}',
                              rates, url=url)
                chapter_rows.append(parent)
            elif code:
                parent = None
            if parent and re.fullmatch(r'[0-9]{2}', statistical):
                chapter_rows.append({**parent, 'code': parent['code'] + statistical,
                                     'rateCode': parent['code'], 'units': [unit] if unit else []})
        assert chapter_rows, (name, url)
        records.extend(chapter_rows)
    assert len(inputs) >= 96 and len(records) > 10000
    return schedule('au-abf-sch3-2026-11-11', 'AU', ['AU'], 'ABF Working Tariff Schedule 3',
                    CHECKED, 'national_schedule', 'Australian Border Force',
                    AU_SOURCE, 'Australian Government Department of Home Affairs, CC BY 3.0 Australia unless noted',
                    AU_TERMS, inputs,
                    ['General Schedule 3 rates and statistical subdivisions, as captured on 2026-11-11.',
                     'Some cells include separate treatment text. Other schedules, tariff concession orders and trade remedies need separate review.']), records


def eac(raw):
    path = raw / 'eac-cet-2022.pdf'
    document = subprocess.check_output(['pdftotext', '-layout', str(path), '-'], text=True)
    records = []
    for page, body in enumerate(document.split('\f'), 1):
        for text in body.splitlines():
            parts = re.split(r' {2,}', text.strip())
            if len(parts) < 3 or not re.fullmatch(r'[0-9]{4}\.[0-9]{2}\.[0-9]{2}', parts[0]):
                continue
            expression = clean(parts[-1])
            if re.fullmatch(r'[0-9]+(?:\.[0-9]+)?\s*%', expression):
                records.append(line(number(parts[0]), f'EAC CET 2022, PDF p. {page}, {parts[0]}',
                                    [rate('mfn', 'Common external tariff', expression)]))
    assert len(records) > 4500 and len({r['code'][:2] for r in records}) >= 94
    return schedule('eac-cet-2022-kra', 'EAC', 'BI KE RW TZ UG'.split(),
                    'EAC CET 2022, KRA publication', '2022-07-01', 'published_baseline',
                    'East African Community / Kenya Revenue Authority',
                    EAC_SOURCE, 'Numeric provisions extracted from the published EAC common external tariff',
                    EAC_SOURCE, [source_file(path, EAC_PDF)],
                    ['Historical HS2022 baseline. Only numeric ad valorem entries are indexed.',
                     'Subsequent Gazette notices, sensitive goods with non-ad-valorem expressions, member derogations and the accession of newer members require review.'],
                    through='2022-07-01'), records


def nz_gst(raw, previous):
    path = previous / 'nz-tariff.tar.gz'
    law = raw / 'nz-gst.html'
    assert 'GST is calculated at 15%' in clean(html.parse(law).getroot().text_content())
    records = {}
    date = lambda value: datetime.strptime(clean(value), '%b %d %Y %I:%M%p').date().isoformat()
    with tarfile.open(path, 'r:gz') as archive:
        assert archive.extractfile('time_stamp.txt').read().decode().strip() == 'Wed Nov 11 04:00:01 AM NZDT 2026'
        with io.TextIOWrapper(archive.extractfile('Tariff_Details.csv'), encoding='latin1', newline='') as stream:
            rows = csv.reader(stream, delimiter='~', quoting=csv.QUOTE_NONE)
            assert next(rows)[11] == 'Tic Gst Exempt Ind'
            for row in rows:
                code = ''.join(row[:5])
                if len(row) < 15 or not re.fullmatch(r'[0-9]{10}', code) or not date(row[12]) <= CHECKED <= date(row[13]):
                    continue
                flag = row[11]
                if flag not in {'N', 'Y'}:
                    continue
                expression = 'Exempt' if flag == 'Y' else '15%'
                condition = ('CusMod records GST exemption indicator Y. Verify the legal basis and import circumstances.'
                             if flag == 'Y' else
                             'CusMod records GST exemption indicator N. Standard import GST when taxable and collected at import. Check low-value and other relief.')
                record = line(code, f'CusMod tariff item {code}{row[5]}, GST indicator {flag}', [
                    rate('general', 'NZ import GST', expression, charge='import_gst', condition=condition)])
                if code in records:
                    assert records[code]['rates'] == record['rates'], code
                records[code] = record
    assert len(records) > 6500
    return measures('nz-cusmod-gst-2026-11-11', 'NZ', ['NZ'], 'CusMod item GST indicators, 2026-11-11',
                    CHECKED, 'national_schedule', 'New Zealand Customs Service', NZ_SOURCE,
                    'CusMod source page states no known rights on the tariff data. The rate is a statutory fact.',
                    NZ_SOURCE, [source_file(path, NZ_ARCHIVE), source_file(law, NZ_GST)],
                    ['Product indicators are attached to the 10-digit tariff item. Exempt and 0% are distinct.',
                     'This pack provides rate references and does not establish collection or exemption eligibility.']), list(records.values())


def german_code_groups(text):
    # The annex mixes HS chapters, headings and CN subheadings, including intervals.
    chapter = re.fullmatch(r'(?:aus )?Kapitel ([0-9]{1,2})', text)
    if chapter:
        return [chapter[1].zfill(2)]
    values = re.findall(r'(?<![0-9])(?:[0-9]{4}(?: +[0-9]{2}(?: *[0-9]{2})?)?|[0-9]{2})(?![0-9])', text)
    codes = [number(value) for value in values]
    if ' bis ' in text and len(codes) == 2:
        first, last = codes[0][:4], codes[1][:4]
        assert len(first) == len(last) == 4 and 0 <= int(last) - int(first) <= 30
        return [f'{value:04}' for value in range(int(first), int(last) + 1)]
    return codes


def germany_vat(raw):
    path = raw / 'de-vat.html'
    law = raw / 'de-vat-sec12.html'
    assert 'sieben Prozent' in clean(html.parse(law).getroot().text_content())
    records = []
    item = ''
    for row in html.parse(path).xpath('//table//tr'):
        cells = [clean(c.text_content()) for c in row.xpath('./td')]
        if len(cells) == 3:
            item, description, reference = cells
        elif len(cells) == 2:
            description, reference = cells
        else:
            continue
        if not item or not reference:
            continue
        reference = re.sub(r'(Unterpositionen?)(?=[0-9])', r'\1 ', reference)
        for code in german_code_groups(reference):
            assert len(code) in {2, 4, 6, 8}, (code, reference)
            records.append(line(code, f'UStG Anlage 2 Nr. {item} · {reference}', [
                rate('other', 'UStG § 12(2) Nr. 1 · reduced import VAT', '7%', charge='import_vat',
                     condition=f'Only for goods in Annex 2 item {item}: {description}. Published code scope: {reference}.')],
                matchPrefix=True, url=DE_VAT))
    assert len(records) >= 95 and {'09','4901','44013100'} <= {r['code'] for r in records}
    return measures('de-ustg-anhang2-2026-11-11', 'DE', ['DE'], 'UStG § 12 and Anlage 2',
                    CHECKED, 'national_schedule', 'Federal Ministry of Justice, Germany', DE_VAT,
                    'Official statutory text, German UrhG § 5',
                    'https://www.gesetze-im-internet.de/urhg/__5.html',
                    [source_file(path, DE_VAT), source_file(law, DE_VAT_LAW)],
                    ['7% reduced import VAT references for goods in Annex 2. Apply the statutory description and exceptions, especially “aus” (ex) entries.',
                     'Other standard, reduced or exempt treatments require their own source and conditions.']), records


def canada_surtax(raw):
    path = raw / 'ca-sor-2026-186.html'
    document = html.parse(path)
    schedules = document.xpath('//div[@class="Schedule"]')
    assert len(schedules) == 4
    order_items = {}
    for index, (element, amount) in enumerate(zip(schedules, (15, 25, 50)), 1):
        assert f'Subject to {amount}% Surtax' in clean(element.xpath('string(./header)'))
        for entry in element.xpath('.//li'):
            printed = clean(entry.text_content())
            code = number(printed)
            assert re.fullmatch(r'[0-9]{8}', code), printed
            assert code not in order_items
            order_items[code] = (index, f'{amount}%')
    assert len(order_items) == 335
    list_path = raw / 'ca-surtax'
    current_list = html.parse(list_path)
    records = []
    for element in current_list.xpath('//table[@id="tariff-list"]//tr[td]'):
        printed, _, _, amount = [clean(cell.text_content()) for cell in element.xpath('./th|./td')]
        code = number(printed)
        assert re.fullmatch(r'[0-9]{8}', code) and amount in {'15%', '25%', '50%'}
        if code in order_items:
            schedule_number, legal_rate = order_items[code]
            assert amount == legal_rate, (code, amount, legal_rate)
            reference = f'SOR/2026-186 Schedule {schedule_number}, {printed}'
            url = CA_ORDER
            condition = 'Sections 1–2 and Schedules 1–4 of SOR/2026-186 govern origin and exceptions. Review remission, in-transit and Chapter 98/99 treatment.'
        else:
            reference = f'Finance Canada current US counter-tariff list, {printed}'
            url = CA_LIST
            condition = 'Check the governing surtax order, valuation basis, remission and any Chapter 98/99 exception. Vehicle surtax bases can depend on Canadian and Mexican content.'
        records.append(line(code, reference, [
            rate('temporary', 'Canada US counter-tariff', amount, charge='additional_duty',
                 originCountries=['US'], origin='United States origin as defined by the governing order',
                 condition=condition, **{'from': '2026-09-08'})], matchPrefix=True, url=url))
    assert len(records) == 648 and len({r['code'] for r in records}) == len(records)
    assert order_items.keys() <= {r['code'] for r in records}
    return measures('ca-us-surtax-2026-09-08', 'CA', ['CA'], 'Finance Canada US counter-tariff list, effective 2026-09-08',
                    '2026-09-08', 'national_schedule', 'Department of Finance / Justice Laws Website, Canada', CA_LIST,
                    'Reproduction of Federal Law Order, SI/97-5',
                    CA_TERMS, [source_file(path, CA_ORDER), source_file(list_path, CA_LIST)],
                    ['Current table in the Finance Canada US counter-tariff list. 335 entries cross-referenced to SOR/2026-186.',
                     'Schedule 4 and other surtax orders, valuation and remission rules require separate verification.']), records


def eu_electric_vehicles(raw):
    path = raw / 'eu-ev-current.html'
    undertaking = raw / 'eu-ev-undertaking.html'
    document = html.parse(path)
    tables = document.xpath('//table')
    assert '8703 80 10 10' in clean(document.getroot().text_content())
    body = tables[2:4]
    entries = []
    scope = ('Origin China. New BEVs within Article 1(1). See net free-at-Union-frontier price, '
             'invoice under Article 1(3), and approved price undertaking in Article 2a.')

    def add(producer, amount, taric):
        assert re.fullmatch(r'[A-Z0-9]{4}', taric)
        entries.append(rate('other', f'EU definitive countervailing duty · TARIC {taric}', amount,
                            charge='trade_remedy', originCountries=['CN'], origin='China',
                            condition=f'{producer}. {scope}'))

    group_amount = None
    annex_amount = None
    for row in body[0].xpath('.//tr[td]'):
        values = [clean(cell.text_content()) for cell in row.xpath('./td')]
        if len(values) == 3 and re.fullmatch(r'[0-9]+,[0-9]+ %', values[1]):
            producer, group_amount, taric = values
            if 'Annex I' in producer:
                annex_amount = group_amount
            if taric:
                add(producer, group_amount, taric)
        elif len(values) == 2 and re.fullmatch(r'[A-Z0-9]{4}', values[1]):
            assert group_amount
            add(values[0], group_amount, values[1])
    assert annex_amount == '20,7 %'
    for row in body[1].xpath('.//tr[td]'):
        values = [clean(cell.text_content()) for cell in row.xpath('./td')]
        if len(values) >= 2 and re.fullmatch(r'[A-Z0-9]{4}', values[-1]):
            add(values[-2], annex_amount, values[-1])
    assert len(entries) >= 60 and len({r['label'] for r in entries}) == len(entries)
    assert '89FZ' in clean(html.parse(undertaking).getroot().text_content())
    entries.append(rate('other', 'EU approved price undertaking · TARIC 89FZ', 'Exempt',
                        charge='trade_remedy', originCountries=['CN'], origin='China',
                        condition='Decision (EU) 2026/328 and Article 2a of 2024/2754. Produced and sold by Volkswagen (Anhui) Automotive Co., Ltd to SEAT S.A. as importer. Apply invoice, undertaking declaration and all other conditions.'))
    metadata = measures('eu-cn-bev-cvd-2026-02-11', 'EU', EU, 'Regulation (EU) 2024/2754 consolidated 2026-02-11',
                    '2026-02-11', 'national_schedule', 'European Commission / EUR-Lex', EU_EV,
                    'EUR-Lex legal notice, EU legislation with source attribution',
                    EU_TERMS, [source_file(path, EU_EV), source_file(undertaking, EU_EV_UNDERTAKING)],
                    ['Definitive countervailing duty for the specified China-origin BEVs under TARIC 8703801010.',
                     'Use the exporter or producer additional code, invoice and approved undertaking conditions.'])
    return metadata, [line('8703801010', 'Regulation (EU) 2024/2754 Article 1, Annex I and Article 2a',
                           entries, matchPrefix=True, url=EU_EV)]


def us_section_301(raw, previous):
    path = raw / 'us-2026-23-ch99.pdf'
    json_path = previous / 'us-2026-23.json'
    document = subprocess.check_output(['pdftotext', '-layout', str(path), '-'], text=True)
    assert 'Harmonized Tariff Schedule of the United States Revision 23 (2026)' in document
    original = json.loads(json_path.read_text())
    hts_rates = {row['htsno']: row for row in original if row['htsno'].startswith('9903.')}
    valid_codes = {number(row['htsno']) for row in original if re.match(r'^[0-9]{4}\.[0-9]{2}\.[0-9]{2}', row['htsno'])}
    scope = 'China-origin goods under HTSUS Chapter 99 Subchapter III. Check product exclusions, effective dates, specific statistical provisions, valuation and interactions with other measures.'
    records = []

    def add(code, chapter99, note, extra=scope):
        expression = clean(hts_rates[chapter99]['general'])
        assert re.fullmatch(r'The duty provided in the applicable subheading\s*(?:\+|plus)\s*[0-9.]+%', expression), (chapter99, expression)
        if code in valid_codes:
            records.append(line(code, f'HTSUS Chapter 99 Subchapter III, U.S. note {note}', [
                rate('other', f'US Section 301 · {chapter99}', expression,
                     charge='additional_duty', originCountries=['CN'], origin='China',
                     sourceCode=number(chapter99), condition=extra)],
                **({'matchPrefix': True} if len(code) == 8 else {}), url=HTS_CH99))

    table_row = re.compile(r'[0-9]{4}\.[0-9]{2}\.[0-9]{2}(?:\s+[0-9]{4}\.[0-9]{2}\.[0-9]{2})*')
    for heading, note, next_note, min_count in [
        ('9903.88.01', 'b', 'c', 650),
        ('9903.88.02', 'd', 'e', 250),
        ('9903.88.03', 'f', 'g', 3500),
        ('9903.88.15', 's', 't', 2000),
    ]:
        beginning = re.search(rf'(?m)^ +\({note}\) +Heading {re.escape(heading)} applies to', document)
        assert beginning, heading
        body = document[beginning.end():]
        end = re.search(rf'(?m)^ +\({next_note}\) +For the purposes of heading 9903\.88\.', body)
        assert end, heading
        body = body[:end.start()]
        if note == 's':
            body = body.split('(ii)         the following products of China:')[0]
        printed_codes = {number(token) for text in body.splitlines() if table_row.fullmatch(text.strip())
                         for token in text.split()}
        assert len(printed_codes) >= min_count, (heading, len(printed_codes))
        for code in sorted(printed_codes):
            add(code, heading, '20(s)(i)' if note == 's' else f'20({note})')

    g = re.search(r'(?ms)^ +\(g\) +For the purposes of heading 9903\.88\.04,.*?'
                  r'following products of China:.*?\n\n(.*?)'
                  r'^ +Notwithstanding U\.S\. note', document)
    assert g
    paragraphs = re.split(r'(?m)^ +[0-9]+\. +', g[1])[1:]
    for index, paragraph in enumerate(paragraphs, 1):
        match = re.search(r'(?:provided for in|in subheading)\s+(?:\[subheading\] )?([0-9.]{10})', clean(paragraph))
        assert match, index
        code = number(match[1])
        add(code, '9903.88.04', f'20(g) item {index}',
            f'{scope} Product exclusions within this subheading are listed in item {index} of U.S. note 20(g).')
    assert len(paragraphs) == 11
    assert re.search(r'9903\.91\.08 applies to products of China classified in 8-digit subheading 4015\.12\.10', document)
    add('40151210', '9903.91.08', '31(i)')
    assert len(records) > 2800
    metadata = measures('us-hts-r23-section301', 'US', ['US'], 'HTS 2026 Revision 23, Chapter 99',
                        '2026-11-10', 'national_schedule', 'USITC', HTS_SOURCE,
                        'United States Government tariff schedule, 17 U.S.C. § 105',
                        HTS_TERMS, [source_file(path, HTS_CH99), source_file(json_path, HTS_URL)],
                        ['Selected Section 301 China measures from U.S. notes 20(b), (d), (f), (g), (s)(i) and 31(i).',
                         'Matches link to goods codes present in the same HTS revision. Check exclusions, sequencing, and other Chapter 99 and trade remedy provisions.'])
    return metadata, records


def kcs_korea(raw):
    path = raw / 'kr-rates.xlsx'
    edition_date = '2026-02-12'
    records = {}
    workbook = load_workbook(path, read_only=True, data_only=True)
    rows = iter(workbook['2.12'].values)
    assert next(rows)[:3] == ('품목번호', '관세율구분', '관세율')
    for code, kind, pct, per_unit, reference_price, country, end_use, start, end in rows:
        if not re.fullmatch(r'[0-9]{10}', clean(code)) or not kind or pct is None:
            continue
        start_date = datetime.strptime(clean(start), '%Y%m%d').date().isoformat()
        end_date = datetime.strptime(clean(end), '%Y%m%d').date().isoformat()
        if not start_date <= edition_date <= end_date:
            continue
        text = f'{pct}%' if isinstance(pct, (int, float)) else clean(pct)
        if per_unit is not None:
            text += f' · per-unit tax field {per_unit}'
        if reference_price is not None:
            text += f' · reference price {reference_price}'
        condition = 'Check KCS UNIPASS for the rate group, units and entitlement.'
        if end_use:
            condition += f' End-use group: {end_use}.'
        treatment = 'general' if kind.startswith('A') else 'bound' if kind.startswith('C') else 'other'
        record = records.setdefault(code, line(code, f'Korea Customs Service HSK {code}, sheet 2.12', []))
        record['rates'].append(rate(treatment, f'KCS rate class {kind}', text, condition=condition,
                                    origin=f'KCS country group {country}' if country else 'KCS source group unreported',
                                    **{'from': start_date, 'through': end_date}))
    workbook.close()
    for record in records.values():
        record['rates'] = list({json.dumps(entry, sort_keys=True): entry for entry in record['rates']}.values())
    assert len(records) > 11000 and sum(len(r['rates']) for r in records.values()) > 300000
    return schedule('kr-kcs-hsk-2026-02', 'KR', ['KR'], 'KCS national 2026 rate table, sheet 2.12',
                    edition_date, 'national_schedule', 'Korea Customs Service', KCS_TARIFF,
                    'Korea Open Government License (KOGL) Type 1. Adapted by Veygrit', KCS_TERMS,
                    [source_file(path, KCS_TARIFF)],
                    ['Workbook 20260211, sheet 2.12. Source active periods, rate classes and country group codes are preserved.',
                     'The edition date is a reference date. Changes in UNIPASS and agreement-specific eligibility need separate review.'],
                    through=edition_date), list(records.values())


def brazil_ipi(raw):
    path = raw / 'br-tipi.xlsx'
    workbook = load_workbook(path, read_only=True, data_only=True)
    sheet = workbook['Tabela Completa']
    edition_date = '2026-02-12'
    assert '12/02/2026' in clean(sheet['A3'].value)
    records = []
    for index, (ncm, ex, description, value, _) in enumerate(sheet.values, 1):
        code = number(ncm)
        if not re.fullmatch(r'[0-9]{6}(?:[0-9]{2})?', code) or value in (None, ''):
            continue
        if not isinstance(value, (int, float)) and value != 'NT':
            continue
        expression = 'NT (não tributado)' if value == 'NT' else f'{Decimal(str(value)):f}%'
        note = 'Verify IPI import liability, the NCM provision, tax base and applicable exemptions.'
        if ex:
            note += f' Ex {clean(ex)} applies only to the exception description: {clean(description)}'
        records.append(line(code, f'RF TIPI 2022, workbook row {index}, NCM {clean(ncm)}', [
            rate('other', 'Brazil IPI', expression, charge='excise', condition=note)],
            **({'matchPrefix': True} if len(code) == 6 else {})))
    workbook.close()
    assert len(records) > 9000
    return measures('br-rfb-tipi-2026-02', 'BR', ['BR'], 'TIPI 2022 with ADE 1/2026 corrected on 2026-02-12',
                    edition_date, 'published_baseline', 'Receita Federal do Brasil', BR_IPI,
                    'Numeric provisions of Brazilian official acts, Lei 9.610/1998 art. 8 IV', BR_TERMS,
                    [source_file(path, BR_IPI)],
                    ['Historical IPI reference by NCM and explicit Ex exception. Other taxes are outside this pack.'],
                    through=edition_date), records


KCS_COUNTRIES = dict(item.split(':') for item in (
    'ARE:AE AUS:AU BGD:BD BRA:BR BRU:BN CAM:KH CAN:CA CHE:CH CHL:CL CHN:CN '
    'COL:CO CRI:CR EEC:EU GBR:GB HND:HN IDN:ID IND:IN ISL:IS ISR:IL JPN:JP '
    'LAO:LA MEX:MX MNG:MN MYA:MM MYS:MY NIC:NI NOR:NO NZL:NZ PAN:PA PER:PE '
    'PHL:PH RUS:RU SAU:SA SGP:SG SLV:SV THA:TH TUR:TR TWN:TW USA:US UZB:UZ '
    'VNM:VN ZAF:ZA').split())


def kcs_columns(country, headers, subheaders):
    for index, title in enumerate(headers[4:], 4):
        detail = subheaders[index]
        key = title.casefold()
        if title in {'부가세', '부가세율'}:
            charge = 'other' if country == 'MY' else 'import_vat'
            label = 'Malaysia sales tax column' if country == 'MY' else 'VAT column'
            yield index, charge, 'other', label
        elif title in {'소비세율', '내국소비세', '특별세'}:
            yield index, 'excise', 'other', title
        elif title == '할증료':
            yield index, 'additional_duty', 'other', 'Surcharge column'
        elif title == '도시진흥세':
            yield index, 'levy', 'other', 'Municipal promotion tax column'
        elif key.startswith('additional customs duty') and detail == 'Other':
            yield index, 'additional_duty', 'other', title
        elif detail in {'Other', 'Other Count.'}:
            yield index, 'customs_duty', 'general', f'{title} · {detail}'
        elif detail == 'SOUTH KOREA':
            yield index, 'customs_duty', 'preferential', f'{title} · South Korea'
        elif '최혜국' in title or key.startswith(('mfn', 'column i -', 'erga omnes', 'rate of duty 1 general')):
            yield index, 'customs_duty', 'mfn', title
        elif (title in {'일반세율', '종가세'} or '기본세율' in title or
              key.startswith(('normal import', 'normal tariff', 'column i 과', 'rate of duty 2'))):
            yield index, 'customs_duty', 'general', title
        elif title == '상한세율' or title == 'WTO협정':
            yield index, 'customs_duty', 'bound', title
        elif title == '잠정세율':
            yield index, 'customs_duty', 'temporary', title
        elif ('협정세율' in title or '특혜세율' in title or title == '대한민국' or
              key.startswith(('column ii -', 'rcep', 'akfta', 'atiga', 'vkfta', 'acfta',
                              'ajcep', 'vjepa', 'aanzfta', 'aifta', 'vcfta', 'apta',
                              'rate of duty 1 special', 'korea-philippines fta', 'knzfta'))):
            yield index, 'customs_duty', 'preferential', title


def kcs_world(raw):
    path = raw / 'kr-world.xlsx'
    stamp = '2025-12-31'
    archive_source = source_file(path, KCS_WORLD)
    seen = set()
    with zipfile.ZipFile(path) as archive:
        for filename in sorted(archive.namelist()):
            if filename == '2025년07월_EU_관세율표.xlsx':
                continue  # The October edition supersedes the July edition in this compilation.
            contents = archive.read(filename)
            workbook = load_workbook(io.BytesIO(contents), read_only=True, data_only=True)
            # The second complete Swiss sheet is labelled 2025 in its source rows.
            sheet = workbook['Sheet1 (2)'] if '스위스' in filename else workbook.worksheets[0]
            rows = iter(sheet.values)
            headings = tuple(map(clean, next(rows)))
            assert headings[:4] == ('순번', '년도', '국가코드', '세번'), filename
            first_row = next(rows)
            country_key = first_row[2]
            if country_key is None:
                country_key = 'TUR'
                assert '튀르키예' in filename
                group = ''
                groups = []
                for header, item in zip(headings, first_row):
                    group = header or group
                    groups.append(group if item else header)
                headings = tuple(groups)
                subheadings = tuple(map(clean, first_row))
                first_row = next(rows)
                first_index = 3
            else:
                subheadings = ('',) * len(headings)
                first_index = 2
            country = KCS_COUNTRIES[country_key]
            assert country not in seen, country
            seen.add(country)
            countries = EU if country == 'EU' else [country]
            columns = list(kcs_columns(country, headings, subheadings))
            units_at = [i for i, header in enumerate(headings) if header.startswith(('단위','수량단위','중량단위'))]
            base_lines = []
            tax_lines = []
            source_years = set()
            for row_index, row in enumerate(chain((first_row,), rows), first_index):
                if not isinstance(row[3], str):
                    continue
                printed_code = clean(row[3])
                code = number(printed_code)
                if country == 'NZ' and re.fullmatch(r'[0-9]{10}[A-Z]', code):
                    code = code[:10]
                if not re.fullmatch(r'[0-9]{6,12}', code):
                    continue
                assert row[2] == country_key, (filename, row_index)
                source_years.add(clean(row[1]))
                rates = []
                taxes = []
                for column, charge, treatment, label in columns:
                    expression = clean(row[column])
                    if expression in {'', '-', '–', '—', 'N/A', '#N/A'}:
                        continue
                    if country == 'TR' and charge == 'import_vat' and re.fullmatch(r'[0-9]+(?:[.,][0-9]+)?', expression):
                        expression += '%'
                    if charge == 'additional_duty' and re.fullmatch(r'0(?:[.,]0+)?\s*%?', expression):
                        continue
                    if charge != 'customs_duty':
                        taxes.append(rate(treatment, label, expression, charge=charge,
                                          condition='Historical KCS reference. Verify local law, origin, exemptions and tax base.'))
                    else:
                        rates.append(rate(treatment, label, expression))
                reference = f'KCS {country} workbook ({clean(row[1])}), {sheet.title} row {row_index}, {printed_code}'
                if rates:
                    base_lines.append(line(code, reference, rates, units=[clean(row[i]) for i in units_at if clean(row[i])]))
                if taxes:
                    tax_lines.append(line(code, reference, taxes))
            workbook.close()
            assert len(base_lines) >= 3000, (country, len(base_lines), headings, subheadings)
            year = '/'.join(sorted(source_years))
            input_files = [archive_source, {'name': filename, 'url': KCS_WORLD, 'sha256': sha256(contents).hexdigest()}]
            limits = ['Reference compilation by Korea Customs Service. Confirm the local authority and amendments before operational use.',
                      'The reference date identifies the compilation. Source workbook rows may use an earlier edition or specify additional effective dates.']
            metadata = schedule(f'kcs-reference-{country.lower()}-2025-12', country, countries,
                                f'KCS foreign tariff compilation, source year {year}',
                                stamp, 'compiled_reference', 'Korea Customs Service', KCS_WORLD,
                                'Korea Open Government License (KOGL) Type 1. Numeric rate fields extracted by Veygrit.',
                                KCS_TERMS, input_files, limits, through=stamp)
            yield metadata, base_lines
            if tax_lines:
                yield {**metadata, 'id': f'kcs-taxes-{country.lower()}-2025-12',
                       'edition': f'KCS foreign tariff compilation, additional tax columns, source year {year}',
                       'role': 'measures'}, tax_lines
    assert len(seen) == len(KCS_COUNTRIES)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('raw_directory', type=Path)
    parser.add_argument('original_source_directory', type=Path)
    parser.add_argument('output_directory', type=Path)
    builders = [*BUILDERS, 'kcs-world']
    parser.add_argument('--only', nargs='+', choices=builders, help='Rebuild named packs and preserve other catalog entries.')
    args = parser.parse_args()
    output = args.output_directory
    document = json.loads((output / 'manifest.json').read_text())
    snapshots = {s['id']: s for s in document['snapshots']}
    for name in args.only or builders:
        packs = (kcs_world(args.raw_directory) if name == 'kcs-world' else
                 [BUILDERS[name](args.raw_directory, args.original_source_directory)])
        for metadata, rows in packs:
            pack = write_pack(output, metadata, rows)
            snapshots[pack['id']] = pack
            print(pack['id'], pack['statistics']['lines'], pack['statistics']['rates'], flush=True)
    (output / 'manifest.json').write_text(json.dumps({'version': 1, 'snapshots': list(snapshots.values())},
                                                     ensure_ascii=False, indent=2) + '\n')


BUILDERS = {
    'tw': lambda raw, _: taiwan(raw),
    'mx': lambda raw, _: mexico(raw),
    'sacu': lambda raw, _: sars(raw),
    'au': lambda raw, _: australia(raw),
    'eac': lambda raw, _: eac(raw),
    'nz-gst': nz_gst,
    'de-vat': lambda raw, _: germany_vat(raw),
    'ca-surtax': lambda raw, _: canada_surtax(raw),
    'eu-bev': lambda raw, _: eu_electric_vehicles(raw),
    'us-301': us_section_301,
    'kr': lambda raw, _: kcs_korea(raw),
    'br-ipi': lambda raw, _: brazil_ipi(raw),
}

if __name__ == '__main__':
    main()
