"""Profil izleri's pictures (docs/PROFIL_IZLERI.md), drawn here in the gift icons' style (assets/gifts: a glossy
cartoon with a darker outline of its own colour, soft gradients and white highlights, on a transparent ground).

Run from app/ (Python 3 with Pillow and numpy):

    python3 -I scripts/mark-art.py [preview dir]

Writes:
  assets/gifts/192/hediye-kaka.png, assets/gifts/512/hediye-kaka.png   💩 Kaka (gift k1): a soft-serve swirl with a face
  assets/gifts/192/hediye-su.png,   assets/gifts/512/hediye-su.png     💧 Su (gift k2): a water drop with droplets and sparkles
  assets/marks/kaka-iz.png        the dirt drawn over a marked profile photo (components/profile-mark): brown splats and
                                  drips round the photo's edge, its middle (the face) left clear; square, the app clips it
                                  to the photo's circle
  assets/marks/su-sicrama.png     the water splash that plays when Su cleans it
With a preview dir: preview.png, every picture on a light and a dark ground and the overlay over a sample face at the
sizes the app draws it (a seat ~56 px, the person card ~80 px, the profile ~100 px).

Deterministic: no randomness, so a rerun writes the same files. After a change run server/api/tools/panel-art.py too
(the panel's copies of the gift icons).
"""

import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

S = 4  # every picture is drawn this many times bigger, then made smaller (smooth edges)
HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(HERE)


def hexrgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


class Pic:
    """An RGBA canvas of n × n (logical px), drawn at S × that size."""

    def __init__(self, n):
        self.n = n
        self.img = Image.new('RGBA', (n * S, n * S), (0, 0, 0, 0))

    def mask(self):
        return Image.new('L', self.img.size, 0)

    def paint(self, mask, fill, alpha=1.0):
        """Lays `fill` (an (r, g, b) colour or an H×W×3 array) through `mask` (an L image), `alpha` times its opacity."""
        if isinstance(fill, tuple):
            layer = Image.new('RGBA', self.img.size, fill + (255,))
        else:
            arr = np.dstack([np.clip(fill, 0, 255).astype(np.uint8), np.full(fill.shape[:2], 255, np.uint8)])
            layer = Image.fromarray(arr, 'RGBA')
        a = np.asarray(mask, dtype=np.float32) * alpha
        layer.putalpha(Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), 'L'))
        self.img = Image.alpha_composite(self.img, layer)

    def out(self, size):
        """The picture at `size` px (premultiplied while it shrinks, so the edges keep their colour)."""
        return self.img.convert('RGBa').resize((size, size), Image.LANCZOS).convert('RGBA')


def ell(d, cx, cy, rx, ry, fill=255):
    d.ellipse([(cx - rx) * S, (cy - ry) * S, (cx + rx) * S, (cy + ry) * S], fill=fill)


def poly(d, pts, fill=255):
    d.polygon([(x * S, y * S) for x, y in pts], fill=fill)


def shape(pic, fn):
    m = pic.mask()
    fn(ImageDraw.Draw(m))
    return m


def blur(m, r):
    return m.filter(ImageFilter.GaussianBlur(r * S))


def grid(pic):
    n = pic.n * S
    y, x = np.mgrid[0:n, 0:n].astype(np.float32) / S
    return x, y


def radial(pic, cx, cy, r, inner, outer):
    """A colour going from `inner` at (cx, cy) to `outer` at distance r and beyond."""
    x, y = grid(pic)
    t = np.clip(np.hypot(x - cx, y - cy) / r, 0, 1)[..., None]
    a, b = np.array(hexrgb(inner), np.float32), np.array(hexrgb(outer), np.float32)
    return a + (b - a) * t


def linear(pic, x0, y0, x1, y1, c0, c1):
    x, y = grid(pic)
    dx, dy = x1 - x0, y1 - y0
    t = np.clip(((x - x0) * dx + (y - y0) * dy) / (dx * dx + dy * dy), 0, 1)[..., None]
    a, b = np.array(hexrgb(c0), np.float32), np.array(hexrgb(c1), np.float32)
    return a + (b - a) * t


def drop_pts(cx, cy, r, tip, angle=-90, steps=64):
    """A teardrop: a circle of radius r at (cx, cy) whose point is `tip` px from its centre towards `angle` degrees."""
    a = math.radians(angle)
    tx, ty = cx + math.cos(a) * tip, cy + math.sin(a) * tip
    # The tangent points from the tip to the circle.
    half = math.acos(min(1.0, r / tip))
    pts = [(tx, ty)]
    for i in range(steps + 1):
        t = a + half + (2 * math.pi - 2 * half) * i / steps
        pts.append((cx + math.cos(t) * r, cy + math.sin(t) * r))
    return pts


def brush(d, ctrl, r0, r1, grow, k, steps=160):
    """A stroke along the cubic Bézier `ctrl` (logical px at 512, scaled by k) that narrows from r0 to r1."""
    (x0, y0), (x1, y1), (x2, y2), (x3, y3) = ctrl
    for i in range(steps + 1):
        t = i / steps
        u = 1 - t
        x = u ** 3 * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t ** 3 * x3
        y = u ** 3 * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t ** 3 * y3
        r = r0 + (r1 - r0) * (t ** 0.8)
        ell(d, x * k, y * k, (r + grow) * k, (r + grow) * k)


def sparkle(d, cx, cy, r, fill=255):
    """A four-pointed glint."""
    w = r * 0.28
    poly(d, [(cx, cy - r), (cx + w, cy - w), (cx + r, cy), (cx + w, cy + w), (cx, cy + r), (cx - w, cy + w), (cx - r, cy), (cx - w, cy - w)], fill)


def arc_stroke(d, cx, cy, rx, ry, a0, a1, width, fill=255):
    d.arc([(cx - rx) * S, (cy - ry) * S, (cx + rx) * S, (cy + ry) * S], a0, a1, fill=fill, width=int(width * S))


# ------------------------------------------------------------------------------------------------- 💩 Kaka

BROWN_LINE = '#4A2410'


def kaka(n=512):
    p = Pic(n)
    k = n / 512
    # The coils from the bottom up: (cx, cy, rx, ry). Each is outlined, so an upper coil's outline lies over the one
    # below it and reads as the fold between them.
    coils = [(256, 372, 186, 88), (252, 276, 146, 74), (262, 192, 104, 60)]
    line = 9

    def tip(d, grow=0.0):
        # The swirl's curled point: a soft stroke out of the top coil that narrows as it bends over to the right.
        brush(d, [(256, 158), (246, 96), (300, 58), (332, 84)], 46, 11, grow, k)

    # A soft shadow under it.
    p.paint(blur(shape(p, lambda d: ell(d, 256 * k, 448 * k, 170 * k, 22 * k)), 6 * k), (60, 30, 10), 0.28)
    for i, (cx, cy, rx, ry) in enumerate(coils):
        cx, cy, rx, ry = cx * k, cy * k, rx * k, ry * k
        p.paint(shape(p, lambda d: ell(d, cx, cy, rx + line * k, ry + line * k)), hexrgb(BROWN_LINE))
        body = shape(p, lambda d: ell(d, cx, cy, rx, ry))
        p.paint(body, radial(p, cx - rx * 0.35, cy - ry * 0.55, rx * 1.35, '#C08048', '#6E3818'))
        # The fold's shade along the coil's lower edge, and a glossy band along its top.
        lower = np.asarray(body, np.float32) / 255 * np.asarray(blur(shape(p, lambda d: ell(d, cx, cy + ry * 0.55, rx * 1.02, ry * 0.75)), 3 * k), np.float32) / 255
        p.paint(Image.fromarray((lower * 255).astype(np.uint8)), (78, 36, 14), 0.45)
        hl = shape(p, lambda d: arc_stroke(d, cx - rx * 0.08, cy - ry * 0.05, rx * 0.78, ry * 0.68, 200, 262, 11 * k))
        p.paint(blur(hl, 1.2 * k), (255, 236, 214), 0.75)
        ell_dot = shape(p, lambda d: ell(d, cx + rx * 0.42, cy - ry * 0.52, 9 * k, 6 * k))
        p.paint(blur(ell_dot, 1 * k), (255, 240, 225), 0.7 if i else 0.55)
    # The point on top.
    p.paint(shape(p, lambda d: tip(d, line)), hexrgb(BROWN_LINE))
    p.paint(shape(p, lambda d: tip(d)), radial(p, 250 * k, 112 * k, 96 * k, '#C78A50', '#71391A'))
    p.paint(blur(shape(p, lambda d: arc_stroke(d, 262 * k, 128 * k, 26 * k, 30 * k, 190, 260, 8 * k)), 1.2 * k), (255, 240, 222), 0.75)
    p.paint(blur(shape(p, lambda d: ell(d, 306 * k, 70 * k, 5 * k, 4 * k)), 0.8 * k), (255, 240, 222), 0.7)

    # The face on the middle coil: big eyes with a glint, pink cheeks, an open smile with a tongue.
    for ex in (206, 300):
        ex, ey = ex * k, 262 * k
        p.paint(shape(p, lambda d: ell(d, ex, ey, 30 * k, 36 * k)), hexrgb('#3A1A08'))
        p.paint(shape(p, lambda d: ell(d, ex, ey, 25 * k, 31 * k)), (255, 255, 255))
        p.paint(shape(p, lambda d: ell(d, ex + 4 * k, ey + 6 * k, 15 * k, 18 * k)), hexrgb('#2A1406'))
        p.paint(shape(p, lambda d: ell(d, ex - 2 * k, ey - 3 * k, 6 * k, 7 * k)), (255, 255, 255))
        p.paint(shape(p, lambda d: ell(d, ex + 9 * k, ey + 14 * k, 3 * k, 3 * k)), (255, 255, 255), 0.85)
    for cx in (162, 344):
        p.paint(blur(shape(p, lambda d: ell(d, cx * k, 300 * k, 22 * k, 12 * k)), 3 * k), (255, 120, 140), 0.45)
    mouth = shape(p, lambda d: d.chord([226 * k * S, 272 * k * S, 286 * k * S, 334 * k * S], 0, 180, fill=255))
    p.paint(mouth, hexrgb('#3A1A08'))
    tongue = np.minimum(np.asarray(mouth, np.float32), np.asarray(shape(p, lambda d: ell(d, 256 * k, 326 * k, 20 * k, 14 * k)), np.float32))
    p.paint(Image.fromarray(tongue.astype(np.uint8)), hexrgb('#F2667E'))
    return p


# ------------------------------------------------------------------------------------------------- 💧 Su

def su(n=512):
    p = Pic(n)
    k = n / 512
    line = 9
    body = lambda grow=0: drop_pts(256 * k, 312 * k, (146 + grow) * k, (262 + grow * 1.7) * k, angle=-90)  # noqa: E731
    p.paint(blur(shape(p, lambda d: ell(d, 256 * k, 470 * k, 140 * k, 16 * k)), 6 * k), (20, 90, 140), 0.22)
    p.paint(shape(p, lambda d: poly(d, body(line))), hexrgb('#1679C2'))
    drop = shape(p, lambda d: poly(d, body()))
    p.paint(drop, radial(p, 200 * k, 230 * k, 250 * k, '#B8F1FF', '#1E92E0'))
    # Depth: a deeper blue round its lower right, a light pool at its bottom (the water's own light).
    deep = np.asarray(drop, np.float32) / 255 * np.asarray(blur(shape(p, lambda d: ell(d, 330 * k, 380 * k, 120 * k, 110 * k)), 30 * k), np.float32) / 255
    p.paint(Image.fromarray((deep * 255).astype(np.uint8)), hexrgb('#0F6FBF'), 0.45)
    pool = np.asarray(drop, np.float32) / 255 * np.asarray(blur(shape(p, lambda d: ell(d, 262 * k, 410 * k, 84 * k, 34 * k)), 10 * k), np.float32) / 255
    p.paint(Image.fromarray((pool * 255).astype(np.uint8)), (210, 250, 255), 0.55)
    # The gift icons' white highlights: a long one down the left, a dot above it, a smile of light at the bottom.
    p.paint(blur(shape(p, lambda d: arc_stroke(d, 256 * k, 312 * k, 112 * k, 112 * k, 150, 222, 22 * k)), 1.5 * k), (255, 255, 255), 0.85)
    p.paint(blur(shape(p, lambda d: ell(d, 214 * k, 150 * k, 13 * k, 18 * k)), 1.5 * k), (255, 255, 255), 0.85)
    p.paint(blur(shape(p, lambda d: arc_stroke(d, 262 * k, 300 * k, 92 * k, 92 * k, 30, 112, 10 * k)), 1.5 * k), (255, 255, 255), 0.55)
    # Droplets flying off, like Sulu Balon's.
    for cx, cy, r, ang in ((92, 318, 20, -120), (430, 250, 15, -60), (412, 404, 11, -75)):
        pts = lambda grow=0: drop_pts(cx * k, cy * k, (r + grow) * k, (r * 1.9 + grow * 1.6) * k, angle=ang)  # noqa: E731
        p.paint(shape(p, lambda d: poly(d, pts(5))), hexrgb('#1679C2'))
        dm = shape(p, lambda d: poly(d, pts()))
        p.paint(dm, radial(p, (cx - r * 0.3) * k, (cy - r * 0.3) * k, r * 1.6 * k, '#C8F5FF', '#2AA2EA'))
        p.paint(shape(p, lambda d: ell(d, (cx - r * 0.3) * k, (cy - r * 0.25) * k, r * 0.28 * k, r * 0.36 * k)), (255, 255, 255), 0.9)
    # Clean: two sparkles.
    for cx, cy, r in ((392, 120, 34), (116, 176, 20)):
        p.paint(blur(shape(p, lambda d: sparkle(d, cx * k, cy * k, (r + 6) * k)), 2 * k), (120, 220, 255), 0.6)
        p.paint(shape(p, lambda d: sparkle(d, cx * k, cy * k, r * k)), (255, 255, 255))
    return p


# ------------------------------------------------------------------------------------------------- the dirt

def splat_parts(cx, cy, r, bits):
    """A splat: a round middle and the bits round it (angle in degrees, distance and radius as shares of r)."""
    parts = [(cx, cy, r, r)]
    for ang, dist, rr in bits:
        a = math.radians(ang)
        parts.append((cx + math.cos(a) * r * dist, cy + math.sin(a) * r * dist, r * rr, r * rr))
    return parts


def kaka_iz(n=384):
    """The dirt over a marked photo, in a square the app clips to the photo's circle (its middle is the face)."""
    p = Pic(n)
    k = n / 384
    # (cx, cy, r) splats with their bits, and the drips running down from them (x, top, bottom, width).
    splats = [
        splat_parts(78, 70, 62, [(-10, 1.05, 0.34), (20, 1.0, 0.26), (55, 0.98, 0.3), (95, 1.0, 0.26), (130, 0.92, 0.36), (175, 0.95, 0.3), (210, 1.0, 0.24), (250, 0.9, 0.34), (290, 0.97, 0.28), (325, 1.0, 0.3)]),
        splat_parts(326, 206, 38, [(160, 0.95, 0.36), (200, 1.0, 0.3), (120, 0.92, 0.3), (240, 0.95, 0.28), (90, 1.0, 0.26), (60, 0.95, 0.3)]),
        splat_parts(84, 312, 24, [(-30, 1.0, 0.36), (30, 1.0, 0.3), (110, 1.0, 0.32), (200, 0.95, 0.34), (260, 0.95, 0.3)]),
    ]
    drips = [(64, 100, 196, 22), (118, 108, 160, 15), (40, 106, 140, 12), (318, 230, 282, 14)]
    flecks = [(160, 40, 9), (182, 70, 6), (150, 132, 7), (268, 150, 8), (290, 128, 5), (250, 300, 7), (148, 330, 6), (300, 296, 9), (206, 24, 5)]
    line = 4.5

    def draw_all(d, grow):
        for parts in splats:
            for cx, cy, rx, ry in parts:
                ell(d, cx * k, cy * k, (rx + grow) * k, (ry + grow) * k)
        for x, top, bottom, w in drips:
            hw = w / 2 + grow
            d.rounded_rectangle([(x - hw) * k * S, top * k * S, (x + hw) * k * S, bottom * k * S], radius=hw * k * S, fill=255)
            ell(d, x * k, bottom * k, (w * 0.62 + grow) * k, (w * 0.66 + grow) * k)
        for x, y, r in flecks:
            ell(d, x * k, y * k, (r + grow) * k, (r + grow) * k)

    # A faint smear round the big splats: the photo looks dirty there, not only spotted.
    smear = shape(p, lambda d: (ell(d, 92 * k, 92 * k, 108 * k, 96 * k), ell(d, 330 * k, 214 * k, 64 * k, 70 * k)))
    p.paint(blur(smear, 14 * k), (92, 52, 20), 0.22)
    p.paint(shape(p, lambda d: draw_all(d, line)), hexrgb('#3E1E0A'))
    mud = shape(p, lambda d: draw_all(d, 0))
    p.paint(mud, linear(p, 40 * k, 20 * k, 300 * k, 330 * k, '#A9683A', '#6A3616'))
    # Each splat's own light: brighter towards its upper left, a glossy rim and a few white specks.
    for parts in splats:
        cx, cy, r, _ = parts[0]
        inner = np.asarray(mud, np.float32) / 255 * np.asarray(blur(shape(p, lambda d: ell(d, (cx - r * 0.3) * k, (cy - r * 0.35) * k, r * 0.7 * k, r * 0.6 * k)), r * 0.25 * k), np.float32) / 255
        p.paint(Image.fromarray((inner * 255).astype(np.uint8)), (200, 140, 86), 0.55)
        p.paint(blur(shape(p, lambda d: arc_stroke(d, cx * k, cy * k, r * 0.72 * k, r * 0.72 * k, 195, 250, max(3, r * 0.13) * k)), 0.8 * k), (255, 236, 214), 0.8)
        p.paint(shape(p, lambda d: ell(d, (cx + r * 0.38) * k, (cy - r * 0.4) * k, r * 0.1 * k, r * 0.08 * k)), (255, 244, 232), 0.85)
    for x, top, bottom, w in drips:
        p.paint(blur(shape(p, lambda d: ell(d, (x - w * 0.18) * k, (bottom - w * 0.12) * k, w * 0.18 * k, w * 0.22 * k)), 0.5 * k), (255, 240, 225), 0.85)
    return p


def su_sicrama(n=384):
    """A splash of water: a ring of drops bursting out of a light middle."""
    p = Pic(n)
    k = n / 384
    c = 192
    p.paint(blur(shape(p, lambda d: ell(d, c * k, c * k, 120 * k, 120 * k)), 30 * k), (150, 225, 255), 0.55)
    ring = shape(p, lambda d: arc_stroke(d, c * k, c * k, 128 * k, 128 * k, 0, 360, 16 * k))
    p.paint(blur(ring, 3 * k), (190, 240, 255), 0.7)
    for i in range(12):
        ang = i * 30 + (8 if i % 2 else -6)
        dist = 128 + (18 if i % 3 == 0 else 0)
        r = 15 if i % 2 else 21
        a = math.radians(ang)
        x, y = c + math.cos(a) * dist, c + math.sin(a) * dist
        pts = lambda grow=0: drop_pts(x * k, y * k, (r + grow) * k, (r * 2.4 + grow * 1.6) * k, angle=ang + 180)  # noqa: E731
        p.paint(shape(p, lambda d: poly(d, pts(4))), hexrgb('#1679C2'))
        dm = shape(p, lambda d: poly(d, pts()))
        p.paint(dm, radial(p, (x - r * 0.3) * k, (y - r * 0.3) * k, r * 1.8 * k, '#D2F7FF', '#2AA2EA'))
        p.paint(shape(p, lambda d: ell(d, (x - r * 0.25) * k, (y - r * 0.25) * k, r * 0.3 * k, r * 0.3 * k)), (255, 255, 255), 0.9)
    for x, y, r in ((192, 30, 9), (60, 110, 7), (330, 300, 8), (40, 280, 6), (350, 80, 6)):
        p.paint(shape(p, lambda d: ell(d, x * k, y * k, (r + 3) * k, (r + 3) * k)), hexrgb('#1679C2'))
        p.paint(shape(p, lambda d: ell(d, x * k, y * k, r * k, r * k)), hexrgb('#7FD8FF'))
    for x, y, r in ((150, 150, 24), (240, 236, 16)):
        p.paint(shape(p, lambda d: sparkle(d, x * k, y * k, r * k)), (255, 255, 255), 0.95)
    return p


# ------------------------------------------------------------------------------------------------- files

def save(img, rel):
    path = os.path.join(APP, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, optimize=True)
    print(rel, img.size, os.path.getsize(path), 'bytes')


def main():
    preview = sys.argv[1] if len(sys.argv) > 1 else None
    k512, s512 = kaka(512), su(512)
    out = {
        'assets/gifts/512/hediye-kaka.png': k512.out(512),
        'assets/gifts/192/hediye-kaka.png': k512.out(192),
        'assets/gifts/512/hediye-su.png': s512.out(512),
        'assets/gifts/192/hediye-su.png': s512.out(192),
        'assets/marks/kaka-iz.png': kaka_iz(384).out(384),
        'assets/marks/su-sicrama.png': su_sicrama(384).out(384),
    }
    for rel, img in out.items():
        save(img, rel)
    if preview:
        sheet(out, preview)


def sheet(out, folder):
    """Every picture on light and dark, and the dirt over a face at the app's sizes (no frame, so its edge shows)."""
    os.makedirs(folder, exist_ok=True)
    W, H = 1240, 760
    im = Image.new('RGBA', (W, H), (245, 245, 248, 255))
    ImageDraw.Draw(im).rectangle([0, H // 2, W, H], fill=(24, 18, 40, 255))
    icons = [out['assets/gifts/512/hediye-kaka.png'], out['assets/gifts/512/hediye-su.png'], out['assets/marks/kaka-iz.png'], out['assets/marks/su-sicrama.png']]
    for row in (0, 1):
        for i, ic in enumerate(icons):
            t = ic.resize((150, 150), Image.LANCZOS)
            im.alpha_composite(t, (20 + i * 170, 20 + row * (H // 2)))
        x = 720
        for size in (56, 80, 100, 160):
            face = Image.new('RGBA', (size, size), (0, 0, 0, 0))
            # A sample face: a skin disc on a teal ground.
            fd = ImageDraw.Draw(face)
            fd.ellipse([0, 0, size - 1, size - 1], fill=(64, 160, 170, 255))
            fd.ellipse([size * 0.28, size * 0.2, size * 0.72, size * 0.66], fill=(236, 196, 160, 255))
            fd.ellipse([size * 0.18, size * 0.62, size * 0.82, size * 1.2], fill=(220, 90, 110, 255))
            dirt = out['assets/marks/kaka-iz.png'].resize((size, size), Image.LANCZOS)
            face = Image.alpha_composite(face, dirt)
            # Where components/profile-mark puts the gift's badge: low on the photo, right of the middle.
            badge = out['assets/gifts/192/hediye-kaka.png'].resize((round(size * 0.32),) * 2, Image.LANCZOS)
            face.alpha_composite(badge, (round(size * 0.60 - badge.width / 2), round(size * 0.63 - badge.height / 2)))
            m = Image.new('L', (size, size), 0)
            ImageDraw.Draw(m).ellipse([0, 0, size - 1, size - 1], fill=255)
            clipped = Image.new('RGBA', (size, size), (0, 0, 0, 0))
            clipped.paste(face, (0, 0), m)
            im.alpha_composite(clipped, (x, 40 + row * (H // 2)))
            x += size + 24
    im.convert('RGB').save(os.path.join(folder, 'preview.png'))
    print('preview', os.path.join(folder, 'preview.png'))


if __name__ == '__main__':
    main()
