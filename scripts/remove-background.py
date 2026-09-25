"""
Cuts a product shot out of its white studio background.

Flood-fills inward from the border rather than thresholding globally, so
light-coloured detail that is genuinely part of the garment — the cream
Ottway label on the pocket here — stays put instead of being punched out.

Write the result into wardrobe-photos-originals/ — that folder holds the
full-size masters and is never served — then build the photo the app
actually downloads:

    python3 scripts/remove-background.py shot.jpg wardrobe-photos-originals/thing-nobg.png
    python3 scripts/optimise-photos.py

Give a replacement photo a NEW filename rather than overwriting one that
is already live: served photos are cached as immutable (see vercel.json),
so a browser that already has the old one will not go looking for a new
version of the same name.
"""
import sys
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

SRC, DST = sys.argv[1], sys.argv[2]
CANVAS = 1400          # matches the existing -nobg.png files in wardrobe-photos/
FILL = 0.88            # fraction of the canvas the garment occupies

# How bright a pixel has to be to count as background. 242 suits a white
# studio backdrop; a greyer one needs a lower number, or nothing qualifies
# and the cutout comes back empty. Pass it as a third argument:
#
#     python3 scripts/remove-background.py shot.jpg out.png 200
#
# The line the script prints tells you whether to reach for it: "background
# regions: 0" means the threshold is above the backdrop.
CUT = int(sys.argv[3]) if len(sys.argv) > 3 else 242

# How far from neutral the background is allowed to be. 12 is a white
# studio backdrop, which is grey to within rounding. A photo taken on the
# floor has a background with a colour of its own — beige carpet runs to
# about 40 — and nothing qualifies at 12, so the cutout comes back with the
# room still in it. Pass it as a fourth argument:
#
#     python3 scripts/remove-background.py shot.jpg out.png 140 60
#
# Raise it only as far as the garment allows: this is the one thing keeping
# a pale garment from being read as more backdrop, and the brightness cut
# above is doing the separating whenever the two are far apart in tone.
SAT = int(sys.argv[4]) if len(sys.argv) > 4 else 12

# A studio backdrop is one flat tone, so every pixel of it can be judged on
# its own. A floor is not: carpet is a texture, and its darker flecks read
# as garment however the two numbers above are set — they fail the
# brightness test individually while the floor as a whole passes it easily.
#
# Blurring first is what closes that gap. It costs the mask a pixel or two
# of precision at the outline and buys a background that is one tone again:
# under this carpet the garment averages 78 and the floor 168, which no
# threshold could confuse. Pass a radius as a fifth argument when the
# cutout comes back wearing the floor:
#
#     python3 scripts/remove-background.py shot.jpg out.png 130 60 8
#
# It defaults to none, because a photo that did not need it should not pay
# the precision.
BLUR = float(sys.argv[5]) if len(sys.argv) > 5 else 0

source = Image.open(SRC).convert('RGB')
rgb = np.array(source.filter(ImageFilter.GaussianBlur(BLUR)) if BLUR else source).astype(np.int16)
lum = rgb.mean(axis=2)
sat = rgb.max(axis=2) - rgb.min(axis=2)          # neutral background, coloured garment

# Background candidates: bright and near-neutral.
candidate = (lum >= CUT) & (sat <= SAT)

# Keep only the regions actually connected to the image border. Anything
# bright but enclosed by the garment (the label) is not background.
labels, n = ndimage.label(candidate)
border = np.concatenate([labels[0, :], labels[-1, :], labels[:, 0], labels[:, -1]])
bg_ids = set(np.unique(border)) - {0}
background = np.isin(labels, list(bg_ids))

# Close pin-holes inside the garment (buttons, weave) that read as bright.
solid = ndimage.binary_fill_holes(~background)

# Pull in by a pixel: the outermost ring is a garment/white blend and would
# otherwise leave a pale halo once the white behind it is gone.
#
# Blurring first widens that ring by about its own radius — it drags the
# garment's darkness out over the floor, and everything it reached is on
# the garment's side of the threshold now. So pull in by that much again,
# which is what puts the outline back where the eye says it is.
solid = ndimage.binary_erosion(solid, iterations=1 + round(BLUR))

# Whatever is left over. Something in the background that reads as dark —
# a shadow, a fleck the blur did not quite flatten — comes through as
# confetti around the garment. A hundredth of the biggest piece is not a
# garment, which still keeps both of a pair of socks, each being the same
# order of size as the other.
labelled, pieces = ndimage.label(solid)
if pieces > 1:
    sizes = ndimage.sum(solid, labelled, range(1, pieces + 1))
    keep = [i + 1 for i, s in enumerate(sizes) if s >= sizes.max() * 0.01]
    solid = np.isin(labelled, keep)
    print(f"pieces: {pieces}, kept: {len(keep)}")

alpha = Image.fromarray((solid * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))

out = source.copy()
out.putalpha(alpha)

bbox = out.getbbox()
out = out.crop(bbox)

scale = (CANVAS * FILL) / max(out.size)
out = out.resize((max(1, round(out.width * scale)), max(1, round(out.height * scale))), Image.LANCZOS)

canvas = Image.new('RGBA', (CANVAS, CANVAS), (0, 0, 0, 0))
canvas.paste(out, ((CANVAS - out.width) // 2, (CANVAS - out.height) // 2), out)
canvas.save(DST)

a = np.array(canvas)[:, :, 3]
print(f"regions found: {n}, background regions: {len(bg_ids)}")
print(f"cropped from {bbox} -> saved {canvas.size}")
print(f"transparent: {(a == 0).mean() * 100:.1f}%  solid: {(a == 255).mean() * 100:.1f}%  soft edge: {((a > 0) & (a < 255)).mean() * 100:.2f}%")
