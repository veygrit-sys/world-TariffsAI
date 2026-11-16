#!/usr/bin/env python3
"""Build the Ukrainian customs tariff and the 2026 EU-origin preferences."""
import argparse
import json
from pathlib import Path
import re

import fitz
from lxml import html

from rebuild import EU, clean, digest, line, rate, schedule, write_pack

LAW_URL = 'https://zakon.rada.gov.ua/laws/show/2697-20'
COPYRIGHT_URL = 'https://www.wipo.int/wipolex/en/legislation/details/22385'
CABINET_URL = ('https://www.kmu.gov.ua/storage/app/sites/1/itd-ind52/'
               '2-dostup-do-rinku-ukrayini-stavki-vviznix-mit-na-2026-rik.pdf')
DECISION_URL = 'https://eur-lex.europa.eu/eli/dec/2025/2130/oj/eng'
ANNEX_URLS = {
    'ua-legal-1.html': 'https://zakon.cc/law/document/read/2697%D0%B0-20',
    'ua-legal-2.html': 'https://zakon.cc/law/document/read/2697%D0%B1-20',
}
CHECK_MIRROR = 'https://document.vobu.ua/wp-content/uploads/uktzed-2023/'
CHECK_FILES = ['r01', 'r02-03', 'r04-05', 'r06', 'r07-10', 'r11', 'r12-14',
               'r15', 'r16', 'r17-21']
TARIFF_CODE = re.compile(r'[0-9]{4}( [0-9]{2}){3}')
PERCENT_NUMBER = r'[0-9]+(?:[.,][0-9]+)?'
QUOTA_RATE = re.compile(
    rf'({PERCENT_NUMBER}) \(в межах тарифної квоти\); '
    rf'({PERCENT_NUMBER}) \(поза межами тарифної квоти\)'
)
AGREEMENT_ORIGIN = 'EU origin under the EU–Ukraine Association Agreement, Decision No 3/2025.'


def expression(value):
    if re.fullmatch(PERCENT_NUMBER, value):
        return f'{value.replace(",", ".")}%'
    # The statutory mirror encodes superscript unit exponents as -2/-3.
    return value.replace('м-2', 'м²').replace('м-3', 'м³').replace('м2', 'м²').replace('м3', 'м³')


def statutory_tables(paths):
    rows = {}
    for path in paths:
        root = html.parse(str(path))
        for row in root.xpath('//table/tr|//table/tbody/tr'):
            cells = [clean(cell.text_content()) for cell in row.xpath('./td|./th')]
            if not cells or not TARIFF_CODE.fullmatch(cells[0]):
                continue
            if len(cells) == 5:
                cells.insert(2, '')  # Chapters where the FTA column is absent.
            spaced_code, _, preferential, mfn, general, unit = cells
            code = spaced_code.replace(' ', '')
            if code in rows or preferential or not mfn or not general:
                raise ValueError(f'Unexpected statutory tariff row: {path} {cells}')
            rows[code] = (spaced_code, expression(mfn), expression(general), expression(unit))
    return rows


def dcfta_rows(path):
    records = []
    columns = (29.28, 49.44, 122.76, 264.62, 331.49, 401.57, 599.02, 735.24)
    with fitz.open(path) as document:
        for page in document:
            words = page.get_text('words', sort=True)
            row_edges = sorted({round(drawing['rect'].y0, 2)
                                for drawing in page.get_drawings()
                                if drawing['rect'].height < 0.1 and drawing['rect'].width > 700})[1:]
            for top, bottom in zip(row_edges, row_edges[1:]):
                cells = [clean(' '.join(word[4] for word in words
                                        if left <= word[0] + 0.3 < right
                                        and top <= (word[1] + word[3]) / 2 < bottom))
                         for left, right in zip(columns, columns[1:])]
                ex, spaced_code, description, mfn, _, transition, published_rate = cells
                if not TARIFF_CODE.fullmatch(spaced_code) or ex not in ('', 'ex', 'ех'):
                    raise ValueError(f'Unexpected Cabinet tariff row on page {page.number + 1}: {cells}')
                records.append((page.number + 1, spaced_code.replace(' ', ''), ex, description,
                                expression(mfn), transition, published_rate))
    if len(records) != 399 or sum(bool(row[2]) for row in records) != 24:
        raise ValueError('Unexpected number of Ukraine←EU PDF rows or ex entries')
    return records


def prefer(label, value, condition, *, treatment='preferential'):
    return rate(treatment, label, expression(value)) | {
        'from': '2026-01-01', 'through': '2026-12-31',
        'originCountries': EU, 'condition': condition,
    }


def build(raw, out):
    law_paths = [raw / name for name in ANNEX_URLS]
    rows = statutory_tables(law_paths)
    mirror_paths = [raw / f'ua-{name}.htm' for name in CHECK_FILES]
    check = statutory_tables(mirror_paths)
    if len(rows) != 11008 or len(check) != 11006 or rows.keys() - check.keys() != {'3916901090', '3916905000'}:
        raise ValueError('Statutory tariff mirrors contain unexpected national codes')
    if any(rows[code][1:3] != values[1:3] for code, values in check.items()):
        raise ValueError('Statutory tariff mirrors disagree on a published rate')
    lines = {}
    for code, (spaced, mfn, general, unit) in rows.items():
        annex = '2697%D0%B0-20' if int(code[:2]) <= 49 else '2697%D0%B1-20'
        lines[code] = line(code, f'Law No 2697-IX, UKT ZED {spaced}', [
            rate('mfn', 'MFN (пільгова)', mfn), rate('general', 'Full duty (повна)', general),
        ], url=f'https://zakon.rada.gov.ua/laws/show/{annex}', **({'units': [unit]} if unit != '-' else {}))

    pdf = raw / 'ua-eu-2026.pdf'
    for page, code, ex, description, reference_mfn, transition, value in dcfta_rows(pdf):
        row = lines[code]
        condition = f'{AGREEMENT_ORIGIN} Cabinet 2026 schedule, p. {page}.'
        if ex:
            condition += f' Ex — covered goods only: {description}.'
        quota = QUOTA_RATE.fullmatch(value)
        if quota:
            condition += f' Published quota allocation: {transition}.'
            row['rates'].extend([
                prefer('EU–Ukraine DCFTA 2026, in quota', quota[1], condition + ' Within the available quota.', treatment='quota'),
                prefer('EU–Ukraine DCFTA 2026, out of quota', quota[2], condition + ' Outside the quota.', treatment='quota'),
            ])
        elif re.fullmatch(PERCENT_NUMBER, value):
            row['rates'].append(prefer('EU–Ukraine DCFTA 2026', value, condition))
        else:
            raise ValueError(f'Unexpected EU tariff rate for {code}: {value}')
        if row['rates'][0]['expression'] != reference_mfn:
            row['notes'] = ['The MFN rate comes from Law 2697-IX. The separately published EU schedule has a differing comparison column for this code.']
    lines['6309000020']['rates'].append(prefer(
        'EU–Ukraine DCFTA 2026, entry-price preference', '0',
        f'{AGREEMENT_ORIGIN} The declared customs value must exceed the 2026 entry price under Annex I-B. '
        'See the Cabinet 2026 schedule, p. 1, and the agreement for the threshold and other conditions.',
    ))

    inputs = [{'name': path.name, 'sha256': digest(path), 'url': ANNEX_URLS[path.name]} for path in law_paths]
    inputs.extend({'name': path.name, 'sha256': digest(path), 'url': CHECK_MIRROR + path.name[3:]}
                  for path in mirror_paths)
    inputs.extend([
        {'name': pdf.name, 'sha256': digest(pdf), 'url': CABINET_URL},
        {'name': 'eu-ua-2025-2130.html', 'sha256': digest(raw / 'eu-ua-2025-2130.html'), 'url': DECISION_URL},
    ])
    metadata = schedule(
        'ua-uktzed-law2697-dcfta-2026', 'UA', ['UA'], 'Law 2697-IX, with selected 2026 EU–Ukraine DCFTA rates',
        '2023-01-01', 'national_schedule', 'Verkhovna Rada of Ukraine and Cabinet of Ministers of Ukraine',
        LAW_URL, 'Adapted statutory rates and official administrative tariff data. Ukraine Law No 2811-IX, Article 8(1)(3).',
        COPYRIGHT_URL, inputs, [
            'The annexes are statutory MFN and full duty rate columns. Statutory rate values were checked against a second legal mirror.',
            'EU preferences are limited to the 2026 Cabinet HS2022 reference table, plus its Annex I-B entry-price example. Check eligibility, origin documents, ex conditions, and quotas.',
            'The Agreement applies beyond the EU-origin items listed here. Other agreements, exemptions, VAT, trade remedies and temporary measures require separate checks.',
        ],
    )
    return write_pack(out, metadata, list(lines.values()))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('raw', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    snapshot = build(args.raw, args.output)
    manifest = {'version': 1, 'snapshots': [snapshot]}
    (args.output / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')


if __name__ == '__main__':
    main()
