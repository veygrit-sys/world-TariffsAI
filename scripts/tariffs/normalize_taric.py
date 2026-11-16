#!/usr/bin/env python3
"""Normalize EU Commission CIRCABC monthly TARIC import remedies.

Requires openpyxl. Input path contains the pinned November 2026 extracts and
input_urls.tsv gives the official guest download URL per workbook. See README.
"""

import argparse
from collections import Counter, defaultdict
from datetime import date, datetime
from hashlib import sha256
from io import BytesIO
from pathlib import Path
import json
import re
from urllib.parse import urlencode
from zipfile import ZipFile

from openpyxl import load_workbook

TARIC_HOME = 'https://taxation-customs.ec.europa.eu/online-services/online-services-and-databases-customs/eu-customs-tariff-taric_en'
TARIC_LEGAL = 'https://commission.europa.eu/legal-notice_en'
TARIC_LOOKUP = 'https://ec.europa.eu/taxation_customs/dds2/taric/measures.jsp'
EU = 'AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE'.split()
REMEDIES = {
    '551': 'Provisional anti-dumping duty',
    '552': 'Definitive anti-dumping duty',
    '553': 'Provisional countervailing duty',
    '554': 'Definitive countervailing duty',
    '652': 'Additional duty based on CIF price',
    '654': 'Additional duty based on CIF price, reduced under the benefit of a tariff quota',
    '695': 'Additional duties',
    '696': 'Additional duties',
}
MFR = {'551', '552', '553', '554'}
BASE_DUTIES = 'Duties Import 01-99.xlsx'
NOMENCLATURE = 'Nomenclature EN.xlsx'
AREA = 'Geographical areas composition.xlsx'
EXCLUSIONS = 'Measure exclusions.xlsx'
CONDITIONS = 'Measure conditions.xlsx'
FOOTNOTES = 'Measure footnotes.xlsx'
ADDITIONAL_CODES = 'Additional codes descriptions.xlsx'
DAILY = (
    'TARIC_20261103_1916.zip',
    'TARIC_20261104_1917.zip',
    'TARIC_20261105_1925.zip',
    'TARIC_20261106_1917.zip',
    'TARIC_20261109_1914.zip',
    'TARIC_20261110_1914.zip',
)
DAILY_HEADERS = {
    'Measures': ('GOODS CODE', 'ADD_CODE', 'ORD_NUMB', 'START_DATE', 'DESCR_START_DATE', 'END_DATE',
                 'RED_IND', 'REGULATION', 'DUTY', 'GEOGR_AREA', 'MEAS_TYP_ID', 'PUBLISH', 'REC_SEQ_NUM'),
    'Measure_Conditions': ('GOODS CODE', 'ADD_CODE', 'ORDER_NUM', 'START_DATE', 'END_DATE', 'ORIGIN', 'MEAS_TYPE',
                           'MEAS_COND_CODE', 'MEAS_COND_SEQ', 'CERTIFICATE', 'COND_AMOUNT', 'COND_MON_UNIT',
                           'COND_MEAS_UNIT', 'COND_MEAS_UNIT_QUAL', 'MEAS_ACT_CODE', 'PUBLISH', 'REC_SEQ_NUM'),
    'Measure_Footnotes': ('GOODS CODE', 'ADD_CODE', 'ORDER_NUM', 'START_DATE', 'END_DATE', 'ORIGIN_CODE', 'MEAS_TYPE',
                         'FOOTNOTE', 'PUBLISH', 'REC_SEQ_NUM'),
    'Add_Codes': ('ADD_CODE', 'LANG_COD', 'DESCR_TEXT', 'PUBLISH', 'START_DATE', 'END_DATE', 'DESCR_START_DATE', 'REC_SEQ_NUM'),
    'Goods_Nomenclature': ('GOODS CODE', 'START_DATE', 'END_DATE', 'LANG_COD', 'HIER_POS', 'INDENTS', 'DESCR_TEXT',
                           'PUBLISH', 'DESCR_START_DATE', 'REC_SEQ_NUM'),
}


def table(path, headers):
    book = load_workbook(path, read_only=True, data_only=True)
    try:
        rows = book.active.values
        got = next(rows)
        if got != headers:
            raise ValueError(f'Unexpected headers in {path}: {got}')
        yield from rows
    finally:
        book.close()


def iso(value):
    if not value:
        return ''
    if isinstance(value, date):
        return value.isoformat()[:10]
    return datetime.strptime(value.split()[0].replace('/', '-'), '%d-%m-%Y').date().isoformat()


def active(start, end, day):
    return (not start or start <= day) and (not end or end >= day)


def txt(value):
    return ' '.join(str(value or '').replace('!1!', ' ').replace('|', ' ').split())


def measure_key(goods, additional, order, start, origin, measure):
    return (goods, additional or '', order or '', iso(start), origin, measure)


def daily_tables(root, daily):
    records = defaultdict(list)
    for filename in daily:
        tag = filename.removeprefix('TARIC_').removesuffix('.zip')
        with ZipFile(root / filename) as archive:
            if bad_member := archive.testzip():
                raise ValueError(f'{filename} failed CRC for {bad_member}')
            for name, headers in DAILY_HEADERS.items():
                workbook = f'{name}_{tag}.xlsx'
                rows = table(BytesIO(archive.read(workbook)), headers)
                records[name].extend(sorted(rows, key=lambda row: int(row[-1])))
    return records


def ancillary_tables(root, requested, day, deltas):
    additional_codes = {}
    for code, language, description, start, desc_start, end in table(root / ADDITIONAL_CODES, (
        'Add code', 'Language', 'Description', 'Start date', 'Descr. start date', 'End date'
    )):
        if language == 'EN' and active(max(iso(start), iso(desc_start)), iso(end), day):
            start = iso(desc_start)
            if code not in additional_codes or start >= additional_codes[code][0]:
                additional_codes[code] = (start, txt(description))
    exclusions = defaultdict(set)
    for goods, additional, order, start, end, _, _, _, origin, measure, excluded in table(root / EXCLUSIONS, (
        'Goods code', 'Add code', 'Order No.', 'Start date', 'End date', 'Origin', 'Measure type',
        'Excluded country code', 'Origin code', 'Meas. type code', 'Excluded country'
    )):
        key = measure_key(goods, additional, order, start, origin, measure)
        if key in requested and active(key[3], iso(end), day):
            exclusions[key].add(excluded)
    conditions = defaultdict(dict)
    for goods, additional, order, start, end, origin, measure, condition, sequence, cert, amount, money, unit, qualifier, action in table(root / CONDITIONS, (
        'Goods code', 'Add code', 'Order No.', 'Start date', 'End date', 'Origin code', 'Meas. type code',
        'Meas. cond', 'Sequence', 'Certificate', 'Cond. amount', 'Mon. unit', 'Meas. unit', 'Meas. unit qual', 'Meas. action'
    )):
        key = measure_key(goods, additional, order, start, origin, measure)
        if key in requested and active(key[3], iso(end), day):
            components = ' '.join(str(v) for v in (amount, money, unit, qualifier) if v is not None)
            conditions[key][(condition, int(sequence))] = (cert or '', components, action)
    footnotes = defaultdict(set)
    for goods, additional, order, origin, start, end, measure, _, _, note in table(root / FOOTNOTES, (
        'Goods code', 'Add code', 'Order No.', 'Origin code', 'Start date', 'End date',
        'Meas. type code', 'Origin', 'Measure type', 'Footnote'
    )):
        key = measure_key(goods, additional, order, start, origin, measure)
        if key in requested and active(key[3], iso(end), day):
            footnotes[key].add(note)
    for code, language, description, op, start, end, desc_start, _ in deltas['Add_Codes']:
        if language != 'EN' or not active(max(iso(start), iso(desc_start)), iso(end), day):
            continue
        if op == 'DELETE':
            if additional_codes.get(code, ('', ''))[0] == iso(desc_start):
                additional_codes.pop(code)
        elif op in {'INSERT', 'UPDATE'} and iso(desc_start) >= additional_codes.get(code, ('', ''))[0]:
            additional_codes[code] = (iso(desc_start), txt(description))
    for goods, additional, order, start, end, origin, measure, kind, sequence, cert, amount, money, unit, qualifier, action, op, _ in deltas['Measure_Conditions']:
        key = measure_key(goods, additional, order, start, origin, measure)
        if key not in requested:
            continue
        condition_key = (kind, int(sequence))
        if op == 'DELETE' or not active(key[3], iso(end), day):
            conditions[key].pop(condition_key, None)
        elif op in {'INSERT', 'UPDATE'}:
            components = ' '.join(str(v) for v in (amount, money, unit, qualifier) if v)
            conditions[key][condition_key] = (cert or '', components, action)
        else:
            raise ValueError(f'Unexpected condition update operation {op}')
    for goods, additional, order, start, end, origin, measure, note, op, _ in deltas['Measure_Footnotes']:
        key = measure_key(goods, additional, order, start, origin, measure)
        if key not in requested:
            continue
        if op == 'DELETE' or not active(key[3], iso(end), day):
            footnotes[key].discard(note)
        elif op in {'INSERT', 'UPDATE'}:
            footnotes[key].add(note)
        else:
            raise ValueError(f'Unexpected footnote update operation {op}')
    return additional_codes, exclusions, conditions, footnotes


def sources(root, urls, day, daily):
    mode = 'individual origins' if daily else 'group origins'
    input_names = (BASE_DUTIES, NOMENCLATURE, AREA, EXCLUSIONS, CONDITIONS, FOOTNOTES, ADDITIONAL_CODES, *daily)
    return {
        'id': 'eu-taric-trade-measures-' + day.replace('-', ''),
        'jurisdiction': 'EU',
        'countries': EU,
        'zone': 'standard',
        'edition': f'DG TAXUD TARIC {mode}, reference date {day}',
        'hsEdition': 'HS2022 / CN 2026 / TARIC',
        'availableFrom': day,
        'availableThrough': day,
        'checkedOn': '2026-11-11',
        'scope': 'compiled_reference' if daily else 'published_baseline',
        'role': 'measures',
        'authority': 'European Commission, Directorate-General for Taxation and Customs Union',
        'sourceUrl': TARIC_HOME,
        'terms': '© European Union, 2026. TARIC data reused under Decision 2011/833/EU and Commission legal notice (CC BY 4.0). Veygrit selected, normalized and joined the source records.',
        'termsUrl': TARIC_LEGAL,
        'inputFiles': [
            {'name': name, 'url': urls[name], 'sha256': sha256((root / name).read_bytes()).hexdigest()}
            for name in input_names
        ],
        'limitations': [
            ('Individual-country origin rows only. November monthly baseline and official daily publications through 10 November 2026 19:14 (Commission local time).'
             if daily else 'Group-origin rows only. November monthly extraction reference date 1 November 2026. Group membership and exclusions are point-in-time.'),
            'Reference date only. Later TARIC updates and legal acts may differ. Consult live TARIC and the cited legal act on the declaration date.',
            'Selected import duty types 551, 552, 553, 554, 652, 654, 695 and 696. Provisional securities, minimum prices, quotas, document requirements, product scope and producer codes require confirmation.',
            'Individual country codes and date-matched members of TARIC groups are normalized to the engine country registry. Measure exclusions are removed from group membership. Some TARIC-specific areas remain outside the registry.',
            'TARIC type and additional-code combinations can represent alternative or exempt treatments. Confirm required proofs and the legal relationship between measures before calculating a duty.',
            'China-origin new BEVs at TARIC 8703801010 use the separately sourced countervailing snapshot.',
        ],
    }


def normalize(root, registry, day, daily):
    selected = {}
    for goods, additional, order, start, end, reduction, origin_label, label, legal, expression, origin, measure in table(root / BASE_DUTIES, (
        'Goods code', 'Add code', 'Order No.', 'Start date', 'End date', 'RED_IND', 'Origin', 'Measure type',
        'Legal base', 'Duty', 'Origin code', 'Meas. type code'
    )):
        if measure not in REMEDIES or (origin in registry) != bool(daily):
            continue
        if goods == '8703801010' and origin == 'CN' and measure == '554':
            continue
        if label != REMEDIES[measure] or not re.fullmatch(r'[0-9]{10}', goods):
            raise ValueError((goods, measure, label))
        key = measure_key(goods, additional, order, start, origin, measure)
        value = (iso(end), txt(legal), txt(expression), txt(origin_label), reduction)
        if key in selected and selected[key] != value:
            raise ValueError(f'Ambiguous TARIC measure key: {key}')
        selected[key] = value
    deltas = daily_tables(root, daily)
    updates = Counter()
    for goods, additional, order, start, _, end, reduction, legal, expression, origin, measure, op, _ in deltas['Measures']:
        if measure not in REMEDIES or origin not in registry:
            continue
        if goods == '8703801010' and origin == 'CN' and measure == '554':
            continue
        if not re.fullmatch(r'[0-9]{10}', goods):
            raise ValueError((goods, measure))
        key = measure_key(goods, additional, order, start, origin, measure)
        updates[op] += 1
        if op == 'DELETE':
            selected.pop(key, None)
        elif op in {'INSERT', 'UPDATE'}:
            previous = selected.get(key)
            legal_match = re.fullmatch(r'(REGULATION|DECISION|INFORMATION) [RDI](\d+/\d+)', legal)
            if legal_match:
                legal = legal_match[1].title() + ' ' + legal_match[2]
            selected[key] = (iso(end), txt(legal), txt(expression), previous[3] if previous else registry[origin], reduction)
        else:
            raise ValueError(f'Unexpected measure update operation {op}')
    selected = {key: value for key, value in selected.items() if active(key[3], value[0], day)}
    print('Applied individual-country update records:', dict(updates), flush=True)
    print('Selected raw import records:', len(selected), flush=True)
    levels = {}
    descriptions = {}
    for combined, start, end, language, level, indent, description, desc_start in table(root / NOMENCLATURE, (
        'Goods code', 'Start date', 'End date', 'Language', 'Hier. Pos.', 'Indent', 'Description', 'Descr. start date'
    )):
        goods, suffix = combined.split()
        if suffix == '80' and active(max(iso(start), iso(desc_start)), iso(end), day):
            assert len(goods) == 10 and level in {2, 4, 6, 8, 10}
            levels[goods] = level
            descriptions[goods] = txt(description)
    for combined, start, end, language, level, indent, description, op, desc_start, _ in deltas['Goods_Nomenclature']:
        if language != 'EN' or not combined.endswith('80'):
            continue
        goods = combined[:-2]
        if active(max(iso(start), iso(desc_start)), iso(end), day) and op in {'INSERT', 'UPDATE'}:
            levels[goods] = int(level)
            descriptions[goods] = txt(description)
        elif op == 'DELETE' and active(iso(start), iso(end), day):
            levels.pop(goods, None)
            descriptions.pop(goods, None)
    members = defaultdict(set)
    for group, group_start, _, _, _, member, _, _, member_start, member_end, group_end in table(root / AREA, (
        'Country group', 'Start date', 'Language', 'Abbrev.', 'Country group descr.', 'Member country', 'Abbrev.',
        'Description', 'Mbship start date', 'Mbship end date', 'End date'
    )):
        if member in registry and active(iso(group_start), iso(group_end), day) and active(iso(member_start), iso(member_end), day):
            members[group].add(member)
    additional_codes, exclusions, conditions, footnotes = ancillary_tables(root, selected, day, deltas)
    groups = {}
    skipped = Counter()
    for key, (end, legal, expression, origin_label, reduction) in sorted(selected.items()):
        goods, add_code, order, start, origin, measure = key
        if not expression:
            skipped['no duty expression'] += 1
            continue
        if origin in registry:
            countries = {origin}
        else:
            countries = members.get(origin, set()) - exclusions.get(key, set())
        if not countries:
            skipped['origin could not be mapped'] += 1
            continue
        if goods not in levels:
            skipped['no active nomenclature'] += 1
            continue
        code = goods[:levels[goods]]
        note = [f'TARIC measure {measure}. {legal}.']
        if add_code:
            description = additional_codes.get(add_code, ('', ''))[1]
            note.append(f'TARIC additional code {add_code}' + (f' ({description}).' if description else '.'))
        if order:
            note.append(f'Quota order {order}.')
        if reduction:
            note.append(f'Reduction indicator {reduction}.')
        excluded = exclusions.get(key)
        if excluded:
            note.append('Excluded TARIC origins ' + ', '.join(sorted(excluded)) + '.')
        if conditions.get(key):
            parts = []
            for (kind, sequence), (cert, units, action) in sorted(conditions[key].items()):
                details = ' '.join(part for part in (cert, units) if part)
                parts.append(f'{kind}{sequence} action {action}' + (f' ({details})' if details else ''))
            note.append('TARIC conditions ' + ', '.join(parts) + '.')
        if footnotes.get(key):
            note.append('TARIC footnotes ' + ', '.join(sorted(footnotes[key])) + '.')
        if measure in MFR:
            note.append('Check producer, document and product eligibility in TARIC and the legal act.')
        condition = ' '.join(note)
        long_notes = []
        if len(expression) > 3000:
            long_notes.append((f'TARIC {measure} additional code {add_code or "none"} exact duty expression', expression))
            expression = 'Conditional TARIC duty. See exact duty expression in row notes.'
        if len(condition) > 3000:
            long_notes.append((f'TARIC {measure} additional code {add_code or "none"} exact condition details', condition))
            condition = f'TARIC {measure}. {legal}. Additional code {add_code or "none"}. See exact condition details in row notes.'
        rate = {
            'charge': 'trade_remedy' if measure in MFR else 'additional_duty',
            'treatment': 'quota' if order else 'temporary' if measure in {'551', '553'} else 'general',
            'label': REMEDIES[measure] + (f' ({add_code})' if add_code else ''),
            'expression': expression,
            'sourceCode': goods,
            'from': start,
            'origin': f'{origin_label} ({origin})',
            'originCountries': sorted(countries),
            'condition': condition,
        }
        if end:
            rate['through'] = end
        record_key = (code, goods, legal, origin, measure)
        if record_key not in groups:
            reference = f'{legal}. TARIC {goods}, measure {measure}, origin {origin}.'
            url = TARIC_LOOKUP + '?' + urlencode({'Lang':'en', 'Taric': goods, 'SimDate': date.fromisoformat(day).strftime('%Y%m%d')})
            row = {'code': code, 'reference': reference, 'url': url, 'rates': []}
            if len(code) < len(goods):
                row['matchPrefix'] = True
            if descriptions[goods]:
                row['notes'] = [descriptions[goods][:3000]]
            groups[record_key] = row
        groups[record_key]['rates'].append(rate)
        for heading, long_text in long_notes:
            chunks = [long_text[i:i+2700] for i in range(0, len(long_text), 2700)]
            for i, chunk in enumerate(chunks, 1):
                groups[record_key].setdefault('notes', []).append(f'{heading} ({i}/{len(chunks)}). {chunk}')
    lines = [groups[key] for key in sorted(groups)]
    print(f'{len(lines)} lines, {sum(len(row["rates"]) for row in lines)} rates, {len(set(row["code"] for row in lines))} codes.')
    print('Omitted raw records:', dict(skipped), flush=True)
    return lines, skipped


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, default=Path('inputs'))
    parser.add_argument('--urls', type=Path, default=Path('input_urls.tsv'))
    parser.add_argument('--registry', type=Path, required=True)
    parser.add_argument('--output', type=Path, default=Path('eu-normalized'))
    parser.add_argument('--group-origins', action='store_true')
    args = parser.parse_args()
    day, daily = ('2026-11-01', ()) if args.group_origins else ('2026-11-11', DAILY)
    registry = {r['code']: r['name'] for r in json.loads(args.registry.read_text()) if r['inScope']}
    urls = dict(line.split('\t') for line in args.urls.read_text().splitlines())
    lines, skipped = normalize(args.input, registry, day, daily)
    metadata = sources(args.input, urls, day, daily)
    if skipped:
        metadata['limitations'].append('Omitted source records: ' + ', '.join(f'{count} {reason}' for reason, count in sorted(skipped.items())) + '.')
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / 'source.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2)+'\n')
    (args.output / 'lines.json').write_text(json.dumps(lines, ensure_ascii=False, separators=(',', ':'))+'\n')


if __name__ == '__main__':
    main()
