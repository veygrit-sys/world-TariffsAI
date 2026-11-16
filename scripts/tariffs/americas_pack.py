"""Write a tariff snapshot pack and a single-directory catalog manifest."""
import gzip
from hashlib import sha256
import json


def input_file(path, url):
    return {'name': path.name, 'url': url, 'sha256': sha256(path.read_bytes()).hexdigest()}


def write_packs(output, snapshots):
    output.mkdir(parents=True, exist_ok=True)
    manifest = []
    for source, lines in snapshots:
        lines.sort(key=lambda line: line['code'])
        pack = output / f"{source['id']}.json.gz"
        data = json.dumps({'id': source['id'], 'lines': lines}, ensure_ascii=False, separators=(',', ':')).encode()
        pack.write_bytes(gzip.compress(data, compresslevel=9, mtime=0))
        rates = [rate for line in lines for rate in line['rates']]
        manifest.append({
            **source,
            'file': pack.name,
            'sha256': sha256(pack.read_bytes()).hexdigest(),
            'statistics': {
                'lines': len(lines),
                'uniqueCodes': len({line['code'] for line in lines}),
                'codesWithRates': len({line['code'] for line in lines if line['rates']}),
                'rates': len(rates),
                'chapters': sorted({line['code'][:2] for line in lines}),
                'charges': sorted({rate['charge'] for rate in rates}),
            },
        })
        print(source['id'], len(lines), len(rates))
    (output / 'manifest.json').write_text(json.dumps({'version': 1, 'snapshots': manifest}, ensure_ascii=False, indent=2) + '\n')
