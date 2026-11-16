#!/usr/bin/env python3
"""Normalize the November 2026 Tolletaten and FOCBS tariff source files."""

import argparse
from collections import defaultdict
from decimal import Decimal
import json
from pathlib import Path
import re
import subprocess

from lxml import html
from openpyxl import load_workbook

from rebuild import clean, digest, line, rate, schedule, write_pack


CHECKED = '2026-11-11'
NO_AUTHORITY = 'Norwegian Customs (Tolletaten)'
NO_DUTY = 'https://data.toll.no/dataset/tollavgiftssats'
NO_FEES = 'https://data.toll.no/dataset/innfoerselsavgift'
NO_GROUPS = 'https://data.toll.no/dataset/landgruppe'
NO_MEMBERS = 'https://data.toll.no/dataset/medlemsland'
CC_BY = 'https://creativecommons.org/licenses/by/4.0/'
NO_ORIGIN_DUTY = 'https://lovdata.no/dokument/SF/forskrift/2026-06-12-1055'
NO_ORIGIN_NOTICE = 'https://www.toll.no/no/bedrift/nyheter-for-naeringslivet/okt-toll-pa-landbruksvarer-og-kunstgjodsel-fra-russland-og-belarus'
CH_SOURCE = 'https://www.bazg.admin.ch/en/tares-free-data-delivery-on-customers-request'
CH_TERMS = 'https://www.fedlex.admin.ch/eli/cc/1993/1798_1798_1798/en'
CH_FILES = {
    'duty_rates_chapter_01_to_30': 'en/suXEbuatJI1d',
    'duty_rates_chapter_31_to_63': 'en/8HOWtwQe30-s',
    'duty_rates_chapter_64_to_83': 'en/dxAKUBpiFgx2',
    'duty_rates_chapter_84_to_97': 'en/vCLXp0mDCgBz',
    'file_description_duty_rates': 'en/pcDe6DdNlvTV',
    'control_elements_import_with_Zusabg': 'de/HtknfbLu7UOt',
    'file_descriptioncontrolelementsimportwithzusabg': 'de/re3W31nkRU6p',
}


def input_file(path, url, title=None):
    return {'name': title or path.name, 'sha256': digest(path), 'url': url}


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def no_input(raw, stem):
    path = raw / f'no-{stem}.json'
    if stem == 'groups':
        search = read_json(raw / 'no-origin-search.json')['result']['results']
        package = next(item for item in search if item['name'] == 'landgruppe')
    else:
        package = read_json(raw / f'no-{stem}-package.json')['result']
    resource = next(resource for resource in package['resources'] if resource['format'] == 'JSON')
    return input_file(path, resource['url'], resource['name'])


def no_interval(record):
    return {key: record[field] for key, field in (('from', 'fomdato'), ('through', 'tomdato')) if record[field]}


def no_current(record):
    return record['fomdato'] <= CHECKED and (not record['tomdato'] or CHECKED <= record['tomdato'])


def numerical(value):
    return format(Decimal(str(value).replace(',', '.')).normalize(), 'f')


def no_expression(value, unit, subunit=False):
    value = Decimal(value.replace(',', '.'))
    if subunit:
        value /= 100
    if unit == 'P':
        return f'{numerical(value)}%'
    quantity = {'K': 'kg', 'L': 'litre', 'S': 'piece', 'G': 'gram', 'M': 'm³'}.get(unit)
    if quantity is None:
        if value == 0:
            return '0%'
        raise ValueError(f'Unsupported nonzero tariff unit {unit}')
    return f'NOK {numerical(value)} per {quantity}'


def norway(raw):
    groups = {row['landgruppekode']: row for row in read_json(raw / 'no-groups.json')['landgrupper'] if no_current(row)}
    members = defaultdict(set)
    for row in read_json(raw / 'no-members.json')['medlemsland']:
        country = row['landkode']
        if not re.fullmatch('[A-Z]{2}', country):
            continue
        for group in row['landgrupper']:
            if no_current(group):
                members[group['landgruppekode']].add(country)

    duty = read_json(raw / 'no-duty.json')
    assert duty['versjon'] == '1.2'
    records = []
    for item in duty['varer']:
        code = item['id']
        if code.startswith('00'):
            continue
        rates = []
        for group in item['avtalesatser']:
            key = group['landgruppe']
            if key == 'TRB':
                # The separate regulation supplies origin-specific rates, including the fertilizer fixed component.
                continue
            name = groups[key]['landgruppenavn']
            is_general = key == 'TALL'
            for row in group['sats']:
                if not no_current(row) or row['satsVerdi'] == '999999,99':
                    continue
                expression = no_expression(row['satsVerdi'], row['satsEnhet'])
                treatment = 'general' if is_general else 'preferential'
                details = no_interval(row)
                if not is_general:
                    details['origin'] = name
                    details['condition'] = 'Confirm the published country-group rules, proof of origin and any product or quota conditions.'
                    if members[key]:
                        details['originCountries'] = sorted(members[key])
                rates.append(rate(treatment, f'TL1 {key}', expression, **details))
        notes = []
        if not any(row['treatment'] == 'general' for row in rates):
            assert code == '63090000', code
            notes.append('Ordinary duty is not a numeric TL1 entry for this code. Verify the rate for equivalent new goods in the tariff.')
        records.append(line(code, f'Tolletaten TL1 · {code}', rates,
                            units=[clean(unit) for unit in [item['enhet'], item['annenEnhet']] if clean(unit)],
                            **({'notes': notes} if notes else {})))
    assert len(records) >= 7400
    meta = schedule('no-tolletaten-duty-2026-11-11', 'NO', ['NO'],
                    'Tolletaten TL1 v1.2, 2026-11-11 resource', CHECKED, 'national_schedule',
                    NO_AUTHORITY, NO_DUTY, 'CC BY 4.0. Source: Tolletaten. Adapted numeric rates and group assignments.',
                    CC_BY, [no_input(raw, stem) for stem in ('duty', 'groups', 'members')],
                    ['The snapshot lists ordinary duty and published country-group schedules for this observation date.',
                     'Confirm origin eligibility, agricultural reductions, raw-material duty and country-specific measures separately.',
                     'Administrative identifiers in chapter 00 and placeholder values are excluded.'])
    yield meta, records

    fees = read_json(raw / 'no-fees.json')
    assert fees['versjon'] == '1.1'
    taxes = []
    for item in fees['varer']:
        code = item['id']
        if code.startswith('00'):
            continue
        rates = []
        for group in item['avgiftsatser']:
            assert group['landgruppe'] == 'ALLE'
            for kind in group['avgiftstyper']:
                kind_code = kind['avgiftstype']
                charge = 'import_vat' if kind_code == 'MV' else 'levy' if kind_code == 'FA' else 'excise'
                for row in kind['avgiftsgrupper']:
                    if not no_current(row):
                        continue
                    vat_condition = (
                        'Reduced rate for qualifying foodstuffs under the Norwegian VAT rules.'
                        if row['avgiftsgruppe'] == 2 else
                        'Ordinary import VAT candidate. Check exemptions and reduced-rate eligibility.'
                    )
                    details = f'Published tax group {kind_code}{row["avgiftsgruppe"]}. '
                    condition = details + (vat_condition if charge == 'import_vat' else clean(row['avgiftsgruppebeskrivelse']))
                    expression = no_expression(row['sats'], row['enhet'], row['oresats'] == 'true')
                    rates.append(rate('general' if charge == 'import_vat' else 'other',
                                      f'{kind_code}{row["avgiftsgruppe"]} · {kind["avgiftstypebeskrivelse"]}',
                                      expression, charge=charge, condition=condition, **no_interval(row)))
        if rates:
            taxes.append(line(code, f'Tolletaten import fees · {code}', rates))
    assert len(taxes) >= 7400
    meta = schedule('no-tolletaten-import-taxes-2026-10-31', 'NO', ['NO'],
                    'Tolletaten import VAT and charges v1.1, 2026-10-31 resource', '2026-10-31',
                    'national_schedule', NO_AUTHORITY, NO_FEES,
                    'CC BY 4.0. Source: Tolletaten. Adapted numeric rates and tax-group identifiers.',
                    CC_BY, [no_input(raw, 'fees')],
                    ['VAT candidates are published by Norwegian commodity code. Confirm statutory reductions, exemptions and treatment under VOEC separately.',
                     'Excise and levy entries can depend on product characteristics or declared tax-group conditions. Øre-based values have been divided by 100.'])
    yield {**meta, 'role': 'measures'}, taxes


def norway_origin_duty(raw):
    path = raw / 'no-ru-law.html'
    tree = html.fromstring(path.read_bytes())
    table = next(t for t in tree.xpath('//table') if 'Kapittel 2Kjøtt' in clean(t.text_content()))
    codes = set()
    for row in table.xpath('.//tr'):
        cells = row.xpath('./td')
        if not cells:
            continue
        code = clean(cells[0].text_content())
        match = re.fullmatch(r'(?:(?:Kapittel|Posisjon|Underposisjon)\s+)?([0-9.]+)', code, flags=re.IGNORECASE)
        if not match:
            raise ValueError(f'Unexpected annex code: {code}')
        code = match[1].replace('.', '').zfill(2)
        assert len(code) in (2, 4, 6, 8), code
        codes.add(code)
    assert len(codes) >= 35 and '02' in codes and '3501' in codes
    rows = [
        line(code, 'FOR-2026-06-12-1055 § 2 and Annex',
             [rate('other', 'Agricultural additional customs duty', '50%',
                   charge='additional_duty', originCountries=['BY', 'RU'],
                   condition='In addition to ordinary tariff duty. The regulation excludes reductions listed in § 3.',
                   **{'from': '2026-07-01'})],
             matchPrefix=True, url=NO_ORIGIN_DUTY)
        for code in codes
    ]
    fertilizers = ['3102', '310520', '310530', '310540', '310551', '310559', '310590']
    for code in fertilizers:
        rows.append(line(code, 'FOR-2026-06-12-1055 § 2',
                         [rate('other', 'Origin-specific fertilizer duty', '6.5% + NOK 5,000 per tonne',
                               charge='additional_duty', originCountries=['BY', 'RU'],
                               condition='Combined regulation-specific rate. Declare TL1 6.5% and TT1 fixed amount. Verify tariff-line application and § 3.',
                               **{'from': '2026-07-01'})],
                         matchPrefix=True, url=NO_ORIGIN_DUTY))
    meta = schedule('no-russia-belarus-origin-duty-2026-07', 'NO', ['NO'],
                    'FOR-2026-06-12-1055', '2026-07-01', 'national_schedule', NO_AUTHORITY,
                    NO_ORIGIN_DUTY, 'Numerical provisions and identifiers of the official regulation. Source: Norwegian legal gazette and Tolletaten.',
                    NO_ORIGIN_DUTY,
                    [input_file(path, NO_ORIGIN_DUTY), input_file(raw / 'no-ru-notice.html', NO_ORIGIN_NOTICE)],
                    ['Applies to Russian or Belarusian origin. Chapters, headings and subheadings are represented as prefixes.',
                     'The fertilizer formula includes both components and should be reviewed as one combined rate.'])
    return {**meta, 'role': 'measures'}, rows


def ch_input(raw, stem):
    language, token = CH_FILES[stem].split('/')
    url = f'https://www.bazg.admin.ch/dam/{language}/sd-web/{token}/{stem}.xlsx'
    return input_file(raw / f'ch-{stem}.xlsx', url, f'{stem}.xlsx')


def ch_rows(raw, stem, first_column):
    book = load_workbook(raw / f'ch-{stem}.xlsx', read_only=True, data_only=True)
    try:
        rows = iter(book.worksheets[0].values)
        next(rows)
        headers = next(rows)
        assert headers[0] == first_column
        yield from (row for row in rows if any(value is not None for value in row))
    finally:
        book.close()


def ch_date(value):
    return value.date().isoformat() if value else None


def ch_interval(start, end):
    dates = {}
    if start:
        dates['from'] = start
    if end and end != '2999-12-31':
        dates['through'] = end
    return dates


def ch_add(rates, item):
    key = tuple((name, value) for name, value in item.items())
    rates[key] = item


def switzerland(raw):
    duty_files = [stem for stem in CH_FILES if stem.startswith('duty_rates_chapter_')]
    codes = defaultdict(dict)
    for stem in duty_files:
        for row in ch_rows(raw, stem, 'TN8 Nr'):
            code = clean(row[0]).replace('.', '')
            assert re.fullmatch('[0-9]{8}', code), row[:5]
            relief, permit, sequence, kind, group = row[1], row[3], row[4], row[9], row[10]
            start, end = ch_date(row[17]), ch_date(row[18])
            if end and end < '2026-10-01' or start and start > CHECKED:
                continue
            assert kind in ('NT', 'PR') and row[16] in ('Fr.', '%')
            if not isinstance(row[15], (int, float)):
                continue
            amount = numerical(row[15])
            assessment = clean(row[23])
            expression = f'{amount}%' if row[16] == '%' else f'CHF {amount} {assessment}'.strip()
            treatment = 'preferential' if kind == 'PR' else 'general'
            conditions = [f'Tares rate sequence {sequence}, relief code {relief}, assessment code {row[19]}.']
            if treatment == 'preferential':
                conditions.append('Confirm agreement or preference eligibility and proof of origin.')
            if relief != '00':
                conditions.append('Customs relief requires the applicable statutory conditions.')
            if permit == '1':
                conditions.append('Check the general import permit and reduced out-of-quota conditions.')
            if row[24] == 'J':
                conditions.append('Direct transport is required under the source conditions.')
            if row[25]:
                conditions.append(f'Seasonal window {clean(row[25])}.')
            details = ch_interval(start, end)
            if kind == 'PR':
                details['origin'] = f'{clean(row[14] or row[11])} (Tares group {group})'
            ch_add(codes[code], rate(treatment, f'{kind} · Tares group {group}', expression,
                                    condition=' '.join(conditions), **details))
    assert len(codes) > 7000
    records = [line(code, f'FOCBS Tares duty rates · {code}', list(rates.values())) for code, rates in codes.items()]
    authority = 'Swiss Federal Office for Customs and Border Security (FOCBS/BAZG)'
    terms = 'Numeric legal tariff provisions and identifiers only. Swiss Copyright Act Art. 5. Official workbooks and nomenclature texts are not redistributed.'
    meta = schedule('ch-tares-duty-2026-10', 'CH', ['CH', 'LI'], 'FOCBS Tares tariff rates from 2026-10-01',
                    '2026-10-01', 'national_schedule', authority, CH_SOURCE, terms,
                    CH_TERMS, [ch_input(raw, stem) for stem in [*duty_files, 'file_description_duty_rates']],
                    ['Swiss customs territory, including Liechtenstein under the 1923 customs treaty. Special territories and EEA conditions need separate verification.',
                     'Published duty candidates retain group, relief, assessment and seasonal identifiers. Confirm preferential origins, statutory conditions and quota availability.'])
    yield meta, records

    charges_file = 'control_elements_import_with_Zusabg'
    codes = defaultdict(dict)
    supported = {
        '280': ('excise', 'Spirits tax'), '480': ('excise', 'Beer tax'),
        '455': ('excise', 'Tobacco tax'), '660': ('excise', 'Motor vehicle tax'),
        '700': ('levy', 'VOC levy'), '740': ('levy', 'CO₂ levy on heating oil'),
        '741': ('levy', 'CO₂ levy on natural gas'), '742': ('levy', 'CO₂ levy on mineral oils'),
        '743': ('levy', 'CO₂ levy on coal and petroleum coke'),
    }
    for row in ch_rows(raw, charges_file, 'TN8 Nr'):
        code = clean(row[0]).replace('.', '')
        assert re.fullmatch('[0-9]{8}', code), row[:5]
        kind, amount = row[10], row[20]
        if kind not in supported or not isinstance(amount, (int, float)):
            continue
        assert row[31] in ('Fr.', '%') and row[32] == 'E' and row[39] == 'All countries'
        charge, name = supported[kind]
        start = max(ch_date(row[i]) for i in (4, 21, 33) if row[i])
        end = min(ch_date(row[i]) for i in (5, 22, 34) if row[i])
        if end < '2026-10-01' or start > CHECKED:
            continue
        quantity = clean(row[29]).replace('<Faktor>', numerical(row[30]))
        expression = f'{numerical(amount)}%' if row[31] == '%' else f'CHF {numerical(amount)} {quantity}'
        condition = f'FOCBS import control element {row[1]}, charge scale {row[15]}, assessment code {row[25]}. Check the product-specific assignment and exemptions in Tares.'
        if row[3]:
            condition += f' Assignment group {row[3]}.'
        if row[23] is not None:
            condition += f' Published minimum {row[23]}.'
        if row[24] is not None:
            condition += f' Published maximum {row[24]}.'
        ch_add(codes[code], rate('other', f'{name} · {kind}/{row[15]}', expression,
                                charge=charge, condition=condition, **ch_interval(start, end)))
    records = [line(code, f'FOCBS Tares import control elements · {code}', list(rates.values()))
               for code, rates in codes.items()]
    assert len(records) > 300
    meta = schedule('ch-tares-excises-2026-10', 'CH', ['CH'], 'FOCBS Tares additional charges from 2026-10-01',
                    '2026-10-01', 'national_schedule', authority, CH_SOURCE, terms, CH_TERMS,
                    [ch_input(raw, stem) for stem in [charges_file, 'file_descriptioncontrolelementsimportwithzusabg']],
                    ['Numeric candidates for selected excise and environmental levy codes with all-country assignments.',
                     'Additional-charge codes are not HS-based VAT rates. Match control element, charge scale, exemptions and composition before applying any candidate.'])
    yield {**meta, 'role': 'measures'}, records


def east_africa(raw):
    path = raw / 'eac-2025.pdf'
    source = 'https://www.rra.gov.rw/index.php?L=0&id=129'
    resource = 'https://www.rra.gov.rw/fileadmin/user_upload/COMMON_EXTERNAL_TARIFF__Updated_June_2025.pdf'
    pages = subprocess.check_output(['pdftotext', '-layout', str(path), '-'], text=True).split('\f')
    sensitive_page = next(i for i, text in enumerate(pages) if i > 500 and 'SCHEDULE 2' in text and 'SENSITIVE ITEMS' in text)
    annex_end = next(i for i, text in enumerate(pages) if i > sensitive_page and 'Legal Notice No.' in text)
    assert (sensitive_page, annex_end) == (557, 560)
    code_pattern = re.compile(r'[0-9]{4}\.[0-9]{2}\.[0-9]{2}')
    percent_pattern = re.compile(r'([0-9]+(?:\.[0-9]+)?)\s*%')
    combined_pattern = re.compile(r'([0-9]+)\s*% or \$\s*([0-9.]+)/MT')
    records = {}
    sensitive_codes = set()
    for page, body in enumerate(pages[:annex_end], 1):
        text_lines = body.splitlines()
        sensitive = page > sensitive_page
        for index, text in enumerate(text_lines):
            fields = re.split(r' {2,}', text.strip())
            if len(fields) < 3:
                continue
            offset = 0 if code_pattern.fullmatch(fields[0]) else 1
            if offset == 1 and not re.fullmatch(r'[0-9]{2}\.[0-9]{2}', fields[0]):
                continue
            if not code_pattern.fullmatch(fields[offset]):
                continue
            code = fields[offset].replace('.', '')
            published = fields[-1]
            if published == 'SI':
                sensitive_codes.add(code)
                continue
            label = 'Common external tariff, Schedule 2 sensitive item' if sensitive else 'Common external tariff, Schedule 1'
            if match := percent_pattern.fullmatch(published):
                expression = f'{match[1]}%'
            elif match := combined_pattern.fullmatch(published):
                expression = f'{match[1]}% or USD {match[2]} per tonne, whichever is higher'
            elif re.fullmatch(r'[0-9]+% or(?: USD)?', published):
                following = [re.search(r' {2,}\$?\s*([0-9]+(?:\.[0-9]+)?)/(kg|MT)\s*$', t)
                             for t in text_lines[index+1:index+5]]
                match = next((item for item in following if item and item.start(1) >= 70), None)
                assert match, (page, code, published)
                quantity = 'kg' if match[2] == 'kg' else 'tonne'
                expression = f'{published.split("%")[0]}% or USD {match[1]} per {quantity}, whichever is higher'
            else:
                following = [re.search(r' {2,}([0-9]+%)\s*$', t) for t in text_lines[index+1:index+3]]
                match = next((item for item in following if item and item.start(1) >= 70), None)
                assert match, (page, code, published)
                expression = match[1]
            if code in records and not sensitive:
                assert records[code]['rates'][0]['expression'] == expression, (code, expression)
                continue
            units = [fields[-2]] if len(fields) > offset + 2 and re.fullmatch(r'[a-zA-Z0-9/ .³-]{1,10}', fields[-2]) else []
            records[code] = line(code, f'EAC CET updated June 2025 · PDF page {page}',
                                 [rate('mfn', label, expression)], units=units)
    assert len(records) > 5900
    assert sensitive_codes.issubset(records), sorted(sensitive_codes - records.keys())
    assert records['04011000']['rates'][0]['expression'] == '60%'
    assert records['10063000']['rates'][0]['expression'] == '75% or USD 345 per tonne, whichever is higher'
    meta = schedule('eac-cet-2022-june-2025-rra', 'EAC', ['BI', 'KE', 'RW', 'TZ', 'UG'],
                    'EAC CET HS2022, June 2025 consolidated publication', '2025-06-30', 'published_baseline',
                    'East African Community / Rwanda Revenue Authority', source,
                    'Numeric provisions from the official CET annex and sensitive-items schedule. Product text is not redistributed.',
                    source, [input_file(path, resource)],
                    ['June 2025 regional baseline. Subsequent EAC Gazette notices and member-specific suspensions or exemptions require separate review.',
                     'Scope is limited to the original catalog destinations. Later accession states are not inferred.'],
                    through='2025-06-30')
    return meta, list(records.values())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('raw', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--only', nargs='+', choices=['no', 'no-origin-duty', 'ch', 'eac'], default=['no', 'no-origin-duty', 'ch', 'eac'])
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    manifest = args.output / 'manifest.json'
    previous = read_json(manifest)['snapshots'] if manifest.exists() else []
    snapshots = {item['id']: item for item in previous}
    builders = {'no': norway, 'no-origin-duty': lambda raw: (norway_origin_duty(raw),), 'ch': switzerland, 'eac': lambda raw: (east_africa(raw),)}
    for key in args.only:
        for meta, rows in builders[key](args.raw):
            snapshot = write_pack(args.output, meta, rows)
            snapshots[meta['id']] = snapshot
            print(snapshot['id'], snapshot['statistics']['lines'], snapshot['statistics']['rates'], flush=True)
    manifest.write_text(json.dumps({'version': 1, 'snapshots': list(snapshots.values())}, ensure_ascii=False, indent=2) + '\n')


if __name__ == '__main__':
    main()
