#!/usr/bin/env python3
"""The part of a shop frame's pictures that is drawn (shop-items.mjs measureFrame).

A frame is a square picture with a transparent hole for the photo and, often, a transparent margin around its ornament.
Phones size the frame on a seat by how far the ornament really reaches, not by the whole square, so it is drawn as big
as it can be and is not cut. This prints the box around every pixel more than a little opaque (alpha above --alpha)
as shares of the picture's sides, {"l", "t", "r", "b"}: left, top, right and bottom edges, 0..1. With more than one
picture (the still one and its moving version) or a moving one (every frame of an animated WebP), the box holds them all.

    python3 frame-reach.py still.png [motion.webp] [--alpha 32]

Exits 3 with a reason on stderr when a picture can't be read or nothing in them is drawn; the server then stores that
the pictures were measured, without a box. Any other failure (a crash, Pillow missing) is tried again later.
"""
import argparse
import json
import sys

from PIL import Image, ImageSequence

# The server checked every picture first (a still one at most 1024 px, a moving one 512 px, 3 MB).
Image.MAX_IMAGE_PIXELS = 4096 * 4096
MAX_FRAMES = 2000


def box_of(path, alpha):
    """The drawn part of one picture, every frame of it: (l, t, r, b) as shares, or None when nothing is drawn."""
    lut = [255 if v > alpha else 0 for v in range(256)]
    edges = None
    with Image.open(path) as im:
        w, h = im.size
        if w < 1 or h < 1:
            raise ValueError('empty picture')
        for i, frame in enumerate(ImageSequence.Iterator(im)):
            if i >= MAX_FRAMES:
                break
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
    ap.add_argument('pictures', nargs='+')
    ap.add_argument('--alpha', type=int, default=32)
    a = ap.parse_args()
    union = None
    for path in a.pictures:
        try:
            b = box_of(path, a.alpha)
        except Exception as e:  # noqa: BLE001 - any unreadable picture is the same answer
            print(f'not a picture: {e}', file=sys.stderr)
            return 3
        if b is None:
            continue
        union = b if union is None else (min(union[0], b[0]), min(union[1], b[1]), max(union[2], b[2]), max(union[3], b[3]))
    if union is None:
        print('nothing visible', file=sys.stderr)
        return 3
    print(json.dumps({k: round(v, 6) for k, v in zip(('l', 't', 'r', 'b'), union)}))
    return 0


if __name__ == '__main__':
    sys.exit(main())
