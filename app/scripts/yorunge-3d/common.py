# Shared helpers for Yörünge's Blender renders (run inside Blender: blender -b --factory-startup -P <asset>.py -- <out dir>).
import math
import os
import sys

import bmesh
import bpy
from mathutils import Vector

STUDIO = os.path.join(os.path.dirname(bpy.app.binary_path), f"{bpy.app.version[0]}.{bpy.app.version[1]}", "datafiles", "studiolights", "world")


def out_dir(default):
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    d = argv[0] if argv else default
    os.makedirs(d, exist_ok=True)
    return d


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    return bpy.context.scene


def cycles(scene, w, h, samples=96, denoise=True):
    scene.render.engine = "CYCLES"
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = "OPTIX"
    prefs.get_devices()
    for d in prefs.devices:
        d.use = d.type == "OPTIX"
    scene.cycles.device = "GPU"
    scene.cycles.samples = samples
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.use_denoising = denoise
    scene.cycles.denoiser = "OPENIMAGEDENOISE"
    scene.render.film_transparent = True
    scene.render.resolution_x = w
    scene.render.resolution_y = h
    scene.render.resolution_percentage = 100
    scene.view_settings.view_transform = os.environ.get("VIEW", "Standard")
    try:
        scene.view_settings.look = os.environ.get("LOOK", "None")
    except Exception as e:
        print("LOOK", e)
    f = scene.render.image_settings
    f.file_format = "PNG"
    f.color_mode = "RGBA"
    f.color_depth = "8"
    f.compression = 30


def srgb(hexstr, a=1.0):
    hexstr = hexstr.lstrip("#")
    c = [int(hexstr[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    lin = [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return (*lin, a)


def node_tree(idblock):
    try:
        idblock.use_nodes = True
    except Exception:
        pass
    return idblock.node_tree


def world(hdri="studio.exr", strength=0.7, rot=0.0):
    w = bpy.data.worlds.new("World")
    bpy.context.scene.world = w
    nt = node_tree(w)
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputWorld")
    bg = nt.nodes.new("ShaderNodeBackground")
    env = nt.nodes.new("ShaderNodeTexEnvironment")
    env.image = bpy.data.images.load(os.path.join(STUDIO, hdri))
    tc = nt.nodes.new("ShaderNodeTexCoord")
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Rotation"].default_value[2] = rot
    nt.links.new(tc.outputs["Generated"], mp.inputs["Vector"])
    nt.links.new(mp.outputs["Vector"], env.inputs["Vector"])
    nt.links.new(env.outputs["Color"], bg.inputs["Color"])
    bg.inputs["Strength"].default_value = strength
    nt.links.new(bg.outputs["Background"], out.inputs["Surface"])
    return w


def material(name, color, metallic=0.0, rough=0.4, coat=0.0, coat_rough=0.03, emission=None, emit=0.0, spec=0.5):
    m = bpy.data.materials.new(name)
    nt = node_tree(m)
    b = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if b is None:
        nt.nodes.clear()
        b = nt.nodes.new("ShaderNodeBsdfPrincipled")
        o = nt.nodes.new("ShaderNodeOutputMaterial")
        nt.links.new(b.outputs["BSDF"], o.inputs["Surface"])
    b.inputs["Base Color"].default_value = srgb(color) if isinstance(color, str) else color
    b.inputs["Metallic"].default_value = metallic
    b.inputs["Roughness"].default_value = rough
    b.inputs["Coat Weight"].default_value = coat
    b.inputs["Coat Roughness"].default_value = coat_rough
    b.inputs["Specular IOR Level"].default_value = spec
    if emission:
        b.inputs["Emission Color"].default_value = srgb(emission)
        b.inputs["Emission Strength"].default_value = emit
    return m


def link(ob, parent=None, mat=None):
    bpy.context.scene.collection.objects.link(ob)
    if parent is not None:
        ob.parent = parent
    if mat is not None:
        ob.data.materials.append(mat)
    return ob


def mesh_object(name, bm, smooth=True, parent=None, mat=None):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    for f in bm.faces:
        f.smooth = smooth
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return link(bpy.data.objects.new(name, me), parent, mat)


def lathe(name, prof, steps=96, closed=False, parent=None, mat=None, smooth=True):
    """A solid of revolution around Z from a profile of (r, z) points."""
    bm = bmesh.new()
    vs = [bm.verts.new((r, 0.0, z)) for r, z in prof]
    es = [bm.edges.new((vs[i], vs[i + 1])) for i in range(len(vs) - 1)]
    if closed:
        es.append(bm.edges.new((vs[-1], vs[0])))
    bmesh.ops.spin(bm, geom=vs + es, cent=(0, 0, 0), axis=(0, 0, 1), angle=math.tau, steps=steps, use_merge=True)
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-5)
    return mesh_object(name, bm, smooth, parent, mat)


def torus(name, major, minor, z=0.0, steps=96, ring=16, parent=None, mat=None):
    prof = [(major + minor * math.cos(a), z + minor * math.sin(a)) for a in [i / ring * math.tau for i in range(ring)]]
    return lathe(name, prof, steps=steps, closed=True, parent=parent, mat=mat)


def slab(name, pts, thick, bevel=0.0, segs=3, parent=None, mat=None):
    """A flat plate from a polygon of (x, z) points, `thick` deep in Y, its edges rounded by `bevel`."""
    bm = bmesh.new()
    front = [bm.verts.new((x, -thick / 2, z)) for x, z in pts]
    back = [bm.verts.new((x, thick / 2, z)) for x, z in pts]
    bm.faces.new(front)
    bm.faces.new(list(reversed(back)))
    n = len(pts)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((front[i], front[j], back[j], back[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=bm.edges[:], offset=bevel, segments=segs, profile=0.5, affect="EDGES", clamp_overlap=True)
    ob = mesh_object(name, bm, True, parent, mat)
    wn = ob.modifiers.new("WN", "WEIGHTED_NORMAL")
    wn.keep_sharp = True
    return ob


def box(name, size, loc=(0, 0, 0), bevel=0.0, segs=3, parent=None, mat=None):
    sx, sy, sz = (s / 2 for s in size)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * 2 * sx + loc[0], v.co.y * 2 * sy + loc[1], v.co.z * 2 * sz + loc[2]))
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=bm.edges[:], offset=bevel, segments=segs, profile=0.5, affect="EDGES", clamp_overlap=True)
    ob = mesh_object(name, bm, True, parent, mat)
    wn = ob.modifiers.new("WN", "WEIGHTED_NORMAL")
    wn.keep_sharp = True
    return ob


def cylinder(name, a, b, r, steps=24, parent=None, mat=None):
    """A rod from point a to point b."""
    a, b = Vector(a), Vector(b)
    L = (b - a).length
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=steps, radius1=r, radius2=r, depth=L)
    ob = mesh_object(name, bm, True, parent, mat)
    ob.location = (a + b) / 2
    ob.rotation_mode = "QUATERNION"
    ob.rotation_quaternion = (b - a).to_track_quat("Z", "Y")
    return ob


def sphere(name, r, loc=(0, 0, 0), seg=32, parent=None, mat=None):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=seg // 2, radius=r)
    ob = mesh_object(name, bm, True, parent, mat)
    ob.location = loc
    return ob


def empty(name, parent=None):
    e = bpy.data.objects.new(name, None)
    return link(e, parent)


def area_light(name, loc, target, energy, color="#FFFFFF", size=2.0):
    ld = bpy.data.lights.new(name, "AREA")
    ld.energy = energy
    ld.size = size
    ld.color = srgb(color)[:3]
    ob = bpy.data.objects.new(name, ld)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = loc
    ob.rotation_mode = "QUATERNION"
    ob.rotation_quaternion = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y")
    return ob


def ortho_camera(loc, target, scale, up="Y"):
    cd = bpy.data.cameras.new("Cam")
    cd.type = "ORTHO"
    cd.ortho_scale = scale
    cd.clip_start = 0.01
    cd.clip_end = 200
    ob = bpy.data.objects.new("Cam", cd)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = loc
    ob.rotation_mode = "QUATERNION"
    ob.rotation_quaternion = (Vector(target) - Vector(loc)).to_track_quat("-Z", up)
    bpy.context.scene.camera = ob
    return ob


def render_frames(scene, folder, frames, before=None):
    """Renders frames[i] for each i into folder/f000.png …; `before(i)` sets the scene up for that frame."""
    os.makedirs(folder, exist_ok=True)
    for i, fr in enumerate(frames):
        scene.frame_set(fr)
        if before:
            before(i)
        scene.render.filepath = os.path.join(folder, f"f{i:03d}.png")
        bpy.ops.render.render(write_still=True)


def exr(scene):
    """Premultiplied linear output (emission keeps its light where alpha is low); post.py turns it into sprites."""
    f = scene.render.image_settings
    f.file_format = "OPEN_EXR"
    f.color_mode = "RGBA"
    f.color_depth = "16"
    f.exr_codec = "ZIP"


def fit_camera(cam, objects, px_long, margin=0.04):
    """Frames an orthographic camera tightly on `objects` (their evaluated vertices): sets ortho scale, the render
    size (`px_long` on the longer side) and moves the camera across its view so the objects sit in the middle.
    Returns a function mapping a world point to (fx, fy), its place in the image as fractions (0,0 top left)."""
    scene = bpy.context.scene
    dg = bpy.context.evaluated_depsgraph_get()
    inv = cam.matrix_world.inverted()
    xs, ys = [], []
    for ob in objects:
        if ob.type != "MESH":
            continue
        ev = ob.evaluated_get(dg)
        me = ev.to_mesh()
        mw = ev.matrix_world
        for v in me.vertices:
            p = inv @ (mw @ v.co)
            xs.append(p.x)
            ys.append(p.y)
        ev.to_mesh_clear()
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    w, h = x1 - x0, y1 - y0
    w, h = w * (1 + 2 * margin), h * (1 + 2 * margin)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    cam.location = cam.matrix_world @ Vector((cx, cy, 0))
    cam.data.ortho_scale = max(w, h)
    if w >= h:
        scene.render.resolution_x, scene.render.resolution_y = px_long, max(2, round(px_long * h / w))
    else:
        scene.render.resolution_x, scene.render.resolution_y = max(2, round(px_long * w / h)), px_long
    bpy.context.view_layer.update()
    inv2 = cam.matrix_world.inverted()

    def to_image(pt):
        p = inv2 @ Vector(pt)
        return (0.5 + p.x / w, 0.5 - p.y / h)

    return to_image
