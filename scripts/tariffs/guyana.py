#!/usr/bin/env python3
"""Normalize GRA's published HS2017 rate reference and verified import measures."""

import argparse
from hashlib import sha256
import gzip
from html import unescape
import json
from pathlib import Path
import re
import subprocess

CET_PAGE = 'https://gra.gov.gy/hs-2017-harmonized-system-hs/'
CET_PDF = 'https://www.gra.gov.gy/wp-content/uploads/2020/12/HS-2017-version.pdf'
BUDGET_PAGE = 'https://gra.gov.gy/administration-of-budget-measures-2026/'
BUDGET_PDF = 'https://www.gra.gov.gy/wp-content/uploads/2026/03/2026-BUDGET-MEASURES-FOR-ASYCUDA-PURPOSES.pdf'
SPORTS_PAGE = 'https://gra.gov.gy/exemptions-on-sports-equipment-and-gear/'
TERMS_URL = 'https://www.wipo.int/wipolex/en/legislation/details/9980'
CHECKED_ON = '2026-11-11'
HS10 = r'\d{4}\.\d{2}\.\d{2}\.\d{2}'
CET_ROW = re.compile(r'^\s*(\d{4})\.(\d{2})\s+(\d{2})\s+(\d{2})\s+(.+)')
CET_RATE = re.compile(r'(?:^|\s{2,})(Free|\d+(?:\.\d+)?%)(?=\s{2,}|\s*$)')
BUDGET_ROW = re.compile(fr'^({HS10})\s+.*?\s{{2,}}(\d+)\s+((?:\$\d{{1,3}}(?:,\d{{3}})+)|\d+|NA)\s+(\d+)\s*$')
SPORTS_ROW = re.compile(fr'<td[^>]*>\s*({HS10})\s*</td>\s*<td[^>]*>\s*(\d+%)\s*</td>\s*<td[^>]*>\s*(\d+%)\s*</td>')


def pdf_pages(path):
    result = subprocess.run(['pdftotext', '-layout', str(path), '-'], check=True, capture_output=True, text=True)
    return result.stdout.split('\f')[:-1]


def rate(charge, expression, label, condition, treatment='other'):
    return {'charge': charge, 'treatment': treatment, 'label': label, 'expression': expression, 'condition': condition}


def input_file(path, url):
    return {'name': path.name, 'url': url, 'sha256': sha256(path.read_bytes()).hexdigest()}


def write_packs(output, snapshots):
    output.mkdir(parents=True, exist_ok=True)
    manifest = []
    for source, lines in snapshots:
        lines.sort(key=lambda row: row['code'])
        pack = output / f"{source['id']}.json.gz"
        data = json.dumps({'id': source['id'], 'lines': lines}, ensure_ascii=False, separators=(',', ':')).encode()
        pack.write_bytes(gzip.compress(data, compresslevel=9, mtime=0))
        rates = [item for row in lines for item in row['rates']]
        manifest.append({
            **source, 'file': pack.name, 'sha256': sha256(pack.read_bytes()).hexdigest(),
            'statistics': {
                'lines': len(lines), 'uniqueCodes': len({row['code'] for row in lines}),
                'codesWithRates': sum(bool(row['rates']) for row in lines), 'rates': len(rates),
                'chapters': sorted({row['code'][:2] for row in lines}),
                'charges': sorted({item['charge'] for item in rates}),
            },
        })
        print(source['id'], len(lines), len(rates))
    (output / 'manifest.json').write_text(json.dumps({'version': 1, 'snapshots': manifest}, ensure_ascii=False, indent=2) + '\n')


def source(key, edition, start, end, page, file, limitations, measure=False):
    metadata = {
        'id': key, 'jurisdiction': 'GY', 'countries': ['GY'], 'zone': 'standard',
        'edition': edition, 'hsEdition': 'HS2017', 'availableFrom': start, 'availableThrough': end,
        'checkedOn': CHECKED_ON, 'scope': 'published_baseline' if measure else 'compiled_reference',
        'authority': 'Guyana Revenue Authority', 'sourceUrl': page,
        'terms': 'Only factual tariff identifiers and rate values are reproduced. The original presentation, product descriptions, and other editorial text are omitted.',
        'termsUrl': TERMS_URL, 'inputFiles': [file], 'limitations': limitations,
    }
    if measure:
        metadata['role'] = 'measures'
    return metadata


def cet_snapshot(path):
    pages = pdf_pages(path)
    assert len(pages) == 727 and 'Customs Duties (Amendment) Order 2018' in pages[1]
    rows = {}
    reviewed = {'5704100000': '20%', '8514400000': 'Free'}
    condition = 'Historical CARICOM reference published by GRA. Verify the current Guyana statutory rate, exceptions, and eligibility in ASYCUDA World.'
    for page, content in enumerate(pages[24:589], 25):
        for line in content.splitlines():
            match = CET_ROW.match(line)
            if not match:
                continue
            code = ''.join(match.groups()[:4])
            expressions = set(CET_RATE.findall(match[5]))
            if code in reviewed:
                assert not expressions and reviewed[code] in match[5], code
                expressions.add(reviewed[code])
            if len(expressions) != 1:
                continue
            value = expressions.pop()
            assert code not in rows, (code, page)
            rows[code] = {'code': code, 'reference': f'GRA HS2017 CET schedule, PDF p. {page}, DUTY RATE',
                          'url': f'{CET_PDF}#page={page}',
                          'rates': [rate('customs_duty', '0%' if value == 'Free' else value, 'Published CET reference', condition, 'general')]}
    assert len(rows) == 6668
    assert rows['0101210000']['rates'][0]['expression'] == '0%'
    assert rows['0101291000']['rates'][0]['expression'] == '45%'
    metadata = source(
        'gy-gra-hs2017-cet-reference', 'GRA published HS2017 CARICOM CET reference, July 2018 PDF',
        '2018-07-06', '2018-07-06', CET_PAGE, input_file(path, CET_PDF),
        ['Historical reference. The date is the PDF creation date in Guyana. The copy has an unnumbered cover order and does not establish a commencement or in-force date.',
         'Only clearly extractable numerical and Free entries in the schedule of rates are encoded. National exceptions, preferences, domestic taxes, and later changes require separate verification.'])
    return metadata, list(rows.values())


def budget_snapshots(path):
    pages = pdf_pages(path)
    assert len(pages) == 4 and 'UPDATED VIA CG LETTER' in pages[-1]
    groups = [[], []]
    for page, content in enumerate(pages, 1):
        for line in content.splitlines():
            match = BUDGET_ROW.match(line)
            if not match:
                assert not re.match(HS10, line), (page, line)
                continue
            printed, duty, excise, vat = match.groups()
            condition = ('Only eligible new hybrid vehicles with the prescribed engine capacity and Commissioner-General letter qualify.'
                         if page == 4 else
                         'Apply only to the exact national tariff line and goods meeting the published budget measure conditions.')
            rates = [
                rate('customs_duty', duty + '%', '2026 budget customs duty', condition),
                rate('import_vat', vat + '%', '2026 budget import VAT', condition),
            ]
            if excise != 'NA':
                value = 'GYD ' + excise[1:] if excise.startswith('$') else excise + '%'
                rates.append(rate('excise', value, '2026 budget excise tax', condition))
            groups[page == 4].append({'code': printed.replace('.', ''), 'reference': f'GRA 2026 Budget Measures, PDF p. {page}',
                                      'url': f'{BUDGET_PDF}#page={page}', 'rates': rates})
    assert [len(rows) for rows in groups] == [36, 4]
    assert len({row['code'] for rows in groups for row in rows}) == 40
    assert next(row for row in groups[0] if row['code'] == '8703232010')['rates'][2]['expression'] == 'GYD 2,000,000'
    scopes = [
        ('gy-gra-2026-budget-import-measures', 'GRA 2026 budget import measures in ASYCUDA World', '2026-02-16',
         'GRA states that the exemptions took effect on 16 February 2026. This snapshot ends on the date of the published guidance.'),
        ('gy-gra-2026-budget-cg-letter', 'GRA 2026 budget import measures via Commissioner-General letter', '2026-03-16',
         'Separate Commissioner-General letter items. Recorded on the notice date because this guidance does not give a separate letter implementation date.'),
    ]
    snapshots = [(source(key, edition, start, '2026-03-16', BUDGET_PAGE, input_file(path, BUDGET_PDF),
                         [timing, 'Selected motor vehicles and outboard motors with published ten-digit codes. Blank or not-applicable excise cells do not establish a zero rate.'],
                         measure=True), rows)
                 for (key, edition, start, timing), rows in zip(scopes, groups, strict=True)]
    combined_duties = []
    for (metadata, rows) in snapshots:
        for row in rows:
            customs = [{**item, 'from': metadata['availableFrom']}
                       for item in row['rates'] if item['charge'] == 'customs_duty']
            combined_duties.append({**row, 'rates': customs})
    metadata = {**snapshots[0][0], 'id': 'gy-gra-2026-budget-selected-duties',
                'limitations': [*snapshots[0][0]['limitations'],
                                'The four Commissioner-General letter rates are recorded from the notice date. Other tariff lines require separate sources.']}
    del metadata['role']
    return (metadata, combined_duties), [taxes_only(item) for item in snapshots]


def taxes_only(snapshot):
    metadata, rows = snapshot
    return metadata, [
        {**row, 'rates': [item for item in row['rates'] if item['charge'] != 'customs_duty']}
        for row in rows
    ]


def sports_snapshots(path):
    document = unescape(path.read_text())
    assert 'February 6, 2024' in document
    rows = []
    for printed, duty, vat in SPORTS_ROW.findall(document):
        assert duty == vat == '0%'
        condition = 'Goods must satisfy the sports equipment exemption in Part III(B)(ii) of the First Schedule and VAT Act Second Schedule paragraph 5(c).'
        rows.append({'code': printed.replace('.', ''), 'reference': 'GRA Exemptions on Sports Equipment and Gear, HS Codes table',
                     'url': SPORTS_PAGE,
                     'rates': [rate('customs_duty', duty, 'Sports equipment customs duty exemption', condition),
                               rate('import_vat', vat, 'Sports equipment import VAT exemption', condition)]})
    assert len(rows) == len({row['code'] for row in rows}) == 12
    metadata = source(
        'gy-gra-sports-equipment-exemptions', 'GRA sports equipment import duty and VAT exemptions',
        '2024-02-06', '2026-02-02', SPORTS_PAGE, input_file(path, SPORTS_PAGE),
        ['GRA identifies 6 February 2024 as the effective date. This snapshot ends on the date of the published guidance.',
         'Twelve lines are explicitly listed. Unlisted goods may require a separate application and eligibility determination.'], measure=True)
    duties = {**metadata, 'id': 'gy-gra-sports-equipment-selected-duties'}
    del duties['role']
    return (duties, [{**row, 'rates': [row['rates'][0]]} for row in rows]), taxes_only((metadata, rows))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('cet_pdf', type=Path)
    parser.add_argument('budget_pdf', type=Path)
    parser.add_argument('sports_html', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    write_packs(args.output / 'reference', [cet_snapshot(args.cet_pdf)])
    budget_duties, budget_taxes = budget_snapshots(args.budget_pdf)
    sports_duties, sports_taxes = sports_snapshots(args.sports_html)
    write_packs(args.output / 'measures', [budget_duties, *budget_taxes, sports_duties, sports_taxes])
