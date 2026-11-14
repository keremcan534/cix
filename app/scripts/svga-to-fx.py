#!/usr/bin/env python3
"""An SVGA animation → a gift / entry video in the app's format (scripts/alpha-stack.sh: colour on top, alpha below).

    python3 scripts/svga-to-fx.py in.svga out.mp4 [--size 540x960] [--fill 0.6] [--center 0.5] [--audio file]
                                  [--despill green] [--fade-in 0.2] [--fade-out 0.4] [--crf 23]

SVGA 2.x (a zlib-compressed protobuf: images and per-frame sprite placements) is drawn frame by frame: each sprite's
image at its layout size, moved by its affine transform, with its alpha (clip paths, vector shapes and mattes are
not drawn; they are counted and reported). Tools that turn a video into SVGA, as the Kling clips are, give one
full picture per frame. The animation is then placed on the portrait frame of the other clips (540×960): its
visible part (all frames together) scaled to `--fill` of the frame's width (and at most of its height), centred at
`--center` of the height. It fades in and out so it never pops, and the colour under the transparent parts is
filled from the picture nearby, so the video's halved colour resolution brings no foreign colour into the edges.
`--despill green`: a picture keyed from a green screen keeps a green hem; green above red and blue is taken down.
Sound: the SVGA's own when it has one, else `--audio` (any file with sound: an earlier clip's, an MP3), cut to the
animation's length with a short fade out. Needs ffmpeg, numpy and Pillow. Spec: docs/SEFFAF_VIDEO_POC.md.
"""
import argparse
import io
import os
import struct
import subprocess
import sys
import tempfile
import zlib

import numpy as np
from PIL import Image, ImageFilter


# ── SVGA 2.x: a protobuf MovieEntity, read without a protobuf library ──

def _varint(b, i):
    shift = n = 0
    while True:
        c = b[i]
        i += 1
        n |= (c & 0x7F) << shift
        if not c & 0x80:
            return n, i
        shift += 7


def _fields(b):
    i = 0
    while i < len(b):
        key, i = _varint(b, i)
        f, wt = key >> 3, key & 7
        if wt == 0:
            v, i = _varint(b, i)
        elif wt == 1:
            v, i = b[i:i + 8], i + 8
        elif wt == 2:
            ln, i = _varint(b, i)
            v, i = b[i:i + ln], i + ln
        elif wt == 5:
            v, i = b[i:i + 4], i + 4
        else:
            raise ValueError(f'protobuf wire type {wt}')
        yield f, v


def _f32(v):
    return struct.unpack('<f', v)[0]


def _floats(b, names, start):
    o = dict(start)
    for f, v in _fields(b):
        if 0 < f <= len(names):
            o[names[f - 1]] = _f32(v)
    return o


def _frame(b):
    o = {'alpha': 0.0, 'layout': None, 'transform': None, 'extra': 0}
    for f, v in _fields(b):
        if f == 1:
            o['alpha'] = _f32(v)
        elif f == 2:
            o['layout'] = _floats(v, ['x', 'y', 'width', 'height'], {'x': 0.0, 'y': 0.0, 'width': 0.0, 'height': 0.0})
        elif f == 3:
            o['transform'] = _floats(v, ['a', 'b', 'c', 'd', 'tx', 'ty'], {'a': 1.0, 'b': 0.0, 'c': 0.0, 'd': 1.0, 'tx': 0.0, 'ty': 0.0})
        elif f in (4, 5) and v:
            o['extra'] += 1  # a clip path or vector shapes: not drawn
    return o


def load_svga(path):
    data = open(path, 'rb').read()
    if data[:2] == b'PK':
        sys.exit('SVGA 1.x (a zip with movie.spec) is not read here; export SVGA 2.x')
    movie = {'params': {}, 'images': {}, 'sprites': [], 'audios': []}
    for f, v in _fields(zlib.decompress(data)):
        if f == 2:
            p = {}
            for pf, pv in _fields(v):
                if pf in (1, 2):
                    p[('w', 'h')[pf - 1]] = _f32(pv)
                elif pf in (3, 4):
                    p[('fps', 'frames')[pf - 3]] = pv
            movie['params'] = p
        elif f == 3:
            entry = dict(_fields(v))
            movie['images'][entry.get(1, b'').decode()] = entry.get(2, b'')
        elif f == 4:
            s = {'key': '', 'frames': [], 'matte': ''}
            for sf, sv in _fields(v):
                if sf == 1:
                    s['key'] = sv.decode()
                elif sf == 2:
                    s['frames'].append(_frame(sv))
                elif sf == 3:
                    s['matte'] = sv.decode()
            movie['sprites'].append(s)
        elif f == 5:
            a = {}
            for af, av in _fields(v):
                a[('key', 'startFrame', 'endFrame', 'startTime', 'totalTime')[af - 1]] = av.decode() if af == 1 else av
            movie['audios'].append(a)
    return movie


def render(movie):
    """Every frame as straight RGBA floats (h, w, 4), 0..1, at the SVGA's own size."""
    w, h = round(movie['params']['w']), round(movie['params']['h'])
    cache = {}
    skipped = 0
    out = []
    for i in range(movie['params']['frames']):
        canvas = Image.new('RGBA', (w, h), (0, 0, 0, 0))
        for s in movie['sprites']:
            fr = s['frames'][i] if i < len(s['frames']) else None
            if not fr or fr['alpha'] <= 0.001 or s['key'] not in movie['images']:
                continue
            skipped += fr['extra'] + (1 if s['matte'] else 0)
            if s['key'] not in cache:
                cache[s['key']] = Image.open(io.BytesIO(movie['images'][s['key']])).convert('RGBA')
            img = cache[s['key']]
            lay = fr['layout'] or {'x': 0, 'y': 0, 'width': img.width, 'height': img.height}
            if (round(lay['width']), round(lay['height'])) != img.size and lay['width'] > 0 and lay['height'] > 0:
                img = img.resize((max(1, round(lay['width'])), max(1, round(lay['height']))), Image.LANCZOS)
            t = fr['transform'] or {'a': 1, 'b': 0, 'c': 0, 'd': 1, 'tx': 0, 'ty': 0}
            # Screen = M · (layout offset + image point); PIL wants the inverse (screen → image).
            m = np.array([[t['a'], t['c'], t['tx'] + t['a'] * lay['x'] + t['c'] * lay['y']], [t['b'], t['d'], t['ty'] + t['b'] * lay['x'] + t['d'] * lay['y']], [0, 0, 1]])
            inv = np.linalg.inv(m)
            placed = img.transform((w, h), Image.AFFINE, data=tuple(inv[:2].ravel()), resample=Image.BICUBIC)
            if fr['alpha'] < 0.999:
                a = np.asarray(placed, np.float32).copy()
                a[..., 3] *= fr['alpha']
                placed = Image.fromarray(a.astype(np.uint8), 'RGBA')
            canvas.alpha_composite(placed)
        out.append(np.asarray(canvas, np.float32) / 255.0)
    if skipped:
        print(f'note: {skipped} clip paths / shapes / mattes were not drawn', file=sys.stderr)
    return out


def bleed(rgb, a):
    """The colour under (nearly) transparent pixels, filled from the picture around them; an edge pixel keeps its own
    colour as far as it is opaque (a keyed edge's own colour is the least sure)."""
    img = Image.fromarray((np.clip(np.concatenate([rgb * a[..., None], a[..., None]], axis=2), 0, 1) * 255).astype(np.uint8), 'RGBA')
    own = np.clip((a - 0.1) / 0.8, 0, 1)[..., None]
    out = rgb.copy()
    todo = a < 0.9
    for r in (2, 6, 18, 54):
        bl = np.asarray(img.filter(ImageFilter.GaussianBlur(r)), np.float32) / 255.0
        ok = todo & (bl[..., 3] > 0.02)
        fill = bl[..., :3] / np.maximum(bl[..., 3], 1e-4)[..., None]
        out[ok] = (rgb * own + fill * (1 - own))[ok]
        todo &= ~ok
    out[todo] = 0.0
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('src')
    ap.add_argument('dst')
    ap.add_argument('--size', default='540x960', help='visible frame, WxH (the video is twice as tall)')
    ap.add_argument('--fill', type=float, default=0.6, help='share of the width the visible part takes (and at most of the height)')
    ap.add_argument('--center', type=float, default=0.5, help='where its middle sits, share of the height from the top')
    ap.add_argument('--audio', help='sound for an SVGA without one: any file with an audio stream')
    ap.add_argument('--despill', choices=('none', 'green'), default='none')
    ap.add_argument('--fade-in', type=float, default=0.2)
    ap.add_argument('--fade-out', type=float, default=0.4)
    ap.add_argument('--crf', type=int, default=23)
    o = ap.parse_args()

    movie = load_svga(o.src)
    p = movie['params']
    fps = p.get('fps') or 20
    print(f"{o.src}: {round(p['w'])}×{round(p['h'])}, {p['frames']} frames at {fps} fps, {len(movie['images'])} images, {len(movie['sprites'])} sprites, {len(movie['audios'])} sounds")
    frames = render(movie)

    W, H = (int(x) for x in o.size.lower().split('x'))
    seen = np.zeros(frames[0].shape[:2], bool)
    for f in frames:
        seen |= f[..., 3] > 0.03
    ys, xs = np.nonzero(seen)
    if not len(xs):
        sys.exit('nothing visible')
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    scale = min(o.fill * W / (x1 - x0), o.fill * H / (y1 - y0))
    sw, sh = round(frames[0].shape[1] * scale), round(frames[0].shape[0] * scale)
    ox = round(W / 2 - (x0 + x1) / 2 * scale)
    oy = round(H * o.center - (y0 + y1) / 2 * scale)
    print(f'visible part {x1 - x0}×{y1 - y0} px → ×{scale:.2f}, at ({ox}, {oy}) on {W}×{H}')

    n = len(frames)
    fade_in = max(1, round(o.fade_in * fps))
    fade_out = max(1, round(o.fade_out * fps))

    tmp = tempfile.mkdtemp()
    audio = None
    if movie['audios'] and movie['audios'][0].get('key') in movie['images']:
        a0 = movie['audios'][0]
        audio = os.path.join(tmp, 'svga-audio.mp3')
        open(audio, 'wb').write(movie['images'][a0['key']])
        delay = int(a0.get('startTime') or round((a0.get('startFrame') or 0) * 1000 / fps))
    elif o.audio:
        audio, delay = o.audio, 0
    dur = n / fps

    cmd = ['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H * 2}', '-framerate', str(fps), '-i', '-']
    if audio:
        cmd += ['-i', audio, '-map', '0:v', '-map', '1:a:0',
                '-af', f'adelay={delay}:all=1,atrim=0:{dur:.3f},afade=t=out:st={max(0.0, dur - 0.3):.3f}:d=0.3', '-c:a', 'aac', '-b:a', '96k']
    cmd += ['-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p',
            '-c:v', 'libx264', '-profile:v', 'main', '-preset', 'slow', '-crf', str(o.crf), '-refs', '3', '-g', str(fps * 2),
            '-pix_fmt', 'yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
            '-t', f'{dur:.3f}', '-movflags', '+faststart', o.dst]
    enc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for i, f in enumerate(frames):
        img = Image.fromarray((np.clip(f, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA').resize((sw, sh), Image.LANCZOS)
        canvas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        canvas.paste(img, (ox, oy))  # onto an empty frame: copied as it is, cut at the frame's edges
        px = np.asarray(canvas, np.float32) / 255.0
        rgb, a = px[..., :3], px[..., 3] * min(1.0, (i + 1) / fade_in, (n - i) / fade_out)
        if o.despill == 'green':
            rgb = rgb.copy()
            rgb[..., 1] = np.minimum(rgb[..., 1], np.maximum(rgb[..., 0], rgb[..., 2]))
        rgb = bleed(rgb, a)
        top = (np.clip(rgb, 0, 1) * 255 + 0.5).astype(np.uint8)
        bottom = np.repeat((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8)[..., None], 3, axis=2)
        enc.stdin.write(np.concatenate([top, bottom], axis=0).tobytes())
    enc.stdin.close()
    if enc.wait() != 0:
        sys.exit('ffmpeg failed')
    print(f'{o.dst}: {n} frames, {dur:.2f} s, {os.path.getsize(o.dst) // 1024} KB{", with sound" if audio else ", silent"}')


if __name__ == '__main__':
    main()
