#!/usr/bin/env python3
"""Save the official POLCOM data-table response for a pinned reference edition."""
import argparse
from pathlib import Path
from urllib.parse import urlencode
import urllib.request
import http.cookiejar
import json

from lxml import html

URL = 'https://polcom.mercosur.int/public/ncm/vigente'

def fetch(dest):
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    headers = {'User-Agent': 'curl/8.10.1', 'Accept': 'text/html'}
    page = opener.open(urllib.request.Request(URL, headers=headers), timeout=30).read()
    document = html.fromstring(page)
    text = ' '.join(document.text_content().split())
    assert 'al 01/11/2026' in text
    csrf, = document.xpath('//meta[@name="csrf-token"]/@content')
    headers.update({
        'X-CSRF-TOKEN': csrf,
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': URL,
        'Origin': 'https://polcom.mercosur.int',
        'Accept': 'application/json, text/html',
    })
    params = {
        'draw': 1, 'start': 0, 'length': -1, 'search[value]': '', 'search[regex]': 'false',
        'order[0][column]': 0, 'order[0][dir]': 'asc',
    }
    for column in range(4):
        params.update({
            f'columns[{column}][data]': column,
            f'columns[{column}][name]': '',
            f'columns[{column}][searchable]': 'true' if column < 2 else 'false',
            f'columns[{column}][orderable]': 'true' if column < 2 else 'false',
            f'columns[{column}][search][value]': '',
            f'columns[{column}][search][regex]': 'false',
        })
    data = []
    total = 15160
    page_size = 500
    for start in range(0, total, page_size):
        params.update({'draw': start // page_size + 1, 'start': start, 'length': page_size})
        request = urllib.request.Request(URL + '/lista', data=urlencode(params).encode(), headers=headers)
        response = json.loads(opener.open(request, timeout=30).read())
        assert response['recordsTotal'] == response['recordsFiltered'] == total
        assert len(response['data']) == min(page_size, total - start)
        data.extend(response['data'])
        print('POLCOM retrieved', len(data), flush=True)
    assert len({row['codigo'] for row in data}) == total
    dest.write_text(json.dumps({'recordsTotal': total, 'data': data}, ensure_ascii=False, separators=(',', ':')) + '\n')
    print('POLCOM rows', total, 'bytes', dest.stat().st_size)

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('dest', type=Path)
    fetch(parser.parse_args().dest)
