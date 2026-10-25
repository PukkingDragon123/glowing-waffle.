#!/usr/bin/env python3
"""Fetch and optimise the CC0 models and surface textures into assets/.

Everything comes from Poly Haven (polyhaven.com, CC0). Models are downloaded
as 1k glTF, their textures resized and re-encoded with Pillow, then packed into
a welded, simplified, quantised .glb by tools/glb.mjs (gltf-transform).
Diffuse maps are painted with a Kuwahara filter (the game's look is a hand-painted
cartoon); normals are softened; roughness and metal maps are dropped since
nothing in the game is shiny.

    npm i --no-save @gltf-transform/core@4 @gltf-transform/extensions@4 @gltf-transform/functions@4 meshoptimizer@0.22
    python3 tools/assets.py [--cache DIR] [--only name,name]

Writes assets/models/*.glb, assets/tex/*.jpg and assets/manifest.json.
"""
import argparse, io, json, os, shutil, subprocess, sys, urllib.request
import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets')
API = 'https://api.polyhaven.com'
UA = {'User-Agent': 'bengrim-asset-build/1.0'}

# name: (poly haven id, texture size, max triangles)
MODELS = {
    # living room
    'sofa': ('sofa_03', 1024, 9000),
    'armchair': ('ArmChair_01', 1024, 7000),
    'tv': ('Television_01', 1024, 4000),
    'tvStand': ('ClassicNightstand_01', 512, 4000),
    'bookshelf': ('wooden_bookshelf_worn', 1024, 8000),
    'fan': ('ceiling_fan', 512, 8000),
    'boombox': ('boombox', 512, 6000),
    'wallClock': ('wall_clock', 512, 4000),
    'plant': ('potted_plant_04', 512, 6000),
    'plantBig': ('potted_plant_02', 512, 14000),
    'pillows': ('throw_pillows_01', 512, 6000),
    'sideTable': ('side_table_tall_01', 512, 6000),
    # kitchen
    'stove': ('electric_stove', 1024, 10000),
    'microwave': ('vintage_microwave', 512, 6000),
    'kettle': ('vintage_electric_kettle', 512, 6000),
    'trashCan': ('metal_trash_can', 512, 6000),
    'table': ('round_wooden_table_01', 512, 6000),
    'chair': ('painted_wooden_chair_01', 512, 2000),
    'jug': ('jug_01', 256, 4000),
    'pot': ('pot_enamel_01', 512, 6000),
    'bowl': ('wooden_bowl_01', 256, 4000),
    'bottles': ('wine_bottles_01', 512, 8000),
    'cleaner': ('all_purpose_cleaner', 256, 3000),
    'bleach': ('bleach_bottle', 256, 3000),
    # bedroom and desk
    'bed': ('old_bed_frame', 512, 14000),
    'commode': ('GothicCommode_01', 1024, 4000),
    'alarmClock': ('alarm_clock_01', 512, 6000),
    'suitcase': ('vintage_suitcase', 512, 8000),
    'photoFrame': ('standing_picture_frame_01', 256, 2000),
    'deskLamp': ('desk_lamp_arm_01', 512, 9000),
    'nightstand': ('side_table_01', 512, 3000),
    'desk': ('metal_office_desk', 1024, 7000),
    # closet and building
    'box': ('cardboard_box_01', 512, 4000),
    'basket': ('wicker_basket_01', 512, 8000),
    'dustpan': ('dustpan', 256, 3000),
    'shelves': ('steel_frame_shelves_01', 512, 4400),
    'socket': ('pull_chain_light_socket', 256, 4000),
    'fireAlarm': ('fire_alarm', 256, 2800),
    'fluoro': ('mounted_fluorescent_lights', 256, 6000),
    'camera': ('security_camera_01', 256, 6000),
    'wheelchair': ('wheelchair_01', 512, 12000),
    'wallLamp': ('industrial_wall_lamp', 256, 4500),
}

# name: (poly haven id, diffuse size, normal/rough size)
TEXTURES = {
    'woodFloor': ('wood_floor_worn', 1024, 512),
    'plaster': ('painted_plaster_wall', 1024, 512),
    'plasterBeige': ('beige_wall_002', 1024, 512),
    'plasterWorn': ('worn_plaster_wall', 1024, 512),
    'plasterPeel': ('peeling_painted_wall', 1024, 512),
    'wallpaper': ('decrepit_wallpaper', 1024, 512),
    'linoleum': ('old_linoleum_flooring_01', 1024, 512),
    'subway': ('long_white_tiles', 1024, 512),
    'mosaic': ('marble_mosaic_tiles', 1024, 512),
    'carpet': ('dirty_carpet', 1024, 512),
    'concrete': ('concrete_floor_worn_001', 1024, 512),
    'paintedConcrete': ('painted_concrete', 1024, 512),
    'cabinetWood': ('wood_cabinet_worn_long', 1024, 512),
    'paintedPlanks': ('distressed_painted_planks', 1024, 512),
    'brick': ('brick_wall_006', 1024, 512),
    'linen': ('rough_linen', 512, 512),
}


def get(url, cache=None):
    if cache:
        f = os.path.join(cache, url.split('://', 1)[1].replace('/', '_'))
        if os.path.exists(f):
            return open(f, 'rb').read()
    data = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120).read()
    if cache:
        os.makedirs(cache, exist_ok=True)
        open(f, 'wb').write(data)
    return data


def box(a, r):
    # mean over a (2r+1) square via an integral image, edge-clamped
    p = np.pad(a, ((r + 1, r), (r + 1, r), (0, 0)), mode='edge').cumsum(0).cumsum(1)
    n = 2 * r + 1
    return (p[n:, n:] - p[:-n, n:] - p[n:, :-n] + p[:-n, :-n]) / (n * n)


def paintify(im, r=3):
    # generalised Kuwahara, the same filter the game runs in post, so
    # photographed surfaces turn into flat brush patches with kept edges
    a = np.asarray(im.convert('RGB'), dtype=np.float32) / 255.0
    m = box(a, r // 2 + 1)
    v = box(a * a, r // 2 + 1) - m * m
    o = r // 2 + 1
    acc = np.zeros_like(a); wsum = np.zeros(a.shape[:2] + (1,), np.float32)
    h, w = a.shape[:2]
    for dy in (-o, o):
        for dx in (-o, o):
            mm = np.roll(m, (dy, dx), (0, 1)); vv = np.roll(v, (dy, dx), (0, 1)).sum(2, keepdims=True)
            wt = 1.0 / (1.0 + 400.0 * np.abs(vv)) ** 4
            acc += mm * wt; wsum += wt
    out = acc / wsum
    # a touch more colour, the way a painter pushes it
    g = out.mean(2, keepdims=True)
    out = np.clip(g + (out - g) * 1.12, 0, 1)
    return Image.fromarray((out * 255 + 0.5).astype(np.uint8))


def jpeg(data, size, quality, normal=False, png=False, paint=False):
    im = Image.open(io.BytesIO(data))
    im = im.convert('RGBA' if png else 'RGB')
    if max(im.size) > size:
        im = im.resize((size, size * im.height // im.width), Image.LANCZOS)
    if paint and not png:
        im = paintify(im, 3 if size >= 1024 else 2)
    if normal:
        # softer normals: fine photographic bumps only add noise to painted light
        im = im.filter(ImageFilter.GaussianBlur(1.2))
    buf = io.BytesIO()
    if png:
        # alpha cut-outs (leaves) stay PNG
        im.save(buf, 'PNG', optimize=True)
    else:
        im.save(buf, 'JPEG', quality=quality, optimize=True, subsampling=0 if normal else 2)
    return buf.getvalue()


def info(pid, cache):
    return json.loads(get('%s/info/%s' % (API, pid), cache))


def build_model(name, pid, size, tris, cache, work):
    files = json.loads(get('%s/files/%s' % (API, pid), cache))
    g = files['gltf']['1k']['gltf']
    d = os.path.join(work, name)
    shutil.rmtree(d, ignore_errors=True)
    os.makedirs(d)
    open(os.path.join(d, 'model.gltf'), 'wb').write(get(g['url'], cache))
    for rel, f in g['include'].items():
        data = get(f['url'], cache)
        if rel.endswith('.jpg') or rel.endswith('.png'):
            normal = '_nor' in rel
            diff = '_diff' in rel or '_col' in rel
            # nothing is shiny, so roughness/metal maps only cost bytes
            s = size if diff else (max(256, size // 2) if normal else 16)
            data = jpeg(data, s, 88 if normal else 82, normal, rel.endswith('.png'), paint=diff)
        p = os.path.join(d, rel)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        open(p, 'wb').write(data)
    out = os.path.join(OUT, 'models', name + '.glb')
    subprocess.run(['node', os.path.join(ROOT, 'tools', 'glb.mjs'), os.path.join(d, 'model.gltf'), out, str(tris)], check=True)
    return out


def build_texture(name, pid, dsize, nsize, cache):
    files = json.loads(get('%s/files/%s' % (API, pid), cache))
    out = {}
    for key, fn, size, q, normal in (('Diffuse', 'diff', dsize, 84, False), ('nor_gl', 'nor', nsize, 88, True)):
        if key not in files:
            continue
        src = files[key]['1k']['jpg']['url'] if 'jpg' in files[key]['1k'] else files[key]['1k']['png']['url']
        p = os.path.join(OUT, 'tex', '%s_%s.jpg' % (name, fn))
        open(p, 'wb').write(jpeg(get(src, cache), size, q, normal, paint=not normal))
        out[fn] = 'tex/%s_%s.jpg' % (name, fn)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--cache', default=os.path.join(ROOT, '.asset-cache'))
    ap.add_argument('--only', default='')
    a = ap.parse_args()
    only = set(filter(None, a.only.split(',')))
    os.makedirs(os.path.join(OUT, 'models'), exist_ok=True)
    os.makedirs(os.path.join(OUT, 'tex'), exist_ok=True)
    mpath = os.path.join(OUT, 'manifest.json')
    man = json.load(open(mpath)) if os.path.exists(mpath) else {'models': {}, 'textures': {}}
    work = os.path.join(a.cache, 'work')
    for name, (pid, size, tris) in MODELS.items():
        if only and name not in only:
            continue
        try:
            out = build_model(name, pid, size, tris, a.cache, work)
        except (KeyError, subprocess.CalledProcessError) as e:
            print('skip', name, pid, repr(e))
            continue
        i = info(pid, a.cache)
        man['models'][name] = {'file': 'models/%s.glb' % name, 'id': pid, 'title': i.get('name', pid),
                               'authors': sorted(i.get('authors', {}).keys()), 'bytes': os.path.getsize(out)}
        print('%-12s %-28s %6.0f KB' % (name, pid, os.path.getsize(out) / 1024))
    for name, (pid, ds, ns) in TEXTURES.items():
        if only and name not in only:
            continue
        maps = build_texture(name, pid, ds, ns, a.cache)
        i = info(pid, a.cache)
        dim = i.get('dimensions') or [2000, 2000]
        man['textures'][name] = {**maps, 'id': pid, 'title': i.get('name', pid), 'authors': sorted(i.get('authors', {}).keys()),
                                 'size': [dim[0] / 1000, dim[1] / 1000]}
        print('%-12s %-28s %s' % (name, pid, ' '.join(maps)))
    man['license'] = 'CC0 1.0, Poly Haven (polyhaven.com)'
    json.dump(man, open(mpath, 'w'), indent=1, sort_keys=True)
    total = sum(os.path.getsize(os.path.join(dp, f)) for dp, _, fs in os.walk(OUT) for f in fs)
    print('assets total %.1f MB' % (total / 1e6))


if __name__ == '__main__':
    sys.exit(main())
