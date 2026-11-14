#!/usr/bin/env python3
"""Cleans a stacked gift / entry video (colour on top, alpha mask below; scripts/alpha-stack.sh) for the room.

    python3 scripts/fx-polish.py in.mp4 out.mp4 [--strength 1] [--edges 0.07,0.06,0.09] [--crf 23]

Two things give a clip away as a rectangle laid over the room (docs/SEFFAF_VIDEO_POC.md):
  - Haze: the clips were cut out of black-ground videos with the glow kept by its brightness, so a ground that was
    not quite black (a night skyline, a floor, mist) stays as a pale, half-transparent sheet; the colour half is
    white there, so on the dark room it reads as a dull grey-white block or halo. It is pale (unsaturated), smooth
    and only partly opaque, unlike the subject (opaque) and its sparks, flames and gold glows (small and bright, or
    coloured). Those are kept; the pale smooth sheet goes. --strength: 0 leaves haze alone (soft light that belongs
    to the effect, an aurora), 1 takes the faint sheets, 2 also the denser ones (a skyline baked into the clip).
  - Cut edges: anything that reaches the frame's edge (a rocket's flame, a palace's steps, a dragon's wing) ends in a
    straight line. On a phone taller than 9:16 the clip sits inside the screen, so that line shows (often at the
    bottom). The alpha fades to nothing over a margin at each edge (left/right, top, bottom: share of the size).
The colour half is left as it is; the audio is copied. Needs ffmpeg, numpy and Pillow.
"""
import argparse
import subprocess
import sys

import numpy as np
from PIL import Image, ImageFilter

LUMA = np.array([0.2126, 0.7152, 0.0722], np.float32)


def smoothstep(lo, hi, x):
    t = np.clip((x - lo) / (hi - lo), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def probe(path):
    out = subprocess.run(
        ['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate', '-of', 'csv=p=0', path],
        capture_output=True, text=True, check=True,
    ).stdout.strip().split(',')
    w, h = int(out[0]), int(out[1])
    num, den = out[2].split('/')
    return w, h, f'{num}/{den}', int(round(int(num) / int(den)))


def edge_ramp(w, h, side, top, bottom):
    x = np.arange(w, dtype=np.float32) + 0.5
    y = np.arange(h, dtype=np.float32) + 0.5
    rx = smoothstep(0.0, side * w, x) * smoothstep(0.0, side * w, w - x) if side > 0 else np.ones(w, np.float32)
    ry = (smoothstep(0.0, top * h, y) if top > 0 else 1.0) * (smoothstep(0.0, bottom * h, h - y) if bottom > 0 else 1.0)
    return np.outer(np.broadcast_to(ry, (h,)), rx).astype(np.float32)


# --strength: below `haze` opaque a pale area goes, from `solid` it stays (in between it fades).
STRENGTH = {0: None, 1: (0.30, 0.65), 2: (0.50, 0.92)}


def _img(x):
    return Image.fromarray((np.clip(x, 0.0, 1.0) * 255.0).astype(np.uint8))


def _arr(img):
    return np.asarray(img, np.float32) / 255.0


def polish_alpha(rgb, a, ramp, strength=1, floor=0.03):
    """rgb: straight colour 0..1 (h, w, 3); a: alpha 0..1 (h, w). Returns the cleaned alpha."""
    out = a
    levels = STRENGTH[strength]
    if levels:
        haze, solid = levels
        mx = rgb.max(axis=2)
        sat = np.where(mx > 0.02, (mx - rgb.min(axis=2)) / np.maximum(mx, 1e-6), 0.0)
        # Judged over a few pixels, so one sheet is kept or dropped as a whole rather than left full of holes.
        pale = 1.0 - smoothstep(0.12, 0.30, _arr(_img(sat).filter(ImageFilter.GaussianBlur(4))))
        # The subject and its own edge: near something opaque the soft edge stays.
        near = _arr(_img(a).filter(ImageFilter.MaxFilter(7)))
        protect = smoothstep(haze, solid, near)
        # A spark or a thin bright line stands out of its surroundings; a sheet of haze doesn't.
        detail = smoothstep(0.04, 0.16, a - _arr(_img(a).filter(ImageFilter.GaussianBlur(10))))
        remove = pale * (1.0 - protect) * (1.0 - detail)
        out = a * (1.0 - _arr(_img(remove).filter(ImageFilter.GaussianBlur(3))))
        # A glow the cut-out left with a hard rim (a block behind a crown, a halo): its rim fades out instead, as light
        # does. Not the subject (fully opaque, and a few pixels around it) and not the sparks.
        core = smoothstep(0.90, 0.98, _arr(_img(a).filter(ImageFilter.MaxFilter(9))))
        rimless = np.minimum(out, _arr(_img(out).filter(ImageFilter.GaussianBlur(14))))
        w = (1.0 - core) * (1.0 - detail)
        out = out * (1.0 - w) + rimless * w
    out = np.clip((out - floor) / (1.0 - floor), 0.0, 1.0)
    return out * ramp


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('src')
    ap.add_argument('dst')
    ap.add_argument('--strength', type=int, default=1, choices=(0, 1, 2), help='haze cleaning: 0 none, 1 faint sheets (default), 2 dense ones too')
    ap.add_argument('--edges', default='0.07,0.06,0.09', help='fade margins: sides,top,bottom as shares of the frame')
    ap.add_argument('--crf', type=int, default=23)
    o = ap.parse_args()

    w, H, rate, fps = probe(o.src)
    h = H // 2
    side, top, bottom = (float(x) for x in o.edges.split(','))
    ramp = edge_ramp(w, h, side, top, bottom)

    dec = subprocess.Popen(
        ['ffmpeg', '-v', 'error', '-i', o.src, '-vf', 'scale=in_color_matrix=bt709:in_range=tv,format=rgb24', '-f', 'rawvideo', '-'],
        stdout=subprocess.PIPE,
    )
    enc = subprocess.Popen(
        ['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{w}x{H}', '-framerate', rate, '-i', '-',
         '-i', o.src, '-map', '0:v', '-map', '1:a?', '-c:a', 'copy',
         '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p',
         '-c:v', 'libx264', '-profile:v', 'main', '-preset', 'slow', '-crf', str(o.crf), '-refs', '3', '-g', str(fps * 2),
         '-pix_fmt', 'yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
         '-movflags', '+faststart', o.dst],
        stdin=subprocess.PIPE,
    )
    size = w * H * 3
    n = 0
    while True:
        buf = dec.stdout.read(size)
        if len(buf) < size:
            break
        frame = np.frombuffer(buf, np.uint8).reshape(H, w, 3)
        rgb = frame[:h].astype(np.float32) / 255.0
        a = np.clip(frame[h:].astype(np.float32) / 255.0 @ LUMA, 0.0, 1.0)
        a2 = polish_alpha(rgb, a, ramp, o.strength)
        mask = np.repeat((a2 * 255.0 + 0.5).astype(np.uint8)[..., None], 3, axis=2)
        enc.stdin.write(np.concatenate([frame[:h], mask], axis=0).tobytes())
        n += 1
    enc.stdin.close()
    if dec.wait() != 0 or enc.wait() != 0:
        sys.exit('ffmpeg failed')
    print(f'{o.dst}: {n} frames')


if __name__ == '__main__':
    main()
