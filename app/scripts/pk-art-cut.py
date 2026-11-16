"""Cut the PK premium ornaments out of the concept PNGs as alpha-channel assets.

Gold (and what gold encloses) is kept, the purple scene behind is dropped: a soft "goldness" from HSV, the holes the
gold rim encloses filled (gems, a banner's cloth, the shield's face), stray sparkles dropped by component size, a
region mask where neighbours are gold too (the podiums beside the trophy), and forced-clear circles (a frame's hole,
where the photo goes). Usage: python -P cut_pk_art.py <concept dir> <out dir> [preview.png]
"""
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage


def smooth(x, lo, hi):
    t = np.clip((x - lo) / (hi - lo), 0, 1)
    return t * t * (3 - 2 * t)


def hsv(a):
    rgb = a[..., :3].astype(np.float32) / 255
    mx = rgb.max(-1)
    mn = rgb.min(-1)
    d = mx - mn + 1e-6
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    h = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
    s = np.where(mx > 0, (mx - mn) / (mx + 1e-6), 0)
    return h, s, mx


def goldness(a, hue=(14, 66), sat=0.28, val=0.36):
    h, s, v = hsv(a)
    lo, hi = hue
    hh = smooth(h, lo - 8, lo + 4) * (1 - smooth(h, hi - 4, hi + 8))
    g = hh * smooth(s, sat - 0.12, sat + 0.06) * smooth(v, val - 0.12, val + 0.08)
    # Specular highlights on the metal are near white: kept where they touch gold.
    hot = smooth(v, 0.86, 0.96) * (1 - smooth(s, 0.35, 0.55))
    near = ndimage.maximum_filter(g > 0.5, size=7)
    return np.maximum(g, hot * near)


def keep_big(mask, n=None, min_frac=0.02):
    lab, k = ndimage.label(mask)
    if k == 0:
        return mask
    sizes = ndimage.sum(mask, lab, range(1, k + 1))
    order = np.argsort(sizes)[::-1]
    big = sizes[order[0]]
    keep = [i + 1 for i in order if sizes[i] >= big * min_frac]
    if n:
        keep = keep[:n]
    return np.isin(lab, keep)


def poly_mask(shape, pts, scale=4):
    h, w = shape
    im = Image.new('L', (w * scale, h * scale), 0)
    ImageDraw.Draw(im).polygon([(x * scale, y * scale) for x, y in pts], fill=255)
    return np.asarray(im.resize((w, h), Image.LANCZOS)).astype(np.float32) / 255


def circle_mask(shape, cx, cy, r, feather=1.5):
    h, w = shape
    yy, xx = np.mgrid[0:h, 0:w]
    d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
    return 1 - smooth(d, r - feather, r + feather)


def cut(img, box, fill=True, n=None, min_frac=0.02, region=None, clear=(), hue=(14, 66), sat=0.28, val=0.36, grow=2, solid=()):
    a = np.asarray(img.crop(box).convert('RGB'))
    g = goldness(a, hue, sat, val)
    if region is not None:
        g = g * region
    core = keep_big(g > 0.5, n, min_frac)
    if fill:
        core = ndimage.binary_fill_holes(ndimage.binary_closing(core, iterations=2))
    zone = ndimage.binary_dilation(core, iterations=grow)
    alpha = np.where(core, 1.0, g * zone)
    # Shapes kept whole whatever their colour (a gem the gold doesn't close round, a banner's cloth).
    for pts in solid:
        alpha = np.maximum(alpha, poly_mask(alpha.shape, pts))
    if region is not None:
        alpha = alpha * region
    for cx, cy, r in clear:
        alpha = alpha * (1 - circle_mask(alpha.shape, cx, cy, r))
    alpha = ndimage.gaussian_filter(alpha, 0.6)
    out = np.dstack([a, (np.clip(alpha, 0, 1) * 255).astype(np.uint8)])
    im = Image.fromarray(out, 'RGBA')
    bb = im.getchannel('A').point(lambda x: 255 if x > 8 else 0).getbbox()
    return im.crop(bb) if bb else im, bb


def save(im, path, width):
    if im.width > width:
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    im.save(path, optimize=True)
    return im


def main():
    src, out = sys.argv[1], sys.argv[2]
    os.makedirs(out, exist_ok=True)
    c01 = Image.open(os.path.join(src, '01_PK_Baslatma.png'))
    c02b = Image.open(os.path.join(src, '02B_Takim_PK_Aktif.png'))
    c04 = Image.open(os.path.join(src, '04_Tac_Kazandiranlar.png'))
    made = {}

    # Winged crown over every PK screen's title.
    crest, _ = cut(c04, (250, 0, 950, 212), n=3, min_frac=0.05)
    made['pk-crest'] = save(crest, os.path.join(out, 'pk-crest.png'), 600)

    # Laurel frames with a crown: the photo goes in their hole. Pink (left) and blue (right).
    box = (100, 360, 570, 782)
    reg = np.asarray(Image.new('L', (box[2] - box[0], box[3] - box[1]), 255)).astype(np.float32) / 255
    pink, bb = cut(c04, box, n=4, min_frac=0.01, region=reg, clear=[(233, 281, 131)])
    made['pk-laurel-pink'] = save(pink, os.path.join(out, 'pk-laurel-pink.png'), 360)
    print('pink frame bbox in crop', bb, 'hole centre/radius (crop px) 233,281,131')
    box = (630, 360, 1100, 782)
    blue, bb = cut(c04, box, n=4, min_frac=0.01, clear=[(242, 282, 131)], solid=[[(242, 1), (273, 32), (242, 63), (211, 32)]])
    made['pk-laurel-blue'] = save(blue, os.path.join(out, 'pk-laurel-blue.png'), 360)
    print('blue frame bbox in crop', bb, 'hole centre/radius (crop px) 242,282,131')

    # The VS shield between the two mode cards.
    vs, _ = cut(c01, (505, 645, 695, 815), n=1)
    made['pk-vs'] = save(vs, os.path.join(out, 'pk-vs.png'), 220)

    # Team banners: the lion (red) and the wolf (blue), each with its gold rod.
    # The cloth is a pennant (straight sides, a V at the bottom) kept whole; the rod over it is its gold.
    def banner(box, pts):
        w, h = box[2] - box[0], box[3] - box[1]
        band = np.zeros((h, w), np.float32)
        band[0:38, :] = 1
        reg = np.maximum(band, poly_mask((h, w), pts))
        return cut(c02b, box, fill=False, n=6, min_frac=0.002, region=reg, solid=[pts])[0]

    made['pk-lion'] = save(banner((100, 104, 318, 312), [(23, 13), (201, 13), (201, 151), (110, 208), (23, 151)]), os.path.join(out, 'pk-lion.png'), 220)
    made['pk-wolf'] = save(banner((878, 104, 1098, 312), [(22, 13), (199, 13), (199, 148), (110, 207), (22, 148)]), os.path.join(out, 'pk-wolf.png'), 220)

    # The trophy between the podiums (the podiums are gold too: an ellipse keeps only the cup).
    box = (500, 900, 700, 1175)
    w, h = box[2] - box[0], box[3] - box[1]
    pts = [(28, 0), (172, 0), (190, 70), (150, 150), (128, 196), (160, 232), (164, 275), (36, 275), (40, 232), (72, 196), (50, 150), (10, 70)]
    trophy, _ = cut(c04, box, n=1, region=poly_mask((h, w), pts))
    made['pk-trophy'] = save(trophy, os.path.join(out, 'pk-trophy.png'), 220)

    # The target ("En Çok Atışı Alan").
    target, _ = cut(c04, (722, 800, 815, 902), n=1)
    made['pk-target'] = save(target, os.path.join(out, 'pk-target.png'), 120)

    if len(sys.argv) > 3:
        tiles = list(made.items())
        W = sum(min(im.width, 320) for _, im in tiles) + 20 * len(tiles) + 20
        sheet = Image.new('RGBA', (W, 360), (20, 8, 34, 255))
        # Half on a checker so the edges show.
        ck = Image.new('RGBA', (W, 180), (0, 0, 0, 0))
        d = ImageDraw.Draw(ck)
        for x in range(0, W, 12):
            for y in range(0, 180, 12):
                if (x // 12 + y // 12) % 2:
                    d.rectangle([x, y, x + 11, y + 11], fill=(200, 200, 200, 255))
                else:
                    d.rectangle([x, y, x + 11, y + 11], fill=(255, 255, 255, 255))
        sheet.alpha_composite(ck, (0, 180))
        x = 10
        for _, im in tiles:
            t = im.copy()
            t.thumbnail((320, 170))
            sheet.alpha_composite(t, (x, 5))
            sheet.alpha_composite(t, (x, 185))
            x += t.width + 20
        sheet.save(sys.argv[3])
    for k, im in made.items():
        print(k, im.size, os.path.getsize(os.path.join(out, k + '.png')) // 1024, 'KB')


if __name__ == '__main__':
    main()
