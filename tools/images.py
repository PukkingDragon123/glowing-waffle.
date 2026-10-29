#!/usr/bin/env python3
"""Fetch real photographs for the posters, signs, billboards and paintings.

Every 2D picture in the game is drawn through printed(key, ...) in
src/gfx/textures.js; when assets/images/<key>.jpg exists (listed in
assets/images/manifest.json) the photo is used instead of the drawing.

Photos come only from Wikimedia Commons, and only under licences that allow
redistribution (public domain, CC0, CC BY, CC BY-SA). Each file's author,
licence and source page go into the manifest and the README credits. Pictures
from a general image search (Google Images and the like) are not used: most of
them are copyrighted.

    python3 tools/images.py                 # fetch everything missing
    python3 tools/images.py --only key,key  # just these
    python3 tools/images.py --list          # show the wanted keys

Needs network access to commons.wikimedia.org and upload.wikimedia.org,
and Pillow.
"""
import argparse, io, json, os, re, sys, urllib.parse, urllib.request
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'images')
API = 'https://commons.wikimedia.org/w/api.php'
UA = {'User-Agent': 'tomyum2540-asset-build/1.0 (game art credits kept in manifest)'}
OK_LICENSES = re.compile(r'^(public domain|pd|cc0|cc[- ]by(-sa)?([- ]\d\.\d)?)', re.I)

# key -> (Commons search, width px). Keys match printed() keys in the code:
# L.poster(k) is 'poster' + k, L.sign(k, ...) is 'sign' + k, paintings are painting_<name>.
WANTED = {
    # paintings and pictures on the walls of 1407
    'painting_flame': ('abstract painting fire flames oil', 600),
    'painting_paddy': ('Thailand rice field buffalo sunset', 900),
    'painting_family': ('Thai temple mural painting people', 600),
    # the corridor notice board and the posters on it
    'posterseen': ('missing person poster Thailand', 400),
    'signhbvote': ('Thailand election campaign poster 1990s', 500),
    'signhbbuy': ('condominium for sale sign Bangkok', 500),
    'signhbwater': ('notice board paper Thai', 400),
    'posteryant': ('sak yant yantra cloth', 400),
    'posterlotto': ('Thai government lottery ticket', 500),
    # the newspaper and the record sleeves
    'newspaper': ('Thai newspaper front page 1997', 800),
    'sleeve0': ('luk thung singer album cover', 300),
    'sleeve1': ('Thai vinyl record cover', 300),
    'sleeve2': ('Thai music cassette cover 1980s', 300),
    'sleeve3': ('mor lam khaen performance', 300),
    # the calendar photo strip
    'calendarPhoto': ('Wat Arun Bangkok', 600),
}


def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read()


def search(q):
    params = {
        'action': 'query', 'format': 'json', 'generator': 'search', 'gsrnamespace': 6, 'gsrlimit': 12,
        'gsrsearch': q + ' filetype:bitmap', 'prop': 'imageinfo', 'iiprop': 'url|extmetadata|size', 'iiurlwidth': 1200,
    }
    data = json.loads(get(API + '?' + urllib.parse.urlencode(params)))
    pages = sorted((data.get('query') or {}).get('pages', {}).values(), key=lambda p: p.get('index', 99))
    for p in pages:
        ii = (p.get('imageinfo') or [{}])[0]
        meta = ii.get('extmetadata', {})
        lic = (meta.get('LicenseShortName') or {}).get('value', '')
        if not OK_LICENSES.match(lic.strip()):
            continue
        author = re.sub(r'<[^>]+>', '', (meta.get('Artist') or {}).get('value', 'unknown')).strip()
        yield {
            'title': p['title'].replace('File:', ''),
            'url': ii.get('thumburl') or ii.get('url'),
            'page': ii.get('descriptionurl'),
            'license': lic, 'author': author or 'unknown',
        }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', default='')
    ap.add_argument('--list', action='store_true')
    a = ap.parse_args()
    if a.list:
        for k, (q, w) in WANTED.items():
            print(f'{k:16} {w:5}px  {q}')
        return
    os.makedirs(OUT, exist_ok=True)
    man_path = os.path.join(OUT, 'manifest.json')
    man = json.load(open(man_path)) if os.path.exists(man_path) else {'images': {}}
    only = set(filter(None, a.only.split(',')))
    for key, (q, width) in WANTED.items():
        if only and key not in only:
            continue
        if key in man['images'] and not only:
            continue
        try:
            hit = next(search(q), None)
        except Exception as e:
            print('search failed', key, e, file=sys.stderr)
            continue
        if not hit:
            print('no freely licensed result for', key, '-', q)
            continue
        im = Image.open(io.BytesIO(get(hit['url']))).convert('RGB')
        if im.width > width:
            im = im.resize((width, width * im.height // im.width), Image.LANCZOS)
        fn = key + '.jpg'
        im.save(os.path.join(OUT, fn), 'JPEG', quality=84, optimize=True)
        man['images'][key] = {'file': fn, 'title': hit['title'], 'author': hit['author'], 'license': hit['license'], 'source': hit['page'],
                              'credit': f"{hit['title']} by {hit['author']}, {hit['license']}, Wikimedia Commons"}
        print('ok', key, '<-', hit['title'], '|', hit['license'])
    json.dump(man, open(man_path, 'w'), indent=1, ensure_ascii=False)


if __name__ == '__main__':
    main()
