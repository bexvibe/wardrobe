"""
Turns downloaded catalogue images into cutouts the app can serve.

    python3 scripts/catalogue-process.py                 # everything in catalogue/raw/
    python3 scripts/catalogue-process.py tee-white       # just these ids
    python3 scripts/catalogue-process.py --tol 40        # looser background match

Input:   catalogue/raw/<id>.(png|jpg|jpeg|webp)   ids come from catalogue/prompts.md
Output:  wardrobe-photos-originals/catalogue-<id>-nobg.png   1400px master, never served
         wardrobe-photos/catalogue-<id>-nobg.webp            600px, via optimise-photos.py
         catalogue/catalogue.json                            what the app's picker reads
         catalogue/preview.png                               contact sheet for eyeballing

Same canvas, fill and edge treatment as remove-background.py, so catalogue
pieces sit alongside real ones. The difference is how the background is
found: remove-background.py looks for bright neutral pixels, which can't
cope with a white tee (the tee is bright and neutral too). This samples the
backdrop colour from the image's corners and floods in from the border over
anything close to it, so a white garment on grey and a black one on white
both work. That is why the prompts put light garments on mid-grey.

Anything that looks wrong is listed at the end as REVIEW. The usual causes:
a shadow or gradient in the backdrop (cutout keeps it), a garment the same
colour as its backdrop (cutout eats it), or a corner that isn't backdrop
(item cropped by the frame). Regenerate those rather than tuning --tol.

Give a regenerated image a NEW id suffix (tee-white-v2) rather than
overwriting one that is live: served photos are cached as immutable.
"""
import argparse
import json
import os
import subprocess
import sys

import numpy as np
from PIL import Image, ImageFilter, ImageDraw
from scipy import ndimage

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

CANVAS = 1400   # matches remove-background.py
FILL = 0.88


def load_variants():
    """id -> variant, from the same manifest the prompts come from."""
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        'catalogue_prompts', os.path.join(ROOT, 'scripts', 'catalogue-prompts.py'))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return {v['id']: v for v in mod.variants()}


def cut_out(src_path, tol):
    """Returns (RGBA canvas, stats dict)."""
    im = Image.open(src_path).convert('RGB')
    rgb = np.array(im).astype(np.int16)
    h, w, _ = rgb.shape

    # Backdrop colour: median of a patch in each corner. If the corners
    # disagree the backdrop isn't flat (gradient, shadow, cropped item).
    k = max(4, min(h, w) // 40)
    patches = [rgb[:k, :k], rgb[:k, -k:], rgb[-k:, :k], rgb[-k:, -k:]]
    meds = np.array([np.median(p.reshape(-1, 3), axis=0) for p in patches])
    bg = np.median(meds, axis=0)
    corner_spread = float(np.abs(meds - bg).max())

    dist = np.sqrt(((rgb - bg) ** 2).sum(axis=2))
    candidate = dist <= tol

    labels, n = ndimage.label(candidate)
    border = np.concatenate([labels[0, :], labels[-1, :], labels[:, 0], labels[:, -1]])
    bg_ids = set(np.unique(border)) - {0}
    background = np.isin(labels, list(bg_ids))

    solid = ndimage.binary_fill_holes(~background)
    solid = ndimage.binary_erosion(solid, iterations=1)

    labelled, pieces = ndimage.label(solid)
    if pieces > 1:
        sizes = ndimage.sum(solid, labelled, range(1, pieces + 1))
        keep = [i + 1 for i, s in enumerate(sizes) if s >= sizes.max() * 0.01]
        solid = np.isin(labelled, keep)

    alpha = Image.fromarray((solid * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))
    out = im.copy()
    out.putalpha(alpha)
    bbox = out.getbbox()
    if bbox is None:
        raise ValueError('nothing left after cutout')

    # Touching the frame means the item was cropped by the generator.
    touches_edge = bbox[0] <= 1 or bbox[1] <= 1 or bbox[2] >= w - 1 or bbox[3] >= h - 1

    out = out.crop(bbox)
    scale = (CANVAS * FILL) / max(out.size)
    out = out.resize((max(1, round(out.width * scale)), max(1, round(out.height * scale))), Image.LANCZOS)
    canvas = Image.new('RGBA', (CANVAS, CANVAS), (0, 0, 0, 0))
    canvas.paste(out, ((CANVAS - out.width) // 2, (CANVAS - out.height) // 2), out)

    a = np.array(canvas)[:, :, 3]
    return canvas, {
        'transparent': float((a == 0).mean()),
        'corner_spread': corner_spread,
        'touches_edge': bool(touches_edge),
        'pieces': int(pieces),
        'bg': [int(x) for x in bg],
    }


def problems(stats):
    p = []
    if stats['corner_spread'] > 25:
        p.append(f"backdrop not flat (corners differ by {stats['corner_spread']:.0f})")
    if stats['touches_edge']:
        p.append('item touches the frame edge (cropped?)')
    if stats['transparent'] < 0.35:
        p.append(f"only {stats['transparent']*100:.0f}% transparent: backdrop probably kept")
    if stats['transparent'] > 0.92:
        p.append(f"{stats['transparent']*100:.0f}% transparent: item probably eaten")
    if stats['pieces'] > 3:
        p.append(f"{stats['pieces']} separate pieces")
    return p


def contact_sheet(paths, dest, cell=220, cols=10):
    rows = (len(paths) + cols - 1) // cols
    sheet = Image.new('RGB', (cols * cell, rows * (cell + 16)), (235, 235, 235))
    d = ImageDraw.Draw(sheet)
    for i, (vid, p) in enumerate(paths):
        im = Image.open(p).convert('RGBA')
        im.thumbnail((cell - 8, cell - 8))
        x, y = (i % cols) * cell, (i // cols) * (cell + 16)
        sheet.paste(im, (x + 4, y + 4), im)
        d.text((x + 4, y + cell), vid[:34], fill=(60, 60, 60))
    sheet.save(dest)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('ids', nargs='*', help='only these ids (default: all in raw dir)')
    ap.add_argument('--raw', default=os.path.join(ROOT, 'catalogue', 'raw'))
    ap.add_argument('--originals', default=os.path.join(ROOT, 'wardrobe-photos-originals'))
    ap.add_argument('--tol', type=float, default=30, help='colour distance counted as backdrop (default 30)')
    ap.add_argument('--skip-optimise', action='store_true')
    args = ap.parse_args()

    variants = load_variants()
    os.makedirs(args.originals, exist_ok=True)

    files = {}
    for f in sorted(os.listdir(args.raw)) if os.path.isdir(args.raw) else []:
        stem, ext = os.path.splitext(f)
        if ext.lower() in ('.png', '.jpg', '.jpeg', '.webp'):
            files[stem] = os.path.join(args.raw, f)
    if args.ids:
        files = {k: v for k, v in files.items() if k in args.ids}
    if not files:
        sys.exit(f'No images found in {args.raw} (named <id>.png, ids are in catalogue/prompts.md).')

    unknown = [k for k in files if k not in variants]
    if unknown:
        print('Skipping files that match no catalogue id: ' + ', '.join(unknown))

    done, review = [], []
    for vid, path in files.items():
        if vid not in variants:
            continue
        try:
            canvas, stats = cut_out(path, args.tol)
        except Exception as e:
            review.append((vid, [str(e)]))
            continue
        dst = os.path.join(args.originals, f'catalogue-{vid}-nobg.png')
        canvas.save(dst)
        done.append((vid, dst))
        bad = problems(stats)
        print(f"{'REVIEW' if bad else 'ok    '} {vid}  transparent {stats['transparent']*100:.0f}%")
        if bad:
            review.append((vid, bad))

    if not args.skip_optimise and done:
        subprocess.run([sys.executable, os.path.join(ROOT, 'scripts', 'optimise-photos.py')],
                       cwd=ROOT, check=True)

    # catalogue.json: everything that has a processed image, in manifest order.
    out_json = os.path.join(ROOT, 'catalogue', 'catalogue.json')
    present = {v for v in variants if os.path.exists(os.path.join(args.originals, f'catalogue-{v}-nobg.png'))}
    entries = [{
        'id': f"cat_{v['id']}",
        'type': v['type'],
        'colour': v['colour'],
        'name': v['name'],
        'category': v['category'],
        'photo': f"wardrobe-photos/catalogue-{v['id']}-nobg.webp",
    } for v in variants.values() if v['id'] in present]
    json.dump(entries, open(out_json, 'w'), indent=1)

    if done:
        contact_sheet(done, os.path.join(ROOT, 'catalogue', 'preview.png'))

    print(f"\n{len(done)} processed this run, {len(entries)}/{len(variants)} in catalogue.json")
    if review:
        print('\nREVIEW these (regenerate rather than loosening --tol):')
        for vid, bad in review:
            print(f'  {vid}: ' + '; '.join(bad))
    print('Contact sheet: catalogue/preview.png')


if __name__ == '__main__':
    main()
