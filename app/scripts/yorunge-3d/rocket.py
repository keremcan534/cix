# Yörünge's rocket: chrome body, candy-red nose and fins, gold bands, a glowing cyan porthole. Rendered nose up, rolling
# once around its long axis over N frames (the in-game sprite sheet), on a transparent background.
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402

import common as c  # noqa: E402

OUT = c.out_dir(os.path.join(os.path.dirname(os.path.abspath(__file__)), "out", "rocket"))
FRAMES = int(os.environ.get("FRAMES", "24"))
SIZE = int(os.environ.get("SIZE", "200"))
SAMPLES = int(os.environ.get("SAMPLES", "128"))

scene = c.reset()
c.cycles(scene, SIZE, SIZE, samples=SAMPLES)
c.world("city.exr", strength=0.55, rot=1.2)

chrome = c.material("Chrome", "#E9EDF3", metallic=1.0, rough=0.16, coat=0.4, coat_rough=0.05)
red = c.material("Candy", "#A80820", metallic=0.25, rough=0.28, coat=1.0, coat_rough=0.02)
gold = c.material("Gold", "#FFC85C", metallic=1.0, rough=0.18)
gun = c.material("Gunmetal", "#3B4150", metallic=1.0, rough=0.32)
seam = c.material("Seam", "#20242E", metallic=0.6, rough=0.5)
glass = c.material("Glass", "#04222C", metallic=0.0, rough=0.03, coat=1.0, coat_rough=0.0, emission="#12CFF5", emit=1.6, spec=1.0)
inner = c.material("NozzleIn", "#120D0A", metallic=0.6, rough=0.5, emission="#FF7A1A", emit=0.6)

R = c.empty("Rocket")

# Body: a skirt at the nozzle, a soft bulge, slightly narrower where the nose sits.
body = [(0.0, 0.17), (0.18, 0.17), (0.21, 0.19), (0.235, 0.24), (0.265, 0.34), (0.288, 0.5), (0.298, 0.68), (0.3, 0.86), (0.296, 1.04), (0.287, 1.22), (0.279, 1.36), (0.0, 1.36)]
c.lathe("Body", body, mat=chrome, parent=R)

# Nose: a tangent ogive from the body to a point.
L, Rn = 0.8, 0.279
rho = (Rn * Rn + L * L) / (2 * Rn)
nose = [(0.0, 1.355)]
for i in range(0, 25):
    x = L * (1 - i / 24)  # distance from the tip
    r = math.sqrt(max(0.0, rho * rho - (L - x) ** 2)) + Rn - rho
    nose.append((max(r, 0.0), 1.355 + (L - x)))
nose[-1] = (0.0, 1.355 + L)
c.lathe("Nose", nose, mat=red, parent=R)
c.sphere("Tip", 0.022, (0, 0, 1.355 + L - 0.006), mat=gold, parent=R)

# Gold bands where the nose meets the body and above the skirt; two dark seams between the panels.
c.torus("BandTop", 0.283, 0.022, z=1.36, mat=gold, parent=R)
c.torus("BandLow", 0.245, 0.016, z=0.26, mat=gold, parent=R)
c.torus("Seam1", 0.293, 0.005, z=0.58, mat=seam, parent=R)
c.torus("Seam2", 0.29, 0.005, z=1.17, mat=seam, parent=R)

# Nozzle: a flared bell, dark metal, a faint glow inside.
bell_out = [(0.12, 0.19), (0.125, 0.15), (0.138, 0.1), (0.158, 0.05), (0.178, 0.012), (0.182, 0.0)]
bell_in = [(0.166, 0.0), (0.152, 0.03), (0.133, 0.08), (0.117, 0.13), (0.106, 0.17)]
c.lathe("Nozzle", bell_out + bell_in, closed=True, mat=gun, parent=R)
c.lathe("NozzleCore", [(0.0, 0.05), (0.11, 0.05), (0.104, 0.16), (0.0, 0.16)], mat=inner, parent=R)
c.torus("NozzleLip", 0.176, 0.01, z=0.004, mat=gold, parent=R)

# Porthole facing the camera (-Y): gold rim, cyan glass dome.
port_z, port_r = 0.92, 0.104
rim = c.torus("PortRim", port_r + 0.012, 0.03, z=0.0, mat=gold, parent=R)
rim.rotation_euler = (math.radians(90), 0, 0)
rim.location = (0, -0.284, port_z)
dome = [(0.0, 0.035)] + [(port_r * math.sin(a), 0.035 * math.cos(a)) for a in [i / 10 * math.pi / 2 for i in range(1, 11)]] + [(0.0, -0.02)]
g = c.lathe("PortGlass", dome, mat=glass, parent=R)
g.rotation_euler = (math.radians(90), 0, 0)
g.location = (0, -0.288, port_z)

# Three swept fins.
fin = [(0.18, 0.86), (0.29, 0.74), (0.4, 0.56), (0.5, 0.33), (0.57, 0.12), (0.61, -0.04), (0.58, -0.075), (0.5, -0.02), (0.39, 0.06), (0.26, 0.14), (0.18, 0.18)]
for k in range(3):
    f = c.slab(f"Fin{k}", fin, 0.06, bevel=0.022, segs=4, mat=red, parent=R)
    f.rotation_euler = (0, 0, math.radians(90 + k * 120))
    # A gold edge along each fin's leading edge.
    edge = c.slab(f"FinEdge{k}", [(0.185, 0.875), (0.295, 0.755), (0.405, 0.575), (0.505, 0.345), (0.575, 0.13), (0.62, -0.045), (0.6, -0.07), (0.56, 0.1), (0.485, 0.32), (0.385, 0.545), (0.275, 0.725), (0.18, 0.84)], 0.066, bevel=0.012, segs=3, mat=gold, parent=R)
    edge.rotation_euler = f.rotation_euler

# Lights: warm key from the upper left, violet and cyan rims (the sky's nebulas), a soft fill from the front.
c.area_light("Key", (-3.2, -4.0, 3.6), (0, 0, 1.0), 900, "#FFF1DE", size=3.0)
c.area_light("RimV", (3.6, 2.6, 1.8), (0, 0, 1.0), 900, "#B455FF", size=2.0)
c.area_light("RimC", (-3.4, 3.0, 2.4), (0, 0, 1.0), 600, "#3FD8FF", size=2.0)
c.area_light("Fill", (0.8, -5.0, 0.2), (0, 0, 1.0), 180, "#E6ECFF", size=4.0)
c.area_light("Top", (0.0, -0.6, 6.0), (0, 0, 1.0), 300, "#FFFFFF", size=2.0)
strip = c.area_light("Strip", (-2.2, -3.2, 1.1), (0, 0, 1.1), 350, "#FFFFFF", size=0.4)
strip.data.shape = "RECTANGLE"
strip.data.size_y = 5.0

# Camera: orthographic, a little above (the rocket's top edge reads), nose at 10 %, nozzle at 90 % of the frame.
H = 2.155 / 0.8
pitch = math.radians(10)
z_c = 0.9 * H - H / 2
c.ortho_camera((0, -20 * math.cos(pitch), z_c + 20 * math.sin(pitch)), (0, 0, z_c), H)

def roll(i):
    # The porthole faces the camera on frame 0; the rocket turns counter-clockwise seen from the nose.
    R.rotation_euler = (0, 0, -math.tau * i / FRAMES)

c.render_frames(scene, OUT, list(range(FRAMES)), before=roll)
print("DONE", OUT)
