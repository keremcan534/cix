# Yörünge's explosion: a Mantaflow fire-and-smoke burst in zero gravity, hot sparks streaking out (motion blur) and
# pieces of the rocket (red paint, chrome) thrown off and burning away. Rendered on a transparent background, one
# PNG per frame; the game plays them as a sprite sheet.
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bmesh  # noqa: E402
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

import common as c  # noqa: E402

OUT = c.out_dir(os.path.join(os.path.dirname(os.path.abspath(__file__)), "out", "explosion"))
SIZE = int(os.environ.get("SIZE", "320"))
SAMPLES = int(os.environ.get("SAMPLES", "128"))
RES = int(os.environ.get("RES", "128"))
NOISE = int(os.environ.get("NOISE", "1"))
FIRST, LAST = 1, int(os.environ.get("LAST", "40"))
ONLY = os.environ.get("ONLY")  # e.g. "6,14,30": render just these frames (a look before the full run)
CACHE = os.path.join(OUT, "cache")

random.seed(7)
scene = c.reset()
c.cycles(scene, SIZE, SIZE, samples=SAMPLES)
scene.cycles.volume_step_rate = 0.5
scene.cycles.volume_max_steps = 1024
scene.cycles.max_bounces = 6
scene.cycles.volume_bounces = 2
scene.frame_start, scene.frame_end = FIRST, LAST
scene.render.fps = 24
scene.use_gravity = False
scene.render.use_motion_blur = True
c.exr(scene)
scene.render.motion_blur_shutter = 0.6
c.world("night.exr", strength=0.15)

# --- The simulation -------------------------------------------------------------------------------------------
bpy.ops.mesh.primitive_cube_add(size=float(os.environ.get("DOM", "6.6")), location=(0, 0, 0))
dom = bpy.context.active_object
dom.name = "Domain"
dm = dom.modifiers.new("Fluid", "FLUID")
dm.fluid_type = "DOMAIN"
ds = dm.domain_settings
ds.domain_type = "GAS"
ds.resolution_max = RES
ds.use_adaptive_domain = True
ds.adapt_margin = 6
ds.cache_directory = CACHE
ds.cache_type = "ALL"
ds.cache_frame_start = FIRST
ds.cache_frame_end = LAST
ds.cache_data_format = "OPENVDB"
ds.alpha = 0.0
ds.beta = 0.0
ds.vorticity = 0.32
ds.use_dissolve_smoke = True
ds.dissolve_speed = int(os.environ.get("DISSOLVE", "65"))
ds.use_dissolve_smoke_log = True
ds.burning_rate = float(os.environ.get("BURN", "0.27"))
ds.flame_smoke = 2.2
ds.flame_vorticity = 0.9
ds.flame_ignition = 1.25
ds.flame_max_temp = 3.0
ds.time_scale = float(os.environ.get("TSCALE", "0.9"))
if NOISE > 1:
    ds.use_noise = True
    ds.noise_scale = NOISE
    ds.noise_strength = 1.4
    ds.noise_pos_scale = 1.6
dom.cycles.use_motion_blur = False

# The source: a lumpy ball that throws fire and smoke outward for a few frames, then is gone.
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=4, radius=0.42, location=(0, 0, 0))
src = bpy.context.active_object
src.name = "Source"
tex = bpy.data.textures.new("Lumps", "CLOUDS")
tex.noise_scale = 0.18
disp = src.modifiers.new("Lumps", "DISPLACE")
disp.texture = tex
disp.strength = 0.22
fm = src.modifiers.new("Fluid", "FLUID")
fm.fluid_type = "FLOW"
fs = fm.flow_settings
fs.flow_type = "BOTH"
fs.flow_behavior = "INFLOW"
fs.flow_source = "MESH"
fs.surface_distance = 0.6
fs.volume_density = 1.0
fs.use_initial_velocity = True
fs.velocity_normal = float(os.environ.get("VEL", "5.5"))
fs.fuel_amount = 4.0
fs.temperature = 3.0
fs.density = 1.2
fs.subframes = 2
for fr, on in ((1, 1.0), (4, 1.0), (7, 0.0)):
    fs.fuel_amount = 4.0 * on
    fs.density = 2.0 * on
    fs.temperature = 3.0 * on
    for p in ("fuel_amount", "density", "temperature"):
        fs.keyframe_insert(p, frame=fr)
src.scale = (1, 1, 1)
src.keyframe_insert("scale", frame=6)
src.scale = (0.001, 0.001, 0.001)
src.keyframe_insert("scale", frame=8)
src.hide_render = True

# Turbulence breaks the ball's symmetry into billows.
bpy.ops.object.effector_add(type="TURBULENCE", location=(0.1, -0.05, 0.08))
turb = bpy.context.active_object
turb.field.strength = 9.0
turb.field.size = 0.45
turb.field.flow = 0.0
bpy.ops.object.effector_add(type="TURBULENCE", location=(-0.2, 0.1, -0.1))
turb2 = bpy.context.active_object
turb2.field.strength = 5.0
turb2.field.size = 0.9

print("BAKE start", RES, NOISE)
with bpy.context.temp_override(object=dom, active_object=dom, selected_objects=[dom], selected_editable_objects=[dom]):
    bpy.ops.fluid.free_all()
    bpy.ops.fluid.bake_all()
print("BAKE done")

# --- The look of the gas --------------------------------------------------------------------------------------
vm = bpy.data.materials.new("Fire")
nt = c.node_tree(vm)
nt.nodes.clear()
out = nt.nodes.new("ShaderNodeOutputMaterial")
pv = nt.nodes.new("ShaderNodeVolumePrincipled")
a_den = nt.nodes.new("ShaderNodeAttribute")
a_den.attribute_name = "density"
a_fl = nt.nodes.new("ShaderNodeAttribute")
a_fl.attribute_name = "flame"
a_t = nt.nodes.new("ShaderNodeAttribute")
a_t.attribute_name = "temperature"

def math_node(op, a=None, b=None, va=None, vb=None, clamp=False):
    n = nt.nodes.new("ShaderNodeMath")
    n.operation = op
    n.use_clamp = clamp
    if a is not None:
        nt.links.new(a, n.inputs[0])
    elif va is not None:
        n.inputs[0].default_value = va
    if b is not None:
        nt.links.new(b, n.inputs[1])
    elif vb is not None:
        n.inputs[1].default_value = vb
    return n.outputs[0]

# Soot density: the smoke, plus the flame itself so the fire keeps its body (and its alpha) over any background.
den = math_node("ADD", math_node("MULTIPLY", a_den.outputs["Fac"], vb=float(os.environ.get("DEN", "10"))), math_node("MULTIPLY", a_fl.outputs["Fac"], vb=float(os.environ.get("FDEN", "3"))))
nt.links.new(den, pv.inputs["Density"])
pv.inputs["Color"].default_value = c.srgb(os.environ.get("SMOKE", "#6E6470"))
pv.inputs["Absorption Color"].default_value = c.srgb("#050306")
pv.inputs["Anisotropy"].default_value = 0.25
# Fire colour: deep red at the cool edge, orange, yellow, white in the hottest core.
ramp = nt.nodes.new("ShaderNodeValToRGB")
cr = ramp.color_ramp
cr.elements[0].position = 0.0
cr.elements[0].color = (0, 0, 0, 1)
cr.elements[1].position = 1.0
cr.elements[1].color = (1.0, 0.96, 0.86, 1)
for pos, col in ((0.1, "#3A0500"), (0.24, "#B81E04"), (0.42, "#FF5A0E"), (0.62, "#FF9A24"), (0.82, "#FFDA6A")):
    e = cr.elements.new(pos)
    e.color = c.srgb(col)
nt.links.new(a_fl.outputs["Fac"], ramp.inputs["Fac"])
nt.links.new(ramp.outputs["Color"], pv.inputs["Emission Color"])
pow_ = math_node("POWER", a_fl.outputs["Fac"], vb=1.5)
nt.links.new(math_node("MULTIPLY", pow_, vb=float(os.environ.get("EMIT", "36"))), pv.inputs["Emission Strength"])
nt.links.new(pv.outputs["Volume"], out.inputs["Volume"])
dom.data.materials.append(vm)

# --- Sparks: hot specks thrown out fast, streaked by motion blur, cooling as they age --------------------------
sm = bpy.data.materials.new("Spark")
nt = c.node_tree(sm)
nt.nodes.clear()
o = nt.nodes.new("ShaderNodeOutputMaterial")
em = nt.nodes.new("ShaderNodeEmission")
em.inputs["Color"].default_value = c.srgb("#FFB648")
pi = nt.nodes.new("ShaderNodeParticleInfo")
div = nt.nodes.new("ShaderNodeMath")
div.operation = "DIVIDE"
nt.links.new(pi.outputs["Age"], div.inputs[0])
nt.links.new(pi.outputs["Lifetime"], div.inputs[1])
inv = nt.nodes.new("ShaderNodeMath")
inv.operation = "SUBTRACT"
inv.use_clamp = True
inv.inputs[0].default_value = 1.0
nt.links.new(div.outputs[0], inv.inputs[1])
mul = nt.nodes.new("ShaderNodeMath")
mul.operation = "MULTIPLY"
mul.inputs[1].default_value = 60.0
nt.links.new(inv.outputs[0], mul.inputs[0])
nt.links.new(mul.outputs[0], em.inputs["Strength"])
nt.links.new(em.outputs[0], o.inputs["Surface"])

speck = c.sphere("Speck", 0.02, (0, 0, -50), seg=8, mat=sm)
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=0.25, location=(0, 0, 0))
emitter = bpy.context.active_object
emitter.name = "SparkEmitter"
emitter.hide_render = True
ps_mod = emitter.modifiers.new("Sparks", "PARTICLE_SYSTEM")
ps = ps_mod.particle_system.settings
ps.count = 260
ps.frame_start = 1
ps.frame_end = 3
ps.lifetime = 20
ps.lifetime_random = 0.6
ps.emit_from = "FACE"
ps.normal_factor = 9.0
ps.factor_random = 2.5
ps.drag_factor = 0.12
ps.effector_weights.gravity = 0.0
ps.render_type = "OBJECT"
ps.instance_object = speck
ps.particle_size = 1.0
ps.size_random = 0.7
ps.use_rotations = False
ps.physics_type = "NEWTON"
for f in (turb, turb2):
    pass
ps.effector_weights.turbulence = 0.15

# --- Pieces of the rocket ---------------------------------------------------------------------------------------
red = c.material("Paint", "#A80820", metallic=0.25, rough=0.3, coat=1.0, coat_rough=0.05, emission="#FF5A10", emit=0.4)
chrome = c.material("Chrome", "#DDE2EA", metallic=1.0, rough=0.2, emission="#FF7A1A", emit=0.25)
gold = c.material("Gold", "#FFC85C", metallic=1.0, rough=0.2)
mats = [red, red, chrome, chrome, red, gold]

def chunk(name, mat):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=1, radius=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * random.uniform(0.6, 1.3), v.co.y * random.uniform(0.15, 0.35), v.co.z * random.uniform(0.6, 1.4)))
    return c.mesh_object(name, bm, False, None, mat)

for i in range(14):
    ob = chunk(f"Chunk{i}", mats[i % len(mats)])
    s = random.uniform(0.035, 0.075)
    d = Vector((random.uniform(-1, 1), random.uniform(-0.35, 0.35), random.uniform(-1, 1))).normalized()
    speed = random.uniform(1.25, 1.85)
    spin = Vector((random.uniform(-9, 9), random.uniform(-9, 9), random.uniform(-9, 9)))
    start = random.choice((2, 3))
    for fr in range(start, LAST + 1, 2):
        t = (fr - start) / 24.0
        r = speed * (1 - math.exp(-t * 2.4)) / 2.4 * 2.4  # fast at first, slowing in the smoke
        ob.location = d * (0.15 + r)
        ob.rotation_euler = spin * t
        k = max(0.0, 1.0 - max(0.0, t - 0.55) / 0.5)  # burns away before it reaches the edge
        ob.scale = (s * k, s * k, s * k)
        ob.keyframe_insert("location", frame=fr)
        ob.keyframe_insert("rotation_euler", frame=fr)
        ob.keyframe_insert("scale", frame=fr)
    ob.scale = (0, 0, 0)
    ob.keyframe_insert("scale", frame=start - 1)

# A light at the heart: the blast lights its own smoke and the pieces in it.
bpy.ops.object.light_add(type="POINT", location=(0, -0.2, 0))
core = bpy.context.active_object
core.data.color = c.srgb("#FFB25A")[:3]
core.data.shadow_soft_size = 0.4
for fr, e in ((1, 0), (2, 6000), (4, 3500), (9, 1200), (16, 300), (26, 0)):
    core.data.energy = e
    core.data.keyframe_insert("energy", frame=fr)
c.area_light("Key", (-3, -4, 3), (0, 0, 0), float(os.environ.get("KEY", "800")), "#C9D4FF", size=3)

c.ortho_camera((0, -20, 0), (0, 0, 0), float(os.environ.get("FRAME", "6.0")))

frames = [int(x) for x in ONLY.split(",")] if ONLY else list(range(FIRST, LAST + 1))
os.makedirs(OUT, exist_ok=True)
for fr in frames:
    scene.frame_set(fr)
    scene.render.filepath = os.path.join(OUT, f"f{fr:03d}.exr")
    bpy.ops.render.render(write_still=True)
print("DONE", OUT)
