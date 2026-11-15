#!/usr/bin/env python3
"""A gift icon made small enough for phones (custom-gifts.mjs checkIcon).

The panel takes icons up to 10 MB and 4096 px; phones load every icon of the gift panel, so what they get is at most
--max-px on its longer side and --max-bytes as an optimised PNG: 1024 px, else 768, 512, 384 or 256, the first that
fits. Transparency is kept. Prints {"width", "height", "bytes"} as JSON; exits 1 with a reason on stderr when it
can't (not a picture, or too detailed even at the smallest size).

    python3 icon-fit.py in.png out.png --max-px 1024 --max-bytes 1048576
"""
import argparse
import io
import json
import sys

from PIL import Image


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src')
    ap.add_argument('out')
    ap.add_argument('--max-px', type=int, default=1024)
    ap.add_argument('--max-bytes', type=int, default=1024 * 1024)
    a = ap.parse_args()
    # The server checked the size first (at most 4096 × 4096); a bigger one is refused here too.
    Image.MAX_IMAGE_PIXELS = 4096 * 4096
    try:
        with Image.open(a.src) as im:
            im.load()
            im = im.convert('RGBA')
    except Exception as e:  # noqa: BLE001 - any unreadable file is the same answer
        print(f'not a picture: {e}', file=sys.stderr)
        return 1
    for px in (1024, 768, 512, 384, 256):
        if px > a.max_px:
            continue
        small = im.copy()
        small.thumbnail((px, px), Image.LANCZOS)
        buf = io.BytesIO()
        small.save(buf, 'PNG', optimize=True)
        if buf.tell() <= a.max_bytes:
            with open(a.out, 'wb') as f:
                f.write(buf.getvalue())
            print(json.dumps({'width': small.width, 'height': small.height, 'bytes': buf.tell()}))
            return 0
    print('too detailed', file=sys.stderr)
    return 1


if __name__ == '__main__':
    sys.exit(main())
