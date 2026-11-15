"""The app's own gift and sticker pictures, small, for the finance panel (server/api/art.mjs).

Reads which file each gift and sticker draws from the app (app/src/components/GiftArt.tsx ART, ReactionArt.tsx SRC
and the Penguen stills of SPRITES) and writes a WebP copy of each to server/api/art/gifts/<id>.webp (128 px) and
server/api/art/stickers/<id>.webp (96 px). The Duygular, Müzik and Hamle stickers are Lottie animations with no
still picture: the panel shows their emoji. Run from the repository's root after a picture changes in the app:

    python3 server/api/tools/panel-art.py

Needs Pillow. Files no gift or sticker uses any more are removed.
"""

import os
import re
import sys

from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
APP = os.path.join(ROOT, 'app')
OUT = os.path.join(ROOT, 'server', 'api', 'art')


def sources(tsx, pattern):
    """id → the app's file (relative to app/src/components), from the require() lines of a component."""
    text = open(os.path.join(APP, 'src', 'components', tsx), encoding='utf8').read()
    return {m.group(1): m.group(2) for m in re.finditer(pattern, text)}


def write(kind, art, size):
    folder = os.path.join(OUT, kind)
    os.makedirs(folder, exist_ok=True)
    kept = set()
    for key, rel in sorted(art.items()):
        src = os.path.normpath(os.path.join(APP, 'src', 'components', rel))
        im = Image.open(src).convert('RGBA')
        im.thumbnail((size, size), Image.LANCZOS)
        name = f'{key}.webp'
        im.save(os.path.join(folder, name), 'WEBP', quality=82, method=6)
        kept.add(name)
    for name in os.listdir(folder):
        if name not in kept:
            os.remove(os.path.join(folder, name))
    return len(kept)


def main():
    # Gifts: the 192 px picture of each catalog gift (the Lucky packages have their own page and are left out).
    gifts = sources('GiftArt.tsx', r"\n  ([a-z][0-9]{1,3}): \{ sm: require\('([^']+)'\)")
    # Stickers: one PNG each, and the Penguen pack's still frames.
    stickers = sources('ReactionArt.tsx', r"\n  '([a-z0-9-]+)': require\('([^']+\.png)'\)")
    stickers.update(sources('ReactionArt.tsx', r"\n  '([a-z0-9-]+)': \{ sheet: require\('[^']+'\), still: require\('([^']+)'\)"))
    if not gifts or not stickers:
        sys.exit('no pictures found: did the app components change?')
    print('gifts', write('gifts', gifts, 128), 'stickers', write('stickers', stickers, 96))


if __name__ == '__main__':
    main()
