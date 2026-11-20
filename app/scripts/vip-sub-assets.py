"""VIP > Abonelik tab art, from the client's light-pink design package (a flat 941x1672 screenshot plus slices).

Rerun (from app/; Python 3 with Pillow, numpy, opencv-python-headless and scipy, as scripts/vip-assets.py, whose
helpers it loads):

    python3 -I scripts/vip-sub-assets.py <package dir> [out dir] [preview dir]

  <package dir>  the unzipped SimilarClub_VIP_Abonelik_Paketi folder (reads spec/layout.json and
                 reference/original.png; nothing in it is executed)
  [out dir]      default assets/vip/sub
  [preview dir]  optional: sheet.png, every file at 4x on a light checker, a dark checker and the page pink

Only what code can't draw well is here; the screen draws the rest (cards, pills, gradients, lines, switches) and
the eye / eye-off icons are Ionicons 'eye' / 'eye-off', which match the design's filled eyes.

What it writes into <out dir>:
  status-crown.png  the colour crown (gems) before "VIP aktif · 27 gün kaldı"
  plan-crown.png    the dark gold crown on the selected plan's gold corner tab
  buy-crown.png     the glossy gold crown on "VIP Satın Al"
  sparkle.png       the section headings' four-point star, drawn at 3x (11 dp)
  check.png         the comparison table's gold tick, drawn at 3x (15x12 dp)
  cross.png         the comparison table's grey cross, drawn at 3x (11x11 dp)

The cut-outs keep the design's resolution (941 px for a ~390 dp screen: 2.41 px per dp); the drawn marks are
fitted to the design's pixels (stroke, ends, angles) and drawn 3x for sharp edges. The marks are one flat colour
on alpha, so `tintColor` recolours them (the "Seviyeyi Gizle" heading's sparkles are darker: #AD7205).
"""
import importlib.util
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

# The ground estimate (harmonic fill from the box edge, in OKLab) and small helpers are the VIP tab's.
_spec = importlib.util.spec_from_file_location('vip_assets', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'vip-assets.py'))
va = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(va)

PX_PER_DP = 941 / 390  # the design's pixels per dp
SCALE = 3              # drawn marks: pixels per dp in the PNG
SS = 8                 # supersampling for the drawn marks

# ---------------------------------------------------------------------------------------------- cut-outs

# Boxes in design pixels (x0, y0, x1, y1): the layout.json art box grown to the whole object, inside one ground
# (the status line's page pink, the gold tab right of the discount pill, the button's purple left of its label).
CROWNS = {
    'status-crown': (277, 115, 334, 168),
    'plan-crown': (566, 193, 609, 230),
    'buy-crown': (308, 505, 382, 571),
}


def cut_by_colour(img, core=0.10, min_part=4):
    """RGBA of the object on a smooth ground. The object is what differs from the ground by more than `core` in
    OKLab; an edge pixel's opacity is how far it lies from the ground toward the nearest object colour, so the design's
    soft glow around a crown (lighter than the pink or gold ground, darker than the purple one) lies the other way and
    drops out, and the edge takes the object's colour (no fringe of the old ground). vip-assets' GrabCut cut_out,
    tuned for the busy night ground, loses the status crown's thin back points on these flat grounds."""
    bglab, diff = va.ground(img)
    b = np.clip(va.rgb(bglab), 0, 1)
    obj = diff > core
    lab, n = va.ndimage.label(obj)
    if n:
        sz = va.ndimage.sum(obj, lab, range(1, n + 1))
        obj = np.isin(lab, 1 + np.nonzero(sz >= min_part)[0])
    # Fully covered: the object less its outer pixel, plus thin parts (a point's tip) the erosion took whole.
    deep = va.ndimage.binary_erosion(obj, iterations=1)
    seed = deep | (obj & ~va.ndimage.binary_dilation(deep, iterations=2))
    # Each pixel's object colour: the nearest seed pixel's.
    _, (iy, ix) = va.ndimage.distance_transform_edt(~seed, return_indices=True)
    F = img[iy, ix]
    d = F - b
    proj = np.clip(((img - b) * d).sum(-1) / np.maximum((d * d).sum(-1), 1e-6), 0, 1)
    band = va.ndimage.binary_dilation(obj, iterations=2)
    alpha = np.where(seed, 1.0, np.where(band, proj, 0.0))
    col = np.where(seed[..., None], img, F)
    ys, xs = np.nonzero(alpha > 0.02)
    y0, y1 = max(ys.min() - 1, 0), min(ys.max() + 2, img.shape[0])
    x0, x1 = max(xs.min() - 1, 0), min(xs.max() + 2, img.shape[1])
    rgba = np.dstack([col * (alpha > 0)[..., None], alpha])
    return rgba[y0:y1, x0:x1]


def make_crowns(orig, out):
    files = []
    for name, (x0, y0, x1, y1) in CROWNS.items():
        rgba = cut_by_colour(orig[y0:y1, x0:x1])
        path = os.path.join(out, name + '.png')
        Image.fromarray(va.u8(rgba), 'RGBA').save(path, optimize=True)
        files.append(path)
    return files

# ---------------------------------------------------------------------------------------------- drawn marks

# Fitted to the design (source pixels): the cross's arms end 10.1 px from its centre with a 4.8 px round-capped
# stroke; the tick runs through (760.2, 1024.7), (768.9, 1033.8), (789.7, 1012.1) with a 4.4 px stroke; the
# sparkle is |x|^p + |y|^p <= R^p with p = 0.72 and R = 13 px (its thin tips make it look 24 px wide).
CROSS = dict(colour='#838BA3', half=10.1, stroke=4.8, size_dp=(11, 11))
CHECK = dict(colour='#CB870E', pts=[(760.2, 1024.7), (768.9, 1033.8), (789.7, 1012.1)], stroke=4.4, size_dp=(15, 12))
SPARKLE = dict(colour='#D39409', p=0.72, r=13.0, size_dp=(11, 11))


def rgb_of(hexs):
    return tuple(int(hexs[i:i + 2], 16) for i in (1, 3, 5))


def flat_rgba(cov, colour):
    """A flat-colour RGBA from a coverage map (the colour everywhere, so edges don't darken when scaled)."""
    h, w = cov.shape
    out = np.zeros((h, w, 4), np.uint8)
    out[..., :3] = rgb_of(colour)
    out[..., 3] = np.clip(cov * 255, 0, 255).round().astype(np.uint8)
    return Image.fromarray(out, 'RGBA')


def stroke_cov(polylines, width, size):
    """Coverage of round-capped, round-joined strokes; points and width in output pixels."""
    w, h = size
    im = Image.new('L', (w * SS, h * SS), 0)
    d = ImageDraw.Draw(im)
    r = width * SS / 2
    for pts in polylines:
        p = [(x * SS, y * SS) for x, y in pts]
        for a, b in zip(p[:-1], p[1:]):
            d.line([a, b], fill=255, width=max(1, round(width * SS)))
        for x, y in p:
            d.ellipse([x - r, y - r, x + r, y + r], fill=255)
    return np.asarray(im, np.float64).reshape(h, SS, w, SS).mean((1, 3)) / 255


def make_cross():
    k = SCALE / PX_PER_DP  # design px -> output px
    w, h = CROSS['size_dp'][0] * SCALE, CROSS['size_dp'][1] * SCALE
    cx, cy, a = w / 2, h / 2, CROSS['half'] * k
    cov = stroke_cov([[(cx - a, cy - a), (cx + a, cy + a)], [(cx + a, cy - a), (cx - a, cy + a)]], CROSS['stroke'] * k, (w, h))
    return flat_rgba(cov, CROSS['colour'])


def make_check():
    k = SCALE / PX_PER_DP
    w, h = CHECK['size_dp'][0] * SCALE, CHECK['size_dp'][1] * SCALE
    pts = np.array(CHECK['pts'])
    pad = CHECK['stroke'] / 2
    lo, hi = pts.min(0) - pad, pts.max(0) + pad
    # Centred in the canvas, at the design's size.
    off = (np.array([w, h]) - (hi - lo) * k) / 2 - lo * k
    cov = stroke_cov([[tuple(p * k + off) for p in pts]], CHECK['stroke'] * k, (w, h))
    return flat_rgba(cov, CHECK['colour'])


def make_sparkle():
    k = SCALE / PX_PER_DP
    w, h = SPARKLE['size_dp'][0] * SCALE, SPARKLE['size_dp'][1] * SCALE
    g = (np.arange(w * SS) + 0.5) / SS
    yy, xx = np.meshgrid((np.arange(h * SS) + 0.5) / SS, g, indexing='ij')
    r, p = SPARKLE['r'] * k, SPARKLE['p']
    inside = (np.abs(xx - w / 2) / r) ** p + (np.abs(yy - h / 2) / r) ** p <= 1
    cov = inside.astype(np.float64).reshape(h, SS, w, SS).mean((1, 3))
    return flat_rgba(cov, SPARKLE['colour'])


def make_marks(out):
    files = []
    for name, fn in (('sparkle', make_sparkle), ('check', make_check), ('cross', make_cross)):
        path = os.path.join(out, name + '.png')
        fn().save(path, optimize=True)
        files.append(path)
    return files

# ---------------------------------------------------------------------------------------------- preview

PAGE_PINK = (251, 232, 238)


def preview_sheet(files, path, sc=4):
    tiles = []
    for f in files:
        im = Image.open(f).convert('RGBA')
        big = np.asarray(im.resize((im.width * sc, im.height * sc), Image.LANCZOS), np.float64) / 255
        a = big[..., 3:]
        h, w = big.shape[:2]
        grounds = [va.checker(h, w, (235, 235, 235), (200, 200, 200)), va.checker(h, w, (40, 40, 40), (20, 20, 20)),
                   va.checker(h, w, PAGE_PINK, PAGE_PINK)]
        tiles.append(Image.fromarray(va.u8(np.concatenate([big[..., :3] * a + g * (1 - a) for g in grounds], 1))))
    va.stack(tiles).save(path)

# ---------------------------------------------------------------------------------------------- main


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    pkg = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else 'assets/vip/sub'
    preview = sys.argv[3] if len(sys.argv) > 3 else None
    os.makedirs(out, exist_ok=True)
    src = os.path.join(pkg, 'reference/original.png')
    lay = json.load(open(os.path.join(pkg, 'spec/layout.json')))['source']
    if (lay['width'], lay['height']) != Image.open(src).size:
        sys.exit('reference/original.png is not the 941x1672 design this script was measured on')
    orig = np.asarray(Image.open(src).convert('RGB'), np.float64) / 255
    files = make_crowns(orig, out) + make_marks(out)
    if preview:
        os.makedirs(preview, exist_ok=True)
        preview_sheet(files, os.path.join(preview, 'sheet.png'))
    for f in files:
        im = Image.open(f)
        print(f'{f}  {im.width}x{im.height} px = {im.width / (PX_PER_DP if "crown" in f else SCALE):.1f}x'
              f'{im.height / (PX_PER_DP if "crown" in f else SCALE):.1f} dp  {os.path.getsize(f)} B')


if __name__ == '__main__':
    main()
