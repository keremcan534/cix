# Turns the Blender renders (out/*) into the game's pictures (app/assets/games/yorunge/): sprite sheets as WebP grids,
# the flame's frames crossfaded into a seamless loop, the still pictures trimmed of nothing (their framing is set in
# Blender) and saved small.
import glob, os, sys
import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from post import oetf  # noqa: E402

OUT, DEST = sys.argv[1], sys.argv[2]
os.makedirs(DEST, exist_ok=True)

def sheet(frames, cols, name, quality=86):
    w, h = frames[0].size
    rows = (len(frames) + cols - 1) // cols
    s = Image.new("RGBA", (w * cols, h * rows), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        s.paste(f, ((i % cols) * w, (i // cols) * h))
    p = os.path.join(DEST, name)
    s.save(p, "WEBP", quality=quality, alpha_quality=80 if quality < 80 else 90, method=6)
    print(name, s.size, f"{len(frames)} frames", f"{os.path.getsize(p) // 1024} KB")

def straight(premul):
    """Premultiplied linear RGBA -> straight sRGB RGBA image, emitted light kept as coverage (as post.py)."""
    P, a = premul[..., :3], np.clip(premul[..., 3], 0, 1)
    D = oetf(P)
    A = np.clip(np.maximum(a, D.max(axis=2)), 0, 1)
    C = np.where(A[..., None] > 1e-4, D / np.maximum(A[..., None], 1e-4), 0)
    return Image.fromarray((np.dstack([np.clip(C, 0, 1), A]) * 255 + 0.5).astype(np.uint8), "RGBA")

what = sys.argv[3:] or ["rocket", "flame", "stills", "explosion", "plates"]

if "rocket" in what:
    fr = [Image.open(p).convert("RGBA") for p in sorted(glob.glob(os.path.join(OUT, "rocket", "f*.png")))]
    sheet(fr, 6, "roket-don.webp", quality=90)
    fr[0].save(os.path.join(DEST, "roket.png"), optimize=True)
    a = np.array(fr[0])[..., 3]
    cx = a.shape[1] // 2
    col = np.where(a[:, cx - 3 : cx + 4].max(axis=1) > 128)[0]
    print("rocket nozzle bottom (centre column) at", col.max() / a.shape[0], "top", col.min() / a.shape[0])

if "flame" in what:
    raw = [np.load(p) for p in sorted(glob.glob(os.path.join(OUT, "flame", "f*.npy")))]
    N, K = 16, len(raw) - 16
    loop = []
    for i in range(N):
        if i < K:
            t = i / K
            loop.append(raw[N + i] * (1 - t) + raw[i] * t)
        else:
            loop.append(raw[i])
    sheet([straight(x) for x in loop], 8, "alev-don.webp", quality=88)

if "stills" in what:
    Image.open(os.path.join(OUT, "ramp", "rampa.png")).convert("RGBA").save(os.path.join(DEST, "rampa.webp"), "WEBP", quality=90, alpha_quality=95, method=6)
    Image.open(os.path.join(OUT, "props", "parasut.png")).convert("RGBA").save(os.path.join(DEST, "parasut.png"), optimize=True)
    Image.open(os.path.join(OUT, "props", "bidon.png")).convert("RGBA").save(os.path.join(DEST, "bidon.png"), optimize=True)
    Image.open(os.path.join(OUT, "props", "duman.png")).convert("RGBA").save(os.path.join(DEST, "duman.webp"), "WEBP", quality=88, alpha_quality=90, method=6)
    for n in ("rampa.webp", "parasut.png", "bidon.png", "duman.webp"):
        print(n, Image.open(os.path.join(DEST, n)).size, f"{os.path.getsize(os.path.join(DEST, n)) // 1024} KB")

if "explosion" in what:
    pick = list(range(4, 21)) + list(range(22, 41, 2))
    def soft_edges(im, band=0.12):
        """Fades the outer `band` of the frame to nothing: the fire's farthest tongues and the last smoke reach the
        render's edge, which on the stage would show as a straight cut."""
        a = np.asarray(im).astype(np.float32)
        h, w = a.shape[:2]
        ramp = lambda n: np.clip(np.minimum(np.arange(n), np.arange(n)[::-1]) / (band * n), 0, 1)
        m = np.outer(ramp(h), ramp(w))
        m = m * m * (3 - 2 * m)
        a[..., 3] *= m
        return Image.fromarray(np.clip(a + 0.5, 0, 255).astype(np.uint8), "RGBA")
    fr = [soft_edges(Image.open(os.path.join(OUT, "explosion", f"f{k:03d}.png")).convert("RGBA")).resize((288, 288), Image.LANCZOS) for k in pick]
    sheet(fr, 6, "patlama-don.webp", quality=76)

if "plates" in what:
    # Each key cut in three: its two round ends (half as wide as it is tall) and a thin middle the game stretches.
    for k in ("tus", "tus-acik"):
        im = Image.open(os.path.join(OUT, "plate", f"{k}.png")).convert("RGBA")
        w, h = im.size
        cap = round(h * 0.5)
        im.crop((0, 0, cap, h)).save(os.path.join(DEST, f"{k}-sol.png"), optimize=True)
        im.crop((w // 2 - 2, 0, w // 2 + 2, h)).save(os.path.join(DEST, f"{k}-orta.png"), optimize=True)
        im.crop((w - cap, 0, w, h)).save(os.path.join(DEST, f"{k}-sag.png"), optimize=True)
        print(k, im.size)
