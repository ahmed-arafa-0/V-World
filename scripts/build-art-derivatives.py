"""Builds web derivatives of the Phase 2 art pack into assets/veoulla-art-web (gitignored; originals untouched).
Sprites are trimmed to ONE union box per family (all crop states of a crop, all poses of Marcelino, lit/unlit candle)
so every state shares scale and ground line; icons/badges/keys are downscaled only."""
import json, os, sys
from PIL import Image
SRC = 'assets/veoulla-art-pack'
OUT = 'assets/veoulla-art-web'
manifest = json.load(open(f'{SRC}/asset_manifest.json'))['assets']
byid = {}
for a in manifest: byid.setdefault(os.path.basename(a['path']), a)
def load(p): return Image.open(f'{SRC}/{p}').convert('RGBA')
def bbox(im):
    return im.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
def union(boxes):
    return (min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes))
def save(im, rel, max_edge):
    os.makedirs(os.path.dirname(f'{OUT}/{rel}'), exist_ok=True)
    s = min(1, max_edge / max(im.size))
    if s < 1: im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    im.save(f'{OUT}/{rel}', optimize=True)
    return im.size
families = {}
for a in manifest:
    p = a['path']
    if p.startswith('phase2/farm/stages/'):
        crop = os.path.basename(p).split('_')[1]; families.setdefault(f'crop_{crop}', []).append(p)
    elif p.startswith('phase2/characters/'): families.setdefault('marcelino', []).append(p)
    elif p.startswith('phase2/props/candle'): families.setdefault('candle', []).append(p)
    elif p.startswith('map/avatar/'): families.setdefault('avatar', []).append(p)
report = {}
for fam, paths in families.items():
    ims = {p: load(p) for p in paths}
    box = union([bbox(i) for i in ims.values()])
    for p, im in ims.items():
        size = save(im.crop(box), os.path.relpath(p, 'phase2').replace(os.sep, '/') if p.startswith('phase2') else p, 640)
        report[p] = {'family': fam, 'union_box': box, 'own_box': bbox(im), 'out': size}
singles = [a['path'] for a in manifest if a['path'].startswith(('phase2/props/walkman', 'phase2/props/museum', 'phase2/props/farm_plot'))]
for p in singles:
    im = load(p); b = bbox(im); size = save(im.crop(b), os.path.relpath(p, 'phase2').replace(os.sep, '/'), 640)
    report[p] = {'family': 'single', 'own_box': b, 'out': size}
for a in manifest:
    p = a['path']
    if p.startswith(('phase2/keys/', 'phase2/farm/icons/', 'phase2/achievements/')):
        report[p] = {'family': 'icon', 'out': save(load(p), os.path.relpath(p, 'phase2').replace(os.sep, '/'), 256)}
json.dump(report, open(f'{OUT}/derivatives.json', 'w'), indent=1)
print(len(report), 'derivatives')
for p, r in report.items():
    if r['family'] not in ('icon',): print(p, r['family'], r.get('union_box'), r['own_box'], r['out'])
