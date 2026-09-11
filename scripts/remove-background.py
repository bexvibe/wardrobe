"""
Cuts a product shot out of its white studio background.

Flood-fills inward from the border rather than thresholding globally, so
light-coloured detail that is genuinely part of the garment — the cream
Ottway label on the pocket here — stays put instead of being punched out.
"""
import sys
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

SRC, DST = sys.argv[1], sys.argv[2]
CANVAS = 1400          # matches the existing -nobg.png files in wardrobe-photos/
FILL = 0.88            # fraction of the canvas the garment occupies

rgb = np.array(Image.open(SRC).convert('RGB')).astype(np.int16)
lum = rgb.mean(axis=2)
sat = rgb.max(axis=2) - rgb.min(axis=2)          # neutral background, coloured garment

# Background candidates: bright and near-neutral.
candidate = (lum >= 242) & (sat <= 12)

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
solid = ndimage.binary_erosion(solid, iterations=1)

alpha = Image.fromarray((solid * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))

out = Image.open(SRC).convert('RGB')
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
