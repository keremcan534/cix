# Yörünge's control keys: a rounded plate with a bevelled gold rim and a glossy enamel face (navy, or ruby when the key
# is on), seen straight on. The game cuts it in three (two round ends and a middle that stretches), so one picture
# fits a key of any width.
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402

import common as c  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1 :]
KIND, OUT = argv[0], argv[1]
os.makedirs(OUT, exist_ok=True)
PXH = int(os.environ.get("PXH", "168"))
SAMPLES = int(os.environ.get("SAMPLES", "160"))
L, H = 4.0, 1.0
FACE = {"tus": ("#2634B0", "#060930"), "tus-acik": ("#C2142F", "#36030A")}[KIND]

scene = c.reset()
c.cycles(scene, round(PXH * L / H), PXH, samples=SAMPLES)
c.world("studio.exr", strength=0.18)


def rounded(w, h, r, seg=14):
    pts = []
    for cx, cz, a0 in ((w / 2 - r, h / 2 - r, 0), (-w / 2 + r, h / 2 - r, 90), (-w / 2 + r, -h / 2 + r, 180), (w / 2 - r, -h / 2 + r, 270)):
        for i in range(seg + 1):
            a = math.radians(a0 + 90 * i / seg)
            pts.append((cx + r * math.cos(a), cz + r * math.sin(a)))
    return pts


gold = c.material("Gold", "#FFC85C", metallic=1.0, rough=0.2)
dark_gold = c.material("GoldDeep", "#B07A22", metallic=1.0, rough=0.35)
# The enamel: light at the top, deep at the bottom, under a clear coat.
face = bpy.data.materials.new("Face")
nt = c.node_tree(face)
b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
b.inputs["Roughness"].default_value = 0.32
b.inputs["Coat Weight"].default_value = 1.0
b.inputs["Coat Roughness"].default_value = 0.1
tc = nt.nodes.new("ShaderNodeTexCoord")
sep = nt.nodes.new("ShaderNodeSeparateXYZ")
nt.links.new(tc.outputs["Object"], sep.inputs[0])
mr = nt.nodes.new("ShaderNodeMapRange")
mr.inputs["From Min"].default_value = -H / 2
mr.inputs["From Max"].default_value = H / 2
nt.links.new(sep.outputs["Z"], mr.inputs["Value"])
ramp = nt.nodes.new("ShaderNodeValToRGB")
ramp.color_ramp.elements[0].color = c.srgb(FACE[1])
ramp.color_ramp.elements[1].color = c.srgb(FACE[0])
nt.links.new(mr.outputs["Result"], ramp.inputs["Fac"])
nt.links.new(ramp.outputs["Color"], b.inputs["Base Color"])

parts = []
R = 0.42
parts.append(c.slab("Rim", rounded(L, H, R), 0.22, bevel=0.06, segs=5, mat=gold))
# A thin dark groove between the rim and the face, then the face standing a little proud of it.
groove = c.slab("Groove", rounded(L - 0.15, H - 0.15, R - 0.075), 0.24, bevel=0.01, segs=2, mat=dark_gold)
inner = c.slab("Face", rounded(L - 0.19, H - 0.19, R - 0.095), 0.27, bevel=0.035, segs=4, mat=face)
parts += [groove, inner]

# Lights: a broad soft box above (the gloss across the face's top), a warm key, violet and cyan rims.
top = c.area_light("Top", (0, -2.5, 3.0), (0, 0, 0.2), 140, "#FFFFFF", size=1.0)
top.data.shape = "RECTANGLE"
top.data.size = 7.0
top.data.size_y = 1.2
# The gloss on the face's upper half: a strip behind the camera that the clear coat mirrors (unseen by the camera).
band = c.area_light("Band", (0, -6, 0.24), (0, 0, 0.24), 5, "#FFFFFF", size=1.0)
band.data.shape = "RECTANGLE"
band.data.size = 3.4
band.data.size_y = 0.34
band.visible_camera = False
c.area_light("Key", (-3, -4, 2), (0, 0, 0), 110, "#FFF1DE", size=3)
c.area_light("RimV", (4, 1.5, 0.5), (0, 0, 0), 300, "#B455FF", size=3)
c.area_light("RimC", (-4, 1.5, 0.5), (0, 0, 0), 250, "#3FD8FF", size=3)

cam = c.ortho_camera((0, -20, 0), (0, 0, 0), L)
c.fit_camera(cam, parts, round(PXH * L / H), margin=0.004)
scene.render.filepath = os.path.join(OUT, f"{KIND}.png")
bpy.ops.render.render(write_still=True)
print("DONE", KIND, scene.render.resolution_x, scene.render.resolution_y)
