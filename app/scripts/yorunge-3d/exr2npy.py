# Loads every EXR in a folder (premultiplied, scene linear) and saves its pixels as .npy (H, W, 4), top row first.
import glob, os, sys
import bpy
import numpy as np
folder = sys.argv[sys.argv.index("--") + 1]
for p in sorted(glob.glob(os.path.join(folder, "*.exr"))):
    img = bpy.data.images.load(p)
    w, h = img.size
    a = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(a)
    a = a.reshape(h, w, 4)[::-1]
    np.save(p[:-4] + ".npy", a)
    bpy.data.images.remove(img)
print("NPY", folder)
