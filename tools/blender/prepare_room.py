"""Prepare a teammate's Blender room for play and export it into the game.

    blender -b --python tools/blender/prepare_room.py -- room_1
    blender -b --python tools/blender/prepare_room.py -- all

The room is used as the artist made it: same geometry, objects, scale, lamps and materials. The
source .blend is never saved back. Only what glTF can't carry is handled:
  1. fog / smoke / fire volumes and render-hidden helpers are left out (glTF would turn volumes into
     solid boxes); cameras aren't exported
  2. curves become meshes (glTF has no curves) and procedural node materials are baked into textures
     (glTF can't carry node textures; they would turn white). Image-textured materials are untouched
  3. the game's layout (spawns, walkable area, blockers, raised floors) is written to a separate
     client/public/models/room_N.layout.json using tools/blender/rooms.json. Nothing is added to the
     room: the artist's own spawn_* empties are used where they were placed
Then it exports client/public/models/room_N.glb with the room's lamps and lists it in the manifest.
"""
import json
import math
import os
import re
import sys

import bpy
import bmesh
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))

HEAVY = 20000  # polygons; heavier decoration gets decimated down to about this
STANDING = 0.9  # props at least this tall block movement
MAX_PROP = 9.0  # footprints wider than this (joined decoration, whole walls) are not props


def log(*a):
    print("prepare_room:", *a)


def world_box(o):
    pts = [o.matrix_world @ Vector(c) for c in o.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi


def is_volume_only(mat):
    if not mat or not mat.use_nodes or not mat.node_tree:
        return False
    out = next((n for n in mat.node_tree.nodes if n.type == "OUTPUT_MATERIAL" and n.is_active_output), None)
    if not out:
        return False
    surface = out.inputs.get("Surface")
    volume = out.inputs.get("Volume")
    return bool(volume and volume.is_linked and not (surface and surface.is_linked))


def _rgb(v):
    return [float(v[0]), float(v[1]), float(v[2])]


def _sample(sock, depth=0):
    """A representative linear colour for a node socket, or None if an image texture feeds it."""
    if not sock.is_linked:
        v = sock.default_value
        return _rgb(v) if hasattr(v, "__len__") else [float(v)] * 3
    if depth > 8:
        return [0.5] * 3
    n = sock.links[0].from_node
    kind = n.bl_idname
    if kind == "ShaderNodeTexImage":
        return None
    if kind == "ShaderNodeValToRGB":
        els = n.color_ramp.elements
        return [sum(e.color[i] for e in els) / len(els) for i in range(3)]
    if kind == "ShaderNodeRGB":
        return _rgb(n.outputs[0].default_value)
    if kind in ("ShaderNodeMix", "ShaderNodeMixRGB"):
        if kind == "ShaderNodeMix":
            colours = [s for s in n.inputs if s.type == "RGBA" and s.enabled]
            a, b = colours[0], colours[1]
            fac = n.inputs[0]
        else:
            a, b, fac = n.inputs["Color1"], n.inputs["Color2"], n.inputs["Fac"]
        ca, cb = _sample(a, depth + 1), _sample(b, depth + 1)
        if ca is None or cb is None:
            return None
        f = 0.5 if fac.is_linked else float(fac.default_value if not hasattr(fac.default_value, "__len__") else fac.default_value[0])
        if n.blend_type == "MULTIPLY":
            return [ca[i] * (1 - f + f * cb[i]) for i in range(3)]
        if n.blend_type in ("ADD", "SCREEN", "LIGHTEN"):
            return [min(1.5, ca[i] + f * cb[i] * 0.5) for i in range(3)]
        return [ca[i] * (1 - f) + cb[i] * f for i in range(3)]
    colour_in = n.inputs.get("Color") or n.inputs.get("Base Color")
    if colour_in is not None and colour_in.type == "RGBA":
        return _sample(colour_in, depth + 1)
    return [0.5] * 3  # noise / voronoi etc. used as detail


def flatten_materials():
    """glTF can't carry procedural node textures (they export as plain white). Give each such
    material one representative colour instead: the author's viewport colour when set, else an
    estimate from the node chain. Image textures are left alone."""
    done = []
    for m in bpy.data.materials:
        if not m.node_tree:
            continue
        p = next((n for n in m.node_tree.nodes if n.bl_idname == "ShaderNodeBsdfPrincipled"), None)
        if not p or not p.inputs["Base Color"].is_linked:
            continue
        base = p.inputs["Base Color"]
        est = _sample(base)
        if est is None:
            continue  # an image texture: the exporter handles it
        view = list(m.diffuse_color[:3])
        colour = view if any(abs(c - 0.8) > 0.01 for c in view) else est
        m.node_tree.links.remove(base.links[0])
        base.default_value = (*[max(0.0, min(1.0, c)) for c in colour], 1.0)
        done.append(m.name)
    return done


def _principled(mat):
    if not mat or not mat.node_tree:
        return None
    return next((n for n in mat.node_tree.nodes if n.bl_idname == "ShaderNodeBsdfPrincipled"), None)


def _is_procedural(mat):
    p = _principled(mat)
    return bool(p and p.inputs["Base Color"].is_linked and _sample(p.inputs["Base Color"]) is not None)


def _tex_size(o):
    size = max(o.dimensions)
    return 1024 if size > 6 else 512 if size > 1.5 else 256


def bake_materials(scene):
    """glTF can't carry procedural node textures, so bake each one's base colour into a texture
    (per object, on a fresh UV map) and wire the material to it. Lighting is not baked in."""
    targets = [
        o for o in scene.objects
        if o.type == "MESH" and o.data.polygons and any(s.material and _is_procedural(s.material) for s in o.material_slots)
    ]
    if not targets:
        return []
    for o in targets:
        if o.data.users > 1:
            o.data = o.data.copy()  # its own mesh, so its UVs and materials are its own
        for slot in o.material_slots:
            if slot.material and _is_procedural(slot.material):
                slot.material = slot.material.copy()
        uv = o.data.uv_layers.get("bake_uv") or o.data.uv_layers.new(name="bake_uv")
        o.data.uv_layers.active = uv
    # One smart UV unwrap for all of them.
    bpy.ops.object.select_all(action="DESELECT")
    for o in targets:
        o.select_set(True)
    bpy.context.view_layer.objects.active = targets[0]
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(island_margin=0.02)
    bpy.ops.object.mode_set(mode="OBJECT")
    # An image per object, made the active node in each of its procedural materials.
    images = {}
    for o in targets:
        img = bpy.data.images.new(f"bake_{o.name}", _tex_size(o), _tex_size(o))
        images[o.name] = img
        for slot in o.material_slots:
            m = slot.material
            if not (m and _is_procedural(m)):
                continue
            node = m.node_tree.nodes.new("ShaderNodeTexImage")
            node.name = "game_bake"
            node.image = img
            m.node_tree.nodes.active = node
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 1
    scene.cycles.device = "CPU"
    bake = scene.render.bake
    bake.use_pass_direct = False
    bake.use_pass_indirect = False
    bake.use_pass_color = True
    bake.margin = 4
    bpy.ops.object.bake(type="DIFFUSE", pass_filter={"COLOR"}, use_clear=True, margin=4)
    # Wire the baked image into Base Color through the bake UV map, and keep it in the file.
    for o in targets:
        images[o.name].pack()
        for slot in o.material_slots:
            m = slot.material
            node = m.node_tree.nodes.get("game_bake") if m and m.node_tree else None
            if not node:
                continue
            p = _principled(m)
            base = p.inputs["Base Color"]
            for link in list(base.links):
                m.node_tree.links.remove(link)
            uvn = m.node_tree.nodes.new("ShaderNodeUVMap")
            uvn.uv_map = "bake_uv"
            m.node_tree.links.new(uvn.outputs["UV"], node.inputs["Vector"])
            m.node_tree.links.new(node.outputs["Color"], base)
    return [o.name for o in targets]


def in_walk(x, y, walk, margin=0.0):
    for b in walk.get("boxes", []):
        if b[0] - margin <= x <= b[1] + margin and b[2] - margin <= y <= b[3] + margin:
            return True
    for c in walk.get("circles", []):
        if math.hypot(x - c[0], y - c[1]) <= c[2] + margin:
            return True
    return False


def add_box(name, lo, hi, collection):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    o.location = ((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2)
    o.scale = (max(hi[0] - lo[0], 0.01), max(hi[1] - lo[1], 0.01), max(hi[2] - lo[2], 0.01))
    collection.objects.link(o)
    return o


def add_disc(name, x, y, r, collection):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_circle(bm, cap_ends=True, segments=32, radius=r)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    o.location = (x, y, 0)
    collection.objects.link(o)
    return o


def add_empty(name, x, y, collection, z=0.0):
    e = bpy.data.objects.new(name, None)
    e.location = (x, y, z)
    collection.objects.link(e)
    return e


def prepare(key, cfg):
    src = os.path.join(ROOT, cfg["source"])
    bpy.ops.wm.open_mainfile(filepath=src)
    scene = bpy.context.scene
    coll = scene.collection
    walk = cfg["walk"]

    # 1. volumes, cameras and anything the settings remove
    gone = []
    for o in list(scene.objects):
        mats = [s.material for s in getattr(o, "material_slots", []) if s.material]
        helper = o.hide_render and o.type in ("MESH", "CURVE")  # boolean cutters and the like
        if o.type == "CAMERA" or helper or o.name in cfg.get("remove", []) or (mats and all(is_volume_only(m) for m in mats)):
            gone.append(o.name)
            bpy.data.objects.remove(o, do_unlink=True)
    log(key, "removed", gone)

    # 2. curves to meshes (glTF has no curves)
    bpy.ops.object.select_all(action="DESELECT")
    curves = [o for o in scene.objects if o.type in ("CURVE", "FONT", "SURFACE")]
    for o in curves:
        o.select_set(True)
    if curves:
        bpy.context.view_layer.objects.active = curves[0]
        bpy.ops.object.convert(target="MESH")
    # Geometry stays exactly as modelled (no decimation). Procedural materials are baked to textures.
    try:
        log(key, "baked materials on", bake_materials(scene))
    except Exception as err:  # noqa: BLE001 - fall back rather than lose the room
        log(key, "baking failed, using flat colours instead:", err)
        log(key, "flattened materials", flatten_materials())

    # 3. The game's layout, worked out from the room and written to its own file. Nothing is added
    #    to, renamed in or moved in the room itself.
    return room_layout(key, cfg)


# Blender (x east, y north, z up) to the game's three.js space (x, y up, z = -y).
def _pt(x, y, z=0.0):
    return [round(x, 3), round(z, 3), round(-y, 3)]


def _box(lo, hi):
    return {"kind": "box", "minX": round(lo[0], 3), "maxX": round(hi[0], 3), "minZ": round(-hi[1], 3), "maxZ": round(-lo[1], 3)}


def room_layout(key, cfg):
    scene = bpy.context.scene
    walk = cfg["walk"]
    bounds = [_box((b[0], b[2]), (b[1], b[3])) for b in walk.get("boxes", [])]
    bounds += [{"kind": "circle", "x": c[0], "z": -c[1], "r": c[2]} for c in walk.get("circles", [])]
    steps = [{**_box((s[0], s[2]), (s[1], s[3])), "top": s[4]} for s in cfg.get("steps", [])]

    # Blockers: every standing prop inside the play area (piers, thrones, pedestals, crates).
    colliders, made = [], []
    for o in scene.objects:
        if o.type != "MESH" or not o.data.polygons or o.hide_render:
            continue
        lo, hi = world_box(o)
        w, d, h = hi.x - lo.x, hi.y - lo.y, hi.z - lo.z
        cx, cy = (lo.x + hi.x) / 2, (lo.y + hi.y) / 2
        if lo.z < 1.2 and h >= STANDING and hi.z > 1.0 and math.hypot(w, d) <= MAX_PROP and in_walk(cx, cy, walk, margin=1.0):
            colliders.append(_box((lo.x, lo.y), (hi.x, hi.y)))
            made.append(o.name)
    log(key, "blockers from", made)

    # Spawns: the room's own spawn empties where the artist placed them; the settings fill any gaps.
    own = {"party": {}, "enemies": {}, "npcs": {}, "boss": None}
    for o in scene.objects:
        n = o.name.lower()
        p = o.matrix_world.translation
        if p.length < 1e-4:
            continue  # an empty left at the origin was never placed
        m = re.match(r"^spawn_(party|player|enemy|npc)_?(\d+)", n)
        if m:
            own["enemies" if m.group(1) == "enemy" else "npcs" if m.group(1) == "npc" else "party"][int(m.group(2))] = _pt(p.x, p.y, p.z)
        elif n.startswith("spawn_boss"):
            own["boss"] = _pt(p.x, p.y, p.z)
    sp = cfg["spawns"]

    def merged(kind):
        mine = [own[kind][i] for i in sorted(own[kind])]
        extra = [_pt(x, y) for x, y in sp.get(kind, [])]
        return mine + extra[len(mine):]

    spawns = {
        "party": merged("party"),
        "enemies": merged("enemies"),
        "boss": own["boss"] or (_pt(*sp["boss"]) if sp.get("boss") else None),
        "npcs": merged("npcs"),
    }
    used_own = {k: len(own[k]) for k in ("party", "enemies", "npcs")}
    log(key, "spawns from the room itself:", used_own, "boss:", bool(own["boss"]))
    return {"bounds": bounds, "colliders": colliders, "steps": steps, "spawns": spawns}


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    with open(os.path.join(HERE, "rooms.json"), encoding="utf-8") as f:
        rooms = {k: v for k, v in json.load(f).items() if not k.startswith("_")}
    keys = list(rooms) if not argv or argv[0] == "all" else argv[:1]
    from export_glb import export, update_manifest  # noqa: E402

    for key in keys:
        layout = prepare(key, rooms[key])
        out = os.path.join(ROOT, "client", "public", "models", key + ".glb")
        export(out, lights=True)
        with open(os.path.join(ROOT, "client", "public", "models", key + ".layout.json"), "w", encoding="utf-8", newline="\n") as f:
            json.dump(layout, f, indent=1)
        log(key, "wrote", key + ".layout.json")
        if "--no-manifest" not in argv:
            update_manifest(key, None, None)


if __name__ == "__main__":
    main()
