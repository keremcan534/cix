# Yörünge's launch ramp: a steel deck on the planet, a rail rising to the right on trusses, amber lights along it, a
# lattice service tower with a lit cabin and a beacon. Seen a little from above and from the left so its depth reads.
# Prints where the rail's middle and its angle land in the picture (the game lays the rocket's belly there).
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

import common as c  # noqa: E402

OUT = c.out_dir(os.path.join(os.path.dirname(os.path.abspath(__file__)), "out", "ramp"))
PX = int(os.environ.get("PX", "600"))
SAMPLES = int(os.environ.get("SAMPLES", "160"))
RAIL_DEG = float(os.environ.get("RAIL_DEG", "24"))

scene = c.reset()
c.cycles(scene, PX, PX, samples=SAMPLES)
c.world("city.exr", strength=0.5, rot=2.2)

steel = c.material("Steel", "#8E97AA", metallic=0.9, rough=0.32)
dark = c.material("DarkSteel", "#3A4152", metallic=0.85, rough=0.4)
red = c.material("Red", "#A80820", metallic=0.25, rough=0.3, coat=1.0, coat_rough=0.05)
chrome = c.material("Chrome", "#E9EDF3", metallic=1.0, rough=0.12)
amber = c.material("Amber", "#2A1500", emission="#FFB020", emit=9.0)
cyan = c.material("Cyan", "#04222C", rough=0.05, coat=1.0, emission="#30D8FF", emit=3.0)
beacon = c.material("Beacon", "#300000", emission="#FF2A3A", emit=14.0)
gold = c.material("Gold", "#FFC85C", metallic=1.0, rough=0.2)

parts = []
def add(ob):
    parts.append(ob)
    return ob

# The deck.
add(c.box("Deck", (3.1, 0.7, 0.16), (1.5, 0, 0.08), bevel=0.03, mat=steel))
add(c.box("DeckStripe", (3.0, 0.02, 0.05), (1.5, -0.355, 0.1), bevel=0.01, mat=red))
add(c.box("DeckFoot", (3.2, 0.78, 0.05), (1.5, 0, 0.0), bevel=0.02, mat=dark))
for i in range(9):
    add(c.box(f"DeckLamp{i}", (0.1, 0.02, 0.035), (0.2 + i * 0.33, -0.362, 0.06), bevel=0.008, mat=amber))

# The rail: from low on the left up to the tower.
x0, x1 = 0.32, 2.42
z0 = 0.42
tan = math.tan(math.radians(RAIL_DEG))
z1 = z0 + (x1 - x0) * tan
a, b = Vector((x0, 0, z0)), Vector((x1, 0, z1))
along = (b - a).normalized()
up = Vector((-along.z, 0, along.x))
L = (b - a).length
mid = (a + b) / 2

def beam(name, center, length, thick, depth, mat, bevel=0.015):
    ob = c.box(name, (length, depth, thick), (0, 0, 0), bevel=bevel, mat=mat)
    ob.location = center
    ob.rotation_euler = (0, -math.radians(RAIL_DEG), 0)
    return add(ob)

beam("Rail", mid, L, 0.14, 0.34, red)
beam("RailTop", mid + up * 0.085, L - 0.04, 0.03, 0.3, dark)
for k, y in enumerate((-0.09, 0.09)):
    g = beam(f"Guide{k}", mid + up * 0.115, L - 0.08, 0.03, 0.035, chrome, bevel=0.01)
    g.location.y = y
# Lamps along the rail's side.
for i in range(8):
    t = (i + 0.5) / 8
    p = a + (b - a) * t + up * 0.0
    lamp = beam(f"RailLamp{i}", p, 0.09, 0.035, 0.02, amber, bevel=0.008)
    lamp.location.y = -0.178

# Trusses under the rail: posts down to the deck and crossed braces between them.
posts = [0.75, 1.3, 1.85]
for i, x in enumerate(posts):
    top = z0 + (x - x0) * tan - 0.07
    for y in (-0.12, 0.12):
        add(c.cylinder(f"Post{i}{y}", (x, y, 0.16), (x, y, top), 0.028, mat=steel))
prev = (x0 + 0.1, z0 + 0.1 * tan - 0.07)
for i, x in enumerate(posts):
    top = z0 + (x - x0) * tan - 0.07
    add(c.cylinder(f"BraceA{i}", (prev[0], -0.12, 0.17), (x, -0.12, top - 0.02), 0.016, mat=dark))
    add(c.cylinder(f"BraceB{i}", (prev[0], -0.12, max(0.17, prev[1] - 0.02)), (x, -0.12, 0.17), 0.016, mat=dark))
    prev = (x, top)

# The service tower on the right.
tx0, tx1, ty = 2.42, 2.86, 0.2
H = z1 + 0.32
for x in (tx0, tx1):
    for y in (-ty, ty):
        add(c.cylinder(f"TPost{x}{y}", (x, y, 0.16), (x, y, H), 0.035, mat=steel))
lv = [0.16 + (H - 0.16) * k / 4 for k in range(5)]
for k in range(4):
    add(c.cylinder(f"TX{k}a", (tx0, -ty, lv[k]), (tx1, -ty, lv[k + 1]), 0.015, mat=dark))
    add(c.cylinder(f"TX{k}b", (tx1, -ty, lv[k]), (tx0, -ty, lv[k + 1]), 0.015, mat=dark))
    add(c.cylinder(f"TH{k}", (tx0, -ty, lv[k + 1]), (tx1, -ty, lv[k + 1]), 0.02, mat=steel))
# Its cabin: red, a row of cyan windows, a gold rail round the roof, an antenna with a beacon.
add(c.box("Cabin", (0.62, 0.56, 0.3), ((tx0 + tx1) / 2, 0, H + 0.15), bevel=0.04, mat=red))
add(c.box("CabinRoof", (0.7, 0.62, 0.05), ((tx0 + tx1) / 2, 0, H + 0.325), bevel=0.02, mat=steel))
for i in range(3):
    add(c.box(f"Win{i}", (0.14, 0.02, 0.11), (tx0 + 0.1 + i * 0.19 - 0.02, -0.285, H + 0.17), bevel=0.012, mat=cyan))
add(c.cylinder("Antenna", ((tx0 + tx1) / 2 + 0.12, 0, H + 0.35), ((tx0 + tx1) / 2 + 0.12, 0, H + 0.78), 0.014, mat=chrome))
add(c.sphere("Beacon", 0.04, ((tx0 + tx1) / 2 + 0.12, 0, H + 0.8), mat=beacon))
add(c.box("RoofRail", (0.66, 0.025, 0.035), ((tx0 + tx1) / 2, -0.3, H + 0.4), bevel=0.008, mat=gold))
# The rail's head where it meets the tower: a clamp.
add(c.box("Clamp", (0.2, 0.42, 0.22), (x1 + 0.02, 0, z1), bevel=0.03, mat=dark))

c.area_light("Key", (-3.0, -4.0, 4.0), (1.5, 0, 0.8), 1100, "#FFF1DE", size=3.0)
c.area_light("RimV", (5.0, 3.0, 2.5), (1.5, 0, 0.8), 1100, "#B455FF", size=3.0)
c.area_light("RimC", (-2.0, 3.5, 2.5), (1.5, 0, 0.8), 600, "#3FD8FF", size=3.0)
c.area_light("Fill", (1.5, -6.0, 0.6), (1.5, 0, 0.8), 260, "#E6ECFF", size=5.0)

yaw, pitch = math.radians(-14), math.radians(12)
target = Vector((1.5, 0, 0.9))
d = Vector((math.sin(yaw) * math.cos(pitch), -math.cos(yaw) * math.cos(pitch), math.sin(pitch)))
cam = c.ortho_camera(target + d * 20, target, 3.5)
to_img = c.fit_camera(cam, parts, PX, margin=0.02)

# Where the rail's top meets the rocket's belly, and its angle on the picture.
top_a, top_b = a + up * 0.13, b + up * 0.13
pa, pb = to_img(top_a), to_img(top_b)
pm = to_img((top_a + top_b) / 2)
W, Hh = scene.render.resolution_x, scene.render.resolution_y
ang = math.degrees(math.atan2((pa[1] - pb[1]) * Hh, (pb[0] - pa[0]) * W))
print(f"RAIL mid=({pm[0]:.4f},{pm[1]:.4f}) a=({pa[0]:.4f},{pa[1]:.4f}) b=({pb[0]:.4f},{pb[1]:.4f}) deg={ang:.2f} size={W}x{Hh}")

scene.render.filepath = os.path.join(OUT, "rampa.png")
bpy.ops.render.render(write_still=True)
print("DONE", OUT)
