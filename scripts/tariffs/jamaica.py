#!/usr/bin/env python3
"""Normalize the Jamaica Customs October 2026 integrated tariff PDF."""
import argparse
from collections import defaultdict
from decimal import Decimal
from pathlib import Path
import re
import subprocess
from xml.etree import ElementTree

from americas_pack import input_file, write_packs


SOURCE = 'https://jca.gov.jm/services/current-tariffs/'
PDF = 'https://jca.gov.jm/wp-content/uploads/2026/11/INTEGRATED-TARIFF-BASED-ON-HS-2022-October-30-2026.pdf'
TERMS = 'https://laws.moj.gov.jm/library/statute/the-copyright-act'
NAMESPACE = '{http://www.w3.org/1999/xhtml}'
CODE = re.compile(r'\d{10}')
FRACTION = re.compile(r'(?:0(?:\.\d+)?|1)')
HEADERS = ('ID', 'ASD05', 'GCT', 'EXC023', 'SCTA08', 'SCTS18', 'SCTF028', 'SCF90', 'ENVL20', 'DCess96', 'CAF', 'Aggreg.')
MEASURES = {
    'ASD05': ('additional_duty', 'Additional Stamp Duty'),
    'GCT': ('import_gst', 'General Consumption Tax'),
    'EXC023': ('excise', 'Excise Duty'),
    'SCTA08': ('excise', 'Special Consumption Tax, ad valorem'),
    'SCF90': ('fee', 'Standards Compliance Fee'),
    'ENVL20': ('levy', 'Environmental Protection Levy'),
}
SPECIFIC_MEASURES = {
    'ASD05': ('additional_duty', 'Additional Stamp Duty'),
    'SCTS18': ('excise', 'Special Consumption Tax, specific'),
    'SCTF028': ('excise', 'Special Consumption Tax, fuel'),
    'DCess96': ('levy', 'DCess96, as printed'),
}


def percentages(value):
    amount = format(Decimal(value) * 100, 'f')
    return (amount.rstrip('0').rstrip('.') if '.' in amount else amount) + '%'


def source_rows(path):
    result = subprocess.run(['pdftotext', '-bbox', str(path), '-'], check=True, capture_output=True)
    document = ElementTree.fromstring(result.stdout)
    pages = list(document.iter(NAMESPACE + 'page'))
    assert len(pages) == 377
    for page_number, page in enumerate(pages, 1):
        words = [(word.text, float(word.get('xMin')), round(float(word.get('yMin')), 2)) for word in page if word.text]
        headers = {text: x for text, x, y in words if text in HEADERS and x > 280 and y < 80}
        assert tuple(sorted(headers, key=headers.get)) == HEADERS, page_number
        bounds = [(key, headers[key] - 2, headers[next_key] - 2) for key, next_key in zip(HEADERS, HEADERS[1:])]
        codes = {y: text for text, x, y in words if 75 < x < 90 and CODE.fullmatch(text)}
        cells = defaultdict(lambda: defaultdict(list))
        for text, x, y in words:
            if not (bounds[0][1] <= x < bounds[-1][2]):
                continue
            column = next(column for column, lo, hi in bounds if lo <= x < hi)
            cells[y][column].append((x, text))
        for y, code in codes.items():
            values = {key: ' '.join(text for _, text in sorted(tokens)) for key, tokens in cells[y].items()}
            if not FRACTION.fullmatch(values.get('ID', '')):
                continue
            # Rows with an independent duty have the levy or complete tax columns.
            assert values.get('ENVL20') == '0.0085' or (values.get('GCT') in ('-', '0.15', '0.2', '0.25', '0') and values.get('EXC023') == '-'), (page_number, code)
            preceding = cells.get(round(y - 10.4, 2), {})
            previous = {key: ' '.join(text for _, text in sorted(tokens)) for key, tokens in preceding.items()}
            yield page_number, code, values, previous


def build(pdf, output):
    duties = []
    measures = []
    for page, code, cells, previous in source_rows(pdf):
        base = {'code': code, 'url': f'{PDF}#page={page}'}
        special = code.startswith(('98', '99'))
        treatment = 'other' if special else 'general'
        duty = {'charge': 'customs_duty', 'treatment': treatment, 'label': 'Jamaica integrated tariff import duty', 'expression': percentages(cells['ID'])}
        if special:
            duty['condition'] = 'Special national chapter. Verify eligibility and calculation basis.'
        duties.append({**base, 'reference': f'JCA Integrated Tariff, PDF p. {page}, ID 01', 'rates': [duty]})
        rates = []
        for key, (charge, label) in MEASURES.items():
            value = cells.get(key, '')
            if FRACTION.fullmatch(value):
                rates.append({'charge': charge, 'treatment': treatment, 'label': f'{label} ({key})', 'expression': percentages(value)})
        for key, (charge, label) in SPECIFIC_MEASURES.items():
            value = cells.get(key, '')
            if not value or value == '-' or (key == 'ASD05' and FRACTION.fullmatch(value)):
                continue
            preceding = previous.get(key, '')
            expression = f'{preceding} {value}' if '$' in preceding and '$' not in value else value
            if not re.search(r'\d', expression):
                continue
            rates.append({
                'charge': charge, 'treatment': treatment, 'label': f'{label} ({key})', 'expression': expression,
                'condition': 'Printed reference. Confirm currency, units, specific or percentage basis, and eligibility against the governing rules.',
            })
        if rates:
            measures.append({**base, 'reference': f'JCA Integrated Tariff, PDF p. {page}, import tax and fee columns', 'rates': rates})

    assert len(duties) == len({row['code'] for row in duties}) == 8088
    by_code = {row['code']: row['rates'] for row in duties}
    measure_by_code = {row['code']: {rate['label'].rsplit('(', 1)[1][:-1]: rate['expression'] for rate in row['rates']} for row in measures}
    assert by_code['8517130000'][0]['expression'] == '20%'
    assert measure_by_code['8517130000'] == {'GCT': '25%', 'SCF90': '0.3%', 'ENVL20': '0.85%'}
    assert measure_by_code['2203001010']['ASD05'] == 'US$0.60 per litre'
    assert measure_by_code['2203001010']['SCTS18'] == 'J$ 1,400 per LPA'
    common = {
        'jurisdiction': 'JM', 'countries': ['JM'], 'zone': 'standard',
        'edition': 'Jamaica Customs Agency Integrated Tariff, 30 October 2026', 'hsEdition': 'HS2022',
        'availableFrom': '2026-11-11', 'availableThrough': '2026-11-11', 'checkedOn': '2026-11-11',
        'scope': 'published_baseline', 'authority': 'Jamaica Customs Agency', 'sourceUrl': SOURCE,
        'terms': 'Factual commodity codes and numeric tariff values from the Jamaica Customs Agency publication. The original text, descriptions and layout are excluded.',
        'termsUrl': TERMS, 'inputFiles': [input_file(pdf, PDF)],
    }
    duty_source = {
        **common, 'id': 'jm-jca-integrated-duty-2026-10-30',
        'limitations': [
            'Public schedule linked by the Jamaica Customs Agency on the check date. The date range describes the observation.',
            'Independent numerical ID 01 cells only. Non-declarable parent rows and deleted entries are excluded. Preferences and temporary eligibility require separate verification.',
        ],
    }
    tax_source = {
        **common, 'id': 'jm-jca-integrated-import-taxes-2026-10-30', 'role': 'measures',
        'limitations': [
            'Explicit values from GCT, ASD, excise, SCT, Standards Compliance Fee and environmental levy fields. A blank cell or dash is not treated as zero or an exemption.',
            'Specific or ambiguous expressions are carried as reference values with unit checks. Some printed specific cells cannot be extracted reliably and require source review.',
            'Customs Administrative Fee, aggregated limit, alternative end use, relief, and calculation bases require separate verification.',
        ],
    }
    write_packs(output, [(duty_source, duties), (tax_source, measures)])


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('pdf', type=Path)
    parser.add_argument('out', type=Path)
    args = parser.parse_args()
    build(args.pdf, args.out)
