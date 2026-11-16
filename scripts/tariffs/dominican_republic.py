#!/usr/bin/env python3
"""Extract Dominican DGA 2022 MFN rate and ITBIS-exemption facts."""
import argparse
from pathlib import Path
import re
import subprocess
from xml.etree import ElementTree

from americas_pack import input_file, write_packs


SOURCE = 'https://vucerd.gob.do/de-inter%C3%A9s/arancel-7ma-enmienda/'
VIEWER = 'https://heyzine.com/flip-book/afb3acbd13.html'
PDF = 'https://cdnm.heyzine.com/files/uploaded/v2/afb3acbd131d1e36f30088edcc4b65f9d0d3a8f1.pdf'
TERMS = 'https://www.wipo.int/wipolex/en/text/585450'
NAMESPACE = '{http://www.w3.org/1999/xhtml}'
CODE = re.compile(r'\d{4}\.\d{2}\.\d{2}')
TABLE_MARKER = re.compile(r'\[?(?:\d{2}\.\d{2}|\d{4}\.\d{2}(?:\.\d{2})?)\]?')
DUTIES = {'0', '2', '3', '8', '14', '20', '25', '40'}

# Printed values for rows that continue across pages or have unusual cell alignment.
# PDF page numbers are 1-based. A blank cell is retained explicitly.
CELL_REVIEW = {
    '0302.35.00': (43, '20', True), '0305.52.00': (50, '20', False),
    '0806.20.00': (75, '', False), '1504.10.29': (96, '0', False),
    '1504.20.90': (96, '0', False), '1504.30.90': (96, '0', False),
    '2207.10.00': (125, '14', False), '2506.20.29': (134, '0', False),
    '3824.30.00': (233, '0', False), '3824.99.80': (234, '0', False),
    '4804.52.00': (292, '0', False), '5205.42.00': (318, '0', False),
    '5206.24.00': (319, '0', False), '7323.94.90': (441, '20', False),
    '8524.12.17': (537, '20', False), '8524.92.11': (538, '0', False),
    '8542.31.00': (547, '0', False), '8704.23.40': (562, '0', False),
    '8704.23.50': (562, '0', False),
}


def rows_from_pdf(path):
    result = subprocess.run(['pdftotext', '-bbox', str(path), '-'], check=True, capture_output=True)
    document = ElementTree.fromstring(result.stdout)
    pages = list(document.iter(NAMESPACE + 'page'))
    assert len(pages) == 633
    for page_number, page in enumerate(pages, 1):
        words = [(word.text, float(word.get('xMin')), float(word.get('yMin'))) for word in page if word.text]
        headers = {text: y for text, x, y in words if text in ('GRAV.', 'ITBIS') and 425 < x < 550}
        if set(headers) != {'GRAV.', 'ITBIS'}:
            continue
        markers = sorted((y, text) for text, x, y in words if x < 145 and y > headers['ITBIS'] and TABLE_MARKER.fullmatch(text))
        for index, (y, code) in enumerate(markers):
            if not CODE.fullmatch(code):
                continue
            if code in CELL_REVIEW:
                rate_page, duty, exempt = CELL_REVIEW[code]
                yield rate_page, code, duty, exempt
                continue
            next_y = markers[index + 1][0] if index + 1 < len(markers) else 775
            duty_values = []
            tax_values = []
            for text, x, word_y in words:
                if not (y - 0.4 <= word_y < next_y - 0.4 and text.isdecimal()):
                    continue
                if abs(x - 490) < 11:
                    duty_values.append(text)
                elif abs(x - 520) < 11:
                    tax_values.append(text)
            assert len(duty_values) == 1 and duty_values[0] in DUTIES, (page_number, code, duty_values)
            assert tax_values in ([], ['0']), (page_number, code, tax_values)
            yield page_number, code, duty_values[0], bool(tax_values)


def build(pdf, output):
    duties = []
    exemptions = []
    for page, printed, duty, exempt in rows_from_pdf(pdf):
        code = printed.replace('.', '')
        base = {'code': code, 'url': f'{PDF}#page={page}'}
        rates = []
        if duty:
            rates.append({'charge': 'customs_duty', 'treatment': 'mfn', 'label': 'Dominican statutory MFN duty (GRAV.)', 'expression': duty + '%'})
        duty_row = {**base, 'reference': f'Dominican DGA Arancel 2022 PDF p. {page}, GRAV.', 'rates': rates}
        if not rates:
            duty_row['notes'] = ['The published GRAV. cell is blank.']
        duties.append(duty_row)
        if exempt:
            exemptions.append({**base, 'reference': f'Dominican DGA Arancel 2022 PDF p. {page}, EX. ITBIS', 'rates': [{
                'charge': 'import_vat', 'treatment': 'general', 'label': 'ITBIS exemption as printed', 'expression': '0%',
                'condition': 'The 2022 tariff table marks this line as exempt. Check the governing tax provisions and product eligibility.',
            }]})
    by_code = {row['code']: row for row in duties}
    assert len(duties) == len(by_code) == 7674
    assert len(exemptions) == 720
    assert by_code['85171300']['rates'][0]['expression'] == '20%'
    assert by_code['01012100']['rates'][0]['expression'] == '0%'
    assert by_code['08062000']['rates'] == []
    assert by_code['03023500']['url'].endswith('#page=43')
    common = {
        'jurisdiction': 'DO', 'countries': ['DO'], 'zone': 'standard',
        'edition': 'Dirección General de Aduanas, Arancel de Aduanas 7ma Enmienda 2022',
        'hsEdition': 'HS2022', 'availableFrom': '2022-01-01', 'availableThrough': '2022-01-01',
        'checkedOn': '2026-11-11', 'scope': 'published_baseline',
        'authority': 'Dirección General de Aduanas, República Dominicana', 'sourceUrl': SOURCE,
        'terms': 'Factual statutory commodity codes and numerical values from the Dominican Customs 2022 edition linked by VUCERD. Descriptions and page presentation are excluded.',
        'termsUrl': TERMS, 'inputFiles': [input_file(pdf, PDF)],
    }
    duty_source = {
        **common, 'id': 'do-dga-arancel-2022-01',
        'limitations': [
            'Historical edition effective 1 January 2022. Snapshot coverage is restricted to that day; later changes are not incorporated.',
            'Includes 7,674 distinct eight-digit entries from the printed GRAV. tables. Check the official live schedule for other operational subdivisions and amendments.',
            f'The rate reflects the published MFN column only. Preferential origin, quotas, trade remedies, excise and eligibility require separate verification. Official edition viewer: {VIEWER}',
        ],
    }
    tax_source = {
        **common, 'id': 'do-dga-itbis-exemptions-2022-01', 'role': 'measures',
        'limitations': [
            'Historical exemption markers in the 2022 edition. Blank cells denote goods subject to ITBIS. The applicable reduced or standard rate must be obtained from tax law.',
            'The 2022 source references separate tax regimes. Eligibility, later reforms, and other taxes are outside this pack.',
        ],
    }
    write_packs(output, [(duty_source, duties), (tax_source, exemptions)])


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('pdf', type=Path)
    parser.add_argument('out', type=Path)
    args = parser.parse_args()
    build(args.pdf, args.out)
