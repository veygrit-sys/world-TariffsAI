#!/usr/bin/env python3
"""Normalize Ecuador COMEX 002-2023 numeric duty schedule with 011-2023 changes."""
import argparse
from pathlib import Path
import re
import subprocess
from xml.etree import ElementTree

from americas_pack import input_file, write_packs


SOURCE = 'https://www.aduana.gob.ec/gaceta-boletin/entrada-en-vigor-resolucion-comex-nro-002-2023--arancel-del-ecuador/'
BASE_PDF = 'https://www.produccion.gob.ec/wp-content/uploads/2023/03/Resolucio%CC%81n-002-2023.pdf'
AMENDMENT_PDF = 'https://www.aduana.gob.ec/gacnorm/data/2023/08/30/19/2.__Resoluci%C3%B3n_011-2023.pdf'
TERMS = 'https://www.derechosintelectuales.gob.ec/wp-content/uploads/downloads/2021/agosto/a_2_16_codigo_ingenios_agosto_2021.pdf'
NAMESPACE = '{http://www.w3.org/1999/xhtml}'
CODE = re.compile(r'\d{4}(?:\.\d{2}){3}')
MARKER = re.compile(r'\[?(?:\d{2}\.\d{2}|\d{4}\.\d{2}(?:\.\d{2}){0,2})\]?')
NUMBER = r'\d+(?:[.,]\d+)?'
AD_VALOREM = re.compile(fr'({NUMBER})(\(\*\))?')
COMPOUND = re.compile(fr'({NUMBER})\s*%?\s*\+\s*(USD\s*|US\$)({NUMBER})\s*(.+)', re.I)
SPECIFIC = re.compile(fr'USD\s+{NUMBER}(?: por kg neto)?', re.I)
ALCOHOL = '1% + USD 0.25 G.A.L. (Grado alcoholico por litro)'

# The source wraps long cells, with the code vertically centered. These
# entries carry boundary text from another cell or omit part of their own cell.
CELL_REVIEW = {
    '2202.99.00.90': ('30 1% + USD 0.25', '30'),
    '2203.00.00.00': ('G.A.L. (Grado alcoholico por litro)', ALCOHOL),
    '2205.90.00.00': ('litro) 30', '30'),
    '2208.20.22.00': ('litro) 20', '20'),
    '2208.70.10.00': ('G.A.L. (Grado alcoholico por litro)', ALCOHOL),
    '9504.30.10.10': ('30 sin', '30'),
}


def pages_from_pdf(path):
    result = subprocess.run(['pdftotext', '-bbox', str(path), '-'], check=True, capture_output=True)
    document = ElementTree.fromstring(result.stdout)
    return list(document.iter(NAMESPACE + 'page'))


def source_rows(path):
    pages = pages_from_pdf(path)
    assert len(pages) == 424
    for page_number, page in enumerate(pages, 1):
        if page_number < 15:
            continue
        words = [(word.text, float(word.get('xMin')), float(word.get('xMax')), float(word.get('yMin'))) for word in page if word.text]
        markers = sorted((y, text) for text, x, _, y in words if 52 < x < 80 and MARKER.fullmatch(text))
        for index, (y, code) in enumerate(markers):
            if not CODE.fullmatch(code):
                continue
            # COMEX 011-2023 deletes Chapter 51's duplicate silk entries.
            if page_number == 208 and code.startswith(('5001.', '5002.', '5003.')):
                continue
            lower = max((y + markers[index - 1][0]) / 2 + 0.1, y - 14.7) if index else y - 14.7
            upper = min((y + markers[index + 1][0]) / 2 - 0.1, y + 14.7) if index + 1 < len(markers) else y + 14.7
            tokens = sorted((round(wy, 1), x, text) for text, x, end, wy in words if lower <= wy <= upper and 323 < x < 390 and end < 401)
            expression = ' '.join(text for _, _, text in tokens)
            if code in CELL_REVIEW:
                parsed, reviewed = CELL_REVIEW[code]
                assert expression == parsed, (code, expression)
                expression = reviewed
            if expression == '1% + USD 0.25 G.A.L. (Grado alcoholico por':
                expression = ALCOHOL
            observations = any(lower <= wy <= upper and x >= 396 for _, x, _, wy in words)
            yield code, page_number, expression, observations


def normalize(expression):
    numeric = AD_VALOREM.fullmatch(expression)
    if numeric:
        return numeric[1].replace(',', '.') + '%', bool(numeric[2])
    mixed = COMPOUND.fullmatch(expression)
    if mixed:
        return f'{mixed[1]}% + USD {mixed[3]} {mixed[4]}', True
    assert SPECIFIC.fullmatch(expression), expression
    return expression, True


def build(base, amendment, output):
    amendment_text = subprocess.run(['pdftotext', '-layout', str(amendment), '-'], check=True, capture_output=True, text=True).stdout
    assert '01 de septiembre de 2023' in amendment_text and 'COMEX' in amendment_text
    assert re.search(r'87\s*11\.60\.00\.00\s+u\s+0\b', amendment_text)
    assert re.search(r'401\s*5\.19\.90\.00[^\n]+?2u\s+0\b', amendment_text)
    rows = {}
    for code, page, expression, observations in source_rows(base):
        assert code not in rows, (page, code)
        rows[code] = (BASE_PDF, page, expression, observations)
    assert len(rows) == 8599
    assert rows['8711.60.00.00'][2] == '30'
    assert rows.pop('4015.19.90.10')[2] == rows.pop('4015.19.90.90')[2] == '0'
    rows['4015.19.90.00'] = (AMENDMENT_PDF, 8, '0', True)
    rows['8711.60.00.00'] = (AMENDMENT_PDF, 15, '0', False)
    for code, page, value, has_note in [
        ('0306.99.00.00', 5, '30', False), ('1001.19.00.00', 5, '0', True),
        ('2304.00.00.00', 6, '0', True), ('6907.30.00.10', 9, '25', False),
        ('6907.30.00.90', 9, '5 + USD 0.14/Kg', True), ('6907.40.00.10', 10, '25', False),
        ('6907.40.00.90', 10, '5 + USD 0.14/Kg', True), ('7019.90.00.10', 10, '10', False),
        ('7019.90.00.90', 11, '0', False), ('8422.11.00.00', 11, '15', False),
        ('8506.80.90.00', 14, '25', False), ('8507.60.00.10', 14, '25', True),
    ]:
        assert normalize(rows[code][2])[0] == normalize(value)[0], code
        rows[code] = (AMENDMENT_PDF, page, value, has_note)

    records = []
    for printed, (pdf, page, raw_rate, observations) in rows.items():
        code = printed.replace('.', '')
        expression, marker = normalize(raw_rate)
        treatment = 'other' if code.startswith('98') else 'general'
        rate = {'charge': 'customs_duty', 'treatment': treatment, 'label': 'COMEX published applied duty', 'expression': expression}
        if code.startswith('98'):
            rate['condition'] = 'Chapter 98 special customs treatment. Confirm eligibility and the calculation rules in the cited text.'
        elif observations or marker:
            rate['condition'] = 'Check the cited schedule for observations, eligibility, special rates, and the calculation basis.'
        if code == '8507600010':
            rate['condition'] = 'The amended observation specifies a 0% exception for electric accumulators for electric vehicles. Verify the classification and conditions.'
        source = '002-2023' if pdf == BASE_PDF else '011-2023'
        records.append({'code': code, 'reference': f'COMEX {source} Annex I, PDF p. {page}, Arancel aplicado', 'rates': [rate], 'url': f'{pdf}#page={page}'})
    assert len(records) == 8598
    by_code = {row['code']: row['rates'][0]['expression'] for row in records}
    assert by_code['0101210000'] == '15%'
    assert by_code['2203000000'].startswith('1% + USD 0.25')
    assert by_code['6101200000'] == '10% + USD 5.5 por kg.'
    assert by_code['4015199000'] == by_code['8711600000'] == '0%'
    assert by_code['5001000000'] == '0%' and '4015199010' not in by_code and '4015199090' not in by_code
    metadata = {
        'id': 'ec-comex-002-011-2023-09', 'jurisdiction': 'EC', 'countries': ['EC'], 'zone': 'standard',
        'edition': 'Ecuador COMEX 002-2023 Annex I as amended by 011-2023 upon entry into force',
        'hsEdition': 'HS2022', 'availableFrom': '2023-09-01', 'availableThrough': '2023-09-01',
        'checkedOn': '2026-11-11', 'scope': 'published_baseline',
        'authority': 'Comité de Comercio Exterior and Servicio Nacional de Aduana del Ecuador',
        'sourceUrl': SOURCE, 'terms': 'Numerical tariff facts from official COMEX resolutions. Ecuador Código Orgánico de la Economía Social de los Conocimientos article 107 excludes legislative and other official texts from copyright protection.',
        'termsUrl': TERMS, 'inputFiles': [input_file(base, BASE_PDF), input_file(amendment, AMENDMENT_PDF)],
        'limitations': [
            'Coverage is limited to the tariff effective on 1 September 2023, with the same-day COMEX 011-2023 changes. Subsequent resolutions require separate verification.',
            'This pack captures the Arancel aplicado column. Product descriptions, separate observations and eligibility conditions, SAFP price bands, preferences, VAT, FODINFA, excise and other measures are not encoded.',
            'Specific and combined duties preserve the published monetary amount and unit. See the cited legal source before applying them.',
        ],
    }
    write_packs(output, [(metadata, records)])


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('base_pdf', type=Path)
    parser.add_argument('amendment_pdf', type=Path)
    parser.add_argument('out', type=Path)
    args = parser.parse_args()
    build(args.base_pdf, args.amendment_pdf, args.out)
