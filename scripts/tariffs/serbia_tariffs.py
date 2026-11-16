#!/usr/bin/env python3
"""Build Serbia's 2026 consolidated national customs tariff."""
import argparse
from collections import defaultdict
import json
from pathlib import Path
import re

import fitz

from rebuild import EU, clean, digest, line, rate, schedule, write_pack

SOURCE_URL = 'https://www.carina.rs/en/business-community/CustomsTariff.html'
PDF_URL = ('https://www.carina.rs/upload/media/2026/7/17/70031/'
           'Regulation_on_harmonization_of_the_Customs_Tariff_nomenclature_for_the_2026_consolidated.pdf')
LEGAL_URL = ('https://reg.pravno-informacioni-sistem.rs/api/Attachment/prilozi/439304/'
             'odeljak_16_masine_aparati_i_uredjaji_elektrotehnicki_proizvodi_njihovi_delovi_aparati_za_snimanje_i_reprodukciju_zvuka.pdf')
TERMS_URL = 'https://www.zis.gov.rs/en/about-us/documents/laws-and-regulations/?cat=copyright-and-related-rights'
CODE = re.compile(r'(?:[^0-9 ]+ ?)?[0-9]{4}(?: [0-9]{2}){0,3}')
SUFFIX = re.compile(r'[0-9]{2}(?: [0-9]{2}){2}')
PERCENT = re.compile(r'[0-9]+(?:[.,][0-9]+)?')
AGREEMENT = re.compile(r'(SAA EC|CEFTA\s*\([^)]*\)|EAEU|TR|EFTA|GB|CN|AE|EG):\s*')
MEMBER = re.compile(r'([A-Z]{2}):\s*')
LATIN = str.maketrans({'А': 'A', 'М': 'M', 'Е': 'E'})
ORIGIN_GROUPS = {'SAA EC': EU, 'CEFTA': ['AL', 'BA', 'MK', 'MD', 'ME', 'XK']}


def table_cells(page, words, header):
    drawings = [tuple(entry['rect']) for entry in page.get_drawings()]
    horizontal = [(round(x0, 1), round(y0, 2), round(x1, 1), round(y1, 2))
                  for x0, y0, x1, y1 in drawings if x1 - x0 > 300 and 0 < y1 - y0 < .65]
    grouped = defaultdict(list)
    for x0, y0, x1, y1 in horizontal:
        grouped[x0, x1].append((y0, y1))
    spanning = [(len(edges), left, right) for (left, right), edges in grouped.items()
                if min(y0 for y0, _ in edges) < header < max(y1 for _, y1 in edges)]
    _, left, right = max(spanning)
    bottom = max(y1 for x0, y0, x1, y1 in drawings
                 if 0 < x1 - x0 < .65 and abs(x0 - right) < .15)
    columns = sorted({round(x0, 1) for x0, y0, x1, y1 in drawings
                      if 0 < x1 - x0 < .65 and y1 - y0 > 1 and abs(y1 - bottom) < 1
                      and left - 1 < x0 < right + 1})
    if len(columns) != 6:
        raise ValueError(f'Unexpected national tariff columns on page {page.number + 1}')
    bounds = sorted({y0 for x0, y0, x1, _ in horizontal
                     if abs(x0 - left) < 1.2 and abs(x1 - right) < 1.2 and header < y0 < bottom}
                    | {round(bottom, 2)})
    for top, end in zip(bounds, bounds[1:]):
        if end - top < 1:
            continue
        yield [clean(' '.join(word[4] for word in words if x0 + .25 <= word[0] < x1 + .25
                              and top <= (word[1] + word[3]) / 2 < end))
               for x0, x1 in zip(columns, columns[1:])]


def pdf_tariff(path):
    heading = ''
    with fitz.open(path) as document:
        for page in document:
            words = page.get_text('words', sort=True)
            headers = [word for word in words if word[4] == 'SU'
                       and any(other[4] == 'Rate' and abs(word[1] - other[1]) < .7 for other in words)]
            if not headers:
                continue
            header, = headers
            for cells in table_cells(page, words, (header[1] + header[3]) / 2):
                published_code, description, unit, base, agreements = cells
                digits = re.sub(r'[^0-9]', '', published_code)
                if CODE.fullmatch(published_code):
                    heading = digits[:4]
                    if len(digits) != 10:
                        if base:
                            raise ValueError(f'Unexpected non-national tariff code: {cells}')
                        continue
                elif SUFFIX.fullmatch(published_code) and base:
                    # These table rows print the remaining six digits below the heading.
                    digits = heading + digits
                else:
                    if base:
                        raise ValueError(f'Unexpected coded duty in the national table: {cells}')
                    continue
                yield page.number + 1, digits, description, unit, base, agreements


def preference_values(agreement, value):
    if agreement in ('EAEU', 'EFTA'):
        pieces = MEMBER.split(value)
        if pieces[0]:
            raise ValueError(f'Unexpected {agreement} group: {value}')
        for member, term in zip(pieces[1::2], pieces[2::2]):
            yield f'{agreement} {member}', [member], term.rstrip(',; ')
    else:
        label = agreement.split(' (')[0]
        yield label, ORIGIN_GROUPS.get(label, [label]), value


def percent_or_expression(value):
    if PERCENT.fullmatch(value):
        return f'{value.replace(",", ".")}%'
    if re.fullmatch(r'57,6 min 5,15\s*€ [mм]ах 7,57\s*€/\s*1000 (?:p/st|ком)', value):
        return '57.6%, minimum EUR 5.15 and maximum EUR 7.57 per 1,000 pieces'
    raise ValueError(f'Unrecognized tariff expression: {value}')


def build(raw, out):
    path = raw / 'rs-2026-consolidated.pdf'
    legal = raw / 'rs-legal-section16.pdf'
    with fitz.open(legal) as document:
        if not any(re.search(r'8507 90 80 10\s+- - - за цивилне ваздухоплове\s+-\s+1\s+ССП:',
                             page.get_text(sort=True)) for page in document):
            raise ValueError('The legal annex does not confirm the corrected civil-aircraft line')
    records = []
    for page, code, description, unit, base, agreements in pdf_tariff(path):
        notes = []
        if code == '8507908090' and description.endswith('For use in civil aircraft'):
            # The Customs English rendering duplicates the code and leaves the duty blank.
            # The consolidated legal annex gives code 8507908010 with a 1% rate.
            code, base, unit = '8507908010', '1', '-'
            notes.append('Civil aircraft code and general duty are from the Serbian legal annex, section XVI.')
        if code == '9111900000' and base == '5(33)':
            base = '5'
            notes.append('Footnote 33 specifies pieces as a supplementary unit for import into the European Union.')
        rates = [rate('general', 'Serbia national duty', percent_or_expression(base))]
        pieces = AGREEMENT.split(agreements.translate(LATIN))
        if pieces[0] or len(pieces) < 3:
            raise ValueError(f'Unexpected agreement column for {code}: {agreements}')
        for agreement, term in zip(pieces[1::2], pieces[2::2]):
            for label, origins, value in preference_values(agreement, term.strip()):
                if re.fullmatch(r'tab\. [1-7]', value):
                    notes.append(f'{label}: see import quota table {value[-1]} in the same annex.')
                    continue
                rates.append(rate('preferential', label, percent_or_expression(value), originCountries=origins,
                                  condition=f'Eligibility and origin evidence required under {label}.'))
        spaced = f'{code[:4]} {code[4:6]} {code[6:8]} {code[8:]}'
        records.append(line(code, f'Serbia 2026 tariff, p. {page}, {spaced}', rates,
                            **({'units': [unit]} if unit and unit != '-' else {}), **({'notes': notes} if notes else {})))
    if len(records) != 10475 or len({row['code'] for row in records}) != len(records):
        raise ValueError('Unexpected total or duplicate codes in the Serbia national tariff')
    metadata = schedule(
        'rs-customs-107-25-45-26', 'RS', ['RS'], '2026 consolidated, Official Gazette 107/25 and 45/26',
        '2026-05-23', 'national_schedule', 'Serbia Customs Administration and Official Gazette of the Republic of Serbia',
        SOURCE_URL, 'Adapted tariff rates from official materials excluded under Article 6 of Serbia’s Copyright and Related Rights Law.',
        TERMS_URL, [{'name': path.name, 'sha256': digest(path), 'url': PDF_URL},
                    {'name': legal.name, 'sha256': digest(legal), 'url': LEGAL_URL}], [
            'The general duty and numerical rates in the Free Trade Agreements column are extracted from the current consolidated regulation.',
            'References to import quota tables are retained as notes. Quota access and balance, origin and documentation conditions, and other applicable measures require separate checks.',
            'The CEFTA group uses XK for the origin designated UN1244 in the publication. The official Serbian legal annex corrects the English rendering of code 8507908010.',
        ],
    )
    return write_pack(out, metadata, records)


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
