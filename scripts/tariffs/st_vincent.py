#!/usr/bin/env python3
"""Normalize the Saint Vincent Customs ASYCUDA HS 2022 PDF report."""
import argparse
from collections import Counter, defaultdict
from pathlib import Path
import re
import subprocess
from xml.etree import ElementTree

from americas_pack import input_file, write_packs


SOURCE = 'https://customs.gov.vc/tariff-classification'
PDF = 'https://customs.gov.vc/downloads/tariff-classification.pdf'
TERMS = 'https://www.wipo.int/wipolex/en/legislation/details/11336'
COLS = ('HS6_COD', 'TAR_PR1', 'TAR_PR2', 'IMPORT_DUTY', 'EXCISE', 'SURCHARGE', 'CSC', 'VAT', 'EPA')
NAMESPACE = '{http://www.w3.org/1999/xhtml}'
DECIMAL = re.compile(r'\d+(?:\.\d+)?')
CODE = re.compile(r'\d{6}')
MEASURES = {
    'EXCISE': ('excise', 'ASYCUDA excise', False),
    'SURCHARGE': ('additional_duty', 'ASYCUDA surcharge', False),
    'CSC': ('fee', 'ASYCUDA Customs Service Charge', True),
    'VAT': ('import_vat', 'ASYCUDA VAT', True),
}


def rows_from_pdf(path):
    result = subprocess.run(['pdftotext', '-bbox', str(path), '-'], check=True, capture_output=True)
    document = ElementTree.fromstring(result.stdout)
    pages = list(document.iter(NAMESPACE + 'page'))
    assert len(pages) == 258
    for page_number, page in enumerate(pages, 1):
        words = [(word.text, float(word.get('xMin')), float(word.get('yMin'))) for word in page if word.text]
        headers = {word: (x, y) for word, x, y in words if word in COLS}
        assert set(headers) == set(COLS), page_number
        code_x, heading_y = headers['HS6_COD']
        rows = {y: {'HS6_COD': word} for word, x, y in words if abs(x - code_x) < 8 and y > heading_y and CODE.fullmatch(word)}
        for word, x, y in words:
            if y not in rows:
                continue
            for column in COLS[1:]:
                if abs(x - (headers[column][0] - 2)) >= 5:
                    continue
                assert column not in rows[y] and DECIMAL.fullmatch(word), (page_number, column, word)
                rows[y][column] = word
        for row in rows.values():
            assert len(row['TAR_PR1']) == 2 and len(row['TAR_PR2']) == 3, row
            yield page_number, row['HS6_COD'] + row['TAR_PR1'] + row['TAR_PR2'], row


def build(pdf, output):
    counts = Counter()
    duty = []
    measures = []
    for page, code, row in rows_from_pdf(pdf):
        counts.update(row.keys())
        base = {'code': code, 'url': f'{PDF}#page={page}'}
        rates = []
        if 'IMPORT_DUTY' in row:
            rates.append({'charge': 'customs_duty', 'treatment': 'general', 'label': 'ASYCUDA import duty', 'expression': row['IMPORT_DUTY'] + '%'})
        record = {**base, 'reference': f'Saint Vincent Customs ASYCUDA PDF p. {page}, IMPORT_DUTY', 'rates': rates}
        if not rates:
            record['notes'] = ['The IMPORT_DUTY cell is blank in the published report.']
        duty.append(record)
        measure_rates = []
        for column, (charge, label, percent) in MEASURES.items():
            if column not in row:
                continue
            rate = {'charge': charge, 'treatment': 'general', 'label': label, 'expression': row[column] + '%' if percent else row[column]}
            if not percent:
                rate['condition'] = 'Published ASYCUDA figure. Verify the unit, calculation basis, legal provision, and exemptions before use.'
            measure_rates.append(rate)
        measures.append({**base, 'reference': f'Saint Vincent Customs ASYCUDA PDF p. {page}, import taxes and charges', 'rates': measure_rates})

    assert len(duty) == len({row['code'] for row in duty}) == len(measures) == 7147
    assert counts == {'HS6_COD': 7147, 'TAR_PR1': 7147, 'TAR_PR2': 7147, 'IMPORT_DUTY': 7146, 'EXCISE': 256, 'SURCHARGE': 121, 'CSC': 7147, 'VAT': 7102, 'EPA': 3574}
    by_code = {row['code']: row for row in duty}
    assert by_code['01012100000']['rates'][0]['expression'] == '0.0%'
    assert by_code['85171300000']['rates'][0]['expression'] == '20.0%'
    assert by_code['85434000000']['rates'] == []
    measure_by_code = {row['code']: row for row in measures}
    assert [r['expression'] for r in measure_by_code['22030010100']['rates']] == ['0.83', '6.0%', '16.0%']
    assert any(r['expression'] == '0.0%' and r['charge'] == 'import_vat' for r in measure_by_code['96190011000']['rates'])

    source = {
        'jurisdiction': 'VC', 'countries': ['VC'], 'zone': 'standard',
        'edition': 'Saint Vincent Customs ASYCUDA HS 2022 report, 3 January 2023 export',
        'hsEdition': 'HS2022', 'availableFrom': '2023-01-03', 'availableThrough': '2023-01-03',
        'checkedOn': '2026-11-11', 'scope': 'published_baseline',
        'authority': 'Customs and Excise Department, Saint Vincent and the Grenadines', 'sourceUrl': SOURCE,
        'terms': 'Factual codes and numeric rates from a publicly posted customs report. Official descriptions and PDF presentation are excluded.',
        'termsUrl': TERMS, 'inputFiles': [input_file(pdf, PDF)],
    }
    duty_source = {
        **source, 'id': 'vc-asycuda-duty-2023-01',
        'limitations': [
            'Historical public export dated 3 January 2023. Later amendments are not established for this snapshot.',
            'One published code has a blank duty cell. Preferential EPA rates, exemptions, and trade remedies require separate verification.',
        ],
    }
    measure_source = {
        **source, 'id': 'vc-asycuda-import-charges-2023-01', 'role': 'measures',
        'limitations': [
            'Historical public export dated 3 January 2023. Rates and conditions may have changed.',
            'The report provides bare excise and surcharge figures. The record preserves them without assuming a currency, unit, percentage or taxable basis.',
            'Blank VAT, excise, or surcharge cells do not establish an exemption. EPA preferential entries are excluded.',
        ],
    }
    write_packs(output, [(duty_source, duty), (measure_source, measures)])


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('pdf', type=Path)
    parser.add_argument('out', type=Path)
    args = parser.parse_args()
    build(args.pdf, args.out)
