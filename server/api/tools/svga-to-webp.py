#!/usr/bin/env python3
"""An SVGA animation → a shop frame: its still picture (PNG) and its moving version (animated WebP).

    python3 server/api/tools/svga-to-webp.py in.svga still.png motion.webp [--max-bytes 3145728]

The app has no SVGA player and a room may show many frames at once, so the panel's SVGA becomes the small animated WebP
the phones already play (shop-items.mjs POST /api/admin/shop/frame-svga). The canvas is kept square and centred, so the
photo's hole stays where the designer drew it. Smaller and softer versions are tried until the file fits. Drawing is
svga-to-fx.py's. Prints {"px", "bytes", "frames"} as JSON on success.
"""
import argparse
import importlib.util
import io
import json
import math
import os
import sys

import numpy as np
from PIL import Image

_spec = importlib.util.spec_from_file_location('svga_to_fx', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'svga-to-fx.py'))
fx = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(fx)

# Biggest first: (pixels, quality).
TRIES = [(320, 80), (320, 65), (256, 65), (256, 50), (200, 50), (160, 45), (128, 40)]
BASE = TRIES[0][0]
MAX_FPS = 15
MAX_FRAMES = 90


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('src')
    ap.add_argument('still')
    ap.add_argument('motion')
    ap.add_argument('--max-bytes', type=int, default=3 * 1024 * 1024)
    o = ap.parse_args()

    movie = fx.load_svga(o.src)
    p = movie['params']
    fps = p.get('fps') or 20
    total = p['frames']
    step = max(1, math.ceil(fps / MAX_FPS), math.ceil(total / MAX_FRAMES))
    w, h = round(p['w']), round(p['h'])
    side = max(w, h)
    frames = []
    still = None
    clear = False
    for i, f in enumerate(fx.render(movie, report=False)):
        if i % step:
            continue
        rgba = (np.clip(f, 0, 1) * 255 + 0.5).astype(np.uint8)
        alpha = rgba[..., 3]
        clear = clear or bool((alpha < 8).any()) or w != h
        canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
        canvas.paste(Image.fromarray(rgba, 'RGBA'), ((side - w) // 2, (side - h) // 2))
        small = canvas.resize((BASE, BASE), Image.LANCZOS)
        frames.append(small)
        if still is None and (alpha > 8).any():
            still = small
    if still is None:
        sys.exit('nothing visible')
    if not clear:
        sys.exit('no transparency')
    if len(frames) < 2:
        sys.exit('not animated')

    duration = max(20, round(1000 * step / fps))
    for px, quality in TRIES:
        seq = frames if px == BASE else [f.resize((px, px), Image.LANCZOS) for f in frames]
        out = io.BytesIO()
        seq[0].save(out, 'WEBP', save_all=True, append_images=seq[1:], duration=duration, loop=0, quality=quality, alpha_quality=80, method=4)
        if out.tell() <= o.max_bytes:
            with open(o.motion, 'wb') as fh:
                fh.write(out.getvalue())
            still.resize((px, px), Image.LANCZOS).save(o.still, 'PNG', optimize=True)
            print(json.dumps({'px': px, 'bytes': out.tell(), 'frames': len(seq)}))
            return
    sys.exit('too big')


if __name__ == '__main__':
    main()
