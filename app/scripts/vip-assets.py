"""VIP > Ayrıcalıklar screen art, cut from the client's design package (a flat 841x1870 screenshot plus slices).

Rerun (from app/; Python 3 with Pillow, numpy, opencv-python-headless and scipy):

    python3 -I scripts/vip-assets.py <package dir> [out dir] [preview dir]

  <package dir>  the unzipped SimilarClub_VIP_Uygulama_Paketi folder (reads spec/layout.json,
                 reference/original.png and assets/slices/vip_hero.png; nothing in it is executed)
  [out dir]      default assets/vip
  [preview dir]  optional: contact sheets to check by eye (hero-sheet.png: all ten signs; rights-sheet.png and
                 deco-sheet.png: each cut-out at 3-5x on a light checker, a dark checker and the card purple;
                 hero-textless.png)

What it writes into <out dir>:
  hero-1.webp .. hero-10.webp  the big VIP sign ("tabela") without its baked "VIP 1" and "✓ Açıldı · Kalıcı"
                               (the screen draws those as live text), one ground colour per VIP level, the
                               corners outside the gold border transparent
  right-<key>.png              the seven right pictures on a transparent ground (keys as in levels-live-core LOOK)
  hero-glow.webp               the gold light around the sign's border (with the flares at its top right and bottom
                               middle), outside the border only: drawn behind every level's sign
  lower-glow.webp              the purple wave behind the last row's empty cells and the lower crown, down the
                               points panel's right side (the crown, the panel and the cards' light painted out,
                               faded out under the panel), on a transparent ground
  crown-left/right.png, info-crown.png, lower-crown.png, tab-crown.png, tab-diamond.png, hero-tick.png (the status
  line's gold ✓)  small decorations

Changing a level's colour: edit LEVEL_TINTS below and rerun. Each entry moves the design's purple ground to
another colour: `hue` is the target hue in HSV degrees (0 red, 30 orange, 125 green, 175 teal, 220 blue,
315 fuchsia, 355 crimson), `chroma` scales the colour strength (1 = as strong as the purple, 0.1 = almost grey),
`lift` > 1 makes the ground lighter, `dark` < 1 makes it darker. VIP 1 is the design itself and is not in the
table. Gold, white and the silver/blue ring are never touched: the recolour is a linear map in OKLab that keeps
the gold direction and neutrals fixed and turns only the purple direction, and the ring with its crown and gem
is masked out (ring_mask).

The text removal and the cut-outs are deterministic (fixed noise seed, fixed seeds for the GrabCut hints), so a
rerun gives the same files.
"""
import json
import os
import sys

import cv2
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage, sparse
from scipy.sparse.linalg import spsolve

# ---------------------------------------------------------------------------------------------- level colours

LEVEL_TINTS = {
    2: dict(hue=182, chroma=0.95, lift=1.06),   # teal
    3: dict(hue=128, chroma=0.85, lift=1.06),   # green
    4: dict(hue=220, chroma=1.0),               # royal blue
    5: dict(hue=24, chroma=0.7),                # bronze
    6: dict(hue=355, chroma=0.95),              # crimson
    7: dict(hue=315, chroma=1.0),               # fuchsia
    8: dict(hue=215, chroma=0.12),              # graphite (cool grey)
    9: dict(hue=338, chroma=0.85, lift=1.3),    # rose, lighter than crimson
    10: dict(hue=40, chroma=0.3, dark=0.55),    # black-gold
}

# ---------------------------------------------------------------------------------------------- colour helpers

M1 = np.array([[0.4122214708, 0.5363325363, 0.0514459929],
               [0.2119034982, 0.6806995451, 0.1073969566],
               [0.0883024619, 0.2817188376, 0.6299787005]])
M2 = np.array([[0.2104542553, 0.7936177850, -0.0040720468],
               [1.9779984951, -2.4285922050, 0.4505937099],
               [0.0259040371, 0.7827717662, -0.8086757660]])
M1i, M2i = np.linalg.inv(M1), np.linalg.inv(M2)


def to_lin(c):
    c = np.asarray(c, np.float64)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def from_lin(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055)


def oklab(rgb):
    return np.cbrt(to_lin(rgb) @ M1.T) @ M2.T


def oklab_lin(lab):
    return ((lab @ M2i.T) ** 3) @ M1i.T


def rgb(lab):
    return from_lin(oklab_lin(lab))


def gamut_clip(lab, iters=14):
    """Pull out-of-sRGB colours toward grey at the same lightness and hue."""
    def inside(t):
        li = oklab_lin(t)
        return np.all((li >= -1e-4) & (li <= 1 + 1e-4), -1)
    if inside(lab).all():
        return lab
    L, ab = lab[..., :1], lab[..., 1:]
    lo, hi = np.zeros(L.shape), np.ones(L.shape)
    for _ in range(iters):
        mid = (lo + hi) / 2
        ok = inside(np.concatenate([L, ab * mid], -1))[..., None]
        lo, hi = np.where(ok, mid, lo), np.where(ok, hi, mid)
    f = np.where(inside(lab)[..., None], 1.0, lo)
    return np.concatenate([np.clip(L, 0, 1), ab * f], -1)


def hsv(a):
    """a: 0..1 RGB. Returns hue in degrees, saturation, value."""
    mx, mn = a.max(-1), a.min(-1)
    d = mx - mn + 1e-9
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    h = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
    return h, np.where(mx > 0, (mx - mn) / (mx + 1e-9), 0), mx


def smooth(x, lo, hi):
    t = np.clip((x - lo) / (hi - lo), 0, 1)
    return t * t * (3 - 2 * t)


def harmonic(img, unknown):
    """Fill the unknown pixels with the smoothest surface that meets the known ones (a Laplace solve)."""
    out = img.copy()
    H, W = unknown.shape
    ys, xs = np.nonzero(unknown)
    n = len(ys)
    if not n:
        return out
    idx = -np.ones((H, W), int)
    idx[ys, xs] = np.arange(n)
    diag = np.zeros(n)
    b = np.zeros((n,) + img.shape[2:])
    rows, cols = [], []
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        yy, xx = ys + dy, xs + dx
        ok = (yy >= 0) & (yy < H) & (xx >= 0) & (xx < W)
        diag[ok] += 1
        k = np.nonzero(ok)[0]
        yy, xx = yy[ok], xx[ok]
        unk = unknown[yy, xx]
        rows.append(k[unk])
        cols.append(idx[yy[unk], xx[unk]])
        b[k[~unk]] += img[yy[~unk], xx[~unk]]
    r = np.concatenate(rows + [np.arange(n)])
    c = np.concatenate(cols + [np.arange(n)])
    v = np.concatenate([-np.ones(sum(len(x) for x in rows)), diag])
    A = sparse.csr_matrix((v, (r, c)), shape=(n, n))
    out[ys, xs] = spsolve(A, b).reshape(b.shape)
    return out


def u8(a):
    return (np.clip(a, 0, 1) * 255).round().astype(np.uint8)


# ---------------------------------------------------------------------------------------------- hero

HERO_ORIGIN = (16, 300)  # vip_hero slice position in the source
# The gold border in hero-slice pixels: outer edge of the line and its corner radius (measured, all four
# corners alike), used for the transparent corners.
HERO_OUTER = (3.5, 6.5, 806.0, 396.5)
HERO_OUTER_R = 64.0
RING_CENTER, RING_HOLE_R = (581, 209), 89  # the ring's photo hole (hero_frame_aperture.png)


def hero_text_mask(im, lay):
    """Pixels of the baked 'VIP 1' and '✓ Açıldı · Kalıcı' (with their soft edges and drop shadow)."""
    H, W, _ = im.shape
    ox, oy = HERO_ORIGIN
    box = np.zeros((H, W), bool)
    for key in ('vip_level_text', 'vip_status_text'):
        x, y, w, h = lay[key]
        box[y - oy - 8:y - oy + h + 8, x - ox - 8:x - ox + w + 8] = True
    rough = harmonic(im, box)  # the ground as if there were no text
    lum, bl = im.mean(2), rough.mean(2)
    exc = lum - bl
    gold = im[..., 0] - im[..., 2]
    t = box & ((exc > bl * 0.35 + 8 / 255) | ((gold > 0) & (lum > bl + 6 / 255)))
    t = ndimage.binary_opening(t, iterations=1) | (box & (exc > bl * 0.8 + 20 / 255))
    shadow = ndimage.binary_dilation(t, iterations=7) & box & (exc < -4 / 255)
    m = ndimage.binary_closing(t | shadow, iterations=2)
    return ndimage.binary_dilation(m, iterations=4) & box


def remove_hero_text(im, lay):
    m = hero_text_mask(im, lay)
    out = harmonic(im, m)
    # The fill is smoother than the ground around it: add grain of the same strength (robust estimate).
    H, W, _ = im.shape
    ring = ndimage.binary_dilation(m, iterations=16) & ~ndimage.binary_dilation(m, iterations=2)
    hp = im - ndimage.gaussian_filter(im, (2.0, 2.0, 0))
    sd = 1.4826 * np.median(np.abs(hp[ring] - np.median(hp[ring], 0)), 0)
    noise = ndimage.gaussian_filter(np.random.default_rng(7).normal(0, 1, (H, W, 1)), (1.0, 1.0, 0))
    noise /= noise.std()
    return out + np.where(m[..., None], noise * sd * 0.9, 0)


def ring_mask(im):
    """The silver/blue winged ring with its crown and gem: kept as it is on every level."""
    H, W, _ = im.shape
    h, s, v = hsv(im)
    yy, xx = np.mgrid[0:H, 0:W]
    cx, cy = RING_CENTER
    r = np.hypot(xx - cx, yy - cy)
    env = (((xx - 578) / 207.) ** 2 + ((yy - 200) / 178.) ** 2 < 1) | ((xx >= 515) & (xx <= 660) & (yy >= 11) & (yy <= 100))
    silver = (s < 0.32) & (v > 0.42)
    blue = (h >= 195) & (h < 250) & (s > 0.3) & (v > 0.22)
    gold = (h >= 8) & (h < 70) & (s > 0.25) & (v > 0.3)
    obj = ndimage.binary_closing(env & (silver | blue | gold), structure=np.ones((3, 3)), iterations=3)
    lab, n = ndimage.label(obj)
    sz = ndimage.sum(obj, lab, range(1, n + 1))
    keep = np.isin(lab, 1 + np.nonzero(sz >= 150)[0])
    hole = r <= RING_HOLE_R
    keep = (ndimage.binary_fill_holes(keep | hole) & ~hole) | (keep & hole)  # the gem reaches into the hole
    keep &= env
    keep &= ~(((xx - 510) / 14.) ** 2 + ((yy - 84) / 18.) ** 2 < 1)  # a blue light flare of the ground, not ring
    m = ndimage.binary_erosion(keep, iterations=1).astype(float)
    return ndimage.gaussian_filter(m, 1.0)


def hsv_to_okhue(hdeg):
    import colorsys
    c = oklab(np.array(colorsys.hsv_to_rgb(hdeg / 360, 0.85, 0.7)))
    return np.arctan2(c[2], c[1])


def recolour_levels(im):
    """{level: rgb} with the purple ground moved to each level's colour."""
    lab = oklab(im)
    h, s, v = hsv(im)

    def direction(sel):
        a, b = lab[..., 1][sel].sum(), lab[..., 2][sel].sum()
        n = np.hypot(a, b)
        return np.array([a / n, b / n])
    uP = direction((h >= 250) & (h < 275) & (s > 0.4) & (v > 0.15))  # the design's purple
    uG = direction((h >= 25) & (h < 55) & (s > 0.4) & (v > 0.5))     # its gold
    # Chroma = alpha * purple + beta * gold; a level replaces the purple axis and keeps the gold one.
    coef = lab[..., 1:] @ np.linalg.inv(np.stack([uP, uG], 1)).T
    alpha, beta = coef[..., 0], coef[..., 1]
    C = np.hypot(lab[..., 1], lab[..., 2])
    # Gold's own orange..yellow spread gives it a small +-alpha (|alpha/C| < 0.4); the ground and its pink
    # gold-purple blends sit at 0.9..1.4. Only the latter move, so gold stays exactly gold.
    gate = smooth(alpha / np.maximum(C, 1e-4), 0.35, 0.7)
    purple_share = gate * np.clip(alpha / 0.03, 0, 1)
    keep = ring_mask(im)[..., None]
    out = {1: im}
    for level, t in LEVEL_TINTS.items():
        th = hsv_to_okhue(t['hue'])
        uT = np.array([np.cos(th), np.sin(th)])
        ab = lab[..., 1:] + (gate * alpha)[..., None] * (uT * t.get('chroma', 1.0) - uP)
        L = lab[..., 0].copy()
        if 'lift' in t:
            L = L * (1 + (t['lift'] - 1) * purple_share)
        if 'dark' in t:
            L = L * (1 - (1 - t['dark']) * purple_share * (1 - 0.5 * L))
        new = rgb(gamut_clip(np.concatenate([L[..., None], ab], -1)))
        out[level] = new * (1 - keep) + im * keep
    return out


def hero_alpha(shape):
    """Opaque inside the gold border's outer edge, a 1.5 px soft edge, transparent outside."""
    H, W = shape
    x0, y0, x1, y1 = HERO_OUTER
    r = HERO_OUTER_R
    yy, xx = np.mgrid[0:H, 0:W] + 0.5
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    qx = np.abs(xx - cx) - ((x1 - x0) / 2 - r)
    qy = np.abs(yy - cy) - ((y1 - y0) / 2 - r)
    sdf = np.hypot(np.maximum(qx, 0), np.maximum(qy, 0)) + np.minimum(np.maximum(qx, qy), 0) - r
    return np.clip((0.75 - sdf) / 1.5, 0, 1)


def make_heroes(pkg, lay, out, preview):
    im = np.asarray(Image.open(os.path.join(pkg, 'assets/slices/vip_hero.png')).convert('RGB'), np.float64) / 255
    clean = remove_hero_text(im, lay)
    levels = recolour_levels(clean)
    a = hero_alpha(im.shape[:2])
    ys, xs = np.nonzero(a > 0)
    crop = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
    files = []
    for level, img in sorted(levels.items()):
        rgba = np.dstack([img, a])[crop[1]:crop[3], crop[0]:crop[2]]
        rgba[..., :3] *= rgba[..., 3:] > 0
        path = os.path.join(out, f'hero-{level}.webp')
        Image.fromarray(u8(rgba), 'RGBA').save(path, 'WEBP', quality=88, method=6)
        files.append(path)
    if preview:
        tw, th = 404, 197
        sheet = Image.new('RGB', (tw * 2 + 30, th * 5 + 60), (12, 7, 28))
        d = ImageDraw.Draw(sheet)
        for level in range(1, 11):
            t = Image.open(os.path.join(out, f'hero-{level}.webp')).convert('RGBA').resize((tw, th), Image.LANCZOS)
            x, y = 10 + ((level - 1) % 2) * (tw + 10), 10 + ((level - 1) // 2) * (th + 10)
            sheet.paste(t, (x, y), t)
            d.text((x + 22, y + 14), f'VIP {level}', fill=(255, 255, 255))
        sheet.save(os.path.join(preview, 'hero-sheet.png'))
        Image.fromarray(u8(clean)).save(os.path.join(preview, 'hero-textless.png'))
    return crop, files


# ---------------------------------------------------------------------------------------------- cut-outs

# Source boxes come from layout.json: a right's picture is cut from its card above the label (the *_art slice
# grown by up to 16 px, inside the card's border), so objects the slice crops (feathers, awning) stay whole.
# fill: holes inside the object are part of it (a room's interior, the clapper's screen) rather than ground
# showing through (the ring's photo hole, the mask's eye holes). bg / fg: GrabCut hints (x, y, r) in box pixels
# where the ground's glow looks like the object.
RIGHTS = {
    'badge': dict(src='vip_badge', fill=False, bg=[(80, 30, 4), (130, 30, 4), (82, 50, 2), (126, 50, 2)]),
    'frame': dict(src='profile_frame', fill=False),
    'hide_levels': dict(src='hide_levels', fill=False, bg=[(80, 45, 4), (88, 40, 2), (84, 51, 3), (90, 45, 2), (78, 55, 2)]),
    'room_password': dict(src='room_password', fill=True),
    'vip_store': dict(src='vip_shop', fill=True, fgpoly=[[(52, 60), (134, 60), (134, 82), (52, 82)]]),  # stall's back wall
    'vip_gifts': dict(src='exclusive_gifts', fill=True),
    'silent_visit': dict(src='silent_visit', fill=True,
                         bg=[(35, 100, 5), (30, 130, 4), (150, 105, 3), (160, 85, 3), (170, 68, 2)],
                         fgpoly=[[(53, 80), (137, 74), (139, 138), (57, 144)]]),
}
DECOS = {
    # The crowns' pearl tips are soft and pale, like glow: pinned as object.
    'crown-left': dict(src='heading_crown_left', pad=6, fill=False, fg=[(12, 30, 3), (23, 27, 2), (59, 23, 2), (72, 22, 3)]),
    'crown-right': dict(src='heading_crown_right', pad=6, fill=False, fg=[(19, 23, 3), (31, 24, 2), (65, 28, 2), (74, 30, 2)]),
    'info-crown': dict(src='points_info_crown', pad=6, fill=False, fg=[(20, 31, 3), (37, 30, 3), (86, 30, 3), (101, 30, 3)]),
    'lower-crown': dict(src='lower_crown', pad=(6, 6, 6, -4), fill=False,  # sits on bright waves: many hints
                        fg=[(29, 27, 4), (32, 40, 3), (35, 55, 3), (183, 48, 6), (178, 64, 3), (208, 100, 5), (213, 99, 4), (201, 105, 2), (196, 108, 3)],
                        fgpoly=[[(20, 112), (60, 120), (100, 130), (140, 140), (165, 146), (140, 147), (100, 140), (60, 130),
                                 (22, 122)]],
                        bg=[(45, 45, 5), (10, 60, 6), (55, 28, 5), (140, 35, 6), (150, 58, 4), (200, 15, 6), (218, 72, 5),
                            (10, 142, 5), (45, 146, 3), (205, 140, 5), (190, 98, 2)]),
    'tab-crown': dict(src='privileges_crown_icon', pad=4, fill=False),
    'tab-diamond': dict(src='members_diamond_icon', pad=4, fill=True),
    # The status line's calligraphic tick (left of "Açıldı"), with its baked shadow as a dark edge.
    'hero-tick': dict(box=(62, 503, 110, 552), fill=False, min_part=20, glow=0.0),
}


def right_box(lay, key):
    cx, cy, cw, ch = lay[key + '_card']
    ax, ay, aw, ah = lay[key + '_art']
    label_y = lay[key + '_label'][1]
    pad = 16
    return (max(ax - pad, cx + 11), max(ay - pad, cy + 14), min(ax + aw + pad, cx + cw - 11), min(ay + ah + pad, label_y + 2))


def deco_box(lay, cfg):
    if 'box' in cfg:
        return cfg['box']
    x, y, w, h = lay[cfg['src']]
    p = cfg['pad']
    l, t, r, b = (p, p, p, p) if isinstance(p, int) else p
    return (x - l, y - t, x + w + r, y + h + b)


def ground(img):
    """The card / page ground under an object, in OKLab: harmonic fill from the box edge, refined 3 times."""
    lab = oklab(img)
    H, W, _ = img.shape
    known = np.zeros((H, W), bool)
    known[:2, :] = known[-2:, :] = known[:, :2] = known[:, -2:] = True
    known &= np.linalg.norm(lab - np.median(lab[known], 0), axis=-1) < 0.08
    bg = harmonic(lab, ~known)
    for _ in range(3):
        diff = np.linalg.norm(lab - bg, axis=-1)
        bg = harmonic(lab, ndimage.binary_dilation(diff > 0.035, iterations=2))
    return bg, np.linalg.norm(lab - bg, axis=-1)


def disks(shape, pts):
    m = np.zeros(shape, bool)
    yy, xx = np.mgrid[0:shape[0], 0:shape[1]]
    for x, y, r in pts:
        m |= (xx - x) ** 2 + (yy - y) ** 2 <= r * r
    return m


def colour_to_alpha(p, b):
    """The least opacity that explains p as some colour over the ground b (per channel, the max)."""
    up = np.where(p > b, (p - b) / np.maximum(1 - b, 1e-4), 0)
    dn = np.where(p < b, (b - p) / np.maximum(b, 1e-4), 0)
    return np.clip(np.maximum(up, dn).max(-1), 0, 1)


def unmix(p, b, a):
    with np.errstate(invalid='ignore', divide='ignore'):
        return np.clip((p - (1 - a[..., None]) * b) / np.maximum(a[..., None], 1e-3), 0, 1)


def cut_out(img, cfg, glow_gain=0.5, glow_px=10):
    """RGBA of the object in img: GrabCut for the shape, colour-to-alpha against the ground for its edge, the
    ground colour taken out of edge pixels (no purple fringe), and a faint warm glow kept around it."""
    bglab, diff = ground(img)
    b = np.clip(rgb(bglab), 0, 1)
    H, W = diff.shape
    m = np.full((H, W), cv2.GC_PR_BGD, np.uint8)
    m[diff >= 0.10] = cv2.GC_PR_FGD
    m[diff < 0.03] = cv2.GC_BGD
    m[:3, :] = m[-3:, :] = m[:, :3] = m[:, -3:] = cv2.GC_BGD
    if cfg.get('bg'):
        m[disks((H, W), cfg['bg'])] = cv2.GC_BGD
    pinned = disks((H, W), cfg.get('fg', []))
    for poly in cfg.get('fgpoly', []):
        pm = Image.new('L', (W, H), 0)
        ImageDraw.Draw(pm).polygon(poly, fill=255)
        pinned |= np.asarray(pm) > 0
    m[pinned] = cv2.GC_FGD
    cv2.setRNGSeed(1)
    cv2.grabCut(np.ascontiguousarray(u8(img)[..., ::-1]), m, None, np.zeros((1, 65)), np.zeros((1, 65)), 10,
                cv2.GC_INIT_WITH_MASK)
    fg = ndimage.binary_opening((m == cv2.GC_FGD) | (m == cv2.GC_PR_FGD), iterations=1)
    lab, n = ndimage.label(fg)
    if n:
        sz = ndimage.sum(fg, lab, range(1, n + 1))
        # Stray sparkles go; parts of at least min_part px (or the biggest part of a tiny icon) stay.
        thr = max(min(cfg.get('min_part', 80), sz.max()), sz.max() * 0.02)
        fg = np.isin(lab, 1 + np.nonzero(sz >= thr)[0])
    fg = ndimage.gaussian_filter(fg.astype(float), 0.8) > 0.5  # smooth the outline (no 1 px stairs or slivers)
    fg |= pinned  # hinted parts stay even when thin links to the rest were dropped
    if cfg.get('fill'):
        fg = ndimage.binary_fill_holes(fg)
    core = ndimage.binary_erosion(fg, iterations=1)
    solid = np.where(core, 1.0, ndimage.gaussian_filter(core.astype(float), 0.6))
    ac = colour_to_alpha(img, b)
    band = ndimage.binary_dilation(fg, iterations=2) & ~core
    edge = np.where(band, ac, 0)
    F = oklab(unmix(img, b, ac))
    hF = np.degrees(np.arctan2(F[..., 2], F[..., 1])) % 360
    CF = np.hypot(F[..., 1], F[..., 2])
    purple = ((hF > 270) & (hF < 350)) * smooth(CF, 0.02, 0.05)
    edge = np.where(band & ~fg, edge * (1 - purple), edge)  # ground's purple light just outside: dropped
    warm = ((hF > 30) & (hF < 110)) * smooth(CF, 0.03, 0.08)
    dist = ndimage.distance_transform_edt(~fg)
    glow = np.where(fg, 0, ac * smooth(ac, 0.10, 0.30) * warm * glow_gain * np.clip(1 - dist / glow_px, 0, 1))
    alpha = np.clip(np.maximum(np.maximum(solid, edge), glow), 0, 1)
    col = np.where(core[..., None], img, unmix(img, b, alpha))
    rgba = np.dstack([col, alpha])
    rgba[..., :3] *= (alpha > 0)[..., None]
    ys, xs = np.nonzero(alpha > 0.02)
    y0, y1 = max(ys.min() - 2, 0), min(ys.max() + 3, H)
    x0, x1 = max(xs.min() - 2, 0), min(xs.max() + 3, W)
    return rgba[y0:y1, x0:x1], (x0, y0)


def checker(h, w, c1, c2, s=12):
    yy, xx = np.mgrid[0:h, 0:w]
    return np.where((((yy // s + xx // s) % 2) == 0)[..., None], np.array(c1) / 255, np.array(c2) / 255)


def on_grounds(path, sc=3):
    """The cut-out at sc x on a light checker, a dark checker and the card purple, side by side."""
    im = Image.open(path).convert('RGBA')
    big = np.asarray(im.resize((im.width * sc, im.height * sc), Image.LANCZOS), np.float64) / 255
    a = big[..., 3:]
    h, w = big.shape[:2]
    tiles = [big[..., :3] * a + checker(h, w, c1, c2) * (1 - a)
             for c1, c2 in (((235, 235, 235), (200, 200, 200)), ((40, 40, 40), (20, 20, 20)), ((42, 26, 64), (42, 26, 64)))]
    return Image.fromarray(u8(np.concatenate(tiles, 1)))


def stack(images, gap=8, colour=(255, 0, 0)):
    w = max(i.width for i in images)
    sheet = Image.new('RGB', (w, sum(i.height + gap for i in images)), colour)
    y = 0
    for i in images:
        sheet.paste(i, (0, y))
        y += i.height + gap
    return sheet


def make_cutouts(orig, lay, out, preview):
    files = []
    sheets = {'rights': [], 'deco': []}
    jobs = [(f'right-{k}', right_box(lay, c['src']), c, 'rights') for k, c in RIGHTS.items()]
    jobs += [(k, deco_box(lay, c), c, 'deco') for k, c in DECOS.items()]
    for name, (x0, y0, x1, y1), cfg, group in jobs:
        rgba, _ = cut_out(orig[y0:y1, x0:x1], cfg, glow_gain=cfg.get('glow', 0.5))
        path = os.path.join(out, name + '.png')
        Image.fromarray(u8(rgba), 'RGBA').save(path, optimize=True)
        files.append(path)
        if preview:
            sheets[group].append(on_grounds(path, 3 if group == 'rights' else 5))
    if preview:
        stack(sheets['rights']).save(os.path.join(preview, 'rights-sheet.png'))
        stack(sheets['deco']).save(os.path.join(preview, 'deco-sheet.png'))
    return files


# ---------------------------------------------------------------------------------------------- glows

PAGE_GROUND = np.array([11, 6, 27]) / 255  # the design's night purple where nothing glows


def make_hero_glow(orig, out, preview):
    """The light outside the sign's gold border, from the screenshot: colour-to-alpha against the page ground (a
    smooth fill from pixels 24+ px away), warm only (purple light of the VIP 1 ground would be wrong on the other
    levels), faded out 24 px from the border (10 px above it, where the tab row's own light starts)."""
    X0, Y0, X1, Y1 = 0, 282, 841, 720
    img = orig[Y0:Y1, X0:X1]
    H, W, _ = img.shape
    ox, oy = HERO_ORIGIN
    x0, y0, x1, y1 = HERO_OUTER
    x0, x1, y0, y1 = x0 + ox - X0, x1 + ox - X0, y0 + oy - Y0, y1 + oy - Y0
    r = HERO_OUTER_R
    yy, xx = np.mgrid[0:H, 0:W] + 0.5
    qx = np.abs(xx - (x0 + x1) / 2) - ((x1 - x0) / 2 - r)
    qy = np.abs(yy - (y0 + y1) / 2) - ((y1 - y0) / 2 - r)
    sdf = np.hypot(np.maximum(qx, 0), np.maximum(qy, 0)) + np.minimum(np.maximum(qx, qy), 0) - r
    far = sdf > 24
    g4 = harmonic(img[::4, ::4], ~far[::4, ::4])  # the ground is smooth: solved at a quarter size
    g = np.dstack([ndimage.zoom(g4[..., c], 4, order=1)[:H, :W] for c in range(3)])
    g = np.where(far[..., None], ndimage.gaussian_filter(img, (6, 6, 0)), ndimage.gaussian_filter(g, (3, 3, 0)))
    soft = ndimage.gaussian_filter(img, (0.8, 0.8, 0))  # no JPEG grain in the alpha
    a = colour_to_alpha(soft, g)
    col = unmix(soft, g, a)
    F = oklab(col)
    hF = np.degrees(np.arctan2(F[..., 2], F[..., 1])) % 360
    purple = ((hF > 200) & (hF < 350)) * smooth(np.hypot(F[..., 1], F[..., 2]), 0.02, 0.06)
    above = (yy < y0) & (xx < 720)  # the top right flare reaches higher
    reach = np.where(above, smooth(-sdf, -10, -4), smooth(-sdf, -24, -14))
    a = a * (1 - purple) * reach * smooth(sdf, -4, -1.5)  # from just under the image's soft edge outwards
    a = np.clip((a - 0.035) / (1 - 0.035), 0, 1)
    ys, xs = np.nonzero(a > 1 / 255)
    bx0, by0, bx1, by1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
    rgba = np.dstack([col * (a[..., None] > 0), a])[by0:by1, bx0:bx1]
    path = os.path.join(out, 'hero-glow.webp')
    Image.fromarray(u8(rgba), 'RGBA').save(path, 'WEBP', quality=90, method=6)
    if preview:
        comp = col * a[..., None] + PAGE_GROUND * (1 - a[..., None])
        Image.fromarray(u8(comp)).save(os.path.join(preview, 'hero-glow.png'))
    # Where it sits, in px of the vip_hero slice (HERO_BOX): the screen places it from these.
    return path, (int(X0 + bx0 - ox), int(Y0 + by0 - oy), int(bx1 - bx0), int(by1 - by0))


def make_lower_glow(orig, lay, out, preview):
    """The purple wave right of the last card and down the points panel's right side: the crown and the panel
    painted out (both are drawn on top: lower-crown.png and the live panel, whose size and place differ a little
    from the design's), the page ground made transparent, faded in from the left and the top (the cards' own light
    above it stays out) and out at the bottom, under the panel, so no edge of it shows at the panel's top line or
    anywhere else. LOWER_GLOW in components/vip/assets.ts carries the size and the panel's top row (264)."""
    X0, Y0, X1, Y1 = 288, 1330, 841, 1775  # from the last card's right edge down to the design's last app row
    EXT = 25  # rows added under it (the app leaves more room under the panel than the design): the fill continues
    PANEL = (22 - 5, 1596 - 5, 821 + 5, 1751 + 5)  # the panel's rim (x0, y0, x1, y1) with its edge light
    FADE = (1725, Y1 + EXT)  # gone by the image's last row, half gone at the panel's bottom
    img = np.concatenate([orig[Y0:Y1, X0:X1], np.zeros((EXT, X1 - X0, 3))])
    H, W, _ = img.shape
    cfg = DECOS['lower-crown']
    bx0, by0, bx1, by1 = deco_box(lay, cfg)
    crown, (cx, cy) = cut_out(orig[by0:by1, bx0:bx1], cfg)
    m = np.zeros((H, W))
    top, left = by0 + cy - Y0, bx0 + cx - X0
    h, w = crown.shape[:2]
    t0, l0 = max(top, 0), max(left, 0)
    m[t0:min(top + h, H), l0:min(left + w, W)] = crown[t0 - top:min(top + h, H) - top, l0 - left:min(left + w, W) - left, 3]
    unknown = ndimage.binary_dilation(m > 0.04, iterations=8)  # wide: none of the crown's gold stays
    px0, py0, px1, py1 = PANEL
    unknown[max(py0 - Y0, 0):py1 - Y0, max(px0 - X0, 0):px1 - X0] = True
    unknown[Y1 - Y0:] = True  # the added rows: the smooth continuation of the last ones
    img = harmonic(img, unknown)
    a = colour_to_alpha(img, PAGE_GROUND)
    col = unmix(img, PAGE_GROUND, a)
    yy, xx = np.mgrid[0:H, 0:W]
    a = a * smooth(xx, 0, 90) * smooth(yy, 0, 50) * (1 - smooth(yy + Y0, *FADE))
    rgba = np.dstack([col * (a[..., None] > 0), a])
    path = os.path.join(out, 'lower-glow.webp')
    Image.fromarray(u8(rgba), 'RGBA').save(path, 'WEBP', quality=88, method=6)
    if preview:
        comp = col * a[..., None] + PAGE_GROUND * (1 - a[..., None])
        Image.fromarray(u8(comp)).save(os.path.join(preview, 'lower-glow.png'))
    return path


# ---------------------------------------------------------------------------------------------- main

def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    pkg = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else 'assets/vip'
    preview = sys.argv[3] if len(sys.argv) > 3 else None
    os.makedirs(out, exist_ok=True)
    if preview:
        os.makedirs(preview, exist_ok=True)
    lay = {e['id']: e['box'] for e in json.load(open(os.path.join(pkg, 'spec/layout.json')))['elements']}
    orig = np.asarray(Image.open(os.path.join(pkg, 'reference/original.png')).convert('RGB'), np.float64) / 255
    crop, files = make_heroes(pkg, lay, out, preview)
    files += make_cutouts(orig, lay, out, preview)
    glow, glow_box = make_hero_glow(orig, out, preview)
    files += [glow, make_lower_glow(orig, lay, out, preview)]
    for f in files:
        im = Image.open(f)
        print(f'{f}  {im.width}x{im.height}  {os.path.getsize(f) // 1024} KB')
    print('hero crop in the vip_hero slice (x0, y0, x1, y1):', tuple(int(v) for v in crop))
    print('hero glow in the vip_hero slice (left, top, width, height; lib/vip-screen HERO_GLOW):', glow_box)


if __name__ == '__main__':
    main()
