# App icon set from the brand logo (a transparent PNG from ChatGPT), run from app/:
#   python3 scripts/app-icons.py [assets/brand/logo.png] [assets]
# Cleans the stray near-invisible pixels around the mark, then writes icon.png (iOS and Expo), the Android
# adaptive layers (foreground, background, monochrome for themed icons), splash-icon.png and favicon.png.
# app.json already points at these files. Needs Pillow and numpy.
import sys
from PIL import Image, ImageFilter, ImageDraw
import numpy as np

src = sys.argv[1] if len(sys.argv) > 1 else 'assets/brand/logo.png'
out = sys.argv[2] if len(sys.argv) > 2 else 'assets'
NAVY = (8, 15, 30)

a = np.array(Image.open(src).convert('RGBA')).astype(np.float32)
al = a[..., 3]
# Shape mask grown by 16 px: the soft edge glow lives inside it, the 1–2/255 specks outside it go.
mask = Image.fromarray(((al > 128) * 255).astype(np.uint8))
for _ in range(4):
    mask = mask.filter(ImageFilter.MaxFilter(9))
near = np.array(mask) > 0
al = np.where(near & (al > 3), al, 0)
al = np.clip(al * 255.0 / 253.0, 0, 255)  # the body was 253/255; make it fully opaque
a[..., 3] = al
a[al == 0, :3] = 0
sym = Image.fromarray(a.astype(np.uint8), 'RGBA')
sym = sym.crop(sym.getbbox())
print('symbol', sym.size)

# Radius of the solid shape from its bbox centre, for fitting Android's safe circle.
sa = np.array(sym)[..., 3]
ys, xs = np.nonzero(sa > 128)
cy, cx = (sa.shape[0] - 1) / 2, (sa.shape[1] - 1) / 2
rmax = float(np.sqrt((ys - cy) ** 2 + (xs - cx) ** 2).max())

def place(canvas, s, height=None, scale=None, dy=0):
    k = scale if scale else height / s.height
    r = s.resize((round(s.width * k), round(s.height * k)), Image.LANCZOS)
    x = (canvas.width - r.width) // 2
    y = (canvas.height - r.height) // 2 + dy
    canvas.alpha_composite(r, (x, y))
    return canvas

def background(n, glow=True):
    bg = Image.new('RGBA', (n, n), NAVY + (255,))
    if glow:
        # Very soft lighter navy behind the mark, same family as the app's surfaces.
        g = Image.new('L', (n, n), 0)
        ImageDraw.Draw(g).ellipse([n * 0.12, n * 0.10, n * 0.88, n * 0.86], fill=255)
        g = g.filter(ImageFilter.GaussianBlur(n * 0.16))
        light = Image.new('RGBA', (n, n), (22, 40, 72, 255))
        bg = Image.composite(light, bg, g.point(lambda v: int(v * 0.85)))
    return bg

N = 1024
# iOS / Expo icon: full square, no transparency (the system rounds the corners).
icon = place(background(N), sym, height=N * 0.60)
icon.convert('RGB').save(f'{out}/icon.png', optimize=True)

# Android adaptive: 108 dp canvas, solid shape inside the 66 dp safe circle (radius 0.3056 of the side).
safe_r = N * 33 / 108
visible = N * 72 / 108
# Same visual weight as the iOS icon: the mark is 64% of the visible 72 dp, well inside the safe circle.
k = 0.64 * visible / sym.height
assert rmax * k <= safe_r, (rmax * k, safe_r)
fg = place(Image.new('RGBA', (N, N), (0, 0, 0, 0)), sym, scale=k)
fg.save(f'{out}/android-icon-foreground.png', optimize=True)
background(N).convert('RGB').save(f'{out}/android-icon-background.png', optimize=True)

# Themed icon (Android 13+): only alpha counts; drop the glow, keep anti-aliased edges.
m = np.array(sym)[..., 3].astype(np.float32)
m = np.clip((m - 120) * 255 / 100, 0, 255).astype(np.uint8)
mono_sym = Image.merge('RGBA', [Image.new('L', sym.size, 255)] * 3 + [Image.fromarray(m)])
mono = place(Image.new('RGBA', (N, N), (0, 0, 0, 0)), mono_sym, scale=k)
mono.save(f'{out}/android-icon-monochrome.png', optimize=True)

# Splash: the mark alone on transparent; app.json shows it 200 dp wide on navy.
# Canvas sized so the mark keeps its own resolution (no upscaling).
S = round(sym.height / 0.86)
splash = place(Image.new('RGBA', (S, S), (0, 0, 0, 0)), sym, height=sym.height)
splash.save(f'{out}/splash-icon.png', optimize=True)

# Favicon 48 px: the mark alone, as large as fits.
fav = Image.new('RGBA', (192, 192), (0, 0, 0, 0))
place(fav, sym, height=184).resize((48, 48), Image.LANCZOS).save(f'{out}/favicon.png', optimize=True)
print('rmax', round(rmax), 'android scale', round(k, 3))
