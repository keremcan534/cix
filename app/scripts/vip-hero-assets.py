"""VIP hero ("tabela") backgrounds in each level's badge colour, without the winged ring (the client, 20 Nov 2026:
"the hero's colour must match the VIP badge; the badge goes where the ring is"). The app draws the level's badge
(assets/vip/levels/badge-<n>.webp) on the right of the card itself.

Rerun (from app/; Python 3 with Pillow and numpy; nothing is executed from the inputs):
    git show 940980a:app/assets/vip/hero-1.webp > /tmp/hero-1-design.webp
    python scripts/vip-hero-assets.py /tmp/hero-1-design.webp
  input   the design's VIP 1 hero (804 x 391, purple, with the winged ring on the right half)
  output  app/assets/vip/hero-<n>.webp for n = 1..10, and prints each level's badge colour for src/lib/vip-screen.ts
          BADGE_COLORS

How: the ring sits right of x = 360; the card's left part (border, night sky, gold swirl) is mirrored onto the right,
the gap between eased from one side to the other, so the card keeps its gold border and swirls with an empty night on
the right. Then every pixel that isn't gold is given the hue and depth of the level's badge shield (the saturated,
non-gold pixels in the middle of the badge, their median), keeping its brightness, so glows and stars stay.
"""
import colorsys
import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, '..', 'assets', 'vip')
LEFT = 360  # the ring's left wing starts right of this column in the design's hero


def ringless(src):
    im = np.array(Image.open(src).convert('RGBA')).astype(np.float32)
    h, w, _ = im.shape
    out = np.zeros_like(im)
    out[:, :LEFT] = im[:, :LEFT]
    out[:, w - LEFT:] = im[:, :LEFT][:, ::-1]
    mid = w - 2 * LEFT
    a = im[:, LEFT - mid:LEFT][:, ::-1]  # continues the left part
    b = im[:, LEFT - mid:LEFT]  # continues the mirrored part
    t = np.linspace(0, 1, mid)[None, :, None]
    t = t * t * (3 - 2 * t)
    out[:, LEFT:w - LEFT] = a * (1 - t) + b * t
    return out


def badge_color(n):
    a = np.array(Image.open(os.path.join(ASSETS, 'levels', f'badge-{n}.webp')).convert('RGBA')).astype(np.float64) / 255
    c = a[60:150, 60:132]
    rgb = c[..., :3][c[..., 3] > 0.9]
    hsv = np.array([colorsys.rgb_to_hsv(*p) for p in rgb])
    hue = hsv[:, 0] * 360
    keep = (hsv[:, 1] > 0.5) & (hsv[:, 2] > 0.2) & ~((hue > 25) & (hue < 65))
    return np.median(rgb[keep], 0)


def rgb_to_hsv(x):
    r, g, b = x[..., 0], x[..., 1], x[..., 2]
    mx = x.max(-1)
    mn = x.min(-1)
    d = mx - mn
    h = np.zeros_like(mx)
    m = d > 1e-6
    rr = m & (mx == r)
    gg = m & (mx == g) & ~rr
    bb = m & ~rr & ~gg
    h[rr] = ((g - b)[rr] / d[rr]) % 6
    h[gg] = (b - r)[gg] / d[gg] + 2
    h[bb] = (r - g)[bb] / d[bb] + 4
    h = h / 6
    s = np.where(mx > 1e-6, d / np.maximum(mx, 1e-6), 0)
    return h, s, mx


def hsv_to_rgb(h, s, v):
    i = np.floor(h * 6).astype(int) % 6
    f = h * 6 - np.floor(h * 6)
    p = v * (1 - s)
    q = v * (1 - f * s)
    t = v * (1 - (1 - f) * s)
    out = np.zeros(h.shape + (3,))
    for k, (r, g, b) in enumerate([(v, t, p), (q, v, p), (p, v, t), (p, q, v), (t, p, v), (v, p, q)]):
        m = i == k
        out[m] = np.stack([r[m], g[m], b[m]], -1)
    return out


def recolour(base, color):
    rgb = base[..., :3] / 255
    h, s, v = rgb_to_hsv(rgb)
    th, ts, tv = colorsys.rgb_to_hsv(*color)
    hue = h * 360
    gold = (hue > 18) & (hue < 68) & (s > 0.25)
    # The design's night purple is about s 0.75; the badge's depth takes its place, never quite grey.
    ns = np.clip(s * max(ts, 0.5) / 0.75, 0, 1)
    nh = np.full_like(h, th)
    new = hsv_to_rgb(nh, ns, v)
    out = np.where(gold[..., None], rgb, new)
    return np.concatenate([out * 255, base[..., 3:]], -1)


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    base = ringless(sys.argv[1])
    for n in range(1, 11):
        color = badge_color(n)
        Image.fromarray(np.clip(recolour(base, color), 0, 255).astype(np.uint8)).save(os.path.join(ASSETS, f'hero-{n}.webp'), 'WEBP', quality=88, method=6)
        print(n, '#%02x%02x%02x' % tuple(int(round(x * 255)) for x in color))


if __name__ == '__main__':
    main()
