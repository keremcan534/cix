# Layers for the opening animation (components/fx/intro), cut from the splash mark. Run from app/:
#   python3 scripts/intro-layers.py [preview-dir]
# The opening starts on the native splash's exact picture (assets/splash-icon.png, 200 dp on NAVY) and brings it to
# life, so every layer here is drawn in that same 200 dp box (600 px: 200 dp at 3x) and the layers give the mark back:
#   head-cyan.png and head-coral.png over heart.png      the two people over the heart, each with its own glow
# React Native lays an image over what is below it ("source over"); it does not add them. So a soft cut is not
# "w and 1 - w of the picture": the layers keep each pixel's colour and share out its opacity, so that stacked in the
# order above the light through them multiplies back to the mark's (1 - a = (1 - a_top) * (1 - a_below)). Laid over
# NAVY they match the splash at 3x to within one level of 255 (the script checks it, reading the files back).
# Also written, none of them part of the mark (each is shown at 0 at rest):
#   fill-1.png, fill-2.png, fill-3.png   the heart's glass lit from inside in its own colours (each pixel screened
#                                        with its own hue, the light on the ribbons and the tip, the translucent centre
#                                        left deep), up to 35%, 70% and all of its height from the tip with a soft edge
#                                        (cross-faded in turn: light rising from the tip)
#   heart-ring.png                       a thin bright ring along the heart's two outer edges: a near-white core in
#                                        a soft line of their own colours (it spreads out from the rim on the beat)
#   mark-aura.png                        a soft heart-shaped bloom in the mark's colours
#   shine.png                            a soft glass glint (a broad band with a bright core) to sweep across a head
#   comet-cyan.png, comet-coral.png      a light running along an edge: a head of its own colour (about 5 dp, a
#                                        small white centre) in a halo of it, and a tail pale at the head, then its
#                                        colour, then nothing (28 dp)
#   streak-cyan.png, streak-coral.png    a short tapered streak of the same light, laid on the comet's own path behind
#                                        it, so the trail bends with the rim and reads as one run of light
#   spark.png                            a four-pointed sparkle (white, tinted in the app)
# and src/lib/intro-path.ts (the head circles and their clips, the heart's two outer edges and its tip, the lights'
# paths just outside them, the boxes of the cropped layers, and where the drawn mark sits in this box and in
# assets/brand/logo.png, in dp), and the web's splash: public/index.html shows assets/splash-icon-native.png (the
# native splash's picture) at 200 px in the middle of the navy page while the app loads, as a phone does.
# With a preview-dir it also draws the checks: each recomposition against the splash with its difference, the parts
# moved apart, the paths over the mark, the sprites in use, and writes the mark split into its glass and its glow
# (mark-core.png over mark-glow.png: the aura is made from the glass; the opening itself doesn't use them).
# Needs Pillow and numpy.
import base64
import hashlib
import io
import json
import math
import os
import re
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

SPLASH = 'assets/splash-icon.png'
LOGO = 'assets/brand/logo.png'  # the sign-in screen's logo: the opening's last move lands the mark on it
OUT = 'assets/intro'
PATH_TS = 'src/lib/intro-path.ts'
PREVIEW = sys.argv[1] if len(sys.argv) > 1 else None
NAVY = np.array([1, 14, 41], np.float64) / 255  # app.json expo-splash-screen backgroundColor #010E29
BOX = 200  # dp: app.json expo-splash-screen imageWidth, the box every layer and point here lives in
N = 600  # px per layer side: 200 dp at 3x
SS = 2  # the shapes are measured at twice the layers' resolution
SOLID = 170  # alpha: the glass shape reaches it, its glow never does (as in scripts/app-icons.py)
EDGE_POINTS = 24

os.makedirs(OUT, exist_ok=True)
if PREVIEW:
    os.makedirs(PREVIEW, exist_ok=True)

src = Image.open(SPLASH).convert('RGBA')
S = src.width
assert src.size == (S, S)
src_f = np.array(src).astype(np.float64) / 255
src_alpha = src_f[..., 3]


def resize_f(a, n, filt=Image.LANCZOS):
    """A float image (H, W) or (H, W, C) resized to n x n, channel by channel, without rounding."""
    if a.ndim == 2:
        return np.array(Image.fromarray(a.astype(np.float32), 'F').resize((n, n), filt)).astype(np.float64)
    return np.dstack([resize_f(a[..., c], n, filt) for c in range(a.shape[2])])


def premul(rgba):
    p = rgba.copy()
    p[..., :3] *= p[..., 3:]
    return p


def valid(p):
    """Clamp a premultiplied image to what a pixel can be: 0 <= colour <= alpha <= 1."""
    p = p.copy()
    p[..., 3] = np.clip(p[..., 3], 0, 1)
    p[..., :3] = np.clip(p[..., :3], 0, p[..., 3:])
    return p


# The mark as a 3x screen shows it: the 800 px splash brought to 600 px, premultiplied (so the glow keeps its colour)
# and with a filter that has no negative lobes (Hamming): Lanczos rings at the glass highlights into colours no
# straight-alpha pixel can hold, so neither the layers nor the native splash's own opaque copy could match it.
MARK = valid(resize_f(premul(src_f), N, Image.HAMMING))


def fill_holes(m):
    # Everything the outside cannot reach is inside the shape (the heart's translucent centre).
    im = Image.fromarray(np.pad((m * 255).astype(np.uint8), 1)).copy()
    ImageDraw.floodfill(im, (0, 0), 128)
    return np.array(im)[1:-1, 1:-1] != 128


def to_dp(i, res):
    """Pixel index (centre) on a res x res grid -> dp in the box."""
    return (np.asarray(i, np.float64) + 0.5) * BOX / res


def to_px(dp, res):
    return np.asarray(dp, np.float64) * res / BOX - 0.5


def bilinear(img, x, y):
    """img sampled at fractional pixel indices (x, y), clamped at the border."""
    h, w = img.shape
    x = np.clip(x, 0, w - 1.001)
    y = np.clip(y, 0, h - 1.001)
    x0, y0 = np.floor(x).astype(int), np.floor(y).astype(int)
    fx, fy = x - x0, y - y0
    return (img[y0, x0] * (1 - fx) * (1 - fy) + img[y0, x0 + 1] * fx * (1 - fy)
            + img[y0 + 1, x0] * (1 - fx) * fy + img[y0 + 1, x0 + 1] * fx * fy)


# ---- The shape: the glass mark without its glow, measured at 2x the layers' resolution ----
M = N * SS
alpha_m = resize_f(src_alpha, M, Image.BILINEAR)
solid_m = fill_holes(alpha_m * 255 >= SOLID)
solid_src = fill_holes(src_alpha * 255 >= SOLID)


def fit_circle(px, py):
    # Algebraic least squares: x^2 + y^2 + D x + E y + F = 0.
    A = np.column_stack([px, py, np.ones_like(px)])
    b = -(px ** 2 + py ** 2)
    D, E, F = np.linalg.lstsq(A, b, rcond=None)[0]
    cx, cy = -D / 2, -E / 2
    return cx, cy, math.sqrt(cx * cx + cy * cy - F)


def heads():
    # A first guess as scripts/app-icons.py makes it (each half's widest row above the neck), then a circle fitted to
    # the head's outline where nothing touches it: rays from the centre over its top and sides, each stopping where
    # the alpha drops below SOLID (interpolated between samples, so to a fraction of a pixel).
    found = []
    mid = S // 2
    for off, half in ((0, solid_src[:, :mid]), (mid, solid_src[:, mid:])):
        w = half.sum(1).astype(np.float64)
        top = int(np.nonzero(w)[0][0])
        i, hi, lo = top, 0.0, None
        while i < len(w):
            hi = max(hi, w[i])
            if w[i] < hi - 10:
                lo = w[i] if lo is None else min(lo, w[i])
                if w[i] > lo + 10:
                    break
            i += 1
        eq = top + int(np.argmax(w[top:i]))
        xs = np.nonzero(half[eq])[0]
        r = (xs.max() - xs.min() + 1) / 2
        cx, cy = off + xs.min() + r - 0.5, top + r - 0.5
        for _ in range(3):
            th = np.radians(np.arange(-200, 21, 1.0))  # screen angles, y down: -90 is straight up
            steps = np.arange(0.6 * r, 1.35 * r, 0.05)
            px_, py_ = [], []
            for t in th:
                xs_ = cx + np.cos(t) * steps
                ys_ = cy + np.sin(t) * steps
                v = bilinear(src_alpha * 255, xs_, ys_)
                out = np.nonzero(v < SOLID)[0]
                if not len(out) or out[0] == 0:
                    continue
                j = out[0]
                f = (v[j - 1] - SOLID) / (v[j - 1] - v[j])
                d = steps[j - 1] + f * (steps[j] - steps[j - 1])
                px_.append(cx + np.cos(t) * d)
                py_.append(cy + np.sin(t) * d)
            px_, py_ = np.array(px_), np.array(py_)
            # A ray that slips along the shoulder or a highlight is not the outline: refit without the far misses.
            keep = np.ones(len(px_), bool)
            for _ in range(4):
                cx, cy, r = fit_circle(px_[keep], py_[keep])
                keep = np.abs(np.hypot(px_ - cx, py_ - cy) - r) < 1.5
        px_, py_ = px_[keep], py_[keep]
        res = np.hypot(px_ - cx, py_ - cy) - r
        # The fit is in source pixel indices; the box's dp counts from the pixel's edge, hence the half pixel.
        found.append({'cx': (cx + 0.5) * BOX / S, 'cy': (cy + 0.5) * BOX / S, 'r': r * BOX / S,
                      'residual_px': float(np.abs(res).max())})
    return found


HEADS = heads()
print('heads (dp)', [{k: round(v, 2) for k, v in h.items()} for h in HEADS])


# ---- Distances and soft weights ----
def edt(mask, cap):
    """Euclidean distance in pixels from each pixel to the nearest True pixel of mask, capped at cap."""
    h, w = mask.shape
    idx = np.arange(h, dtype=np.float64)[:, None].repeat(w, 1)
    above = np.maximum.accumulate(np.where(mask, idx, -np.inf), axis=0)
    below = np.minimum.accumulate(np.where(mask, idx, np.inf)[::-1], axis=0)[::-1]
    g2 = np.minimum(np.minimum(idx - above, below - idx), cap + 1) ** 2
    d2 = g2.copy()
    for k in range(1, int(cap) + 1):
        np.minimum(d2[:, k:], g2[:, :-k] + k * k, out=d2[:, k:])
        np.minimum(d2[:, :-k], g2[:, k:] + k * k, out=d2[:, :-k])
    return np.minimum(np.sqrt(d2), cap + 1)


def box_down(a, f=SS):
    """Area average f x f blocks (the 2x analysis grid -> the layers' grid)."""
    h, w = a.shape[:2]
    return a.reshape(h // f, f, w // f, f, *a.shape[2:]).mean(axis=(1, 3))


def blur(a, sigma):
    """Gaussian blur of a float image (H, W[, C]), edges extended."""
    r = int(math.ceil(3 * sigma))
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2)
    k /= k.sum()
    for axis in range(min(a.ndim, 2)):
        pad = [(0, 0)] * a.ndim
        pad[axis] = (r, r)
        p = np.pad(a, pad, mode='edge')
        n = a.shape[axis]
        a = sum(k[i] * np.take(p, np.arange(i, i + n), axis=axis) for i in range(2 * r + 1))
    return a


def screen(*parts):
    """Lights laid over each other: 1 - (1 - a)(1 - b)..."""
    out = np.zeros_like(parts[0])
    for p in parts:
        out = 1 - (1 - out) * (1 - p)
    return out


def g1(x, s):
    return np.exp(-0.5 * (x / s) ** 2)


def ease(x):
    x = np.clip(x, 0, 1)
    return x * x * (3 - 2 * x)


g_m = to_dp(np.arange(M), M)
X, Y = np.meshgrid(g_m, g_m)
CAP_DP = 40  # beyond this the mark's glow is gone (the splash fades it out inside 0.475 of its side)


def head_region(h):
    """The head's disc, cut off where the head rests on its lobe. The circle fitted to the free upper outline reaches
    about 1.4 dp further down than the glass does: the head ends at a thin dark crease (the alpha dips) and the lobe's
    bright rim starts below it. Per column the head ends where the alpha first drops below SOLID going down; where
    head and lobe run together without a dip, the head's lower edge follows the circle raised by the crease's
    measured height (it runs parallel to the circle there)."""
    cut = np.full(M, np.nan)
    cols = np.nonzero(np.abs(g_m - h['cx']) < h['r'])[0]
    bottom = h['cy'] + np.sqrt(np.maximum(h['r'] ** 2 - (g_m - h['cx']) ** 2, 0))
    for j in cols:
        ybot = bottom[j]
        rows = np.nonzero((g_m >= max(h['cy'], ybot - 4)) & (g_m <= ybot + 1.5))[0]
        prof = alpha_m[rows, j] * 255
        if prof[0] < SOLID:
            continue
        drop = np.nonzero(prof < SOLID)[0]
        if len(drop):
            k = drop[0]
            cut[j] = g_m[rows[k - 1]] + (prof[k - 1] - SOLID) / (prof[k - 1] - prof[k]) * (g_m[1] - g_m[0])
    found = ~np.isnan(cut[cols])
    near = found & (np.abs(g_m[cols] - h['cx']) < 0.6 * h['r'])
    lift = float(np.median(bottom[cols][near] - cut[cols][near]))
    h['lift_dp'] = lift
    cut[cols] = np.where(found, cut[cols], bottom[cols] - lift)
    cut[cols] = blur(cut[cols], 1.5 * M / BOX)  # the crossings carry the pixel steps of the source
    cut[np.isnan(cut)] = -np.inf
    return (np.hypot(X - h['cx'], Y - h['cy']) <= h['r']) & (Y <= cut[None, :])


head_m = [head_region(h) for h in HEADS]
head_d = [edt(m, CAP_DP * M / BOX) * BOX / M for m in head_m]
# The heart: the shape without the two heads. The heads are not perfect circles (see residual_px), so a hair of a
# head's rim can stick out of its disc: an opening (shrink 2 px, keep what is joined to the heart's centre, grow back)
# leaves those to the head.
heart_m = solid_m & ~head_m[0] & ~head_m[1]
seed = (int(round(to_px(100, M))), int(round(to_px(125, M))))
im = Image.fromarray(heart_m.astype(np.uint8) * 255).filter(ImageFilter.MinFilter(5))
assert im.getpixel(seed) == 255, 'the heart centre is not inside the shape'
ImageDraw.floodfill(im, seed, 128)
core_heart = Image.fromarray((np.array(im) == 128).astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(5))
heart_m &= np.array(core_heart) > 0
heart_d = edt(heart_m, CAP_DP * M / BOX) * BOX / M

# Each pixel belongs to whichever of the three it is nearest (so a head's glow goes with the head), with a soft cut:
# a soft-min over the distances, much wider out in the glow, so where a head's glow and the heart's meet they share
# it and a moved head leaves no dark gap and no hard edge, but crisp (a pixel) inside the glass where a head rests on
# its lobe. There the picture is nearly opaque, and under a nearly opaque top a layer must make up whatever little
# opacity the top leaves out: a soft cut there would fill the heart layer, under the head's rim, with a band of that rim.
d = np.stack([head_d[0], head_d[1], heart_d])
dmin = d.min(0)
tau = 0.08 + 0.8 * dmin
e = np.exp(-(d - dmin) / tau)
W_PARTS = [box_down(x) for x in e / e.sum(0)]  # cyan head, coral head, heart
far = box_down(dmin) > CAP_DP - 1
print('pixels past the distance cap with any alpha', int((far & (MARK[..., 3] > 0.5 / 255)).sum()))
# The glass shape and its outer glow. The cut is not on the glass's edge but a little outside it, ramping from 0.25 to
# 0.75 dp out, where the glow is about half opaque: on the nearly opaque rim, the glow under a partly covering core
# pixel would have to be nearly opaque itself, and drawn at another density than 3x (each layer resampled on its
# own) that would show as a bright hairline around the mark. So the core keeps the first breath of its glow.
out_d = edt(solid_m, 2 * M / BOX) * BOX / M
W_CORE = box_down(np.clip(1 - (out_d - 0.25) / 0.5, 0, 1))


# ---- Splitting the mark into layers ----
def to8(p):
    """A premultiplied float layer -> 8-bit straight RGBA. Each colour is kept only as precisely as it can show: over
    any background a colour error e moves the pixel by e * alpha, so a faint pixel needs few colour levels (much
    smaller files; the error stays under half a level)."""
    a = np.round(np.clip(p[..., 3], 0, 1) * 255)
    rgb = p[..., :3] / np.maximum(p[..., 3:], 1e-12) * 255
    step = np.minimum(np.where(a > 0, 2 ** np.floor(np.log2(255 / np.maximum(a, 1))), 1), 64)[..., None]
    rgb = np.clip(np.round(rgb / step) * step, 0, 255)
    rgb[a == 0] = 0
    return np.dstack([rgb, a]).astype(np.uint8)


def from8(q):
    return premul(q.astype(np.float64) / 255)


def split(target, weights):
    """Layers, top first, that laid over each other (source over) give target. Each layer keeps the target's colour and
    takes its weight's share of the opacity still needed under the layers above it; the bottom one takes the rest.
    What is still needed is worked out from the rounded layer above where that layer lets at least half the light
    through, so the rounding is absorbed below; under a nearly opaque pixel it would be multiplied up into visible
    specks in a layer that may be shown alone, so there the exact value is used (the error stays under a level)."""
    rem = target
    left = np.ones(target.shape[:2])
    layers = []
    for i, w in enumerate(weights):
        last = i == len(weights) - 1
        share = np.ones_like(w) if last else np.clip(w / np.maximum(left, 1e-12), 0, 1)
        exact = rem * share[..., None]
        q = to8(exact)
        layers.append(q)
        if last:
            break
        t = 1 - exact[..., 3:]
        k = np.clip((t - 0.25) / 0.25, 0, 1)
        f = exact + k * (from8(q) - exact)
        t = 1 - f[..., 3:]
        rem = valid(np.where(t > 1 / 512, (rem - f) / np.maximum(t, 1 / 512), 0))
        left = left - w
    return layers


def over(layers, bg=NAVY):
    """Layers (bottom first, 8-bit straight RGBA) laid over an opaque colour, as float RGB."""
    out = np.broadcast_to(bg, layers[0].shape[:2] + (3,)).astype(np.float64)
    for q in layers:
        f = from8(q)
        out = f[..., :3] + (1 - f[..., 3:]) * out
    return out


def save(q, name):
    path = f'{OUT}/{name}'
    Image.fromarray(q, 'RGBA').save(path, optimize=True)
    return path


core, glow = split(MARK, [W_CORE, 1 - W_CORE])
cyan, coral, heart = split(MARK, W_PARTS)
files = {name: save(q, name) for name, q in (('head-cyan.png', cyan), ('head-coral.png', coral), ('heart.png', heart))}
# The glass and its glow are not part of the opening (only the aura is made from the glass): previews only.
SPLIT_ONLY = {'mark-core.png': core, 'mark-glow.png': glow}
if PREVIEW:
    for name, q in SPLIT_ONLY.items():
        Image.fromarray(q, 'RGBA').save(f'{PREVIEW}/{name}', optimize=True)

# The heart lit from inside, for the opening's rising light (shown over heart.png, under the heads), only inside the
# glass (the heart's solid region, heads off, with a 1 dp soft edge: none of its glow). Light in coloured glass keeps
# its colour: each pixel is what the heart shows over the navy screened with its own hue (that colour at full
# brightness), so the cyan glows cyan and the coral coral, never milky. The light sits on the ribbons and the tip (the
# opaque glass: the heart's opacity from FILL_CLEAR up to FILL_OPAQUE); the translucent purple-blue centre between
# them takes FILL_FLOOR of it, so it stays deep. The app shows a stage at FILL_PEAK at most (lib/intro-timeline), so
# the screen sees heart + opacity * a * (lit - heart). Cut to the heart's box (whole dp, so it stays on the 3x grid).
FILL_CLEAR, FILL_OPAQUE, FILL_FLOOR = 0.66, 0.92, 0.12
FILL_PEAK = 0.55  # lib/intro-timeline FILL_PEAK, for the previews
in_px = edt(~heart_m, 4 * M / BOX)
out_px = edt(heart_m, 4 * M / BOX)
signed_dp = (np.where(heart_m, -(in_px - 0.5), out_px - 0.5)) * BOX / M  # distance to the glass's edge, + outside
W_LIT = box_down(np.clip(0.5 - signed_dp, 0, 1))
heart_f = heart.astype(np.float64) / 255
heart_shown = heart_f[..., :3] * heart_f[..., 3:] + (1 - heart_f[..., 3:]) * NAVY
heart_hue = heart_shown / np.maximum(heart_shown.max(-1, keepdims=True), 1e-6)
lit_rgb = screen(heart_shown, heart_hue)
lit_on = ease((heart_f[..., 3] - FILL_CLEAR) / (FILL_OPAQUE - FILL_CLEAR))
lit_a = W_LIT * (FILL_FLOOR + (1 - FILL_FLOOR) * lit_on)
lit = np.dstack([lit_rgb * lit_a[..., None], lit_a])  # premultiplied


def dp_box(mask, res, margin):
    """The whole-dp box around a mask on a res x res grid, grown by margin dp: left, top, width, height."""
    ys_, xs_ = np.nonzero(mask)
    x0 = math.floor(xs_.min() * BOX / res - margin)
    y0 = math.floor(ys_.min() * BOX / res - margin)
    x1 = math.ceil((xs_.max() + 1) * BOX / res + margin)
    y1 = math.ceil((ys_.max() + 1) * BOX / res + margin)
    return {'left': max(x0, 0), 'top': max(y0, 0), 'width': min(x1, BOX) - max(x0, 0), 'height': min(y1, BOX) - max(y0, 0)}


def crop(p, b):
    k = N // BOX
    return p[b['top'] * k:(b['top'] + b['height']) * k, b['left'] * k:(b['left'] + b['width']) * k]


FILL_BOX = dp_box(heart_f[..., 3] * W_LIT > 0.5 / 255, N, 1)
# The light rises from the tip: lit up to an edge FILL_FEATHER dp soft, at FILL_STAGES of the heart's height. The edge
# is a wide arc around the tip (distances across count 1 / FILL_WIDE), not a straight line: nothing in the glass is.
FILL_STAGES = (0.35, 0.70, 1.0)
FILL_FEATHER = 25
FILL_WIDE = 1.35
g_n = to_dp(np.arange(N), N)
XN, YN = np.meshgrid(g_n, g_n)
heart_rows = np.nonzero(heart_m.any(1))[0]
heart_top = float(to_dp(heart_rows[0], M))
# The glass's lowest point (TIP, measured on the outline below, is the same point).
tip_xy = (float(to_dp(np.nonzero(heart_m[heart_rows[-1]])[0].mean(), M)), float(to_dp(heart_rows[-1], M)))
heart_h = tip_xy[1] - heart_top
reach = np.hypot((XN - tip_xy[0]) / FILL_WIDE, YN - tip_xy[1])
fill_report = []
for i, frac in enumerate(FILL_STAGES, 1):
    if frac >= 1:
        w = np.ones_like(reach)
    else:
        w = 1 - ease((reach - (frac * heart_h - FILL_FEATHER / 2)) / FILL_FEATHER)
    files[f'fill-{i}.png'] = save(to8(crop(valid(lit * w[..., None]), FILL_BOX)), f'fill-{i}.png')
    fill_report.append({'stage': frac, 'edge_dp_above_tip': frac * heart_h})


# ---- Checks: read the files back, lay them over NAVY, compare with the splash at 3x ----
def read8(path):
    return np.array(Image.open(path).convert('RGBA'))


ref = np.round((MARK[..., :3] + (1 - MARK[..., 3:]) * NAVY) * 255)
native = Image.open('assets/splash-icon-native.png').convert('RGB')
ref_native = np.round(np.clip(resize_f(np.array(native).astype(np.float64) / 255, N, Image.HAMMING), 0, 1) * 255)
report = {'heads_dp': HEADS, 'weights_sum_max_error': float(np.abs(sum(W_PARTS) - 1).max())}


def layer8(n):
    """A layer as written (read back from its file), or as it would be (the previews-only split)."""
    return SPLIT_ONLY[n] if n in SPLIT_ONLY else read8(files[n])


def check(name, bottom_first):
    rec = np.round(over([layer8(n) for n in bottom_first]) * 255)
    diff = np.abs(rec - ref).max(-1)
    diff_n = np.abs(rec - ref_native).max(-1)
    # The opacity alone: 1 - prod(1 - a_i) against the mark's alpha.
    a = 1 - np.prod([1 - layer8(n)[..., 3] / 255 for n in bottom_first], axis=0)
    r = {'max': int(diff.max()), 'mean': round(float(diff.mean()), 4), 'pixels_over_1': int((diff > 1).sum()),
         'pixels_over_0': int((diff > 0).sum()), 'max_vs_native_file': int(diff_n.max()),
         'mean_vs_native_file': round(float(diff_n.mean()), 4),
         'alpha_max_error_levels': round(float(np.abs(a - MARK[..., 3]).max() * 255), 3)}
    report[name] = r
    print(name, r)
    return rec, diff


rec_cg, diff_cg = check('core+glow', ['mark-glow.png', 'mark-core.png'])
rec_parts, diff_parts = check('heads+heart', ['heart.png', 'head-coral.png', 'head-cyan.png'])
for n, p in files.items():
    print(n, os.path.getsize(p), 'bytes')


# ---- Sprites, drawn in dp offsets from their centre (v down) at 3x ----
def sprite_rgba(w_dp, h_dp, fn, name):
    """A sprite w x h dp at 3x; fn(u, v) gives premultiplied RGBA (H, W, 4) for dp offsets from the sprite's centre."""
    w, h = round(w_dp * 3), round(h_dp * 3)
    u = (np.arange(w) + 0.5) / 3 - w_dp / 2
    v = (np.arange(h) + 0.5) / 3 - h_dp / 2
    U, V = np.meshgrid(u, v)
    q = to8(valid(fn(U, V)))
    files[name] = save(q, name)
    return q


def light(a, rgb):
    """A light of one colour (0..1) with opacity a, premultiplied."""
    return np.dstack([a[..., None] * np.asarray(rgb, np.float64), a])


def stack(*layers):
    """Premultiplied layers, bottom first, laid over each other (source over)."""
    out = np.zeros_like(layers[0])
    for p in layers:
        out = p + (1 - p[..., 3:]) * out
    return out


def sprite(w_dp, h_dp, alpha_fn, name):
    """A white sprite (the app tints it with Image tintColor); alpha_fn(u, v) gets dp offsets from its centre."""
    return sprite_rgba(w_dp, h_dp, lambda u, v: light(np.clip(alpha_fn(u, v), 0, 1), (1, 1, 1)), name)


# A glass glint: a broad soft band (about 14 dp across) with a brighter core of 3-4 dp, bowed a little like a light
# reflected on a sphere, upright (the app turns it about 20 degrees) and fading out at both ends. White: the app shows
# it at 0.45 at most. 44 x 72 dp: tall enough to cross a head (about 43 dp wide) at an angle inside its round clip.
SHINE = (44, 72)
SHINE_BOW = 3  # dp: the band's middle is this far ahead of its ends


def shine_alpha(u, v):
    w = u - SHINE_BOW * (1 - (v / (SHINE[1] / 2)) ** 2)
    return screen(0.5 * g1(w, 6.0), 0.95 * g1(w, 1.5)) * ease((SHINE[1] / 2 - np.abs(v)) / (0.22 * SHINE[1]))


shine = sprite(*SHINE, shine_alpha, 'shine.png')
# A comet heading right (+x): its head is the sprite's centre, so turning the sprite about its centre turns it about
# the head. A head of its own colour, about COMET_CORE dp across (its light at half strength there), with a small
# white centre (about 1.4 dp), in a halo of the colour: it reads as that person's light, not as a white spark. And a
# tail of COMET_TAIL dp: a thread pale at the head that turns to the colour by 40% of its length, in a glow of the
# colour, both gone by its end. Most of it is in its first half, so on the lobe's curve (about 30 dp across) the
# straight tail stays on the path; the streaks (below) carry the rest of the trail around the bend. 64 x 14 dp (the
# head at the centre), one file per colour (a tint would turn the white centre into the colour too).
COMET = (64, 14)
COMET_TAIL = 28
COMET_CORE = 5
COMET_TINTS = {'comet-cyan.png': (60, 238, 255), 'comet-coral.png': (255, 104, 138)}


def comet_rgba(tint):
    t_ = np.asarray(tint, np.float64) / 255
    core_rgb = t_ + 0.12 * (1 - t_)  # the colour, a touch lit
    pale = t_ + 0.55 * (1 - t_)
    core_sigma = COMET_CORE / 2 / math.sqrt(2 * math.log(2))  # half strength at COMET_CORE / 2 from the centre

    def fn(u, v):
        t = np.clip(-u / COMET_TAIL, 0, 1)
        behind = u < 0
        glow = np.where(behind, 0.7 * (1 - t) ** 1.8 * g1(v, 1.7 * (1 - 0.45 * t)), 0)
        thread = np.where(behind, 0.95 * (1 - t) ** 2.2 * g1(v, 0.6 * (1 - 0.4 * t)), 0)
        paleness = (1 - ease(t / 0.4))[..., None]
        thread_rgb = paleness * pale + (1 - paleness) * t_
        r = np.hypot(u, v)
        return stack(light(glow, t_), light(0.6 * g1(r, 3.0), t_), light(thread, thread_rgb),
                     light(0.95 * g1(r, core_sigma), core_rgb), light(0.8 * g1(r, 0.55), (1, 1, 1)))
    return fn


comets = {name: sprite_rgba(*COMET, comet_rgba(tint), name) for name, tint in COMET_TINTS.items()}
# The head is that colour, not white: inside COMET_CORE / 2 of its centre, outside its small white middle (beyond
# 1 dp), each pixel's hue is the tint's (its channels in the tint's order, its weakest channel well under its strongest).
for name, tint in COMET_TINTS.items():
    q_ = comets[name].astype(np.float64)
    hh, ww = q_.shape[:2]
    yy_, xx_ = np.mgrid[0:hh, 0:ww]
    r_ = np.hypot((xx_ + 0.5) / 3 - COMET[0] / 2, (yy_ + 0.5) / 3 - COMET[1] / 2)
    ring_ = (r_ > 1.0) & (r_ < COMET_CORE / 2)
    rgb_ = q_[ring_][:, :3]
    order = np.argsort(tint)
    assert (rgb_[:, order[0]] <= rgb_[:, order[2]] - 40).all(), f'{name}: the head is near-white'
    assert (q_[ring_][:, 3] > 120).all(), f'{name}: the head is faint'
    print(name, 'head: weakest channel at most', int(rgb_[:, order[0]].max()), 'strongest at least', int(rgb_[:, order[2]].min()))
# A streak of the same light, heading right (+x), centred: tapered to a point at both ends and fullest a little ahead
# of its middle, a pale core in a glow of its colour. The app lays two behind each comet on the comet's own path (a few
# ms behind it, each turned to the path there), so the trail bends with the rim and reads as one run of light.
STREAK = (18, 8)


def streak_rgba(tint):
    t_ = np.asarray(tint, np.float64) / 255
    pale = t_ + 0.6 * (1 - t_)

    def fn(u, v):
        s_ = np.clip(u / STREAK[0] + 0.5, 0, 1)
        along = np.sin(np.pi * s_ ** 1.4) ** 1.2
        return stack(light(0.6 * along * g1(v, 1.5), t_), light(0.9 * along * g1(v, 0.55), pale))
    return fn


streaks = {name.replace('comet', 'streak'): sprite_rgba(*STREAK, streak_rgba(tint), name.replace('comet', 'streak'))
           for name, tint in COMET_TINTS.items()}
# A four-pointed sparkle with a soft core and short diagonal glints, 32 x 32 dp.
SPARK = 32


def spark_alpha(u, v):
    r = np.hypot(u, v)
    ray = lambda along, across, length, peak: peak * g1(across, 0.45) * np.clip(1 - np.abs(along) / length, 0, 1) ** 2.2
    d1, d2 = (u + v) / math.sqrt(2), (u - v) / math.sqrt(2)
    return screen(g1(r, 1.0), 0.35 * g1(r, 3.5), ray(u, v, 15, 1), ray(v, u, 15, 1), ray(d1, d2, 8, 0.45),
                  ray(d2, d1, 8, 0.45))


spark = sprite(SPARK, SPARK, spark_alpha, 'spark.png')

# A soft bloom in the mark's own colours and shape (the glass shape blurred, a little stronger), at 300 px: it is all
# blur, so half the resolution loses nothing. Not part of the mark: shown at 0 at rest, for a beat or a flare.
AN = N // 2
core_f = from8(core)
aura_p = blur(resize_f(core_f, AN, Image.BOX), 5 * AN / BOX)
aura_a = np.clip(aura_p[..., 3] * 1.5, 0, 1)
aura_rgb = aura_p[..., :3] / np.maximum(aura_p[..., 3:], 1e-9)
aura_q = to8(np.dstack([aura_rgb * aura_a[..., None], aura_a]))
files['mark-aura.png'] = save(aura_q, 'mark-aura.png')


# ---- Paths: the heart's outer edges, from each head down to the tip ----
def contours(f, level):
    """Marching squares: the level lines of f as polylines of (x, y) pixel indices (closed ones repeat their start)."""
    f = np.pad(f, 1, constant_values=min(f.min(), level) - 1)
    b = f >= level
    case = b[:-1, :-1] * 1 + b[:-1, 1:] * 2 + b[1:, 1:] * 4 + b[1:, :-1] * 8
    links = {}

    def key(side, i, j):
        return {'t': (0, i, j), 'b': (0, i + 1, j), 'l': (1, i, j), 'r': (1, i, j + 1)}[side]

    table = {1: ['lt'], 2: ['tr'], 3: ['lr'], 4: ['rb'], 6: ['tb'], 7: ['lb'], 8: ['bl'], 9: ['tb'], 11: ['rb'],
             12: ['lr'], 13: ['tr'], 14: ['lt']}
    for i, j in zip(*np.nonzero((case > 0) & (case < 15))):
        c = int(case[i, j])
        if c in (5, 10):
            centre = f[i:i + 2, j:j + 2].mean() >= level
            segs = (['tr', 'bl'] if centre else ['lt', 'rb']) if c == 5 else (['lt', 'rb'] if centre else ['tr', 'bl'])
        else:
            segs = table[c]
        for s_ in segs:
            a_, b_ = key(s_[0], i, j), key(s_[1], i, j)
            links.setdefault(a_, []).append(b_)
            links.setdefault(b_, []).append(a_)

    def point(k):
        kind, i, j = k
        if kind == 0:
            a_, c_ = f[i, j], f[i, j + 1]
            return (j + (level - a_) / (c_ - a_) - 1, i - 1)
        a_, c_ = f[i, j], f[i + 1, j]
        return (j - 1, i + (level - a_) / (c_ - a_) - 1)

    seen, lines = set(), []
    for start in links:
        if start in seen:
            continue
        line, prev, cur = [start], None, start
        seen.add(start)
        while True:
            nxt = [n for n in links[cur] if n != prev]
            if not nxt:
                break
            prev, cur = cur, nxt[0]
            line.append(cur)
            if cur in seen:
                break
            seen.add(cur)
        lines.append(np.array([point(k) for k in line]))
    return lines


def resample(pts, n):
    """n points evenly spaced by arc length along a polyline (ends included)."""
    seg = np.hypot(*np.diff(pts, axis=0).T)
    s = np.concatenate([[0], np.cumsum(seg)])
    at_ = np.linspace(0, s[-1], n)
    return np.column_stack([np.interp(at_, s, pts[:, 0]), np.interp(at_, s, pts[:, 1])]), s[-1]


# The heart's outline (heads taken off) on the 2x grid, smoothed a little, in dp.
outline = max(contours(blur(heart_m.astype(np.float64), 1.0), 0.5), key=len)
outline = (outline + 0.5) * BOX / M
# The tip: the outline's lowest point (the glow flares a little there, so its last stretch is drawn as a straight
# line into the point).
TIP = outline[np.argmax(outline[:, 1])]
print('tip (dp)', TIP.round(2))


def headings(dense, length, keep_from):
    """Direction of travel in degrees (0 = right, 90 = down) along a polyline evenly spaced by arc length, over about
    1.5 dp either side so the outline's pixel steps don't show, unwrapped so it can be interpolated, and kept near
    0..180 rather than near -180. From arc length keep_from on, it keeps the heading it has there."""
    k = max(1, round(1.5 / (length / (len(dense) - 1))))
    ix = np.arange(len(dense))
    d = dense[np.minimum(ix + k, len(dense) - 1)] - dense[np.maximum(ix - k, 0)]
    ang = np.degrees(np.unwrap(np.arctan2(d[:, 1], d[:, 0])))
    j = int(np.searchsorted(np.linspace(0, length, len(dense)), keep_from))
    ang[j:] = ang[j]
    ang -= 360 * round(float(ang.mean()) / 360)
    return ang


def edge(hi, outward):
    """From where head hi and the heart part on the head's outer side, over the lobe and down to the tip."""
    gap = bilinear(head_d[hi], to_px(outline[:, 0], M), to_px(outline[:, 1], M))
    n = len(outline) - 1  # closed: the last point repeats the first
    i = int(np.argmin(gap))
    step = 1 if (outline[(i + 10) % n, 0] - outline[i, 0]) * outward > 0 else -1
    # Along the stretch where the lobe runs against the head, out to where they part (the neck's outer corner).
    while gap[(i + step) % n] < 0.5:
        i += step
    start_gap = float(gap[i % n])
    pts = []
    while True:
        p = outline[i % n]
        if p[1] > TIP[1] - 2.5:  # the glow blunts the very tip: the last stretch is a straight line into it
            break
        pts.append(p)
        i += step
        assert len(pts) < n, 'the edge never reached the tip'
    pts = np.array(pts + [TIP])
    dense, length = resample(pts, 401)
    # On the straight line into the blunt tip a sprite keeps the side's own heading instead of turning at the last
    # moment.
    s_cut = length - float(np.hypot(*(TIP - pts[-2])))
    ang = headings(dense, length, s_cut - 1.5)
    pick = np.linspace(0, len(dense) - 1, EDGE_POINTS).round().astype(int)
    out, _ = resample(pts, EDGE_POINTS)
    return {'points': out, 'angle': ang[pick], 'length': length, 'gap_dp': start_gap, 'dense': dense,
            'outward': outward}


EDGE_LEFT = edge(0, -1)
EDGE_RIGHT = edge(1, 1)
for nm, e_ in (('left', EDGE_LEFT), ('right', EDGE_RIGHT)):
    print(nm, 'from', e_['points'][0].round(2), 'length', round(e_['length'], 1), 'gap to head', round(e_['gap_dp'], 2))

# ---- The lights' paths: each edge moved COMET_OFFSET dp out, onto the rim's own glow ----
# A light on the glass itself is lost in the rim's neon; much further out it floats beside the heart, a spark with a
# dark gap between it and the glass. About 1 dp out its head rides the rim's glow: on it, touching the glass, its
# coloured halo spilling onto the navy. At both ends the offset eases back to nothing over COMET_TAPER dp of the
# edge, so the light still sets off at its head's neck and meets the other one on the tip.
COMET_OFFSET = 1.0
COMET_TAPER = 14
# Along the middle of its path the mark's opacity under the head stays between these (of 255): on the rim's glow,
# never out on the bare navy (a gap) and never on the glass (SOLID).
COMET_ON_GLOW = 60


def comet_path(e_):
    dense, length = e_['dense'], e_['length']
    n_ = len(dense)
    s_ = np.linspace(0, length, n_)
    k = max(1, round(1.5 / (length / (n_ - 1))))
    ix = np.arange(n_)
    d = dense[np.minimum(ix + k, n_ - 1)] - dense[np.maximum(ix - k, 0)]
    d /= np.hypot(d[:, 0], d[:, 1])[:, None]
    normal = e_['outward'] * np.column_stack([d[:, 1], -d[:, 0]])  # the left edge runs anticlockwise, the right clockwise
    off = COMET_OFFSET * ease(s_ / COMET_TAPER) * ease((length - s_) / COMET_TAPER)
    moved = dense + normal * off[:, None]
    fine, length_ = resample(moved, n_)
    ang = headings(fine, length_, length_ - 1.5)
    pick = np.linspace(0, n_ - 1, EDGE_POINTS).round().astype(int)
    out, _ = resample(moved, EDGE_POINTS)
    out[0], out[-1] = dense[0], dense[-1]
    # On the rim's glow: the alpha along its middle (the dense path, not only the 24 points) is under the glass's
    # level (SOLID) and over the bare navy's.
    mid = fine[(np.linspace(0, length_, n_) > COMET_TAPER) & (np.linspace(0, length_, n_) < length_ - COMET_TAPER)]
    a_ = bilinear(alpha_m * 255, to_px(mid[:, 0], M), to_px(mid[:, 1], M))
    return {'points': out, 'angle': ang[pick], 'length': length_, 'dense': fine, 'alpha_max': float(a_.max()),
            'alpha_min': float(a_.min())}


COMET_LEFT = comet_path(EDGE_LEFT)
COMET_RIGHT = comet_path(EDGE_RIGHT)
for nm, c_ in (('left', COMET_LEFT), ('right', COMET_RIGHT)):
    print('comet', nm, 'length', round(c_['length'], 1), 'alpha under its middle', round(c_['alpha_min'], 1), '..',
          round(c_['alpha_max'], 1))
    assert c_['alpha_max'] < SOLID, 'a light runs on the glass'
    assert c_['alpha_min'] > COMET_ON_GLOW, 'a light runs off the rim, on the bare navy'



# ---- The ring: a thin bright line along the heart's two outer edges, in the mark's own colours there ----
# Spread out from the rim on the beat (the app scales it about its box's centre). It starts soft at each neck corner,
# so its ends never draw a line into a head. A thin near-white core (about 1.2 dp) in a soft line of about 5 dp of
# the edge's own colour: once it is a few dp off the rim it reads as a ripple of light, not as more of the rim's glow.
RING_MARGIN = 8
ring_pts = np.concatenate([EDGE_LEFT['dense'], EDGE_RIGHT['dense']])
ring_s = np.concatenate([np.linspace(0, 1, len(e_['dense'])) for e_ in (EDGE_LEFT, EDGE_RIGHT)])
RING_BOX = {'left': math.floor(ring_pts[:, 0].min() - RING_MARGIN), 'top': math.floor(ring_pts[:, 1].min() - RING_MARGIN)}
RING_BOX['width'] = math.ceil(ring_pts[:, 0].max() + RING_MARGIN) - RING_BOX['left']
RING_BOX['height'] = math.ceil(ring_pts[:, 1].max() + RING_MARGIN) - RING_BOX['top']
rx = RING_BOX['left'] + (np.arange(RING_BOX['width'] * 3) + 0.5) / 3
ry = RING_BOX['top'] + (np.arange(RING_BOX['height'] * 3) + 0.5) / 3
RX, RY = np.meshgrid(rx, ry)
ring_d = np.full(RX.shape, np.inf)
ring_at = np.zeros(RX.shape)
for k0 in range(0, len(ring_pts), 64):
    chunk = ring_pts[k0:k0 + 64]
    dd = np.hypot(RX[..., None] - chunk[:, 0], RY[..., None] - chunk[:, 1])
    j = dd.argmin(-1)
    dmin_ = np.take_along_axis(dd, j[..., None], -1)[..., 0]
    closer = dmin_ < ring_d
    ring_d = np.where(closer, dmin_, ring_d)
    ring_at = np.where(closer, ring_s[k0 + j], ring_at)
ring_w = ease(ring_at / 0.16)
# The mark's colour near each point: its premultiplied picture blurred about 3 dp, divided by its blurred opacity.
mark_soft = blur(MARK, 3 * N / BOX)
mark_rgb = mark_soft[..., :3] / np.maximum(mark_soft[..., 3:], 1e-6)
ring_rgb = np.dstack([bilinear(mark_rgb[..., c], to_px(RX, N), to_px(RY, N)) for c in range(3)]).clip(0, 1)
ring_p = stack(light(0.22 * ring_w * g1(ring_d, 3.0), ring_rgb),
               light(0.6 * ring_w * g1(ring_d, 1.3), ring_rgb + 0.15 * (1 - ring_rgb)),
               light(ring_w * g1(ring_d, 0.5), ring_rgb + 0.75 * (1 - ring_rgb)))
files['heart-ring.png'] = save(to8(valid(ring_p)), 'heart-ring.png')


# ---- Where the drawn mark sits: in this box, and in the sign-in screen's logo (the opening lands on it) ----
def shape_of(alpha, side):
    """The glass shape's box (alpha >= SOLID, holes filled): its centre and width, in units of side per image side."""
    ys_, xs_ = np.nonzero(fill_holes(alpha * 255 >= SOLID))
    n = alpha.shape[0]
    x0, x1, y0, y1 = xs_.min() / n, (xs_.max() + 1) / n, ys_.min() / n, (ys_.max() + 1) / n
    return {'cx': (x0 + x1) / 2 * side, 'cy': (y0 + y1) / 2 * side, 'width': (x1 - x0) * side, 'height': (y1 - y0) * side}


MARK_SHAPE = shape_of(src_alpha, BOX)
logo_img = Image.open(LOGO).convert('RGBA')
assert logo_img.width == logo_img.height
LOGO_MARK = shape_of(np.array(logo_img).astype(np.float64)[..., 3] / 255, 1)
# The logo is the same drawing as the splash, framed differently: the same shape, so one scale fits both ways.
assert abs(MARK_SHAPE['width'] / MARK_SHAPE['height'] - LOGO_MARK['width'] / LOGO_MARK['height']) < 0.01
print('mark shape (dp)', {k: round(v, 2) for k, v in MARK_SHAPE.items()}, 'logo mark (side)', {k: round(v, 4) for k, v in LOGO_MARK.items()})


# ---- src/lib/intro-path.ts ----
def num(v):
    return f'{v:.1f}'.rstrip('0').rstrip('.') if abs(v - round(v)) > 1e-9 else str(int(round(v)))


def arr(vs, key):
    """A number list for the edge object, on one line if it fits in 120 columns, else wrapped like prettier would."""
    items = [num(float(v)) for v in vs]
    one = f"  {key}: [{', '.join(items)}],"
    if len(one) <= 120:
        return one
    lines, cur = [], ''
    for it in items:
        nxt = f'{cur} {it},' if cur else f'{it},'
        if len(nxt) + 4 > 120:
            lines.append(cur)
            nxt = f'{it},'
        cur = nxt
    lines.append(cur)
    return f'  {key}: [\n' + '\n'.join('    ' + ln for ln in lines) + '\n  ],'


def circle(h, lift=0.0):
    return f"{{ cx: {num(h['cx'])}, cy: {num(h['cy'] - lift / 2)}, r: {num(h['r'] - lift / 2)} }}"


def box_ts(b):
    return f"{{ left: {b['left']}, top: {b['top']}, width: {b['width']}, height: {b['height']} }}"


def shape_ts(sh, digits):
    def fmt(v):
        t = f'{v:.{digits}f}'.rstrip('0').rstrip('.')
        return t if t not in ('', '-0') else '0'
    return '{ ' + ', '.join(f'{k}: {fmt(sh[k])}' for k in ('cx', 'cy', 'width')) + ' }'


def edge_ts(e_):
    p = e_['points']
    return '\n'.join(['{', arr(p[:, 0], 'x'), arr(p[:, 1], 'y'), arr(e_['angle'], 'angle'),
                      f"  length: {num(e_['length'])},", '}'])


ts = f'''// Generated by scripts/intro-layers.py from assets/splash-icon.png. Do not edit by hand: run the script again when the
// mark changes (it also writes the opening's layers in assets/intro, which share this box).
//
// The mark's geometry for the opening (components/fx/intro), in dp inside the mark's {BOX} x {BOX} dp box (the native
// splash's size, app.json expo-splash-screen imageWidth), (0, 0) at the box's top-left, y down.

export type Circle = {{ cx: number; cy: number; r: number }};
export type Point = {{ x: number; y: number }};
/**
 * A polyline along the heart's outer edge: x[i], y[i] evenly spaced by arc length (so interpolating them over evenly
 * spaced input moves at a steady speed), angle[i] the direction of travel there in degrees (0 = right, 90 = down,
 * unwrapped so it interpolates without a jump), length the edge's length in dp.
 */
export type Edge = {{ x: readonly number[]; y: readonly number[]; angle: readonly number[]; length: number }};
/** A box in the mark's box: whole dp, so a layer cut to it stays on the 3x pixel grid. */
export type Box = {{ left: number; top: number; width: number; height: number }};
/** Where a drawn shape sits: its centre and its width. */
export type Shape = {{ cx: number; cy: number; width: number }};

/** The box every layer and point here is drawn in (dp). */
export const MARK_BOX = {BOX};
/** The left (cyan) glass head: the circle of its free upper outline. */
export const HEAD_CYAN: Circle = {circle(HEADS[0])};
/** The right (coral) glass head: the circle of its free upper outline. */
export const HEAD_CORAL: Circle = {circle(HEADS[1])};
/**
 * A round clip (overflow: hidden, borderRadius r) for light swept across a head. Where a head rests on its lobe its
 * glass ends {num(min(h['lift_dp'] for h in HEADS))}-{num(max(h['lift_dp'] for h in HEADS))} dp above its circle's bottom, so the clip is the circle with its bottom raised to there
 * (same top): a sweep never lights the lobe's rim.
 */
export const HEAD_CYAN_CLIP: Circle = {circle(HEADS[0], HEADS[0]['lift_dp'])};
export const HEAD_CORAL_CLIP: Circle = {circle(HEADS[1], HEADS[1]['lift_dp'])};
/** The heart's bottom tip. */
export const TIP: Point = {{ x: {num(TIP[0])}, y: {num(TIP[1])} }};
/** From the cyan head's outer neck corner (where it and the heart part), over the left lobe, down to the tip. */
export const EDGE_LEFT: Edge = {edge_ts(EDGE_LEFT)};
/** From the coral head's outer neck corner (where it and the heart part), over the right lobe, down to the tip. */
export const EDGE_RIGHT: Edge = {edge_ts(EDGE_RIGHT)};
/**
 * The lights ride the rim's own glow, just outside the glass (on the glass they would be lost in its neon, further out
 * they float beside it with a dark gap): each edge moved this far out (dp), less at both ends, so a light still sets
 * off at its head's neck and meets the other on the tip.
 */
export const COMET_OFFSET = {num(COMET_OFFSET)};
/** The left light's path: EDGE_LEFT moved out (COMET_OFFSET), evenly spaced and with headings like an edge. */
export const COMET_LEFT: Edge = {edge_ts(COMET_LEFT)};
/** The right light's path: EDGE_RIGHT moved out (COMET_OFFSET). */
export const COMET_RIGHT: Edge = {edge_ts(COMET_RIGHT)};
/** The rising light's three layers (assets/intro/fill-1..3.png) are cut to this box around the heart's glass. */
export const FILL_BOX: Box = {box_ts(FILL_BOX)};
/** The ring along the heart's edges (assets/intro/heart-ring.png) is cut to this box; it spreads about its centre. */
export const RING_BOX: Box = {box_ts(RING_BOX)};
/** The drawn mark (its glass, without the glow) in this box. */
export const MARK_SHAPE: Shape = {shape_ts(MARK_SHAPE, 2)};
/**
 * The same drawing in assets/brand/logo.png (the sign-in screen's logo), as fractions of that picture's side: the
 * opening's last move lands its mark there.
 */
export const LOGO_MARK: Shape = {shape_ts(LOGO_MARK, 4)};
'''
with open(PATH_TS, 'w') as fh:
    fh.write(ts)

# ---- The web's splash (public/index.html) ----
# The web has no native splash: the page itself is the splash's navy, and its picture (the native splash's own file,
# 200 px in the middle of the whole page, as expo-splash-screen draws it on a phone) until the app draws over it. So
# the web starts on the same picture the opening starts on. Inlined (lossless WebP at 2x), so it is there on the first
# paint and needs no path (the preview is served under a base path, deep links from a 404 page). The page notes the
# source file's md5: tests/intro-timeline.test.ts fails when the splash changes and this was not run again.
WEB_HTML = 'public/index.html'
NATIVE_SPLASH = 'assets/splash-icon-native.png'
WEB_SPLASH_PX = 2 * BOX
native = Image.open(NATIVE_SPLASH).convert('RGB')
assert native.width == native.height and native.getpixel((0, 0)) == tuple(int(round(c * 255)) for c in NAVY), \
    'the native splash is a square picture on the navy'
buf = io.BytesIO()
native.resize((WEB_SPLASH_PX, WEB_SPLASH_PX), Image.LANCZOS).save(buf, 'WEBP', lossless=True, quality=100, method=6)
with open(NATIVE_SPLASH, 'rb') as fh:
    native_md5 = hashlib.md5(fh.read()).hexdigest()
with open(WEB_HTML) as fh:
    page = fh.read()
page, n_img = re.subn(r'url\(data:image/webp;base64,[A-Za-z0-9+/=]*\)',
                      f'url(data:image/webp;base64,{base64.b64encode(buf.getvalue()).decode()})', page)
page, n_md5 = re.subn(r'splash-icon-native\.png md5 [0-9a-f]{32}', f'splash-icon-native.png md5 {native_md5}', page)
assert n_img == 1 and n_md5 == 1, f'{WEB_HTML}: expected one splash picture and one md5 note'
with open(WEB_HTML, 'w') as fh:
    fh.write(page)
print('web splash', WEB_SPLASH_PX, 'px', len(buf.getvalue()), 'bytes, md5 of', NATIVE_SPLASH, native_md5)
report['web_splash_bytes'] = len(buf.getvalue())
report['tip_dp'] = TIP.tolist()
report['edges'] = {nm: {'length_dp': e_['length'], 'start_dp': e_['points'][0].tolist()}
                   for nm, e_ in (('left', EDGE_LEFT), ('right', EDGE_RIGHT))}
report['comets'] = {nm: {'length_dp': c_['length'], 'alpha_max_middle': c_['alpha_max'], 'alpha_min_middle': c_['alpha_min']}
                    for nm, c_ in (('left', COMET_LEFT), ('right', COMET_RIGHT))}
report['fill'] = {'box': FILL_BOX, 'stages': fill_report, 'heart_top_dp': heart_top, 'tip_dp': tip_xy}
report['ring_box'] = RING_BOX
report['mark_shape'] = MARK_SHAPE
report['logo_mark'] = LOGO_MARK
report['bytes'] = {n: os.path.getsize(p) for n, p in files.items()}


# ---- Previews (with a preview-dir) ----
def img_premul(q):
    """8-bit straight RGBA -> Pillow premultiplied image, for transforms without dark fringes."""
    return Image.fromarray(q, 'RGBA').convert('RGBa')


def place(canvas, q, dx_dp=0.0, dy_dp=0.0, scale=1.0, about=(BOX / 2, BOX / 2), opacity=1.0, rotate=0.0):
    """Lay layer q (a 200 dp box at 3x) over canvas (float RGB, the box at 3x), moved/scaled like an Animated view."""
    n = canvas.shape[0]
    k = n / BOX
    im = img_premul(q)
    if im.size != (n, n):
        im = im.resize((n, n), Image.BICUBIC)
    # Output pixel (x, y) takes input at ((x - c) / s + c - d): an inverse affine map, in pixels.
    cx, cy = about[0] * k, about[1] * k
    th = math.radians(rotate)
    a_, b_ = math.cos(th) / scale, math.sin(th) / scale
    tx, ty = cx + dx_dp * k, cy + dy_dp * k
    coeffs = (a_, b_, cx - a_ * tx - b_ * ty, -b_, a_, cy + b_ * tx - a_ * ty)
    im = im.transform((n, n), Image.AFFINE, coeffs, Image.BICUBIC)
    f = np.array(im.convert('RGBA')).astype(np.float64) / 255
    f[..., :3] *= f[..., 3:]
    f *= opacity
    return f[..., :3] + (1 - f[..., 3:]) * canvas


def navy_canvas(n=N):
    return np.broadcast_to(NAVY, (n, n, 3)).copy()


def to_img(a):
    return Image.fromarray(np.clip(np.round(a * 255 if a.max() <= 1.0001 else a), 0, 255).astype(np.uint8), 'RGB')


if PREVIEW:
    font = ImageFont.load_default(size=17)
    small = ImageFont.load_default(size=12)

    def sheet(panels, path, cols=None, size=None):
        cols = cols or len(panels)
        size = size or panels[0][0].size[0]
        rows = (len(panels) + cols - 1) // cols
        out = Image.new('RGB', (cols * size, rows * (size + 30)), (8, 8, 12))
        d = ImageDraw.Draw(out)
        for i, (im, text) in enumerate(panels):
            x, y = (i % cols) * size, (i // cols) * (size + 30)
            out.paste(im.resize((size, size), Image.LANCZOS) if im.size[0] != size else im, (x, y + 30))
            d.text((x + 8, y + 6), text, fill=(235, 235, 240), font=font)
        out.save(path)
        return path

    previews = []

    def diff_img(diff):
        # 0 black, 1 level dark red, 2 orange, 3+ yellow-white
        lut = np.array([[0, 0, 0], [150, 20, 20], [255, 140, 0], [255, 255, 160]], np.uint8)
        return Image.fromarray(lut[np.clip(diff, 0, 3).astype(int)], 'RGB')

    for name, rec, diff in (('core+glow', rec_cg, diff_cg), ('heads+heart', rec_parts, diff_parts)):
        r = report[name]
        previews.append(sheet([
            (to_img(ref), 'splash-icon.png at 3x on #010E29'),
            (to_img(rec), f'{name} files laid over #010E29'),
            (diff_img(diff), f"difference: max {r['max']}, mean {r['mean']:.2f} (red 1, orange 2)"),
        ], f"{PREVIEW}/recompose-{name.replace('+', '-')}.png"))

    def checker(n=N, c=24):
        yy, xx = np.mgrid[0:n, 0:n]
        v = np.where(((yy // c) + (xx // c)) % 2 == 0, 0.62, 0.78)
        return np.dstack([v, v, v])

    def uncrop(q, b):
        """A layer cut to box b, back in the whole 200 dp box at 3x."""
        k = N // BOX
        full = np.zeros((N, N, 4), np.uint8)
        full[b['top'] * k:(b['top'] + b['height']) * k, b['left'] * k:(b['left'] + b['width']) * k] = q
        return full

    L = {n: layer8(n) for n in ['mark-core.png', 'mark-glow.png', 'head-cyan.png', 'head-coral.png', 'heart.png',
                                 'mark-aura.png']}
    for i in (1, 2, 3):
        L[f'fill-{i}.png'] = uncrop(read8(files[f'fill-{i}.png']), FILL_BOX)
    L['heart-ring.png'] = uncrop(read8(files['heart-ring.png']), RING_BOX)
    names = list(L)
    panels = [(to_img(place(navy_canvas(), L[n])), f'{n} on navy') for n in names]
    panels += [(to_img(place(checker(), L[n])), f'{n} on grey') for n in names]
    previews.append(sheet(panels, f'{PREVIEW}/layers.png', cols=len(names), size=300))

    def mark_with(under=(), between=(), over_=()):
        """The mark as the opening stacks it: under the heart, between the heart and the heads, over everything."""
        c_ = navy_canvas()
        for q, kw in under:
            c_ = place(c_, q, **kw)
        c_ = place(c_, L['heart.png'])
        for q, kw in between:
            c_ = place(c_, q, **kw)
        c_ = place(place(c_, L['head-coral.png']), L['head-cyan.png'])
        for q, kw in over_:
            c_ = place(c_, q, **kw)
        return c_

    ring_c = (RING_BOX['left'] + RING_BOX['width'] / 2, RING_BOX['top'] + RING_BOX['height'] / 2)
    previews.append(sheet([
        (to_img(mark_with(between=[(L['fill-1.png'], {'opacity': FILL_PEAK})])), f'fill-1 at {FILL_PEAK}'),
        (to_img(mark_with(between=[(L['fill-2.png'], {'opacity': FILL_PEAK})])), f'fill-2 at {FILL_PEAK}'),
        (to_img(mark_with(between=[(L['fill-3.png'], {'opacity': FILL_PEAK})])), f'fill-3 at {FILL_PEAK}'),
        (to_img(mark_with(between=[(L['fill-1.png'], {'opacity': FILL_PEAK / 2}),
                                   (L['fill-2.png'], {'opacity': FILL_PEAK / 2})])), 'fill-1 and fill-2 half (cross-fade)'),
        (to_img(mark_with(between=[(L['heart-ring.png'], {'opacity': 0.75, 'scale': 1.05, 'about': ring_c})])),
         'ring 0.75 at 1.05 (its peak)'),
        (to_img(mark_with(between=[(L['heart-ring.png'], {'opacity': 0.4, 'scale': 1.09, 'about': ring_c})])),
         'ring 0.4 at 1.09'),
        (to_img(mark_with(between=[(L['heart-ring.png'], {'opacity': 0.12, 'scale': 1.11, 'about': ring_c})])),
         'ring 0.12 at 1.11'),
        (to_img(mark_with(under=[(L['mark-aura.png'], {'opacity': 0.35, 'scale': 1.04, 'about': (100, 108)})],
                          between=[(L['fill-3.png'], {'opacity': FILL_PEAK})])), f'beat: aura 0.35, fill-3 {FILL_PEAK}'),
    ], f'{PREVIEW}/light.png', cols=4, size=400))

    c = navy_canvas()
    c = place(c, L['heart.png'])
    c = place(c, L['head-coral.png'], 5, -10)
    lifted = place(c, L['head-cyan.png'], -5, -10)
    beat = place(place(place(navy_canvas(), L['heart.png'], scale=1.08, about=(100, 120)), L['head-coral.png']),
                 L['head-cyan.png'])
    core_only = place(navy_canvas(), L['mark-core.png'])
    echo = navy_canvas()
    for s_, o in ((1.16, 0.3), (1.08, 0.55)):
        echo = place(echo, L['mark-glow.png'], scale=s_, opacity=o, about=(100, 108))
    echo = place(place(echo, L['mark-glow.png']), L['mark-core.png'])
    flare = place(place(place(navy_canvas(), L['mark-aura.png'], opacity=0.9, scale=1.06, about=(100, 108)),
                        L['mark-glow.png']), L['mark-core.png'])
    white = navy_canvas()
    wq = L['mark-core.png'].copy()
    wq[..., :3] = 255  # what tintColor white does to the core
    white = place(place(place(white, L['mark-glow.png']), L['mark-core.png']), wq, opacity=0.6)
    previews.append(sheet([
        (to_img(lifted), 'heads lifted 10 dp, moved out 5 dp'),
        (to_img(beat), 'heart scaled 1.08 (a beat)'),
        (to_img(core_only), 'mark-core alone (glow off)'),
        (to_img(echo), 'glow echoes: glow at 1.08 / 1.16'),
        (to_img(flare), 'aura 0.9 at 1.06 under the mark'),
        (to_img(white), 'core tinted white at 0.6 over the mark'),
    ], f'{PREVIEW}/moved.png', cols=3, size=400))

    # The paths over the mark at 4x (800 px) with a zoom of the tip and of each contact.
    P = 4
    base = Image.open(SPLASH).convert('RGBA')
    bg = Image.new('RGBA', base.size, (1, 14, 41, 255))
    bg.alpha_composite(base)
    bg = bg.convert('RGB').resize((BOX * P, BOX * P), Image.LANCZOS)
    dr = ImageDraw.Draw(bg)

    def xy(x, y):
        return (x * P, y * P)

    ol = [xy(*p) for p in outline]
    dr.line(ol, fill=(255, 255, 255), width=1)
    for h, col in ((HEADS[0], (255, 255, 255)), (HEADS[1], (255, 255, 255))):
        dr.ellipse([xy(h['cx'] - h['r'], h['cy'] - h['r']), xy(h['cx'] + h['r'], h['cy'] + h['r'])], outline=col, width=1)
        dr.line([xy(h['cx'] - 1.5, h['cy']), xy(h['cx'] + 1.5, h['cy'])], fill=col)
        dr.line([xy(h['cx'], h['cy'] - 1.5), xy(h['cx'], h['cy'] + 1.5)], fill=col)
    for e_, col in ((EDGE_LEFT, (255, 230, 60)), (EDGE_RIGHT, (60, 255, 120))):
        pts = e_['points']
        dr.line([xy(*p) for p in pts], fill=col, width=2)
        for i, (p, a) in enumerate(zip(pts, e_['angle'])):
            x, y = xy(*p)
            dr.ellipse([x - 4, y - 4, x + 4, y + 4], outline=(0, 0, 0), fill=col)
            t = math.radians(a)
            dr.line([(x, y), (x + math.cos(t) * 22, y + math.sin(t) * 22)], fill=col, width=2)
            if i % 4 == 0 or i == len(pts) - 1:
                dr.text((x + 7, y - 16), str(i), fill=col, font=small)
    x, y = xy(*TIP)
    dr.line([(x - 9, y), (x + 9, y)], fill=(255, 60, 60), width=2)
    dr.line([(x, y - 9), (x, y + 9)], fill=(255, 60, 60), width=2)
    dr.text((10, 8), 'white: measured outline and head circles; yellow/green: EDGE_LEFT/RIGHT (24 points, ticks = angle)',
            fill=(235, 235, 240), font=font)
    zooms = []
    for (cx_, cy_), w_ in (((EDGE_LEFT['points'][0][0] + 4, EDGE_LEFT['points'][0][1] + 1), 26),
                           ((EDGE_RIGHT['points'][0][0] - 4, EDGE_RIGHT['points'][0][1] + 1), 26),
                           ((TIP[0], TIP[1] - 6), 26)):
        box_ = (int((cx_ - w_ / 2) * P), int((cy_ - w_ / 2) * P), int((cx_ + w_ / 2) * P), int((cy_ + w_ / 2) * P))
        zooms.append(bg.crop(box_).resize((400, 400), Image.NEAREST))
    out = Image.new('RGB', (800 + 400, 1200), (8, 8, 12))
    out.paste(bg, (0, 0))
    for i, z in enumerate(zooms):
        out.paste(z, (800, i * 400))
    out.save(f'{PREVIEW}/path.png')
    previews.append(f'{PREVIEW}/path.png')

    # Sprites: as files (on navy), and in use: the shine swept across the cyan head inside its round clip, the
    # comet along the left edge, sparks at the tip.
    def sprite_on(q, tint, n=240):
        a = q[..., 3:].astype(np.float64) / 255
        h_, w_ = q.shape[:2]
        col = q[..., :3].astype(np.float64) / 255 if tint is None else np.array(tint) / 255
        c_ = np.broadcast_to(NAVY, (h_, w_, 3)) * (1 - a) + col * a
        im = to_img(c_)
        canvas = Image.new('RGB', (n, n), tuple(int(v * 255) for v in NAVY))
        im.thumbnail((n - 20, n - 20), Image.LANCZOS)
        canvas.paste(im, ((n - im.width) // 2, (n - im.height) // 2))
        return canvas

    sweep = []
    for pos in (-22, 0, 22):
        c_ = place(place(place(navy_canvas(), L['heart.png']), L['head-coral.png']), L['head-cyan.png'])
        # The shine rotated 20 degrees, kept only inside HEAD_CYAN_CLIP (what an overflow: hidden circle does).
        k3 = N / BOX
        clip_r = HEADS[0]['r'] - HEADS[0]['lift_dp'] / 2  # HEAD_CYAN_CLIP
        hx, hy = HEADS[0]['cx'] * k3, (HEADS[0]['cy'] - HEADS[0]['lift_dp'] / 2) * k3
        im = Image.fromarray(shine, 'RGBA').convert('RGBa').rotate(-20, Image.BICUBIC, expand=True)
        layer = Image.new('RGBa', (N, N), (0, 0, 0, 0))
        layer.paste(im, (int(hx + pos * k3 - im.width / 2), int(hy - im.height / 2)))
        f = np.array(layer.convert('RGBA')).astype(np.float64) / 255
        yy, xx = np.mgrid[0:N, 0:N]
        inside = np.clip(clip_r * k3 - np.hypot(xx + 0.5 - hx, yy + 0.5 - hy) + 0.5, 0, 1)
        a = f[..., 3:] * inside[..., None] * 0.45  # the app shows it at 0.45 at most
        c_ = f[..., :3] * a + (1 - a) * c_
        sweep.append((to_img(c_).crop((int(hx - 40 * k3), int(hy - 40 * k3), int(hx + 40 * k3), int(hy + 40 * k3))),
                       f'shine in the head clip, x {pos:+d} dp'))
    trail_img = Image.fromarray(np.round(mark_with() * 255).astype(np.uint8), 'RGB').convert('RGBA')
    # Each light at a few points of its path, with its two streaks a few points behind it (as at mid-run, about 16 and
    # 32 ms back), each sprite turned to the path where it is.
    for path_, cname in ((COMET_LEFT, 'comet-cyan.png'), (COMET_RIGHT, 'comet-coral.png')):
        for i in (5, 11, 17, 22):
            for j, q, op in ((i - 2, streaks[cname.replace('comet', 'streak')], 0.55), (i - 1, streaks[cname.replace('comet', 'streak')], 0.85),
                             (i, comets[cname], 1.0)):
                x, y = path_['points'][j] * (N / BOX)
                q = q.copy()
                q[..., 3] = np.round(q[..., 3] * op).astype(np.uint8)
                im = Image.fromarray(q, 'RGBA').rotate(-float(path_['angle'][j]), Image.BICUBIC, expand=True)
                trail_img.alpha_composite(im, (int(x - im.width / 2), int(y - im.height / 2)))
    sp = Image.fromarray(spark, 'RGBA')
    x, y = TIP * (N / BOX)
    trail_img.alpha_composite(sp, (int(x - sp.width / 2), int(y - sp.height / 2)))
    previews.append(sheet([
        (sprite_on(shine, (255, 255, 255)), 'shine.png'),
        (sprite_on(comets['comet-cyan.png'], None), 'comet-cyan.png'),
        (sprite_on(comets['comet-coral.png'], None), 'comet-coral.png'),
        (sprite_on(streaks['streak-cyan.png'], None), 'streak-cyan.png'),
        (sprite_on(streaks['streak-coral.png'], None), 'streak-coral.png'),
        (sprite_on(spark, (255, 248, 236)), 'spark.png'),
    ] + [(im.resize((240, 240), Image.LANCZOS), t) for im, t in sweep], f'{PREVIEW}/sprites.png', cols=3, size=240))
    trail_img.convert('RGB').save(f'{PREVIEW}/comet-on-edge.png')
    previews.append(f'{PREVIEW}/comet-on-edge.png')
    with open(f'{PREVIEW}/report.json', 'w') as fh:
        json.dump(report, fh, indent=1, default=float)
    print('previews', previews)
