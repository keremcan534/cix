# Splits a mic seat picture (the pouf, any colour) into the three layers the app stacks to draw it in any colour
# (components/room/seat-pouf, Koltuk renkleri), run from app/:
#   python3 scripts/seat-layers.py <empty seat.png> <locked seat.png> [out dir] [#RRGGBB,… for a preview sheet]
#   renk   the cushion's shape in white (the app tints it with the room's colour),
#   isik   its light and shade over the colour (white highlights, dark folds, with alpha),
#   altin  the gold (trim, feet, padlock) as it is.
# Writes koltuk-{bos,kilitli}-{renk,isik,altin}.png (copy them to the panel's web/img too) and, with colours,
# koltuk-palet.png: each colour across, the empty seat above and the locked one below, on the room's dark.
# The cushion should be one light colour and the gold a yellow-orange gold: gold is told apart by its hue.
# Plain Python, no packages; 8-bit PNGs.
import colorsys
import struct
import sys
import zlib


def read_png(path):
    data = open(path, 'rb').read()
    i, idat, plte, trns = 8, b'', b'', b''
    w = h = ct = 0
    while i < len(data):
        n = struct.unpack('>I', data[i:i + 4])[0]
        kind, body = data[i + 4:i + 8], data[i + 8:i + 8 + n]
        if kind == b'IHDR':
            w, h, depth, ct = struct.unpack('>IIBB', body[:10])
            if depth != 8:
                raise SystemExit(f'{path}: 8-bit PNG only (this is {depth}-bit)')
        elif kind == b'PLTE':
            plte = body
        elif kind == b'tRNS':
            trns = body
        elif kind == b'IDAT':
            idat += body
        i += 12 + n
    bpp = {6: 4, 2: 3, 3: 1}.get(ct)
    if not bpp:
        raise SystemExit(f'{path}: RGBA, RGB or palette PNG only')
    stride = w * bpp
    raw = zlib.decompress(idat)
    out, prev, pos = [], bytearray(stride), 0
    for _ in range(h):
        f = raw[pos]
        line = bytearray(raw[pos + 1:pos + 1 + stride])
        pos += 1 + stride
        for x in range(stride):
            a = line[x - bpp] if x >= bpp else 0
            up = prev[x]
            c = prev[x - bpp] if x >= bpp else 0
            if f == 1:
                line[x] = (line[x] + a) & 255
            elif f == 2:
                line[x] = (line[x] + up) & 255
            elif f == 3:
                line[x] = (line[x] + (a + up) // 2) & 255
            elif f == 4:
                pa, pb, pc = abs(up - c), abs(a - c), abs(a + up - 2 * c)
                line[x] = (line[x] + (a if pa <= pb and pa <= pc else up if pb <= pc else c)) & 255
        prev = line
        for x in range(w):
            if ct == 3:
                k = line[x]
                r, g, b = plte[3 * k:3 * k + 3]
                out.append((r, g, b, trns[k] if k < len(trns) else 255))
            elif ct == 6:
                out.append(tuple(line[4 * x:4 * x + 4]))
            else:
                out.append(tuple(line[3 * x:3 * x + 3]) + (255,))
    return w, h, out


def write_png(path, w, h, px):
    raw = b''.join(b'\x00' + bytes(v for p in px[y * w:(y + 1) * w] for v in p) for y in range(h))
    chunk = lambda t, d: struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xFFFFFFFF)
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))


def is_gold(r, g, b):
    hue, sat, val = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
    return 20 / 360 <= hue <= 62 / 360 and sat >= 0.32 and val >= 0.18


def lum(r, g, b):
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255


def split(path):
    """The three layers; the cushion's middle brightness is where light turns to shade."""
    w, h, px = read_png(path)
    cushion = sorted(lum(*p[:3]) for p in px if p[3] > 128 and not is_gold(*p[:3]))
    mid = cushion[len(cushion) // 2]
    clear = (0, 0, 0, 0)
    renk, isik, altin = [], [], []
    for r, g, b, a in px:
        if a == 0 or is_gold(r, g, b):
            renk.append(clear)
            isik.append(clear)
            altin.append((r, g, b, a) if a else clear)
            continue
        light = lum(r, g, b)
        renk.append((255, 255, 255, a))
        if light >= mid:
            isik.append((255, 255, 255, round(min(1, (light - mid) / (1 - mid) * 0.95) * a)))
        else:
            isik.append((0, 0, 0, round(min(1, (mid - light) / mid * 0.85) * a)))
        altin.append(clear)
    return w, h, renk, isik, altin


def over(dst, src):
    sa, da = src[3] / 255, dst[3] / 255
    oa = sa + da * (1 - sa)
    if oa == 0:
        return (0, 0, 0, 0)
    return tuple(round((src[k] * sa + dst[k] * da * (1 - sa)) / oa) for k in range(3)) + (round(oa * 255),)


def compose(renk, isik, altin, colour, bg=(28, 20, 34, 255)):
    """The seat as the app draws it: the cushion in the colour, its light and shade, its gold, on the room's dark."""
    c = tuple(int(colour[i:i + 2], 16) for i in (1, 3, 5))
    out = []
    for m, s, g in zip(renk, isik, altin):
        p = bg
        if m[3]:
            p = over(p, c + (m[3],))
        if s[3]:
            p = over(p, s)
        if g[3]:
            p = over(p, g)
        out.append(p)
    return out


if __name__ == '__main__':
    if len(sys.argv) < 3:
        raise SystemExit(__doc__ or 'usage: seat-layers.py <empty.png> <locked.png> [out dir] [#RRGGBB,…]')
    empty, locked = sys.argv[1:3]
    out_dir = sys.argv[3] if len(sys.argv) > 3 else 'assets/room'
    palette = sys.argv[4].split(',') if len(sys.argv) > 4 else []
    rows = []
    for state, src in (('bos', empty), ('kilitli', locked)):
        w, h, renk, isik, altin = split(src)
        for name, layer in (('renk', renk), ('isik', isik), ('altin', altin)):
            write_png(f'{out_dir}/koltuk-{state}-{name}.png', w, h, layer)
        rows.append((w, [compose(renk, isik, altin, c) for c in palette]))
        print(f'{state}: {w}x{h}, gold px {sum(1 for p in altin if p[3])}, cushion px {sum(1 for p in renk if p[3])}')
    if palette:
        # Each tile at half size.
        w = rows[0][0]
        tile = w // 2
        sheet = []
        for y in range(tile * 2):
            tiles = rows[y // tile][1]
            for x in range(tile * len(palette)):
                sheet.append(tiles[x // tile][((y % tile) * 2) * w + (x % tile) * 2])
        write_png(f'{out_dir}/koltuk-palet.png', tile * len(palette), tile * 2, sheet)
