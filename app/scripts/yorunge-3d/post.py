# Premultiplied linear .npy frames -> straight-alpha sRGB PNGs, with emitted light kept as coverage
# ("emission to alpha"): over black the sprite looks exactly like the render; over the game's dark sky, nearly so.
import glob, os, sys
import numpy as np
from PIL import Image

def oetf(x):
    x = np.clip(x, 0, 1)
    return np.where(x <= 0.0031308, x * 12.92, 1.055 * np.power(x, 1 / 2.4) - 0.055)

def convert(npy, png, gain=1.0):
    a = np.load(npy)
    P, alpha = a[..., :3] * gain, np.clip(a[..., 3], 0, 1)
    D = oetf(P)
    A = np.clip(np.maximum(alpha, D.max(axis=2)), 0, 1)
    C = np.where(A[..., None] > 1e-4, D / np.maximum(A[..., None], 1e-4), 0)
    out = np.dstack([np.clip(C, 0, 1), A])
    Image.fromarray((out * 255 + 0.5).astype(np.uint8), "RGBA").save(png)

if __name__ == "__main__":
    folder = sys.argv[1]
    gain = float(sys.argv[2]) if len(sys.argv) > 2 else 1.0
    for f in sorted(glob.glob(os.path.join(folder, "*.npy"))):
        convert(f, f[:-4] + ".png", gain)
    print("PNG", folder)
