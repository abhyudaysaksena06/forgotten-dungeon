"""Turn the artist's Dragon.blend into the game's boss_morvath_dragon.glb.

    blender -b --disable-autoexec assets/blender/boss_morvath_dragon.blend \
        --python tools/blender/build_dragon.py -- [--out client/public/models/boss_morvath_dragon.glb]
        [--work <folder for baked textures and the built .blend>] [--preview <folder for test renders>]

The dragon has no armature: it is built from separate parts (body, head, lower jaw, wings), and its
look comes from procedural Cycles materials that glTF can't carry. So this script:

1. applies the modifiers (at the viewport levels, the density the artist exported at),
2. bakes every procedural material to textures (colour, normal, roughness, emission) on a fresh,
   packed UV layout per group: body, head, wings. Each material keeps its own clearcoat, IOR and
   specular values; only the procedural parts become images,
3. adds pivots (body, head, both wings) and makes the boss clips by animating them:
   idle, boss_strike, boss_sweep, skill, transform, armour_break, hit, death,
4. exports a GLB with the clips as separate animations (the backdrop, floor, camera and lamps stay out).

The game turns the model 180 degrees (it faces -X in Blender) and sizes it from the manifest.
"""
import argparse
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Euler, Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
FPS = 24

GROUPS = {
    # name: (objects, colour/normal size, roughness/emission size)
    "body": (
        ["Dragon_Body", "Dragon_BellyPlates", "Dragon_SpineFrills", "Dragon_BodyHorns", "Dragon_Legs",
         "Dragon_Claws", "Dragon_LegSpikes", "Dragon_WingBones"],
        4096, 2048,
    ),
    "head": (
        ["Dragon_Skull", "Dragon_Horns", "Dragon_Gums", "Dragon_LowerJaw", "Dragon_JawSpikes",
         "Dragon_LowerGums_Tongue", "Dragon_Eye_L", "Dragon_Eye_R"],
        2048, 1024,
    ),
    "wings": (["Dragon_Wing_Near", "Dragon_Wing_Far"], 2048, 1024),
}
# Plain materials glTF already carries as they are: kept untouched.
KEEP = {"Saliva", "Teeth", "ThroatFire"}
SCENERY = ["Backdrop", "Floor"]

# Pivots, in Blender world space. The dragon faces -X, its hind legs are at +X.
BODY_PIVOT = (0.9, 0.0, 0.3)
HEAD_PIVOT = (-1.6, -0.05, 3.95)
WING_NEAR_PIVOT = (0.2, -0.75, 2.4)
WING_FAR_PIVOT = (0.2, 0.75, 2.5)


def parse():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser(prog="build_dragon.py")
    p.add_argument("--out", default=os.path.join(ROOT, "client", "public", "models", "boss_morvath_dragon.glb"))
    p.add_argument("--work", default=os.path.join(ROOT, ".dragon_build"))
    p.add_argument("--preview", help="render test frames of every clip into this folder")
    p.add_argument("--samples", type=int, default=4)
    return p.parse_args(argv)


# ---------- helpers ----------

def obj(name):
    return bpy.data.objects[name]


def select_only(objs, active=None):
    bpy.ops.object.mode_set(mode="OBJECT") if bpy.context.object and bpy.context.object.mode != "OBJECT" else None
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = active or (objs[0] if objs else None)


def use_gpu():
    prefs = bpy.context.preferences.addons["cycles"].preferences
    for kind in ("OPTIX", "CUDA", "HIP", "ONEAPI", "METAL"):
        try:
            prefs.compute_device_type = kind
        except TypeError:
            continue
        prefs.get_devices()
        devs = [d for d in prefs.devices if d.type == kind]
        if devs:
            for d in prefs.devices:
                d.use = d.type == kind
            bpy.context.scene.cycles.device = "GPU"
            print("bake device:", kind, [d.name for d in devs])
            return
    bpy.context.scene.cycles.device = "CPU"
    print("bake device: CPU")


# ---------- 1. modifiers ----------

def apply_modifiers():
    for name in SCENERY:
        if name in bpy.data.objects:
            bpy.data.objects.remove(obj(name), do_unlink=True)
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    for o in meshes:
        if o.data.users > 1:
            o.data = o.data.copy()
    select_only(meshes)
    bpy.ops.object.convert(target="MESH")  # applies the modifiers at their viewport levels
    print("modifiers applied on", len(meshes), "meshes")


# ---------- 2. bake ----------

def principled(mat):
    return next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)


def output_node(mat):
    outs = [n for n in mat.node_tree.nodes if n.type == "OUTPUT_MATERIAL"]
    return next((n for n in outs if n.is_active_output), outs[0] if outs else None)


def bake_group(gname, names, big, small, work, samples):
    objs = [obj(n) for n in names]
    # A fresh UV layout shared by the whole group, packed into one square.
    for o in objs:
        uv = o.data.uv_layers.new(name="BakeUV")
        o.data.uv_layers.active = uv  # the bake target; materials still read their own "UVMap"
    select_only(objs)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.003, area_weight=0.0, scale_to_bounds=False)
    bpy.ops.uv.pack_islands(rotate=True, margin=0.003)
    bpy.ops.object.mode_set(mode="OBJECT")

    mats = sorted({s.material for o in objs for s in o.material_slots if s.material and s.material.name not in KEEP}, key=lambda m: m.name)
    images = {
        "color": bpy.data.images.new(f"dragon_{gname}_color", big, big, alpha=False),
        "normal": bpy.data.images.new(f"dragon_{gname}_normal", big, big, alpha=False),
        "rough": bpy.data.images.new(f"dragon_{gname}_rough", small, small, alpha=False),
        "emit": bpy.data.images.new(f"dragon_{gname}_emit_raw", small, small, alpha=False, float_buffer=True),
    }
    for k in ("normal", "rough", "emit"):
        images[k].colorspace_settings.name = "Non-Color"
    images["normal"].generated_color = (0.5, 0.5, 1.0, 1.0)

    # Each material gets an active image node (the bake target) and, while baking colour, roughness
    # and normals, its Principled BSDF wired straight to the output (so a mix with a translucent
    # shader, as on the wings, doesn't hide the colour).
    targets, rewire = {}, {}
    for m in mats:
        nt = m.node_tree
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.name = "__bake__"
        nt.nodes.active = tex
        targets[m] = tex
        out, p = output_node(m), principled(m)
        if out and p and out.inputs["Surface"].is_linked and out.inputs["Surface"].links[0].from_node != p:
            rewire[m] = (out.inputs["Surface"].links[0].from_socket, p.outputs[0], out.inputs["Surface"])

    def wire(direct):
        for m, (orig, bsdf, surf) in rewire.items():
            m.node_tree.links.new(bsdf if direct else orig, surf)

    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.samples = samples
    sc.render.bake.margin = 16
    sc.render.bake.use_clear = True
    sc.render.bake.target = "IMAGE_TEXTURES"
    select_only(objs)

    def bake(kind, image, **kw):
        for tex in targets.values():
            tex.image = image
        print(f"  baking {gname} {kind} {image.size[0]}px ...", flush=True)
        bpy.ops.object.bake(type=kind, **kw)

    wire(True)
    bake("DIFFUSE", images["color"], pass_filter={"COLOR"})
    bake("NORMAL", images["normal"], normal_space="TANGENT")
    bake("ROUGHNESS", images["rough"])
    wire(False)
    bake("EMIT", images["emit"])

    # Emission is HDR: store it normalised, and carry its peak as the emissive strength.
    raw = images["emit"]
    px = np.empty(len(raw.pixels), dtype=np.float32)
    raw.pixels.foreach_get(px)
    peak = float(px.reshape(-1, 4)[:, :3].max())
    emit = None
    if peak > 1e-3:
        emit = bpy.data.images.new(f"dragon_{gname}_emit", small, small, alpha=False)
        px4 = px.reshape(-1, 4)
        px4[:, :3] = np.clip(px4[:, :3] / peak, 0, 1)
        px4[:, 3] = 1
        # The 8-bit image is sRGB: encode, so the colour comes back linear in the game.
        c = px4[:, :3]
        px4[:, :3] = np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055)
        emit.pixels.foreach_set(px4.ravel())
    bpy.data.images.remove(raw)
    print(f"  {gname}: emission peak {peak:.3f}")

    os.makedirs(work, exist_ok=True)
    for k, img in (("color", images["color"]), ("normal", images["normal"]), ("rough", images["rough"]), ("emit", emit)):
        if img is None:
            continue
        img.filepath_raw = os.path.join(work, img.name + ".png")
        img.file_format = "PNG"
        img.save()
        img.pack()

    for m, tex in targets.items():
        m.node_tree.nodes.remove(tex)

    # Baked copies of each material for this group; the originals stay in the file untouched.
    baked = {}
    for m in mats:
        baked[m] = make_baked(m, gname, images["color"], images["normal"], images["rough"], emit, peak)
    for o in objs:
        for s in o.material_slots:
            if s.material in baked:
                s.material = baked[s.material]
        # The baked layout becomes the only UV map.
        for uv in [u for u in o.data.uv_layers if u.name != "BakeUV"]:
            o.data.uv_layers.remove(uv)
        o.data.uv_layers["BakeUV"].name = "UVMap"
        o.data.uv_layers["UVMap"].active_render = True


def copy_input(src, dst, name):
    if src and name in src.inputs and name in dst.inputs and not src.inputs[name].is_linked:
        dst.inputs[name].default_value = src.inputs[name].default_value


def make_baked(orig, gname, color, normal, rough, emit, peak):
    m = bpy.data.materials.new(f"{orig.name}_{gname}")
    m.use_nodes = True
    nt = m.node_tree
    p = principled(m)
    src = principled(orig)
    for name in ("Metallic", "IOR", "Alpha", "Coat Weight", "Coat Roughness", "Coat IOR", "Specular IOR Level", "Sheen Weight"):
        copy_input(src, p, name)
    if src is None:  # an emission-only material (the eyes): no diffuse
        p.inputs["Roughness"].default_value = 0.4

    def tex(img, x, y):
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = img
        t.location = (x, y)
        return t

    nt.links.new(tex(color, -700, 300).outputs["Color"], p.inputs["Base Color"])
    nt.links.new(tex(rough, -700, 0).outputs["Color"], p.inputs["Roughness"])
    nm = nt.nodes.new("ShaderNodeNormalMap")
    nm.location = (-300, -300)
    nt.links.new(tex(normal, -700, -300).outputs["Color"], nm.inputs["Color"])
    nt.links.new(nm.outputs["Normal"], p.inputs["Normal"])
    if emit is not None:
        nt.links.new(tex(emit, -700, -600).outputs["Color"], p.inputs["Emission Color"])
        p.inputs["Emission Strength"].default_value = peak
    m.use_backface_culling = orig.use_backface_culling
    return m


# ---------- 3. pivots and clips ----------

def empty(name, loc, parent=None):
    e = bpy.data.objects.new(name, None)
    e.empty_display_size = 0.3
    bpy.context.scene.collection.objects.link(e)
    e.location = loc
    if parent:
        e.parent = parent
        e.matrix_parent_inverse = parent.matrix_world.inverted()
    bpy.context.view_layer.update()
    return e


def parent_keep(child, parent):
    mw = child.matrix_world.copy()
    child.parent = parent
    child.matrix_parent_inverse = parent.matrix_world.inverted()
    child.matrix_world = mw


def split_wing_bones():
    """WingBones is one mesh for both wings: split it into the near (-Y) and far (+Y) side."""
    wb = obj("Dragon_WingBones")
    select_only([wb])
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="DESELECT")
    bpy.ops.object.mode_set(mode="OBJECT")
    mw = wb.matrix_world
    for v in wb.data.vertices:
        v.select = (mw @ v.co).y < 0
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_mode(type="VERT")
    bpy.ops.mesh.select_linked()  # whole bones, never a bone cut in half
    bpy.ops.mesh.separate(type="SELECTED")
    bpy.ops.object.mode_set(mode="OBJECT")
    near = next(o for o in bpy.context.selected_objects if o != wb)
    near.name = "Dragon_WingBones_Near"
    wb.name = "Dragon_WingBones_Far"
    return near, wb


def build_rig():
    root = empty("Dragon", (0, 0, 0))
    body = empty("Dragon_BodyPivot", BODY_PIVOT, root)
    head = empty("Dragon_HeadPivot", HEAD_PIVOT, body)
    wing_n = empty("Dragon_WingPivot_Near", WING_NEAR_PIVOT, body)
    wing_f = empty("Dragon_WingPivot_Far", WING_FAR_PIVOT, body)
    bones_n, bones_f = split_wing_bones()
    rig = {root, body, head, wing_n, wing_f}
    for o in list(bpy.data.objects):
        if o in rig or o.type not in ("MESH", "EMPTY") or o.parent is not None:
            continue
        if o.name in ("Dragon_Wing_Near", bones_n.name):
            parent_keep(o, wing_n)
        elif o.name in ("Dragon_Wing_Far", bones_f.name):
            parent_keep(o, wing_f)
        elif o.name == "Dragon_HeadRig":
            parent_keep(o, head)
        else:
            parent_keep(o, body)
    jaw = obj("Dragon_LowerJaw")
    fire = obj("Dragon_ThroatFire")
    for o in (body, head, wing_n, wing_f, jaw, fire):
        o.rotation_mode = "XYZ"
    return {"body": body, "head": head, "wing_n": wing_n, "wing_f": wing_f, "jaw": jaw, "fire": fire}


# A pose is a dict of offsets from rest:
#   body: (dx, dy, dz, pitch°, roll°, yaw°, scale)  pitch is about Y (+ = rear up, head rises)
#   head: (pitch°, yaw°)    + pitch lifts the snout, yaw swings it sideways
#   jaw:  degrees opened    wings: degrees spread (both sides)    fire: throat glow scale
REST = {"body": (0, 0, 0, 0, 0, 0, 1), "head": (0, 0), "jaw": 0, "wings": 0, "fire": 1}


def P(**kw):
    p = dict(REST)
    p.update(kw)
    return p


CLIPS = {
    # Breathing: chest rises, head sways, wings stir, a slow throat glow. Loops.
    "idle": [
        (0, P()),
        (18, P(body=(0, 0, 0.03, 0.8, 0, 0, 1), head=(3, 2), jaw=3, wings=4, fire=1.12)),
        (36, P(body=(0, 0, 0.05, 1.2, 0, 0, 1), head=(4, 0), jaw=5, wings=7, fire=1.2)),
        (54, P(body=(0, 0, 0.02, 0.6, 0, 0, 1), head=(2, -2), jaw=2, wings=3, fire=1.08)),
        (72, P()),
    ],
    # Dragon Claw: rear back, then lunge and bite.
    "boss_strike": [
        (0, P()),
        (8, P(body=(0.18, 0, 0.05, 9, 0, 0, 1), head=(16, 0), jaw=10, wings=22)),
        (14, P(body=(-0.65, 0, -0.06, -11, 0, 0, 1), head=(-20, 0), jaw=28, wings=32)),
        (18, P(body=(-0.6, 0, -0.06, -10, 0, 0, 1), head=(-16, 0), jaw=-4, wings=28)),
        (30, P()),
    ],
    # Shadowflame / Dragon's Breath: rear up, open wide and sweep fire across the arena.
    "boss_sweep": [
        (0, P()),
        (10, P(body=(0.1, 0, 0.08, 10, 0, 0, 1), head=(26, 0), jaw=12, wings=36, fire=1.3)),
        (18, P(body=(-0.2, 0, 0.02, -2, 0, 0, 1), head=(-8, 26), jaw=36, wings=40, fire=1.55)),
        (30, P(body=(-0.2, 0, 0.02, -2, 0, 0, 1), head=(-8, -26), jaw=36, wings=40, fire=1.55)),
        (36, P(body=(-0.05, 0, 0, 1, 0, 0, 1), head=(0, -8), jaw=12, wings=20, fire=1.3)),
        (44, P()),
    ],
    # Draws in shadow-fire (the warning before the breath): head up, chest swells, throat glows.
    "skill": [
        (0, P()),
        (10, P(body=(0.08, 0, 0.1, 7, 0, 0, 1.03), head=(22, 0), jaw=6, wings=42, fire=1.4)),
        (18, P(body=(0.08, 0, 0.12, 8, 0, 0, 1.04), head=(24, 0), jaw=8, wings=44, fire=1.6)),
        (26, P(body=(0.08, 0, 0.1, 7, 0, 0, 1.03), head=(22, 0), jaw=6, wings=42, fire=1.45)),
        (36, P()),
    ],
    # The Change: rises from a crouch, wings burst open, roars.
    "transform": [
        (0, P(body=(0, 0, -0.35, -6, 0, 0, 0.85), head=(-26, 0), jaw=0, wings=-14, fire=0.5)),
        (16, P(body=(0, 0, 0.1, 12, 0, 0, 1.05), head=(30, 0), jaw=36, wings=48, fire=1.5)),
        (24, P(body=(0, 0, 0.1, 12, 0, 0, 1.05), head=(30, 6), jaw=38, wings=50, fire=1.55)),
        (32, P(body=(0, 0, 0.1, 12, 0, 0, 1.05), head=(30, -6), jaw=38, wings=50, fire=1.55)),
        (48, P()),
    ],
    # Rune Strike shatters the armour: violent recoil.
    "armour_break": [
        (0, P()),
        (4, P(body=(0.32, 0, 0.04, 10, 3, 0, 1), head=(26, -8), jaw=22, wings=26, fire=0.6)),
        (12, P(body=(0.12, 0, 0, -4, -2, 0, 1), head=(-6, 6), jaw=8, wings=10)),
        (26, P()),
    ],
    # A flinch.
    "hit": [
        (0, P()),
        (3, P(body=(0.16, 0, 0, 4, 2, 0, 1), head=(10, 6), jaw=10, wings=10)),
        (14, P()),
    ],
    # Agony, then the head and wings drop and the body sinks (the game also topples the actor).
    "death": [
        (0, P()),
        (12, P(body=(0.1, 0, 0.05, 8, 0, 0, 1), head=(22, 0), jaw=30, wings=30, fire=1.3)),
        (30, P(body=(0, 0, -0.25, -10, 3, 0, 1), head=(-35, 4), jaw=16, wings=-18, fire=0.3)),
        (48, P(body=(0, 0, -0.35, -12, 4, 0, 1), head=(-45, 6), jaw=12, wings=-24, fire=0.01)),
    ],
}


def key_pose(rig, rest, frame, pose):
    d = math.radians
    bx, by, bz, pitch, roll, yaw, s = pose["body"]
    b = rig["body"]
    b.location = rest["body"][0] + Vector((bx, by, bz))
    b.rotation_euler = Euler((d(roll), d(pitch), d(yaw)))  # dragon faces -X: +Y lifts the head end
    b.scale = (s, s, s)
    h = rig["head"]
    h.rotation_euler = Euler((0, d(pose["head"][0]), d(pose["head"][1])))
    jaw = rig["jaw"]
    jaw.rotation_euler = rest["jaw"][1].copy()
    jaw.rotation_euler.y += d(pose["jaw"])
    rig["wing_n"].rotation_euler = Euler((d(pose["wings"]), 0, 0))
    rig["wing_f"].rotation_euler = Euler((d(-pose["wings"]), 0, 0))
    fire = rig["fire"]
    fire.scale = rest["fire"][2] * pose["fire"]
    for k, paths in (("body", ("location", "rotation_euler", "scale")), ("head", ("rotation_euler",)),
                     ("jaw", ("rotation_euler",)), ("wing_n", ("rotation_euler",)), ("wing_f", ("rotation_euler",)),
                     ("fire", ("scale",))):
        for path in paths:
            rig[k].keyframe_insert(data_path=path, frame=frame)


def make_clips(rig):
    rest = {k: (o.location.copy(), o.rotation_euler.copy(), o.scale.copy()) for k, o in rig.items()}
    for o in rig.values():
        o.animation_data_create()
    for clip, keys in CLIPS.items():
        actions = {}
        for k, o in rig.items():
            a = bpy.data.actions.new(f"{clip}|{o.name}")
            a.use_fake_user = True
            o.animation_data.action = a
            actions[k] = a
        for frame, pose in keys:
            key_pose(rig, rest, frame, pose)
        for k, o in rig.items():
            ad = o.animation_data
            track = ad.nla_tracks.new()
            track.name = clip
            slot = getattr(ad, "action_slot", None)
            strip = track.strips.new(clip, 0, actions[k])
            if slot is not None and hasattr(strip, "action_slot"):
                strip.action_slot = slot
            strip.extrapolation = "NOTHING"
            track.mute = True
            ad.action = None
    # Back to rest for the exported bind pose.
    for k, o in rig.items():
        o.location, o.rotation_euler, o.scale = rest[k]
    bpy.context.scene.render.fps = FPS
    print("clips:", ", ".join(CLIPS))


# ---------- 4. preview and export ----------

def preview(rig, folder):
    """Render a few frames of each clip from the artist's camera (EEVEE), to check the motion."""
    os.makedirs(folder, exist_ok=True)
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_EEVEE"
    sc.render.resolution_x, sc.render.resolution_y = 640, 480
    for clip, keys in CLIPS.items():
        for o in rig.values():
            t = next(t for t in o.animation_data.nla_tracks if t.name == clip)
            o.animation_data.action = t.strips[0].action
        for frame, _ in keys[1:-1] if len(keys) > 2 else keys:
            sc.frame_set(frame)
            sc.render.filepath = os.path.join(folder, f"{clip}_{frame:02d}.png")
            bpy.ops.render.render(write_still=True)
        for o in rig.values():
            o.animation_data.action = None
    sc.frame_set(0)


def export(out, rig):
    keep = [o for o in bpy.data.objects if o.type in ("MESH", "EMPTY")]
    select_only(keep)
    bpy.context.scene.frame_set(0)
    for o in rig.values():
        for t in o.animation_data.nla_tracks:
            t.mute = False
    os.makedirs(os.path.dirname(out), exist_ok=True)
    opts = dict(
        filepath=out,
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_texcoords=True,
        export_normals=True,
        export_tangents=False,  # three.js does normal maps without them; saves ~8 MB
        export_cameras=False,
        export_lights=False,
        export_animations=True,
        export_animation_mode="NLA_TRACKS",
        export_force_sampling=True,
        export_optimize_animation_size=False,  # every clip keys every pivot, so none inherits a pose
        export_anim_slide_to_zero=True,
        export_image_format="JPEG",
        export_jpeg_quality=92,
    )
    try:
        bpy.ops.export_scene.gltf(**opts)
    except TypeError as e:  # option renamed in this exporter version
        print("exporter:", e)
        opts.pop("export_jpeg_quality")
        opts["export_image_quality"] = 92
        bpy.ops.export_scene.gltf(**opts)
    print("wrote", out, f"({os.path.getsize(out) // 1024} KB)")


def main():
    a = parse()
    bpy.context.scene.render.fps = FPS
    use_gpu()
    apply_modifiers()
    for g, (names, big, small) in GROUPS.items():
        bake_group(g, names, big, small, a.work, a.samples)
    rig = build_rig()
    make_clips(rig)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(a.work, "boss_morvath_dragon_built.blend"))
    if a.preview:
        preview(rig, a.preview)
    export(a.out, rig)


if __name__ == "__main__":
    main()
