# Yörünge's engine flame: a volumetric plume pointing down (its root at the top of the frame), streaky licks flowing
# away from the nozzle. N + K frames are rendered; post (loop) crossfades the last K into the first so it loops.
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402

import common as c  # noqa: E402

OUT = c.out_dir(os.path.join(os.path.dirname(os.path.abspath(__file__)), "out", "flame"))
W, H = int(os.environ.get("W", "80")), int(os.environ.get("H", "320"))
FRAMES = int(os.environ.get("FRAMES", "22"))
SAMPLES = int(os.environ.get("SAMPLES", "96"))
L = 4.0  # plume length; the frame is L tall and L * W / H wide

scene = c.reset()
c.cycles(scene, W, H, samples=SAMPLES)
c.exr(scene)
scene.cycles.volume_step_rate = 0.25
scene.cycles.volume_max_steps = 1024
c.world("night.exr", strength=0.0)

bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, -L / 2))
vol = bpy.context.active_object
vol.scale = (1.2, 1.2, L)
bpy.ops.object.transform_apply(location=True, rotation=False, scale=True)

m = bpy.data.materials.new("Flame")
nt = c.node_tree(m)
nt.nodes.clear()
N = nt.nodes
out = N.new("ShaderNodeOutputMaterial")
pv = N.new("ShaderNodeVolumePrincipled")
pv.inputs["Color"].default_value = (0, 0, 0, 1)
pv.inputs["Absorption Color"].default_value = (0, 0, 0, 1)
tc = N.new("ShaderNodeTexCoord")
sep = N.new("ShaderNodeSeparateXYZ")
nt.links.new(tc.outputs["Object"], sep.inputs[0])
X, Y, Z = sep.outputs

def op(o, a, b=None, clamp=False):
    n = N.new("ShaderNodeMath")
    n.operation = o
    n.use_clamp = clamp
    for i, v in enumerate((a, b)):
        if v is None:
            continue
        if isinstance(v, (int, float)):
            n.inputs[i].default_value = v
        else:
            nt.links.new(v, n.inputs[i])
    return n.outputs[0]

time = N.new("ShaderNodeValue")
time.name = "Time"
T = time.outputs[0]

# t: 0 at the nozzle, 1 at the tip.
t = op("DIVIDE", op("MULTIPLY", Z, -1.0), L, clamp=True)
# The plume's radius along it: 0.2 at the nozzle, swelling, closing to a point.
R = op("MULTIPLY", op("ADD", 0.19, op("MULTIPLY", 0.36, op("POWER", t, 0.5))), op("SUBTRACT", 1.0, op("POWER", t, 2.2)))

def noise(scale_xy, scale_z, flow, wrate, detail, scale=1.0):
    comb = N.new("ShaderNodeCombineXYZ")
    nt.links.new(op("MULTIPLY", X, scale_xy), comb.inputs[0])
    nt.links.new(op("MULTIPLY", Y, scale_xy), comb.inputs[1])
    nt.links.new(op("ADD", op("MULTIPLY", Z, scale_z), op("MULTIPLY", T, flow)), comb.inputs[2])
    nz = N.new("ShaderNodeTexNoise")
    nz.noise_dimensions = "4D"
    nz.inputs["Scale"].default_value = scale
    nz.inputs["Detail"].default_value = detail
    nz.inputs["Roughness"].default_value = 0.55
    nt.links.new(comb.outputs[0], nz.inputs["Vector"])
    nt.links.new(op("MULTIPLY", T, wrate), nz.inputs["W"])
    return nz.outputs["Fac"]

n1 = noise(2.6, 0.42, 3.4, 0.8, 6.0)  # licks, stretched along the plume, flowing away
n2 = noise(6.5, 0.9, 6.0, 1.5, 4.0)  # fine flicker
r = op("SQRT", op("ADD", op("MULTIPLY", X, X), op("MULTIPLY", Y, Y)))
wob = op("ADD", 0.42, op("MULTIPLY", n1, 1.15))  # the edge breathes with the licks
d = op("DIVIDE", r, op("MAXIMUM", op("MULTIPLY", R, wob), 0.001))
shape = op("POWER", op("SUBTRACT", 1.0, d, clamp=True), 0.75)
fade = op("POWER", op("SUBTRACT", 1.0, t, clamp=True), 1.25)
grain = op("ADD", 0.2, op("MULTIPLY", op("POWER", n2, 1.6), 2.2))
I = op("MULTIPLY", op("MULTIPLY", shape, fade), grain)
# The core right at the nozzle burns hottest.
core = op("MULTIPLY", op("POWER", op("SUBTRACT", 1.0, op("MULTIPLY", d, 1.6), clamp=True), 2.0), op("POWER", op("SUBTRACT", 1.0, op("MULTIPLY", t, 2.2), clamp=True), 1.5))
I = op("ADD", I, op("MULTIPLY", core, 0.9))

ramp = N.new("ShaderNodeValToRGB")
cr = ramp.color_ramp
cr.elements[0].position = 0.0
cr.elements[0].color = (0, 0, 0, 1)
cr.elements[1].position = 1.0
cr.elements[1].color = (1.0, 0.98, 0.92, 1)
for pos, col in ((0.08, "#5A0A02"), (0.2, "#D2300A"), (0.38, "#FF6A10"), (0.58, "#FFA82A"), (0.8, "#FFE27A")):
    e = cr.elements.new(pos)
    e.color = c.srgb(col)
nt.links.new(op("MINIMUM", I, 1.0), ramp.inputs["Fac"])
nt.links.new(ramp.outputs["Color"], pv.inputs["Emission Color"])
nt.links.new(op("MULTIPLY", op("POWER", I, 1.3), float(os.environ.get("EMIT", "15"))), pv.inputs["Emission Strength"])
nt.links.new(op("MULTIPLY", I, 2.5), pv.inputs["Density"])
nt.links.new(pv.outputs["Volume"], out.inputs["Volume"])
vol.data.materials.append(m)

c.ortho_camera((0, -20, -L / 2), (0, 0, -L / 2), L)

def at(i):
    time.outputs[0].default_value = i / 24.0

os.makedirs(OUT, exist_ok=True)
for i in range(FRAMES):
    at(i)
    scene.render.filepath = os.path.join(OUT, f"f{i:03d}.exr")
    bpy.ops.render.render(write_still=True)
print("DONE", OUT)
