# App icon set from the brand logo, run from app/:
#   python3 scripts/app-icons.py [assets/brand/logo.png] [assets]
# logo.png is the owners' mark (two people forming a heart, Nov 2026) lifted off its navy rounded square: a
# transparent PNG whose neon glow is soft alpha, un-blended against NAVY, so on NAVY it looks exactly like the
# original. This writes icon.png (iOS and Expo), the Android adaptive layers (foreground, background, monochrome for
# themed icons), splash-icon.png (+ splash-icon-native.png for the native splash), notification-icon.png and
# favicon.png. app.json already points at these files. Needs Pillow and numpy.
import sys
from PIL import Image, ImageFilter, ImageDraw
import numpy as np

src = sys.argv[1] if len(sys.argv) > 1 else 'assets/brand/logo.png'
out = sys.argv[2] if len(sys.argv) > 2 else 'assets'
# Measured from the owners' logo: the navy under the mark (#010E29, also app.json's splash and adaptive icon colour)
# and the slightly darker navy of the square's corners (#000A21).
NAVY = (1, 14, 41)
NAVY_EDGE = (0, 10, 33)
# In the owners' logo the solid mark spans 0.666 of the rounded square's width.
SHARE = 0.666

sym = Image.open(src).convert('RGBA')
sym = sym.crop(sym.getbbox())
al = np.array(sym)[..., 3]


def fill_holes(m):
    # Everything the outside cannot reach is inside the shape (the heart's translucent centre).
    im = Image.fromarray(np.pad((m * 255).astype(np.uint8), 1)).copy()  # a copy: fromarray's image is read-only
    ImageDraw.floodfill(im, (0, 0), 128)
    return np.array(im)[1:-1, 1:-1] != 128


# The solid shape (heads and heart, not the glow): the glow never reaches 2/3 opacity, the shape does.
solid = fill_holes(al >= 170)
ys, xs = np.nonzero(solid)
sx0, sx1, sy0, sy1 = xs.min(), xs.max(), ys.min(), ys.max()
scx, scy = (sx0 + sx1) / 2, (sy0 + sy1) / 2  # centre of the solid shape; every layout centres on it
solid_w = sx1 - sx0 + 1
rmax = float(np.sqrt((ys - scy) ** 2 + (xs - scx) ** 2).max())  # for Android's safe circle
print('symbol', sym.size, 'solid', solid_w, sy1 - sy0 + 1, 'rmax', round(rmax))


def place(canvas, s, scale, cx=scx, cy=scy):
    # Draw s scaled by `scale` with its point (cx, cy) on the canvas centre (premultiplied, so no dark fringes).
    w, h = round(s.width * scale), round(s.height * scale)
    r = s.convert('RGBa').resize((w, h), Image.LANCZOS).convert('RGBA')
    x = round(canvas.width / 2 - cx * w / s.width)
    y = round(canvas.height / 2 - cy * h / s.height)
    layer = Image.new('RGBA', canvas.size, (0, 0, 0, 0))
    layer.paste(r, (x, y))
    return Image.alpha_composite(canvas, layer)


def save_rgba(im, path):
    # Each colour stored only as precisely as it can show: over any background a colour error e moves the pixel by
    # e * alpha, so the faint glow needs few colour levels (much smaller files, error under one level).
    a = np.array(im.convert('RGBA'))
    al_ = a[..., 3].astype(np.float64)
    step = np.minimum(np.where(al_ > 0, 2 ** np.floor(np.log2(np.maximum(255 / np.maximum(al_, 1) * 1.99, 1))), 1), 64)[..., None]
    a[..., :3] = np.clip(np.round(a[..., :3] / step) * step, 0, 255).astype(np.uint8)
    a[a[..., 3] == 0, :3] = 0
    Image.fromarray(a, 'RGBA').save(path, optimize=True)


def background(n):
    # The logo's square: navy, a touch lighter in the middle, darker towards the corners.
    yy, xx = np.mgrid[0:n, 0:n]
    r = np.sqrt((xx - (n - 1) / 2) ** 2 + (yy - (n - 1) / 2) ** 2) / (n / 2)
    t = np.clip((r - 0.45) / 0.95, 0, 1)
    t = t * t * (3 - 2 * t)
    c = np.array(NAVY, np.float64) * (1 - t[..., None]) + np.array(NAVY_EDGE, np.float64) * t[..., None]
    # Ordered dither keeps the 1–2 level steps of such a dark gradient from banding.
    c += (np.indices((n, n)).sum(0) % 2 - 0.5)[..., None] * 0.5
    return Image.fromarray(np.dstack([np.clip(np.round(c), 0, 255), np.full((n, n), 255)]).astype(np.uint8), 'RGBA')


N = 1024
# iOS / Expo icon: the logo's square, full bleed (the system rounds the corners), the mark at the logo's own share.
k_icon = SHARE * N / solid_w
icon = place(background(N), sym, k_icon)
icon.convert('RGB').save(f'{out}/icon.png', optimize=True)

# Android adaptive: 108 dp canvas, 72 dp visible, the solid shape inside the 66 dp safe circle (radius 0.3056 of the
# side). Same share of the visible 72 dp as the iOS icon, unless the safe circle needs it smaller. The glow is kept:
# it fades out inside the canvas, the launcher's mask is the icon's own edge.
safe_r = N * 33 / 108
visible = N * 72 / 108
k = min(SHARE * visible / solid_w, (safe_r - 2) / rmax)
assert rmax * k <= safe_r, (rmax * k, safe_r)
fg = place(Image.new('RGBA', (N, N), (0, 0, 0, 0)), sym, k)
save_rgba(fg, f'{out}/android-icon-foreground.png')
background(N).convert('RGB').save(f'{out}/android-icon-background.png', optimize=True)

# Themed icon (Android 13+) and notification icon: only alpha counts. A clean silhouette: the two heads as round
# discs and the heart filled, with a thin gap between each head and the heart so the people still read when tinted.
def heads(m):
    # Each half of the shape from the top: the head's width grows to its equator, then shrinks towards the neck where
    # it meets the heart's lobe. Nothing else is beside the head down to its equator, so the widest row there gives
    # the head's centre and radius.
    found = []
    mid = int(round(scx))
    for off, half in ((0, m[:, :mid]), (mid, m[:, mid:])):
        w = half.sum(1).astype(np.float64)
        top = int(np.nonzero(w)[0][0])
        # Walk down until the width has dropped clearly below the head's widest row and then risen again (the lobe).
        i, hi, lo = top, 0.0, None
        while i < len(w):
            hi = max(hi, w[i])
            if w[i] < hi - 10:
                lo = w[i] if lo is None else min(lo, w[i])
                if w[i] > lo + 10:
                    break
            i += 1
        eq = top + int(np.argmax(w[top:i]))
        xs_ = np.nonzero(half[eq])[0]
        r = (xs_.max() - xs_.min() + 1) / 2
        assert abs((eq - top) - r) < 0.15 * r, ('head is not round', eq - top, r)
        found.append((off + xs_.min() + r - 0.5, top + r - 0.5, r))
    print('heads', [tuple(round(v, 1) for v in h) for h in found])
    return found


SS = 4  # supersampling for anti-aliased edges
H, W = solid.shape


def hull(points):
    # Convex hull (monotone chain) of (x, y) points, as a polygon.
    pts = sorted(set(points))
    def half(seq):
        h = []
        for p in seq:
            while len(h) >= 2 and (h[-1][0] - h[-2][0]) * (p[1] - h[-2][1]) - (h[-1][1] - h[-2][1]) * (p[0] - h[-2][0]) <= 0:
                h.pop()
            h.append(p)
        return h
    lower, upper = half(pts), half(reversed(pts))
    return lower[:-1] + upper[:-1]


# The heart below its widest row is convex; the glow flare at the tip leaves a small drip there, so that part is
# replaced by its convex hull (straight sides into a point).
low = solid.copy()
widest = int(np.argmax(solid.sum(1)))
low[:widest] = False
ly, lx = np.nonzero(low)
edge = {}
for y, x in zip(ly, lx):
    a_, b_ = edge.get(y, (x, x))
    edge[y] = (min(a_, x), max(b_, x))
pts = [(x, y) for y, (a_, b_) in edge.items() for x in (a_, b_ + 1)] + [(x, y + 1) for y, (a_, b_) in edge.items() for x in (a_, b_ + 1)]
tip = Image.new('L', (W * SS, H * SS), 0)
ImageDraw.Draw(tip).polygon([(x * SS, y * SS) for x, y in hull(pts)], fill=255)
big = np.array(Image.fromarray((solid * 255).astype(np.uint8)).resize((W * SS, H * SS), Image.BILINEAR)).astype(np.float64)
big = np.maximum(big, np.array(tip))
# Smooth the outline (the ribbons' edges leave small wobbles).
big = np.array(Image.fromarray(big.astype(np.uint8)).filter(ImageFilter.GaussianBlur(3 * SS))) >= 128
yy, xx = np.mgrid[0:H * SS, 0:W * SS]
gap = 0.022 * solid_w * SS
mono_big = big.copy()
for hx, hy, r in heads(solid):
    d = np.sqrt((xx - (hx + 0.5) * SS + 0.5) ** 2 + (yy - (hy + 0.5) * SS + 0.5) ** 2)
    mono_big &= d > (r * SS + gap)  # carve the gap out of the heart
    mono_big |= d <= r * SS         # the head itself, a clean disc
m = Image.fromarray((mono_big * 255).astype(np.uint8)).resize((W, H), Image.BOX)
mono_sym = Image.merge('RGBA', [Image.new('L', (W, H), 255)] * 3 + [m])
mono = place(Image.new('RGBA', (N, N), (0, 0, 0, 0)), mono_sym, k)
save_rgba(mono, f'{out}/android-icon-monochrome.png')
# The notification icon (app.json expo-notifications): the same silhouette filling about 22 of Android's 24 dp, so it
# isn't a speck in the status bar (the themed icon's 108 dp canvas would shrink it to about 11 dp there). 96 px.
NI = 96
nk = (NI * 22 / 24) / max(mono_sym.size)
notif = place(Image.new("RGBA", (NI, NI), (0, 0, 0, 0)), mono_sym, nk, cx=mono_sym.width / 2, cy=mono_sym.height / 2)
save_rgba(notif, f'{out}/notification-icon.png')

# Splash: the mark with its glow on transparent; app.json shows it 200 dp wide on NAVY. Android 12+ shows the image
# inside a circle of 0.48 of its width, so the glow is faded out before that circle instead of being cut by it.
# 800 px: 200 dp at Android's densest screens (xxxhdpi); the logo's whole glow fits the square.
S = 800
splash = place(Image.new('RGBA', (S, S), (0, 0, 0, 0)), sym, S / max(sym.size))
sa = np.array(splash).astype(np.float64)
yy, xx = np.mgrid[0:S, 0:S]
r = np.sqrt((xx - (S - 1) / 2) ** 2 + (yy - (S - 1) / 2) ** 2) / S
t = np.clip((0.475 - r) / 0.045, 0, 1)
sa[..., 3] *= t * t * (3 - 2 * t)
save_rgba(Image.fromarray(np.round(sa).astype(np.uint8), 'RGBA'), f'{out}/splash-icon.png')
# The native splash's own copy (app.json expo-splash-screen): the same picture already laid on NAVY, opaque. Expo's
# build resizes a transparent splash with premultiplied colour (without sharp-cli it uses jimp), which turns a glow and
# glass mark dark; an opaque one on exactly the splash colour goes through untouched and its edge is invisible.
# splash-icon.png stays transparent for the opening animation (components/fx/intro), drawn on the same NAVY.
native = Image.new('RGBA', (S, S), NAVY + (255,))
native.alpha_composite(Image.open(f'{out}/splash-icon.png').convert('RGBA'))
native.convert('RGB').save(f'{out}/splash-icon-native.png', optimize=True)

# Favicon 48 px: the logo itself (the mark on its navy rounded square) reads on light and dark browser tabs alike.
F = 192
fav_bg = background(F)
rr = Image.new('L', (F * 4, F * 4), 0)
ImageDraw.Draw(rr).rounded_rectangle([0, 0, F * 4 - 1, F * 4 - 1], radius=F * 4 * 0.22, fill=255)
fav = place(fav_bg, sym, 0.74 * F / solid_w)
fav.putalpha(rr.resize((F, F), Image.LANCZOS))
fav.convert('RGBa').resize((48, 48), Image.LANCZOS).convert('RGBA').save(f'{out}/favicon.png', optimize=True)
print('icon scale', round(k_icon, 3), 'android scale', round(k, 3), 'solid r in dp', round(rmax * k / N * 108, 1))
