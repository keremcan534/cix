"""Cut a delivered icon sheet (an even grid of 3D icons on a transparent PNG) into one 192 px PNG per cell.

The generator leaves faint speckles (alpha 1-30) around the icons and keeps the icons themselves at alpha ~252: the
speckles are dropped by alpha and component size, the icon's body is made fully opaque, and its soft edge is kept.
Each icon is cropped to its own bounds, centred on a square canvas with a small margin and scaled to 192 px.

Usage: python scripts/sheet-cut.py <sheet.png> <cols> <rows> <out dir> <name1,name2,...> [size]
Names go row by row; an empty name skips that cell.
"""
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage


def clean(cell: np.ndarray) -> np.ndarray:
    alpha = cell[..., 3].astype(np.float32)
    body = alpha >= 128
    labels, n = ndimage.label(body)
    if n == 0:
        return cell
    sizes = ndimage.sum(body, labels, range(1, n + 1))
    keep_ids = [i + 1 for i, s in enumerate(sizes) if s >= max(200, sizes.max() * 0.01)]
    keep = np.isin(labels, keep_ids)
    # The soft edge (alpha below 128) belongs to the icon only where it touches a kept body.
    near = ndimage.binary_dilation(keep, iterations=3)
    alpha = np.where(near, alpha, 0)
    alpha = np.where(alpha >= 235, 255, alpha)
    alpha = np.where(alpha < 24, 0, alpha)
    out = cell.copy()
    out[..., 3] = alpha.astype(np.uint8)
    return out


def square(cell: np.ndarray, size: int, margin: float = 0.06) -> Image.Image:
    ys, xs = np.nonzero(cell[..., 3] > 0)
    crop = cell[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1]
    h, w = crop.shape[:2]
    side = int(round(max(h, w) * (1 + 2 * margin)))
    canvas = np.zeros((side, side, 4), np.uint8)
    y0, x0 = (side - h) // 2, (side - w) // 2
    canvas[y0 : y0 + h, x0 : x0 + w] = crop
    return Image.fromarray(canvas, 'RGBA').resize((size, size), Image.LANCZOS)


def main() -> None:
    src, cols, rows, out_dir, names = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), sys.argv[4], sys.argv[5].split(',')
    size = int(sys.argv[6]) if len(sys.argv) > 6 else 192
    sheet = np.array(Image.open(src).convert('RGBA'))
    H, W = sheet.shape[:2]
    os.makedirs(out_dir, exist_ok=True)
    for i, name in enumerate(names):
        if not name:
            continue
        r, c = divmod(i, cols)
        y0, y1 = round(r * H / rows), round((r + 1) * H / rows)
        x0, x1 = round(c * W / cols), round((c + 1) * W / cols)
        img = square(clean(sheet[y0:y1, x0:x1]), size)
        img.save(os.path.join(out_dir, name + '.png'), optimize=True)
        print(name)


if __name__ == '__main__':
    main()
