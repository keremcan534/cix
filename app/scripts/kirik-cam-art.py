"""Muzip hediyeler's placeholder pictures for the Terlik Geldi! → Kırık Cam → Cam Tamiri pair (docs/PROFIL_IZLERI.md),
drawn in code until the team uploads the real ones in the panel (Hediyeler › İz türleri, docs/HEDIYE_YONETIMI.md).

Run from app/ (Python 3 with Pillow and numpy):

    python3 -I scripts/kirik-cam-art.py [preview dir]

Writes:
  assets/marks/kirik-cam.png                   Kırık Cam: the app's own overlay (components/profile-mark), cracks of a
                                               pane hit near its top left edge running round the photo's rim, the
                                               middle (the face) left open; 512 × 512, real transparency (alpha 0)
  ../docs/gorseller/muzip/kirik-cam-512.png    the same file, to upload as the kind's overlay (the server's check:
                                               server/api/tools/mark-art-check.py)
  ../docs/gorseller/muzip/cam-tamiri-512.png   Cam Tamiri's icon (a mended pane: two strips of tape and a glint), to
                                               upload as the gift's icon
With a preview dir: kirik-cam-preview.png, the overlay over a sample face at the app's seat sizes (30, 52, 78, 96 px)
on a light and a dark ground, and the icon.

Deterministic: a fixed seed, so a rerun writes the same files.
"""

import math
import os
import random
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

S = 4  # drawn this many times bigger, then made smaller (smooth edges)
N = 512
HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(HERE)
DOCS = os.path.join(os.path.dirname(APP), 'docs', 'gorseller', 'muzip')


def shrink(img, size):
    """`img` at `size` px (premultiplied while it shrinks, so the edges keep their colour)."""
    return img.convert('RGBa').resize((size, size), Image.LANCZOS).convert('RGBA')


def crack_path(rng, x, y, angle, length, jag):
    """A crack from (x, y) towards `angle` (radians): a jagged line of `length` px, bending a little at each step."""
    pts = [(x, y)]
    done = 0.0
    while done < length:
        step = rng.uniform(14, 30)
        angle += rng.uniform(-jag, jag)
        x += math.cos(angle) * step
        y += math.sin(angle) * step
        pts.append((x, y))
        done += step
    return pts


def inside_face(x, y, r=0.34):
    return math.hypot(x - N / 2, y - N / 2) < r * N


def kirik_cam():
    rng = random.Random(20261120)
    big = N * S
    lines = Image.new('L', (big, big), 0)
    shade = Image.new('L', (big, big), 0)
    tint = Image.new('L', (big, big), 0)
    d = ImageDraw.Draw(lines)
    ds = ImageDraw.Draw(shade)
    dt = ImageDraw.Draw(tint)

    def stroke(pts, width):
        sc = [(px * S, py * S) for px, py in pts]
        ds.line(sc, fill=255, width=int((width + 3) * S), joint='curve')
        d.line(sc, fill=255, width=int(width * S), joint='curve')

    def impact(ix, iy, rings, spokes, reach, width):
        """A hit at (ix, iy): tinted shards, rings of broken arcs between the spokes, the spokes running out."""
        angles = sorted(rng.uniform(0, 2 * math.pi) for _ in range(spokes))
        for i, a in enumerate(angles):
            b = angles[(i + 1) % spokes] if i + 1 < spokes else angles[0] + 2 * math.pi
            for r0, r1 in zip([0] + rings[:-1], rings):
                r1 += rng.uniform(-5, 8)
                poly = [(ix + math.cos(a) * r0, iy + math.sin(a) * r0), (ix + math.cos(a) * r1, iy + math.sin(a) * r1), (ix + math.cos(b) * r1, iy + math.sin(b) * r1), (ix + math.cos(b) * r0, iy + math.sin(b) * r0)]
                if not any(inside_face(px, py) for px, py in poly) and rng.random() < 0.7:
                    dt.polygon([(px * S, py * S) for px, py in poly], fill=int(rng.uniform(90, 170)))
        for r in rings:
            for i, a in enumerate(angles):
                if rng.random() < 0.2:
                    continue
                b = angles[(i + 1) % spokes] if i + 1 < spokes else angles[0] + 2 * math.pi
                rr = r + rng.uniform(-4, 4)
                pts = [(ix + math.cos(a + (b - a) * t / 6) * rr, iy + math.sin(a + (b - a) * t / 6) * rr) for t in range(7)]
                if not any(inside_face(px, py) for px, py in pts):
                    stroke(pts, width * 0.75)
        for a in angles:
            pts = crack_path(rng, ix, iy, a, rng.uniform(reach * 0.6, reach), 0.22)
            keep = [pts[0]]
            for p in pts[1:]:
                if inside_face(*p, r=0.35) or not (2 < p[0] < N - 2 and 2 < p[1] < N - 2):
                    break
                keep.append(p)
            if len(keep) > 1:
                stroke(keep, width)

    # The hit: up and to the left, near the rim, where a slipper lands; a smaller second one low on the right.
    impact(112, 100, [26, 52, 82], 14, 170, 6.5)
    impact(418, 402, [18, 38], 10, 110, 5.0)
    # Cracks that ran on round the rim, both ways, with small branches; never into the face.
    for start, a, length in [((160, 46), -0.12, 380), ((52, 170), 1.72, 360), ((478, 250), 1.95, 200), ((300, 490), 3.05, 210), ((470, 120), 2.4, 140), ((40, 380), -0.7, 120)]:
        pts = crack_path(rng, *start, a, length, 0.16)
        keep = []
        for p in pts:
            if inside_face(*p, r=0.36):
                break
            keep.append(p)
        if len(keep) > 1:
            stroke(keep, 5.0)
            for j in range(1, len(keep) - 1, 2):
                bx, by = keep[j]
                ang = math.atan2(by - N / 2, bx - N / 2) + rng.choice([-1, 1]) * rng.uniform(0.3, 0.9)
                br = [p for p in crack_path(rng, bx, by, ang, rng.uniform(22, 50), 0.3) if not inside_face(*p, r=0.36)]
                if len(br) > 1:
                    stroke(br, 3.2)
    # A sheen on the glass along the rim (top left and bottom right), faint; never over the face.
    for x0, y0, x1, y1 in [(20, 300, 300, 20), (240, 500, 500, 240)]:
        dt.line([(x0 * S, y0 * S), (x1 * S, y1 * S)], fill=60, width=26 * S)
    face_off = Image.new('L', (big, big), 255)
    c, r = N / 2 * S, 0.36 * N * S
    ImageDraw.Draw(face_off).ellipse([c - r, c - r, c + r, c + r], fill=0)
    tint = Image.fromarray(np.minimum(np.asarray(tint), np.asarray(face_off)), 'L')

    lines = lines.filter(ImageFilter.GaussianBlur(0.35 * S))
    shade = shade.filter(ImageFilter.GaussianBlur(1.1 * S))
    tint = tint.filter(ImageFilter.GaussianBlur(0.6 * S))
    out = Image.new('RGBA', (big, big), (0, 0, 0, 0))
    # A faint blue glass on the shards, a dark edge under every crack (seen on a light photo), the crack's bright
    # line on top (seen on a dark one).
    for mask, colour, k in [(tint, (196, 228, 255), 0.6), (shade, (28, 44, 66), 0.8), (lines, (248, 252, 255), 1.0)]:
        layer = Image.new('RGBA', (big, big), colour + (255,))
        a = np.asarray(mask, dtype=np.float32) * k
        layer.putalpha(Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), 'L'))
        out = Image.alpha_composite(out, layer)
    # A glint at the impact.
    g = Image.new('L', (big, big), 0)
    gd = ImageDraw.Draw(g)
    ix, iy, w, r = 112, 100, 5, 26
    pts = [(ix, iy - r), (ix + w, iy - w), (ix + r, iy), (ix + w, iy + w), (ix, iy + r), (ix - w, iy + w), (ix - r, iy), (ix - w, iy - w)]
    gd.polygon([(px * S, py * S) for px, py in pts], fill=255)
    layer = Image.new('RGBA', (big, big), (255, 255, 255, 255))
    layer.putalpha(g.filter(ImageFilter.GaussianBlur(0.5 * S)))
    out = Image.alpha_composite(out, layer)
    img = shrink(out, N)
    # Anything barely there is nothing: the empty parts are truly transparent (alpha 0), as the server's check wants.
    arr = np.asarray(img).copy()
    arr[arr[..., 3] < 6] = 0
    return Image.fromarray(arr, 'RGBA')


def cam_tamiri_icon():
    """Cam Tamiri: a pane of glass mended with two strips of tape, a glint; on a transparent ground."""
    big = N * S
    out = Image.new('RGBA', (big, big), (0, 0, 0, 0))

    def put(mask, fill, alpha=1.0):
        nonlocal out
        layer = Image.new('RGBA', (big, big), fill + (255,))
        a = np.asarray(mask, dtype=np.float32) * alpha
        layer.putalpha(Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), 'L'))
        out = Image.alpha_composite(out, layer)

    def mask(fn):
        m = Image.new('L', (big, big), 0)
        fn(ImageDraw.Draw(m))
        return m

    def rr(d, x0, y0, x1, y1, r, fill=255):
        d.rounded_rectangle([x0 * S, y0 * S, x1 * S, y1 * S], radius=r * S, fill=fill)

    # The frame and the pane.
    put(mask(lambda d: rr(d, 70, 70, 442, 442, 46)).filter(ImageFilter.GaussianBlur(10 * S)), (20, 40, 70), 0.35)
    put(mask(lambda d: rr(d, 64, 56, 448, 440, 44)), (93, 120, 150))
    put(mask(lambda d: rr(d, 92, 84, 420, 412, 28)), (160, 214, 248))
    # A light from the top left over the glass.
    hl = mask(lambda d: d.polygon([(110 * S, 100 * S), (260 * S, 100 * S), (110 * S, 250 * S)], fill=255))
    put(hl.filter(ImageFilter.GaussianBlur(6 * S)), (235, 248, 255), 0.75)
    # The mended crack under the tape.
    put(mask(lambda d: d.line([(150 * S, 150 * S), (230 * S, 220 * S), (210 * S, 270 * S), (330 * S, 350 * S)], fill=255, width=7 * S, joint='curve')), (70, 105, 140), 0.9)
    # Two strips of tape, crossed.
    for ang in (35, -35):
        m = Image.new('L', (big, big), 0)
        md = ImageDraw.Draw(m)
        rr(md, 256 - 170, 256 - 34, 256 + 170, 256 + 34, 10)
        m = m.rotate(ang, resample=Image.BICUBIC, center=(256 * S, 256 * S))
        put(m.filter(ImageFilter.GaussianBlur(4 * S)), (60, 40, 20), 0.3)
        put(m, (246, 222, 160))
        edge = m.filter(ImageFilter.FIND_EDGES).filter(ImageFilter.GaussianBlur(1.2 * S))
        put(edge, (196, 160, 92), 0.8)
    # A glint.
    def glint(d):
        cx, cy, r, w = 372, 132, 44, 9
        d.polygon([(cx * S, (cy - r) * S), ((cx + w) * S, (cy - w) * S), ((cx + r) * S, cy * S), ((cx + w) * S, (cy + w) * S), (cx * S, (cy + r) * S), ((cx - w) * S, (cy + w) * S), ((cx - r) * S, cy * S), ((cx - w) * S, (cy - w) * S)], fill=255)

    put(mask(glint), (255, 255, 255))
    img = shrink(out, N)
    arr = np.asarray(img).copy()
    arr[arr[..., 3] < 4] = 0
    return Image.fromarray(arr, 'RGBA')


def face(size):
    """A sample round photo: a soft face on a warm ground, enough to judge how the overlay sits on a real one."""
    img = Image.new('RGBA', (size * 4, size * 4), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    n = size * 4
    d.ellipse([0, 0, n, n], fill=(214, 168, 132, 255))
    d.ellipse([n * 0.28, n * 0.18, n * 0.72, n * 0.66], fill=(240, 205, 175, 255))
    d.pieslice([n * 0.18, n * 0.62, n * 0.82, n * 1.3], 180, 360, fill=(90, 120, 170, 255))
    d.ellipse([n * 0.38, n * 0.36, n * 0.44, n * 0.42], fill=(60, 40, 30, 255))
    d.ellipse([n * 0.56, n * 0.36, n * 0.62, n * 0.42], fill=(60, 40, 30, 255))
    d.arc([n * 0.42, n * 0.44, n * 0.58, n * 0.56], 20, 160, fill=(150, 70, 60, 255), width=max(1, n // 60))
    return img.resize((size, size), Image.LANCZOS)


def preview(mark, icon, where, scale=3):
    sizes = [30, 52, 78, 96]
    pad = 16
    w = pad + sum(s * scale + pad for s in sizes) + 512 // 2 + pad
    h = (max(sizes) * scale + pad * 2) * 2
    sheet = Image.new('RGBA', (w, h), (0, 0, 0, 255))
    for row, ground in enumerate([(245, 241, 234, 255), (24, 16, 40, 255)]):
        y0 = row * (h // 2)
        sheet.paste(Image.new('RGBA', (w, h // 2), ground), (0, y0))
        x = pad
        for s in sizes:
            px = s * scale
            photo = face(px)
            over = mark.resize((px, px), Image.LANCZOS)
            circle = Image.new('L', (px, px), 0)
            ImageDraw.Draw(circle).ellipse([0, 0, px - 1, px - 1], fill=255)
            clip = Image.new('RGBA', (px, px), (0, 0, 0, 0))
            clip.paste(over, (0, 0), Image.fromarray((np.asarray(circle, dtype=np.float32) * np.asarray(over)[..., 3] / 255).astype(np.uint8), 'L'))
            seat = Image.alpha_composite(photo, clip)
            sheet.alpha_composite(seat, (x, y0 + pad))
            x += px + pad
        sheet.alpha_composite(icon.resize((256, 256), Image.LANCZOS), (x, y0 + pad))
    sheet.convert('RGB').save(os.path.join(where, 'kirik-cam-preview.png'))


def main():
    mark = kirik_cam()
    icon = cam_tamiri_icon()
    os.makedirs(os.path.join(APP, 'assets', 'marks'), exist_ok=True)
    os.makedirs(DOCS, exist_ok=True)
    mark.save(os.path.join(APP, 'assets', 'marks', 'kirik-cam.png'), optimize=True)
    mark.save(os.path.join(DOCS, 'kirik-cam-512.png'), optimize=True)
    icon.save(os.path.join(DOCS, 'cam-tamiri-512.png'), optimize=True)
    if len(sys.argv) > 1:
        os.makedirs(sys.argv[1], exist_ok=True)
        preview(mark, icon, sys.argv[1])


if __name__ == '__main__':
    main()
