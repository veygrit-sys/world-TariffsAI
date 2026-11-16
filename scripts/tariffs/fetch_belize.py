#!/usr/bin/env python3
"""Fetch the Belize Customs chapter files for the January 2023 First Schedule."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser
import json
from pathlib import Path
import re
from urllib.error import HTTPError
from urllib.parse import quote, urljoin
from urllib.request import urlopen


INDEX = 'https://www.customs.gov.bz/ttpg.html'


class ChapterLinks(HTMLParser):
    def __init__(self):
        super().__init__()
        self.link = None
        self.chapters = {}

    def handle_starttag(self, tag, attrs):
        href = dict(attrs).get('href', '')
        if tag == 'a' and href.startswith('tariffs_PDF/'):
            self.link = href

    def handle_data(self, text):
        match = re.match(r'\s*Chapter (\d+)\s*:', text, re.I)
        if self.link and match:
            number = int(match[1])
            if number in self.chapters:
                raise ValueError(f'Duplicate chapter {number}')
            self.chapters[number] = urljoin(INDEX, quote(self.link, safe='/_%'))

    def handle_endtag(self, tag):
        if tag == 'a':
            self.link = None


def download(out):
    out.mkdir(parents=True, exist_ok=True)
    with urlopen(INDEX, timeout=60) as response:
        index = response.read().decode('utf-8')
    parser = ChapterLinks()
    parser.feed(index)
    if set(parser.chapters) != set(range(1, 99)):
        raise ValueError(f'Unexpected chapters {sorted(parser.chapters)}')

    (out / 'belize-chapter-urls.json').write_text(json.dumps(parser.chapters, indent=2) + '\n')

    def fetch(chapter):
        url = parser.chapters[chapter]
        path = out / f'bz{chapter:02}.pdf'
        if path.is_file() and path.read_bytes().startswith(b'%PDF'):
            return
        try:
            with urlopen(url, timeout=60) as response:
                data = response.read()
        except HTTPError as error:
            return chapter, url, error.code
        if not data.startswith(b'%PDF'):
            raise ValueError(f'Expected a PDF for chapter {chapter}: {url}')
        path.write_bytes(data)

    with ThreadPoolExecutor(max_workers=8) as pool:
        errors = [error for error in pool.map(fetch, sorted(parser.chapters)) if error]
    if errors:
        raise ValueError(f'Could not download chapters: {errors}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('out', type=Path)
    download(parser.parse_args().out)
