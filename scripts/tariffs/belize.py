#!/usr/bin/env python3
"""Extract Belize First Schedule statutory MFN rate facts from chapter PDFs."""
import argparse
import json
from pathlib import Path
import re
import subprocess
from xml.etree import ElementTree

from americas_pack import input_file, write_packs
from fetch_belize import INDEX


NAMESPACE = '{http://www.w3.org/1999/xhtml}'
CODE = re.compile(r'\d{4}\.\d{2}\.\d{2}')
RATE = re.compile(r'\d+(?:\.\d+)?\s*%|\$\s*\d+(?:\.\d+)?\s*/\s*(?:\d+\s*lb|lb|Imp\.?\s*gal)', re.I)


def chapter_rows(path, chapter):
    result = subprocess.run(['pdftotext', '-bbox', str(path), '-'], check=True, capture_output=True)
    document = ElementTree.fromstring(result.stdout)
    for page_number, page in enumerate(document.iter(NAMESPACE + 'page'), 1):
        words = [(word.text, float(word.get('xMin')), float(word.get('xMax')), float(word.get('yMin'))) for word in page if word.text]
        header_y = next((y for text, x, _, y in words if text == 'HEADING' and x < 150), None)
        if header_y is None:
            continue
        headers = {text: (x + end) / 2 for text, x, end, y in words if text in ('MFN', 'CARICOM') and x > 450 and abs(y - header_y) < 15}
        assert set(headers) == {'MFN', 'CARICOM'}, (chapter, page_number)
        rows = sorted((y, text) for text, x, _, y in words if x < 135 and y > header_y and CODE.fullmatch(text))
        mfn = headers['MFN']
        boundary = (mfn + headers['CARICOM']) / 2
        for index, (y, tariff_code) in enumerate(rows):
            suffixes = [text for text, x, _, wy in words if 115 < x < 195 and abs(y - wy) < 0.8 and re.fullmatch(r'\d{2}', text)]
            assert len(suffixes) == 1, (chapter, page_number, tariff_code, suffixes)
            code = tariff_code.replace('.', '') + suffixes[0]
            assert code.startswith(f'{chapter:02}'), (chapter, code)
            next_y = rows[index + 1][0] if index + 1 < len(rows) else 1000
            candidates = sorted((x, text) for text, x, end, wy in words if mfn - 34 < (x + end) / 2 < boundary and y - 1 < wy < min(y + 15, next_y - 1))
            expressions = RATE.findall(' '.join(text for _, text in candidates))
            assert len(expressions) <= 1, (chapter, page_number, code, expressions)
            expression = expressions[0].replace(' ', '') if expressions else ''
            # Chapter 4 p. 4 overlays a PDF form index between the printed 5 and %.
            if code == '0404900000':
                assert page_number == 4 and not expression
                expression = '5%'
            yield page_number, code, expression


def build(raw, output):
    inputs = []
    lines = []
    urls = json.loads((raw / 'belize-chapter-urls.json').read_text())
    assert set(urls) == {str(chapter) for chapter in range(1, 99)}
    for chapter in range(1, 99):
        pdf = raw / f'bz{chapter:02}.pdf'
        url = urls[str(chapter)]
        inputs.append(input_file(pdf, url))
        for page, code, expression in chapter_rows(pdf, chapter):
            rates = []
            if expression:
                rate = {'charge': 'customs_duty', 'treatment': 'mfn', 'label': 'Belize statutory MFN rate', 'expression': expression}
                if expression.startswith('$'):
                    rate['condition'] = 'Specific duty in the official MFN column. Confirm the printed currency and unit in the First Schedule.'
                if chapter == 98:
                    rate['treatment'] = 'other'
                    rate['condition'] = 'Chapter 98 special treatment. Verify eligibility in the First Schedule.'
                rates.append(rate)
            row = {'code': code, 'reference': f'Belize First Schedule, chapter {chapter}, PDF p. {page}, MFN', 'rates': rates, 'url': f'{url}#page={page}'}
            if not rates:
                row['notes'] = ['The published MFN cell is blank.']
            lines.append(row)
    by_code = {row['code']: row for row in lines}
    assert len(lines) == len(by_code) == 7000
    assert by_code['0101291000']['rates'][0]['expression'] == '45%'
    assert by_code['0701900000']['rates'][0]['expression'] == '$0.42/100lb'
    assert by_code['2204100000']['rates'][0]['expression'] == '$51/Imp.gal'
    assert by_code['8702102910']['rates'][0]['expression'] == '10%'
    assert by_code['0404900000']['rates'][0]['expression'] == '5%'
    assert by_code['8902004000']['rates'] == []
    assert sum(bool(row['rates']) for row in lines) == 6999
    source = {
        'id': 'bz-customs-first-schedule-2023-01',
        'jurisdiction': 'BZ', 'countries': ['BZ'], 'zone': 'standard',
        'edition': 'Belize Customs and Excise Duties Act First Schedule, Act 1 of 2023 as enacted',
        'hsEdition': 'HS2022', 'availableFrom': '2023-01-01', 'availableThrough': '2023-01-01',
        'checkedOn': '2026-11-11', 'scope': 'published_baseline',
        'authority': 'Belize Customs and Excise Department', 'sourceUrl': INDEX,
        'terms': 'Factual tariff codes and rate values from Belize statutory First Schedule under Act No. 1 of 2023. Descriptions and presentation are excluded.',
        'termsUrl': 'https://www.nationalassembly.gov.bz/wp-content/uploads/2023/01/Act-No.-1-of-2023-Customs-and-Excise-Amendment.pdf',
        'inputFiles': inputs,
        'limitations': [
            'First Schedule as introduced on 1 January 2023. The snapshot is restricted to that effective day because later statutory orders can change the tariff.',
            'MFN column only. Check applicable preferential treatment, conditions, trade remedies, environmental taxes and import GST separately.',
            'The reserved chapter 77 has no commodity lines. Chapter 98 is special treatment.',
        ],
    }
    write_packs(output, [(source, lines)])


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('raw', type=Path)
    parser.add_argument('out', type=Path)
    args = parser.parse_args()
    build(args.raw, args.out)
