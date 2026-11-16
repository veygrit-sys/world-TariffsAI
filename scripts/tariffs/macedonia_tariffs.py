#!/usr/bin/env python3
"""Build North Macedonia's 2026 customs tariff with the July statutory changes."""
import argparse
import json
from pathlib import Path
import re
from urllib.parse import quote

import fitz
from openpyxl import load_workbook

from rebuild import clean, digest, line, rate, schedule, write_pack

SOURCE_URL = 'https://customs.gov.mk/en-GB/pocetna/e-carina/nkts/carinska-tarifa.nspx'
WORKBOOK_URL = 'https://customs.gov.mk/content/CT%20%202026.xlsx'
LAW_URL = 'https://www.customs.gov.mk/content/'
TERMS_URL = 'https://cdn.nestjs.wipolex.wji.prd.web1.wipo.int/wipolex/en/legislation/details/10641'
DOCUMENTS = {
    'mk-amendment-130-2025.pdf': 'ЗАКОН ЗА ИЗМЕНУВАЊЕ И ДОПОЛНУВАЊЕ НА ЗАКОНОТ ЗА ЦАРИНСКАТА ТАРИФА.pdf',
    'mk-amendment-161-2026.pdf': 'Закон за изменување ЗЦТ.pdf',
}
NUMBER = r'[0-9]+(?:[.,][0-9]+)?'
LINE_CODE = re.compile(r'[0-9]{10}')
CHANGES = re.compile(r'„([0-9]{4}(?:\s+[0-9]{2}){3})\s*[-–]+[^“]+“[^„]+„([0-9]+(?:,[0-9]+)?)“'
                     r'\s*се\s+заменува\s+со\s+(?:бројот|кратенката)\s+„([0-9]+(?:,[0-9]+)?|сл)“')
MIXED = re.compile(rf'(?:(?P<base>{NUMBER})\s*\+\s*)?(?P<specific>{NUMBER})\s*(?:eur|еур,?)/'
                   rf'(?P<unit>kg|кг|л)(?:\s*max\.\s*(?P<maximum>{NUMBER}))?')


def expression(value):
    text = clean(value)
    if text == 'сл':
        return '0%'
    if re.fullmatch(NUMBER, text):
        return f'{text.replace(",", ".").removesuffix(".0")}%'
    match = MIXED.fullmatch(text)
    if not match:
        raise ValueError(f'Unexpected rate: {value}')
    parts = match.groupdict()
    unit = 'litre' if parts['unit'] == 'л' else 'kg'
    value = f'EUR {parts["specific"]} per {unit}'
    if parts['base']:
        value = f'{parts["base"]}% + {value}'
    if parts['maximum']:
        value += f', maximum {parts["maximum"]}%'
    return re.sub(r'(?<=\d),(?=\d)', '.', value)


def law_text(path):
    with fitz.open(path) as document:
        return '\n'.join(page.get_text(sort=True) for page in document)


def july_changes(path):
    source = law_text(path)
    if 'бр. 161 од 16.7.2026' not in source:
        raise ValueError('Expected North Macedonia Gazette 161 of 16 July 2026')
    matches = CHANGES.findall(source)
    changes = {''.join(code.split()): (expression(old), expression(new)) for code, old, new in matches}
    if len(matches) != 70 or len(changes) != 70:
        raise ValueError('Expected 70 tariff changes in Gazette 161/2026')
    return changes


def build(raw, out):
    workbook_path = raw / 'mk-2026.xlsx'
    us_path = raw / 'mk-amendment-130-2025.pdf'
    july_path = raw / 'mk-amendment-161-2026.pdf'
    us_law = law_text(us_path)
    if 'бр. 130 од 27.6.2025' not in us_law or not re.search(r'Соединетите\s+Американски Држави се применува царинска давачка', us_law):
        raise ValueError('Expected US-origin preference in Gazette 130/2025')
    changes = july_changes(july_path)
    workbook = load_workbook(workbook_path, read_only=True, data_only=True)
    rows = []
    seen = set()
    try:
        for index, (raw_code, description, value, unit) in enumerate(
            workbook['tariff 2026'].iter_rows(min_row=2, max_col=4, values_only=True), 2
        ):
            code = re.sub(r'\s+', '', clean(raw_code).translate(str.maketrans('oOоО', '0000')).lstrip('★□*'))
            if not LINE_CODE.fullmatch(code):
                continue
            if code in seen:
                raise ValueError(f'Duplicate national code {code} in row {index}')
            seen.add(code)
            rates = []
            if value is not None and value != '':
                original = expression(value)
                label = 'North Macedonia national duty'
                condition = {}
                if 'For industrial' in clean(description):
                    condition['condition'] = clean(description).lstrip('- ')
                if code in changes:
                    before, after = changes[code]
                    if original != before:
                        raise ValueError(f'Published old rate does not match the workbook for {code}')
                    rates.append(rate('general', label, original, through='2026-07-15', **condition))
                    rates.append(rate('general', f'{label} (Gazette 161/2026)', after, **{'from': '2026-07-16', **condition}))
                else:
                    rates.append(rate('general', label, original, **condition))
                rates.append(rate('preferential', 'United States origin (Gazette 130/2025)', '0%', originCountries=['US'],
                                  condition='Qualifying US origin and proof under Article 2(5) of the Law on Customs Tariff and implementing rules.'))
            rows.append(line(code, f'North Macedonia 2026 Customs Tariff workbook, row {index}, {code}', rates,
                             **({'units': [clean(unit)]} if clean(unit) else {})))
    finally:
        workbook.close()
    if len(rows) != 10334 or not changes.keys() <= seen:
        raise ValueError(f'Unexpected national tariff table size or missing amendment codes: {len(rows)}')
    inputs = [{'name': workbook_path.name, 'sha256': digest(workbook_path), 'url': WORKBOOK_URL}]
    inputs.extend({'name': name, 'sha256': digest(raw / name), 'url': LAW_URL + quote(filename)}
                  for name, filename in DOCUMENTS.items())
    metadata = schedule(
        'mk-customs-2026-gazette-161', 'MK', ['MK'], 'Customs Tariff 2026, with Official Gazette 161/2026',
        '2026-01-01', 'national_schedule', 'Customs Administration of North Macedonia and Official Gazette', SOURCE_URL,
        'Adapted official tariff rates and official texts, excluded under Article 16 of North Macedonia’s Law on Copyright and Related Rights.',
        TERMS_URL, inputs, [
            'The workbook contains national basic duties. Seventy lines have date-specific changes from Official Gazette 161/2026.',
            'The US-origin duty preference is subject to origin proof. Other preferential schedules, quotas, VAT and additional duties require separate checks.',
            'The source sheet is labelled tariff 2026 and linked under 2026, with a 2025 text heading. The malformed 11-digit code in row 9480 and unnumbered rows are excluded.',
        ],
    )
    return write_pack(out, metadata, rows)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('raw', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    manifest = {'version': 1, 'snapshots': [build(args.raw, args.output)]}
    (args.output / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')


if __name__ == '__main__':
    main()
