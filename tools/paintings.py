#!/usr/bin/env python3
"""Build src/world/paintings.data.js from public-domain museum paintings.

Every image is from The Metropolitan Museum of Art's Open Access programme
(CC0, isPublicDomain = true). The faces are smeared out the same way Mochi's
face is in the game: a swirl drag sampled from a heavily blurred copy, with
the original brushwork laid back over it so it still reads as paint.

    python3 tools/paintings.py [--cache DIR]

Needs Pillow and numpy. Downloads the Met's web-large JPEGs (about 600 px).
"""
import argparse, base64, io, json, os, sys, urllib.request
import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'src', 'world', 'paintings.data.js')

# faces: (cx, cy, rx, ry) as fractions of the image width/height
PAINTINGS = [
    dict(key='charpentier', met=438815, size=768,
         title='Madame Georges Charpentier and Her Children', artist='Auguste Renoir', date='1878',
         url='https://images.metmuseum.org/CRDImages/ep/web-large/DP-35674-001.jpg',
         faces=[(0.495, 0.19, 0.052, 0.072), (0.367, 0.385, 0.048, 0.064), (0.224, 0.475, 0.042, 0.058)]),
    dict(key='pitcher', met=437881, size=512,
         title='Young Woman with a Water Pitcher', artist='Johannes Vermeer', date='ca. 1662',
         url='https://images.metmuseum.org/CRDImages/ep/web-large/DP353257.jpg',
         faces=[(0.462, 0.305, 0.05, 0.062)]),
    dict(key='madamex', met=12127, size=512,
         title='Madame X (Virginie Amélie Avegno Gautreau)', artist='John Singer Sargent', date='1883–84',
         url='https://images.metmuseum.org/CRDImages/ad/web-large/DP-29006-001.jpg',
         faces=[(0.548, 0.215, 0.066, 0.05)]),
    dict(key='thinker', met=10827, size=512,
         title='The Thinker: Portrait of Louis N. Kenton', artist='Thomas Eakins', date='1900',
         url='https://images.metmuseum.org/CRDImages/ad/web-large/DT102.jpg',
         faces=[(0.49, 0.168, 0.085, 0.047)]),
    dict(key='aristotle', met=437394, size=512,
         title='Aristotle with a Bust of Homer', artist='Rembrandt van Rijn', date='1653',
         url='https://images.metmuseum.org/CRDImages/ep/web-large/DP-30758-001.jpg',
         faces=[(0.535, 0.35, 0.062, 0.075), (0.165, 0.55, 0.055, 0.07)], lift=0.72),
]


def fetch(url, cache):
    name = os.path.join(cache, url.rsplit('/', 1)[1]) if cache else None
    if name and os.path.exists(name):
        return open(name, 'rb').read()
    req = urllib.request.Request(url, headers={'User-Agent': 'bengrim-asset-build/1.0'})
    data = urllib.request.urlopen(req, timeout=60).read()
    if name:
        os.makedirs(cache, exist_ok=True)
        open(name, 'wb').write(data)
    return data


def bilinear(img, x, y):
    h, w = img.shape[:2]
    x = np.clip(x, 0, w - 1.001); y = np.clip(y, 0, h - 1.001)
    x0 = np.floor(x).astype(int); y0 = np.floor(y).astype(int)
    fx = (x - x0)[..., None]; fy = (y - y0)[..., None]
    a = img[y0, x0]; b = img[y0, x0 + 1]; c = img[y0 + 1, x0]; d = img[y0 + 1, x0 + 1]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def smear_faces(im, faces, seed):
    w, h = im.size
    src = np.asarray(im, dtype=np.float32)
    out = src.copy()
    rng = np.random.default_rng(seed)
    for (cx, cy, rx, ry) in faces:
        cx *= w; cy *= h; rx *= w; ry *= h
        r = max(rx, ry)
        soft = np.asarray(im.filter(ImageFilter.GaussianBlur(r * 0.55)), dtype=np.float32)
        detail = src - np.asarray(im.filter(ImageFilter.GaussianBlur(1.6)), dtype=np.float32)
        x0, x1 = int(max(0, cx - rx * 1.8)), int(min(w, cx + rx * 1.8))
        y0, y1 = int(max(0, cy - ry * 1.8)), int(min(h, cy + ry * 2.4))
        yy, xx = np.mgrid[y0:y1, x0:x1].astype(np.float32)
        dx = (xx - cx) / rx; dy = (yy - cy) / ry
        d = np.sqrt(dx * dx + dy * dy)
        fall = np.clip(1.0 - d / 1.35, 0, 1) ** 2
        # swirl around the centre plus a downward drag, like wet paint wiped by a thumb
        ang = fall * (3.6 + rng.uniform(-0.5, 0.5))
        ca, sa = np.cos(ang), np.sin(ang)
        sx = cx + ((xx - cx) * ca - (yy - cy) * sa)
        sy = cy + ((xx - cx) * sa + (yy - cy) * ca) - fall * ry * 0.8
        # streaks: the drag wobbles along x so it reads as smeared, not blurred
        sx += np.sin(yy / max(2.0, ry * 0.18) + rng.uniform(0, 6)) * fall * rx * 0.12
        smeared = bilinear(soft, sx, sy)
        # put brush texture back over the smear, dragged twice as far so no feature survives
        smeared += bilinear(detail, xx + (sx - xx) * 1.8, yy + (sy - yy) * 1.8) * 0.6
        # a soft tail of smear running down below the chin
        tail = np.clip(1.0 - np.abs(dx) / 1.1, 0, 1) * np.clip((dy - 0.6) / 1.2, 0, 1) * np.clip(1.0 - (dy - 0.6) / 1.6, 0, 1)
        m = np.clip((1.3 - d) / 0.55, 0, 1)
        m = m * m * (3 - 2 * m)
        m = np.maximum(m, tail * 0.55)[..., None]
        out[y0:y1, x0:x1] = out[y0:y1, x0:x1] * (1 - m) + smeared * m
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--cache', default=None, help='keep downloaded originals here')
    ap.add_argument('--preview', default=None, help='also write processed JPEGs to this folder')
    a = ap.parse_args()
    entries = []
    for i, p in enumerate(PAINTINGS):
        im = Image.open(io.BytesIO(fetch(p['url'], a.cache))).convert('RGB')
        if p.get('lift'):
            # the photograph is darker than the canvas reads in a lit room
            im = im.point(lambda v, g=p['lift']: round(255 * (v / 255) ** g))
        im = smear_faces(im, p['faces'], 11 + i)
        s = p['size'] / max(im.size)
        if s < 1:
            im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
        buf = io.BytesIO(); im.save(buf, 'JPEG', quality=84, optimize=True, progressive=False)
        if a.preview:
            os.makedirs(a.preview, exist_ok=True)
            open(os.path.join(a.preview, p['key'] + '.jpg'), 'wb').write(buf.getvalue())
        entries.append(dict(key=p['key'], title=p['title'], artist=p['artist'], date=p['date'],
                            credit='The Metropolitan Museum of Art, Open Access (CC0), object %d' % p['met'],
                            w=im.width, h=im.height,
                            src='data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode()))
        print('%-12s %dx%d %5.0f KB' % (p['key'], im.width, im.height, len(buf.getvalue()) / 1024))
    with open(OUT, 'w') as f:
        f.write('// Generated by tools/paintings.py - do not edit by hand.\n')
        f.write('// Public-domain paintings from The Met Open Access (CC0), faces smeared.\n')
        f.write('export const PAINTINGS = {\n')
        for e in entries:
            src = e.pop('src')
            meta = json.dumps(e, ensure_ascii=False)[1:-1]
            f.write('  %s: { %s,\n    src: \'%s\' },\n' % (e['key'], meta, src))
        f.write('};\n')
    print('wrote', os.path.relpath(OUT, ROOT), '%.0f KB' % (os.path.getsize(OUT) / 1024))


if __name__ == '__main__':
    sys.exit(main())
