#!/usr/bin/env python3
"""The part of a shop frame's pictures that is drawn (shop-items.mjs measureFrame).

A frame is a square picture with a transparent hole for the photo and, often, a transparent margin around its ornament.
Phones size the frame on a seat by how far the ornament really reaches, not by the whole square, so it is drawn as big
as it can be and is not cut. This prints the box around every pixel that is even faintly visible (alpha above --alpha,
about 5%: a soft glow counts) as shares of the picture's sides, {"l", "t", "r", "b"}: left, top, right and bottom
edges, 0..1. With more than one picture (the still one and its moving version) or a moving one (every frame of an
animated WebP, however many: the server's time limit bounds the run), the box holds them all.

    python3 frame-reach.py still.png [motion.webp] [--alpha 12]
    python3 frame-reach.py --check        # {"webp": true}: whether this Pillow reads WebP, moving ones included

Exits 3 with a reason on stderr only when a picture itself is the problem: it isn't a PNG or WebP, its data is broken or
cut off, or nothing in the pictures is drawn; the server then stores that the pictures were measured, without a box.
Anything else (Pillow missing or without WebP, out of memory, a file gone, a crash) exits 1 and is tried again later.
"""
import argparse
import json
import struct
import sys

from PIL import Image, ImageSequence, UnidentifiedImageError, features

# The server checked every picture first (a still one at most 1024 px, a moving one 512 px, 3 MB).
Image.MAX_IMAGE_PIXELS = 4096 * 4096
UNREADABLE = 3


def webp_ok():
    """Whether this Pillow reads WebP, moving ones too (before Pillow 11 animation was a feature of its own)."""
    if not features.check_module('webp'):
        return False
    return all(features.check_feature(f) for f in ('webp_anim',) if f in features.features)


def is_webp(path):
    with open(path, 'rb') as f:
        head = f.read(12)
    return head[:4] == b'RIFF' and head[8:12] == b'WEBP'


def file_error(e):
    """Whether an error is about the picture itself, not about this machine (those are tried again)."""
    if isinstance(e, (UnidentifiedImageError, SyntaxError, ValueError, EOFError, struct.error, Image.DecompressionBombError)):
        return True
    # Pillow says a file is broken or cut off with a bare OSError ("image file is truncated", "broken data stream");
    # one with an errno is the machine's (a file gone, no room, an I/O error), and a missing decoder is Pillow's.
    return isinstance(e, OSError) and e.errno is None and 'not available' not in str(e)


def box_of(path, alpha):
    """The drawn part of one picture, every frame of it: (l, t, r, b) as shares, or None when nothing is drawn."""
    lut = [255 if v > alpha else 0 for v in range(256)]
    edges = None
    with Image.open(path, formats=['PNG', 'WEBP']) as im:
        w, h = im.size
        if w < 1 or h < 1:
            raise ValueError('empty picture')
        for frame in ImageSequence.Iterator(im):
            # Palette pictures keep their transparency in RGBA; a picture without alpha is drawn all over.
            found = frame.convert('RGBA').getchannel('A').point(lut).getbbox()
            if not found:
                continue
            edges = found if edges is None else (min(edges[0], found[0]), min(edges[1], found[1]), max(edges[2], found[2]), max(edges[3], found[3]))
    if edges is None:
        return None
    x0, y0, x1, y1 = edges
    return (x0 / w, y0 / h, x1 / w, y1 / h)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('pictures', nargs='*')
    ap.add_argument('--alpha', type=int, default=12)
    ap.add_argument('--check', action='store_true', help='print what this Pillow reads and stop')
    a = ap.parse_args()
    if a.check:
        print(json.dumps({'webp': webp_ok()}))
        return 0
    if not a.pictures:
        ap.error('no pictures')
    webp = None
    union = None
    for path in a.pictures:
        if is_webp(path):
            if webp is None:
                webp = webp_ok()
            if not webp:
                print('this Pillow reads no WebP (moving ones included)', file=sys.stderr)
                return 1
        try:
            b = box_of(path, a.alpha)
        except Exception as e:  # noqa: BLE001 - sorted below: the file's fault or this machine's
            if not file_error(e):
                raise
            print(f'not a picture: {type(e).__name__}: {e}', file=sys.stderr)
            return UNREADABLE
        if b is None:
            continue
        union = b if union is None else (min(union[0], b[0]), min(union[1], b[1]), max(union[2], b[2]), max(union[3], b[3]))
    if union is None:
        print('nothing visible', file=sys.stderr)
        return UNREADABLE
    # Unrounded: the server moves the edges out (never smaller than measured).
    print(json.dumps(dict(zip(('l', 't', 'r', 'b'), union))))
    return 0


if __name__ == '__main__':
    sys.exit(main())
