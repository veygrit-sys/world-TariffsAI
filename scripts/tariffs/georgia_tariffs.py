#!/usr/bin/env python3
"""Build a reference of covered Georgia Tax Code Article 197 import rates."""
import argparse
import json
from pathlib import Path
import re

from lxml import html

from rebuild import clean, digest, line, rate, schedule, write_pack

LAW_URL = 'https://matsne.gov.ge/ka/document/view/1043717?publication=248'
LAW_MIRROR_URL = 'https://tax.eaudit.ge/197'
LOOKUP_ENDPOINT = 'https://www.rs.ge/RsGe.Module/CommodityCodes/SearchCommodityCodes'
TERMS_URL = 'https://wipolex-res.wipo.int/edocs/lexdocs/laws/en/ge/ge023en.pdf'
HEADINGS = ('0105', '2204', '8703')


def specific_expression(value):
    number, unit = re.fullmatch(r'([0-9]+(?:[.,][0-9]+)?)euro/(lit|%vol/HL)', value).groups()
    amount = number.replace(',', '.')
    basis = 'litre' if unit == 'lit' else 'hectolitre per percentage point of alcohol by volume'
    return f'EUR {amount} per {basis}'


def article_codes(path):
    root = html.fromstring(path.read_text())
    tables = root.xpath('//table')
    if len(tables) != 3 or not re.search(r'"dateModified":"2026-10-28"', path.read_text()):
        raise ValueError('Expected the three tables in Georgia Tax Code Article 197, October 2026 consolidation')
    results = {}
    for paragraph, (table, count) in enumerate(zip(tables, (176, 37, 17)), 1):
        rows = table.xpath('.//tr')[1:]
        if len(rows) != count:
            raise ValueError(f'Unexpected Article 197({paragraph}) row count')
        for row in rows:
            index, published_code, _, *explicit_rate = [clean(cell.text_content()) for cell in row.xpath('./td|./th')]
            code = published_code.replace(' ', '')
            if not re.fullmatch(r'\d{2}|\d{4}|\d{6}|\d{8}|\d{11}', code) or code in results:
                raise ValueError(f'Unexpected statutory tariff code: {published_code}')
            expression = f'{12 if paragraph == 1 else 5}%' if not explicit_rate else specific_expression(explicit_rate[0])
            results[code] = (paragraph, index, expression)
    return results


def code_rows(path, heading):
    response = json.loads(path.read_text())
    if response['Status'] != 0 or not response['Tree']:
        raise ValueError(f'Georgia Revenue Service did not return codes for {heading}')
    for row in response['Tree']:
        code = row['CODE'].replace(' ', '')
        if len(code) == 11 and code.startswith(heading) and code.isascii() and code.isdecimal():
            if heading == '8703' and not any('Rate applies only to motor car' in item['PERMIT_NAME']
                                               for item in row.get('IMPORT_TAX_RATE', [])):
                continue
            yield code


def build(raw, out):
    article = raw / 'ge-article-197-current.html'
    statutory = article_codes(article)
    rows = {}
    for code, (paragraph, index, expression) in statutory.items():
        if len(code) < 6:
            continue
        rows[code] = line(code, f'Tax Code Article 197({paragraph}), item {index}', [
            rate('general', 'Georgia statutory import duty', expression),
        ], url=LAW_URL)
    for heading in HEADINGS:
        path = raw / f'ge-{heading}.json'
        for code in code_rows(path, heading):
            if code in rows:
                continue
            matches = [prefix for prefix in statutory if code.startswith(prefix)]
            if heading == '8703':
                rows[code] = line(code, 'Tax Code Article 197(6), motor cars in heading 8703', [
                    rate('general', 'Georgia motor car import duty',
                         'GEL 0.05 per cm³ of engine displacement, plus 5% of that amount per year of operation',
                         sourceCode=heading, condition='Motor car under heading 8703 entering the import procedure.'),
                ], url=LAW_URL)
            elif matches:
                prefix = max(matches, key=len)
                paragraph, index, expression = statutory[prefix]
                rows[code] = line(code, f'Tax Code Article 197({paragraph}), item {index}, published code {prefix}', [
                    rate('general', 'Georgia statutory import duty', expression, sourceCode=prefix),
                ], url=LAW_URL)
    inputs = [{'name': article.name, 'sha256': digest(article), 'url': LAW_MIRROR_URL}]
    for heading in HEADINGS:
        path = raw / f'ge-{heading}.json'
        inputs.append({'name': path.name, 'sha256': digest(path), 'url': LOOKUP_ENDPOINT})
    metadata = schedule(
        'ge-tax-code-art197-2026-10', 'GE', ['GE'], 'Tax Code Article 197, October 2026 consolidation',
        '2026-10-28', 'published_baseline', 'Legislative Herald of Georgia and Georgia Revenue Service', LAW_URL,
        'Adapted rates from statutory text, with official commodity nomenclature codes. Georgia Copyright Law Article 8.',
        TERMS_URL, inputs, [
            'Selected published statutory codes and selected national descendants from the Georgia Revenue Service nomenclature lookup. Broad headings and chapters are not fully expanded.',
            'The Revenue Service query supplies the selected national code mappings. Duty values are from the October 2026 statutory consolidation.',
            'A missing code has no rate in this reference. Check the Tax Code for shorter chapter/heading codes, exemptions, temporary admission, VAT, excise and preferential origin treatment.',
        ],
    )
    return write_pack(out, metadata, list(rows.values()))


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
