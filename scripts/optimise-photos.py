"""
Builds the photos the app actually serves.

wardrobe-photos-originals/  1400px PNG masters, never served
wardrobe-photos/            600px WebP, what the browser downloads

The app shows a photo at 174 CSS px at most, so a 1400px master is about
sixteen times more pixels than any screen uses. Serving the masters cost
67MB and most of a minute on a phone; at 600px WebP the same 66 photos are
under 2MB, and 600 is still comfortably more than a retina screen needs at
the sizes this app draws.

Run after adding anything to wardrobe-photos-originals/:

    python3 scripts/optimise-photos.py

It only writes a WebP whose master is newer, so re-running is cheap. Pass
--force to rebuild everything, --check to report without writing (so a
missing or stale photo can be caught before it ships).

Give a replacement photo a NEW filename rather than overwriting one that
is already live: served photos are cached as immutable (see vercel.json),
so a browser that already has the old one will not go looking for a new
version of the same name.

Photos added from the phone do not come through here at all — the app
downsizes and encodes those to WebP itself before upload, and they live in
Supabase Storage rather than the repo.
"""
import os
import sys
from PIL import Image

ORIGINALS = 'wardrobe-photos-originals'
SERVED = 'wardrobe-photos'
EDGE = 600
QUALITY = 82

force = '--force' in sys.argv
check = '--check' in sys.argv


def served_name(master):
    return os.path.splitext(master)[0] + '.webp'


def build(master_path, out_path):
    im = Image.open(master_path)
    im = im.convert('RGBA' if im.mode in ('RGBA', 'LA', 'P') else 'RGB')
    scale = min(1, EDGE / max(im.size))
    if scale < 1:
        im = im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))),
                       Image.LANCZOS)
    im.save(out_path, 'WEBP', quality=QUALITY, method=6)


def main():
    if not os.path.isdir(ORIGINALS):
        sys.exit(f'{ORIGINALS}/ not found — run this from the repo root.')
    os.makedirs(SERVED, exist_ok=True)

    masters = sorted(f for f in os.listdir(ORIGINALS)
                     if f.lower().endswith(('.png', '.jpg', '.jpeg', '.webp')))
    built = skipped = stale = 0
    before = after = 0

    for name in masters:
        src = os.path.join(ORIGINALS, name)
        dst = os.path.join(SERVED, served_name(name))
        fresh = (os.path.exists(dst)
                 and os.path.getmtime(dst) >= os.path.getmtime(src)
                 and not force)
        if fresh:
            skipped += 1
        elif check:
            stale += 1
            print(f'  stale or missing: {served_name(name)}')
        else:
            build(src, dst)
            built += 1
        before += os.path.getsize(src)
        if os.path.exists(dst):
            after += os.path.getsize(dst)

    if check:
        print(f'{len(masters)} masters, {stale} need rebuilding')
        sys.exit(1 if stale else 0)

    # Anything served that no longer has a master is dead weight in the deploy.
    expected = {served_name(n) for n in masters}
    orphans = [f for f in sorted(os.listdir(SERVED)) if f not in expected]
    for f in orphans:
        print(f'  orphan (no master): {SERVED}/{f}')

    mb = 1048576
    print(f'{built} built, {skipped} already current')
    print(f'masters {before / mb:.1f} MB  ->  served {after / mb:.1f} MB'
          f'  ({before / after:.0f}x smaller)' if after else '')


if __name__ == '__main__':
    main()
