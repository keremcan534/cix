# Yörünge's small props, one per run: `parasut` (a red-and-white canopy carrying a chrome escape pod), `bidon` (a red
# jerrycan with a gold cap: the fuel key's picture), `duman` (a soft puff of smoke).
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bmesh  # noqa: E402
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

import common as c  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1 :]
KIND, OUT = argv[0], argv[1]
os.makedirs(OUT, exist_ok=True)
PX = int(os.environ.get("PX", "160"))
SAMPLES = int(os.environ.get("SAMPLES", "128"))
random.seed(3)

scene = c.reset()
c.cycles(scene, PX, PX, samples=SAMPLES)
c.world("city.exr", strength=0.55, rot=1.2)
parts = []


def lights(center=(0, 0, 0)):
    c.area_light("Key", (-3.2, -4.0, 3.6), center, 900, "#FFF1DE", size=3.0)
    c.area_light("RimV", (3.6, 2.6, 1.8), center, 800, "#B455FF", size=2.0)
    c.area_light("RimC", (-3.4, 3.0, 2.4), center, 500, "#3FD8FF", size=2.0)
    c.area_light("Fill", (0.8, -5.0, 0.2), center, 200, "#E6ECFF", size=4.0)


def view(yaw, pitch, target):
    yaw, pitch = math.radians(yaw), math.radians(pitch)
    d = Vector((math.sin(yaw) * math.cos(pitch), -math.cos(yaw) * math.cos(pitch), math.sin(pitch)))
    cam = c.ortho_camera(Vector(target) + d * 20, target, 2.0)
    c.fit_camera(cam, parts, PX, margin=0.03)
    # Square pictures: the game draws them in square boxes.
    s = max(cam.data.ortho_scale, 0)
    scene.render.resolution_x = scene.render.resolution_y = PX
    cam.data.ortho_scale = s


if KIND == "parasut":
    white = c.material("White", "#F3F1EE", rough=0.55, spec=0.3)
    red = c.material("Red", "#B10A24", rough=0.5, spec=0.3)
    cord = c.material("Cord", "#D9D4C8", rough=0.6)
    chrome = c.material("Chrome", "#E9EDF3", metallic=1.0, rough=0.15)
    gold = c.material("Gold", "#FFC85C", metallic=1.0, rough=0.2)
    glass = c.material("Glass", "#04222C", rough=0.03, coat=1.0, emission="#12CFF5", emit=1.6)
    # The canopy: a dome of 10 gores that billow between their seams, alternating red and white.
    G, RING = 10, 14
    bm = bmesh.new()
    rows = []
    for j in range(RING + 1):
        v = j / RING  # 0 crown … 1 hem
        phi = v * math.radians(78)
        row = []
        for i in range(G * 8):
            th = i / (G * 8) * math.tau
            bil = 1 + 0.07 * math.sin(math.pi * ((th * G / math.tau) % 1)) * math.sin(v * math.pi * 0.9)
            r = math.sin(phi) * bil
            row.append(bm.verts.new((r * math.cos(th), r * math.sin(th), math.cos(phi) * 0.82)))
        rows.append(row)
    n = G * 8
    for j in range(RING):
        for i in range(n):
            f = bm.faces.new((rows[j][i], rows[j][(i + 1) % n], rows[j + 1][(i + 1) % n], rows[j + 1][i]))
            f.material_index = (i // 8) % 2
    bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=0.012)
    can = c.mesh_object("Canopy", bm, True, None, white)
    can.data.materials.append(red)
    parts.append(can)
    # The pod hanging under it.
    pod_z = -1.15
    pod = c.lathe("Pod", [(0.0, -0.17), (0.1, -0.16), (0.15, -0.1), (0.16, 0.0), (0.14, 0.09), (0.09, 0.15), (0.0, 0.17)], mat=chrome)
    pod.location = (0, 0, pod_z)
    parts.append(pod)
    band = c.torus("PodBand", 0.158, 0.018, z=0.0, mat=gold)
    band.location = (0, 0, pod_z)
    parts.append(band)
    win = c.sphere("PodWin", 0.06, (0, -0.135, pod_z + 0.04), mat=glass)
    win.scale = (1, 0.45, 1)
    parts.append(win)
    # Cords from the hem's seams to the pod's top.
    hem_r = math.sin(math.radians(78))
    hem_z = math.cos(math.radians(78)) * 0.82
    for i in range(G):
        th = i / G * math.tau
        parts.append(c.cylinder(f"Cord{i}", (hem_r * math.cos(th), hem_r * math.sin(th), hem_z), (0, 0, pod_z + 0.17), 0.006, steps=6, mat=cord))
    lights((0, 0, -0.3))
    view(18, 10, (0, 0, -0.3))

elif KIND == "bidon":
    red = c.material("Red", "#B10A24", metallic=0.3, rough=0.3, coat=1.0, coat_rough=0.04)
    gold = c.material("Gold", "#FFC85C", metallic=1.0, rough=0.2)
    dark = c.material("Dark", "#3A4152", metallic=0.85, rough=0.4)
    parts.append(c.box("Body", (0.62, 0.24, 0.78), (0, 0, 0.39), bevel=0.06, segs=4, mat=red))
    # The embossed X on its side, and a rim round it.
    for k, ang in enumerate((38, -38)):
        x = c.box(f"X{k}", (0.78, 0.03, 0.07), (0, 0, 0), bevel=0.02, mat=red)
        x.location = (0, -0.125, 0.36)
        x.rotation_euler = (0, math.radians(ang), 0)
        parts.append(x)
    parts.append(c.box("Rim", (0.66, 0.26, 0.04), (0, 0, 0.76), bevel=0.015, mat=dark))
    # Three-bar handle on top and the spout with a gold cap on the front corner.
    for k, x in enumerate((-0.16, 0.0, 0.16)):
        parts.append(c.cylinder(f"HPost{k}", (x, 0, 0.78), (x, 0, 0.9), 0.025, mat=red))
    parts.append(c.cylinder("HBar", (-0.2, 0, 0.92), (0.2, 0, 0.92), 0.035, mat=red))
    parts.append(c.cylinder("Spout", (0.19, -0.02, 0.78), (0.19, -0.02, 0.9), 0.06, mat=dark))
    parts.append(c.cylinder("Cap", (0.19, -0.02, 0.88), (0.19, -0.02, 0.97), 0.072, mat=gold))
    lights((0, 0, 0.45))
    view(-28, 16, (0, 0, 0.45))

elif KIND == "duman":
    bpy.ops.mesh.primitive_cube_add(size=2.2, location=(0, 0, 0))
    vol = bpy.context.active_object
    m = bpy.data.materials.new("Smoke")
    nt = c.node_tree(m)
    nt.nodes.clear()
    N = nt.nodes
    out = N.new("ShaderNodeOutputMaterial")
    pv = N.new("ShaderNodeVolumePrincipled")
    pv.inputs["Color"].default_value = c.srgb("#D8D4DC")
    pv.inputs["Anisotropy"].default_value = 0.3
    tc = N.new("ShaderNodeTexCoord")
    nz = N.new("ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = 2.2
    nz.inputs["Detail"].default_value = 8.0
    nz.inputs["Roughness"].default_value = 0.6
    nt.links.new(tc.outputs["Object"], nz.inputs["Vector"])
    ln = N.new("ShaderNodeVectorMath")
    ln.operation = "LENGTH"
    nt.links.new(tc.outputs["Object"], ln.inputs[0])
    # Density: a ball whose edge is eaten by the noise into billows.
    sub = N.new("ShaderNodeMath")
    sub.operation = "SUBTRACT"
    sub.inputs[0].default_value = 0.95
    nt.links.new(ln.outputs["Value"], sub.inputs[1])
    add = N.new("ShaderNodeMath")
    add.operation = "ADD"
    nt.links.new(sub.outputs[0], add.inputs[0])
    sc = N.new("ShaderNodeMath")
    sc.operation = "MULTIPLY_ADD"
    nt.links.new(nz.outputs["Fac"], sc.inputs[0])
    sc.inputs[1].default_value = 0.9
    sc.inputs[2].default_value = -0.45
    nt.links.new(sc.outputs[0], add.inputs[1])
    mul = N.new("ShaderNodeMath")
    mul.operation = "MULTIPLY"
    mul.use_clamp = False
    mul.inputs[1].default_value = 14.0
    clamp = N.new("ShaderNodeClamp")
    nt.links.new(add.outputs[0], clamp.inputs["Value"])
    nt.links.new(clamp.outputs[0], mul.inputs[0])
    nt.links.new(mul.outputs[0], pv.inputs["Density"])
    nt.links.new(pv.outputs["Volume"], out.inputs["Volume"])
    vol.data.materials.append(m)
    scene.cycles.volume_step_rate = 0.5
    c.area_light("Key", (-3, -3, 4), (0, 0, 0), 1400, "#FFF4E8", size=3)
    c.area_light("RimV", (3.5, 3, 1), (0, 0, 0), 500, "#B455FF", size=3)
    c.area_light("Fill", (0, -5, -1), (0, 0, 0), 250, "#C9D4FF", size=4)
    c.ortho_camera((0, -20, 0), (0, 0, 0), 2.3)

scene.render.filepath = os.path.join(OUT, f"{KIND}.png")
bpy.ops.render.render(write_still=True)
print("DONE", KIND)
