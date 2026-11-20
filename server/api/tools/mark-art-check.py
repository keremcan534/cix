#!/usr/bin/env python3
"""How a profile mark's overlay picture covers the photo under it (mark-kinds.mjs checkMarkArt, docs/PROFIL_IZLERI.md).

A kind's overlay (Kırık Cam's cracks, Kaka İzi's splats) is drawn over a person's round photo on their seat, card and
profile, so it must leave the photo seen: its empty parts truly transparent (alpha 0, not a white or a faintly visible
ground) and its middle, where the face is, mostly open. This prints what the server decides on, as JSON:

    {"width", "height", "frames", "clear", "face"}

  clear  the share of all pixels that are fully transparent (alpha 0)
  face   the share of the face circle (centred, radius --face of the side) that is more than half opaque (alpha >= 128)

    python3 mark-art-check.py picture.png [--face 0.3]

Reads PNG and WebP only (every frame of a moving one is counted, so the server can refuse it). Exits 3 with a reason on
stderr when the picture itself is the problem (not a PNG or WebP, broken, cut off, too big); anything else (Pillow or
numpy missing, out of memory) exits 1. Run without the API's environment (its keys never reach a program that reads
files the admins uploaded).
"""
import argparse
import json
import struct
import sys

import numpy as np
from PIL import Image, ImageSequence, UnidentifiedImageError

# The server checked the size first (at most 2048 px each way); this only stops a decompression bomb.
Image.MAX_IMAGE_PIXELS = 4096 * 4096
UNREADABLE = 3


def file_error(e):
    """Whether an error is about the picture itself, not about this machine."""
    if isinstance(e, (UnidentifiedImageError, SyntaxError, ValueError, EOFError, struct.error, Image.DecompressionBombError)):
        return True
    return isinstance(e, OSError) and e.errno is None and 'not available' not in str(e)


def measure(path, face_radius):
    with Image.open(path, formats=['PNG', 'WEBP']) as im:
        w, h = im.size
        if w < 1 or h < 1:
            raise ValueError('empty picture')
        frames = sum(1 for _ in ImageSequence.Iterator(im))
        im.seek(0)
        # Palette pictures keep their transparency in RGBA; one without alpha is opaque all over.
        a = np.asarray(im.convert('RGBA').getchannel('A'), dtype=np.uint8)
    yy, xx = np.mgrid[0:h, 0:w]
    r = np.hypot(xx - (w - 1) / 2, yy - (h - 1) / 2)
    face = r <= face_radius * min(w, h)
    return {
        'width': w,
        'height': h,
        'frames': frames,
        'clear': float((a == 0).mean()),
        'face': float((a[face] >= 128).mean()) if face.any() else 0.0,
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('picture')
    ap.add_argument('--face', type=float, default=0.3)
    a = ap.parse_args()
    try:
        out = measure(a.picture, a.face)
    except Exception as e:  # noqa: BLE001 - sorted below: the file's fault or this machine's
        if not file_error(e):
            raise
        print(f'not a picture: {type(e).__name__}: {e}', file=sys.stderr)
        return UNREADABLE
    print(json.dumps(out))
    return 0


if __name__ == '__main__':
    sys.exit(main())
