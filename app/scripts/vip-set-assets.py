"""VIP seti: the client's "vip 1-10lvl sistem" package (20 Nov 2026) cut into what the app and the server use.

Rerun (from app/; Python 3 with Pillow and numpy; nothing in the package is executed):

    python scripts/vip-set-assets.py <package dir> <converted dir>

  <package dir>    the unzipped "vip 1-10lvl sistem" folder: vip rozetleri/, profil çerçeveleri/, sohbet balonu/,
                   kişi kartı/, giriş efekti resimleri/ (PNG, vip1.png … vip10.png), haraketli çerçeveler/ and
                   giriş efekti/ (SVGA)
  <converted dir>  the SVGAs already turned into the phones' formats by the server's own tools:
                     frame/frame-<n>.png, frame/frame-<n>.webp   server/api/tools/svga-to-webp.py <svga> <png> <webp>
                     entry/entry-<n>.mp4                         server/api/tools/svga-to-fx.py <svga> <mp4> --fill 1

What it writes (paths from the repository's root):
  app/assets/vip/levels/badge-<n>.webp   the level's badge (VIP list, the VIP chip on the profile and person card)
  app/assets/vip/levels/frame-<n>.webp   the level's still profile frame (VIP list)
  app/assets/vip/levels/bubble-<n>.webp  the level's chat bubble (VIP list)
  app/assets/vip/levels/entry-<n>.webp   the level's entry effect picture (VIP list)
  app/src/components/vip/level-art.ts    the requires above, their sizes and the person card's colours per level
  server/api/vip-set/                    the bag items the server adds once (vip-set.mjs): frame-<n>.png / .webp,
                                         bubble-<n>.png, entry-<n>.mp4, entry-icon-<n>.webp and manifest.json (each
                                         frame's photo hole, each bubble's corners and colours)

The person card ("kişi kartı" in the package is the chat bubble's own design): its inner colour, left to right, and its
rim's two tones, measured from the bubble picture; an inner colour too light for the card's white text is darkened
until white reads on it (contrast 4.5:1), keeping its hue.
"""
import json
import os
import shutil
import sys

import numpy as np
from PIL import Image

LEVELS = range(1, 11)
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
APP_OUT = os.path.join(ROOT, 'app', 'assets', 'vip', 'levels')
TS_OUT = os.path.join(ROOT, 'app', 'src', 'components', 'vip', 'level-art.ts')
SERVER_OUT = os.path.join(ROOT, 'server', 'api', 'vip-set')


def rgba(path):
    return Image.open(path).convert('RGBA')


def trimmed(im, pad=4):
    """The picture cut to its visible part (alpha > 8) with `pad` px round it."""
    a = np.asarray(im)[..., 3]
    ys, xs = np.nonzero(a > 8)
    box = (max(xs.min() - pad, 0), max(ys.min() - pad, 0), min(xs.max() + 1 + pad, im.width), min(ys.max() + 1 + pad, im.height))
    return im.crop(box)


def squared(im):
    side = max(im.size)
    out = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    out.paste(im, ((side - im.width) // 2, (side - im.height) // 2))
    return out


def fit(im, w=None, h=None):
    k = min((w or 1e9) / im.width, (h or 1e9) / im.height)
    return im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)


def save_webp(im, path, q=88):
    im.save(path, 'WEBP', quality=q, method=6)
    return im.size


def erode(mask, n):
    """Binary erosion by n px (4-neighbour steps), numpy only."""
    m = mask.copy()
    for _ in range(n):
        m = m & np.roll(m, 1, 0) & np.roll(m, -1, 0) & np.roll(m, 1, 1) & np.roll(m, -1, 1)
    return m


def fill_holes(mask):
    """A closed shape with its inside: everything the outside can't reach (a flood from the border)."""
    H, W = mask.shape
    free = np.ones((H + 2, W + 2), bool)
    free[1:-1, 1:-1] = ~mask
    out = np.zeros((H + 2, W + 2), bool)
    out[0, :] = out[-1, :] = out[:, 0] = out[:, -1] = True
    while True:
        grown = out | (free & (np.roll(out, 1, 0) | np.roll(out, -1, 0) | np.roll(out, 1, 1) | np.roll(out, -1, 1)))
        if (grown == out).all():
            break
        out = grown
    return ~out[1:-1, 1:-1]


def hexof(c):
    return '#%02X%02X%02X' % tuple(int(round(float(v))) for v in c)


def lin(c):
    c = np.asarray(c, float) / 255
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def unlin(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055) * 255


def readable(c, max_lum=0.18):
    """`c` darkened (in linear light, hue kept) until white text on it has a 4.5:1 contrast."""
    l = lin(c)
    y = float(l @ [0.2126, 0.7152, 0.0722])
    return unlin(l * (max_lum / y)) if y > max_lum else np.asarray(c, float)


def frame_hole(path):
    """A still frame's photo place: the empty middle's centre and its rim's median distance, as shares of the width."""
    im = rgba(path)
    a = np.asarray(im)[..., 3] > 40
    inside = fill_holes(a) & ~a
    H, W = inside.shape
    ys, xs = np.nonzero(inside)
    cy, cx = ys.mean(), xs.mean()
    edge = inside & ~erode(inside, 1)
    ey, ex = np.nonzero(edge)
    r = float(np.median(np.hypot(ey - cy, ex - cx))) + 1
    hole = min(max(r / W, 0.1), 0.45)
    # Within 1 % of the middle is the middle (the designs are centred; the rest is their ornaments' pull).
    x, y = (0.5 if abs(v - 0.5) < 0.01 else v for v in (cx / W, cy / H))
    at = None if x == 0.5 and y == 0.5 else {'x': round(min(max(x, 0.3), 0.7), 3), 'y': round(min(max(y, 0.3), 0.7), 3)}
    return round(hole, 3), at


def bubble_look(im):
    """Inner colours (left, right) and the rim's tones (top, bottom) of a bubble picture."""
    px = np.asarray(im).astype(float)
    a = px[..., 3] > 200
    solid = fill_holes(a) | a
    H = solid.shape[0]
    core = erode(solid, max(6, H // 7))
    ys, xs = np.nonzero(core)
    y0, y1 = np.percentile(ys, 30), np.percentile(ys, 70)
    x0, x1 = xs.min(), xs.max()
    band = core.copy()
    band[: int(y0)] = False
    band[int(y1) + 1:] = False
    left = band.copy()
    left[:, int(x0 + (x1 - x0) * 0.45):] = False
    right = band.copy()
    right[:, : int(x0 + (x1 - x0) * 0.55)] = False
    inner = [np.median(px[m][:, :3], 0) for m in (left, right)]
    rim = solid & ~erode(solid, max(3, H // 25))
    mid = (ys.min() + ys.max()) / 2
    top = rim.copy()
    top[int(mid):] = False
    bottom = rim.copy()
    bottom[: int(mid)] = False

    def tone(m):
        c = px[m][:, :3]
        v = c.max(1)
        return np.median(c[v >= np.percentile(v, 60)], 0)
    return inner, [tone(top), tone(bottom)]


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    pkg, conv = sys.argv[1], sys.argv[2]
    for d in (APP_OUT, SERVER_OUT):
        os.makedirs(d, exist_ok=True)

    def src(folder, n):
        return os.path.join(pkg, folder, f'vip{n}.png')
    app, manifest = {}, {'frames': {}, 'bubbles': {}, 'entries': {}}
    for n in LEVELS:
        row = {}
        row['badge'] = save_webp(fit(squared(trimmed(rgba(src('vip rozetleri', n)))), 192, 192), os.path.join(APP_OUT, f'badge-{n}.webp'))
        row['frame'] = save_webp(fit(squared(trimmed(rgba(src('profil çerçeveleri', n)))), 240, 240), os.path.join(APP_OUT, f'frame-{n}.webp'))
        bub = trimmed(rgba(src('sohbet balonu', n)))
        row['bubble'] = save_webp(fit(bub, 300, 300), os.path.join(APP_OUT, f'bubble-{n}.webp'))
        row['entry'] = save_webp(fit(trimmed(rgba(src('giriş efekti resimleri', n))), 260, 260), os.path.join(APP_OUT, f'entry-{n}.webp'))
        inner, rim = bubble_look(trimmed(rgba(src('kişi kartı', n))))
        row['card'] = {'inner': [hexof(readable(c)) for c in inner], 'rim': [hexof(c) for c in rim]}
        app[n] = row

        # The server's bag items.
        for ext in ('png', 'webp'):
            shutil.copyfile(os.path.join(conv, 'frame', f'frame-{n}.{ext}'), os.path.join(SERVER_OUT, f'frame-{n}.{ext}'))
        hole, at = frame_hole(os.path.join(SERVER_OUT, f'frame-{n}.png'))
        manifest['frames'][n] = {'hole': hole, 'at': at}
        big = fit(bub, 420, 1024)
        big.save(os.path.join(SERVER_OUT, f'bubble-{n}.png'), optimize=True)
        w, h = big.size
        inner_big, _ = bubble_look(big)
        manifest['bubbles'][n] = {
            'w': w,
            'h': h,
            'slice': {'t': round(h * 0.36), 'r': round(w * 0.27), 'b': round(h * 0.36), 'l': round(w * 0.27)},
            'colors': [hexof(readable(c)) for c in inner_big],
        }
        shutil.copyfile(os.path.join(conv, 'entry', f'entry-{n}.mp4'), os.path.join(SERVER_OUT, f'entry-{n}.mp4'))
        save_webp(fit(squared(trimmed(rgba(src('giriş efekti resimleri', n)))), 384, 384), os.path.join(SERVER_OUT, f'entry-icon-{n}.webp'), 85)
    with open(os.path.join(SERVER_OUT, 'manifest.json'), 'w', encoding='utf-8', newline='\n') as f:
        json.dump(manifest, f, indent=1, ensure_ascii=False)
        f.write('\n')

    def req(kind, n):
        return f"require('../../../assets/vip/levels/{kind}-{n}.webp')"
    lines = [
        "// Made by app/scripts/vip-set-assets.py from the client's \"vip 1-10lvl sistem\" package: do not edit by hand.",
        "// Per VIP level: its badge, still profile frame, chat bubble and entry effect picture (w × h: the files' pixels), and",
        "// the person card's colours (the bubble's inner colour left to right, darkened where white text needs it, and its",
        "// rim's top and bottom tones).",
        "import type { ImageSourcePropType } from 'react-native';",
        '',
        'type Pic = { source: ImageSourcePropType; w: number; h: number };',
        'export type VipLevelArt = { badge: Pic; frame: Pic; bubble: Pic; entry: Pic; card: { inner: readonly [string, string]; rim: readonly [string, string] } };',
        '',
        'export const VIP_LEVEL_ART: Record<number, VipLevelArt> = {',
    ]
    for n, row in app.items():
        pics = ', '.join(f"{k}: {{ source: {req(k, n)}, w: {row[k][0]}, h: {row[k][1]} }}" for k in ('badge', 'frame', 'bubble', 'entry'))
        c = row['card']
        lines.append(f"  {n}: {{ {pics}, card: {{ inner: ['{c['inner'][0]}', '{c['inner'][1]}'], rim: ['{c['rim'][0]}', '{c['rim'][1]}'] }} }},")
    lines += ['};', '']
    with open(TS_OUT, 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n'.join(lines))
    print(json.dumps({'app': {n: r['card'] for n, r in app.items()}, 'server': manifest}, indent=1))


if __name__ == '__main__':
    main()
