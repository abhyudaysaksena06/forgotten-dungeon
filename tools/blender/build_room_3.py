"""Build Room 3, the Hall of Trials (the Hollow Saint cathedral), for the game.

    blender -b --python tools/blender/build_room_3.py
    blender -b --python tools/blender/build_room_3.py -- --samples 32 --texel 80 --save-blend /tmp/room_3_game.blend

Reads assets/blender/room_3.blend (never saved back) and writes:
    client/public/models/room_3.glb          the room, ready for three.js
    client/public/models/room_3.layout.json  spawns, walkable area, blockers and dais steps
    client/public/models/manifest.json       room_3 switched on

What it corrects, compared with prepare_room.py:
  1. Chains and the sarcophagus hole: modifiers are applied *before* the render-hidden helper curves
     and the boolean cutter are deleted, so the 32 chains keep their curve shape and the tomb keeps its hole.
  2. Black textures: every object is UV-unwrapped on its own (one shared unwrap left each object's
     image ~99% black), and the base colour is baked through an Emission swap, so metallic or
     translucent shading can't darken it. Every baked image is checked; a black one stops the build.
  3. Size: the 90 x 90 m floor is cropped to the cathedral, heavy decoration is decimated to a
     triangle budget, small props are joined by material (fewer draw calls), textures share a pixel
     budget instead of 1024 px each. Fog, cloud and dust volumes, the camera, sun and area lights
     (which glTF can't carry) are left out.
  4. Lamps: the game lights a room with 16 lamps. Instead of the 16 brightest (chandeliers 11-15 m up,
     most far from the fight), 16 are chosen to light the Saint, the dais, the nave and the columns,
     and boosted 1.6x to stand in for the 35 dropped lamps and the fog.
  5. Layout: the dais is round and stepped, not a 0.9 m box; its steps and the blockers (piers,
     fallen drums, votive racks, the tomb) are measured from the geometry with rays. NPC 2 no longer
     spawns inside the fallen drums: any spawn on an obstacle is moved to the nearest clear floor.
     Spawn empties are written into the .glb too, so the room works even without the layout file.
"""
import argparse
import json
import math
import os
import sys

import bpy
import bmesh
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
MODELS = os.path.join(ROOT, "client", "public", "models")
SOURCE = os.path.join(ROOT, "assets", "blender", "room_3.blend")
KEY = "room_3"

from prepare_room import _is_procedural, _principled, is_volume_only  # noqa: E402

# ---------------------------------------------------------------------------------------------
# Room settings (Blender metres: x east, y north, z up)
# ---------------------------------------------------------------------------------------------
WALK = {"boxes": [[-5.0, 5.0, 0.5, 10.6]], "circles": [[0.0, 17.4, 8.3]]}  # nave + rotunda
SPAWNS = {
    "party": [[0, 6.2], [-1.6, 6.0], [1.6, 6.0], [0, 5.2]],
    "enemies": [[-3.2, 11.4], [3.2, 11.4], [0, 10.9]],
    "boss": [0, 12.4],
    "npcs": [[-6.4, 14.0], [6.4, 14.0]],  # NPC 2 sits inside the fallen drums: moved automatically
}
FLOOR_CROP = (-15.0, 15.0, -4.0, 31.0)  # minX, maxX, minY, maxY: the cathedral, not the 90 m plane
DROP = {"DustMotes"}  # emissive dust sprites: thousands of triangles, noise in the browser
NO_JOIN = {"Floor", "Dais", "Floor_Inlay_Ring", "Sarcophagus"}
NO_DECIMATE = {"Floor", "Dais", "Floor_Inlay_Ring"}
# The game lights a room with at most 16 of its lamps. These are the ones around the fight.
GAME_LAMPS = [
    "MoonShaft", "Statue_UnderLight", "EyeGlow",               # the Saint
    "DaisGlow", "DaisGlow.001", "DaisGlow.002",               # the dais, where the boss stands
    "PierGlow_-1_a", "PierGlow_1_a", "PierGlow_-1_b", "PierGlow_1_b",  # the nave, where the party starts
    "VotiveRack_0_Light", "VotiveRack_3_Light",               # the rotunda sides
    "Ambulatory_0_Light", "Ambulatory_1_Light", "Ambulatory_4_Light", "Ambulatory_5_Light",  # the columns behind
]
# Things you can walk over or through (everything else in the arena taller than STEP_OVER blocks).
WALK_THROUGH = ("skull", "bone", "rubble", "_flames", "_wax", "binding_anchors", "cobweb")
WALKABLE_RAISED = ("dais",)  # raised floors characters stand on (become `steps` in the layout)
STEP_OVER = 0.35  # an obstacle lower than this is stepped over
HEAD = 1.9  # anything whose underside is below this, over a cell, blocks it
CELL = 0.5  # layout grid in metres


def log(*a):
    print("build_room_3:", *a, flush=True)


def parse():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser(prog="build_room_3.py")
    p.add_argument("--tris", type=int, default=400_000, help="triangle budget for the whole room")
    p.add_argument("--texel", type=float, default=64, help="texture pixels per metre before the budget")
    p.add_argument("--megapixels", type=float, default=16, help="total baked texture budget")
    p.add_argument("--max-tex", type=int, default=2048)
    p.add_argument("--samples", type=int, default=8, help="Cycles samples for the bake (AO nodes need a few)")
    p.add_argument("--jpeg", type=int, default=82)
    p.add_argument("--light-boost", type=float, default=1.6, help="multiply the kept lamps' power (they stand in for 51 lamps and the fog)")
    p.add_argument("--no-draco", action="store_true", help="don't Draco-compress meshes")
    p.add_argument("--no-manifest", action="store_true")
    p.add_argument("--save-blend", help="also save the prepared scene here, for checking it in Blender")
    return p.parse_args(argv)


# ---------------------------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------------------------
def select_only(objs, active=None):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = active or (objs[0] if objs else None)


def tri_count(o):
    return sum(len(p.vertices) - 2 for p in o.data.polygons) if o.type == "MESH" else 0


def world_area(o):
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bm.transform(o.matrix_world)
    a = sum(f.calc_area() for f in bm.faces)
    bm.free()
    return a


def top_collection(o):
    return o.users_collection[0].name if o.users_collection else ""


# ---------------------------------------------------------------------------------------------
# 1. clean up: apply modifiers first, then drop helpers, volumes, cameras and lamps glTF can't carry
# ---------------------------------------------------------------------------------------------
def clean(scene):
    helpers = [o for o in scene.objects if o.hide_render and o.type in ("MESH", "CURVE")]
    gone = []
    for o in list(scene.objects):
        mats = [s.material for s in getattr(o, "material_slots", []) if s.material]
        volume = mats and all(is_volume_only(m) for m in mats)
        if o.type == "CAMERA" or volume or o.name in DROP:
            gone.append(o.name)
            bpy.data.objects.remove(o, do_unlink=True)
    log("removed", gone)

    # Make everything real geometry *while the helpers still exist*: curve modifiers keep their
    # paths, the boolean keeps its cutter, curves (archivolts, cobwebs) become meshes.
    keep = [o for o in scene.objects if o.type in ("MESH", "CURVE", "FONT", "SURFACE") and o not in helpers]
    for o in helpers:
        o.hide_set(False)
    select_only(keep)
    bpy.ops.object.make_single_user(object=True, obdata=True)
    with_mods = sum(1 for o in keep if getattr(o, "modifiers", None) and len(o.modifiers))
    bpy.ops.object.convert(target="MESH")
    log(f"applied modifiers on {with_mods} objects and converted curves")
    names = [o.name for o in helpers]
    for o in helpers:
        bpy.data.objects.remove(o, do_unlink=True)
    log("then removed helper curves / cutters:", len(names))

    # lamps: glTF has no area lights and the game ignores the sun; keep the fight's 16
    missing = [n for n in GAME_LAMPS if n not in scene.objects]
    if missing:
        log("WARNING: lamps not found:", missing)
    dropped = 0
    for o in list(scene.objects):
        if o.type != "LIGHT":
            continue
        if o.name in GAME_LAMPS and o.data.type in ("POINT", "SPOT"):
            o.data.use_shadow = False
            continue
        bpy.data.objects.remove(o, do_unlink=True)
        dropped += 1
    log(f"lamps: kept {len(GAME_LAMPS) - len(missing)}, dropped {dropped}")


def crop_floor(scene):
    f = scene.objects.get("Floor")
    if not f:
        return
    minx, maxx, miny, maxy = FLOOR_CROP
    inv = f.matrix_world.inverted()
    bm = bmesh.new()
    bm.from_mesh(f.data)
    before = len(bm.faces)
    for co, no in (((minx, 0, 0), (-1, 0, 0)), ((maxx, 0, 0), (1, 0, 0)), ((0, miny, 0), (0, -1, 0)), ((0, maxy, 0), (0, 1, 0))):
        co_l = inv @ Vector(co)
        no_l = (inv.to_3x3() @ Vector(no)).normalized()
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=co_l, plane_no=no_l, clear_outer=True)
    bm.to_mesh(f.data)
    bm.free()
    log(f"floor cropped to x {minx}..{maxx}, y {miny}..{maxy} ({before} -> {len(f.data.polygons)} faces)")


def fix_flat_surfaces(scene):
    """Flat pieces whose faces point down (the floor inlay ring) render black in the browser and bake
    black (their ambient occlusion looks into the floor). Flip them up and lift anything lying exactly
    on the floor by 1 cm, which also stops it flickering against the floor."""
    floor = scene.objects.get("Floor")
    floor_top = max((floor.matrix_world @ Vector(c)).z for c in floor.bound_box) if floor else 0.0
    flipped, lifted = [], []
    for o in scene.objects:
        if o.type != "MESH" or not o.data.polygons or o.name == "Floor":
            continue
        pts = [o.matrix_world @ Vector(c) for c in o.bound_box]
        dz = max(p.z for p in pts) - min(p.z for p in pts)
        span = max(max(p.x for p in pts) - min(p.x for p in pts), max(p.y for p in pts) - min(p.y for p in pts))
        if dz > 0.05 or span < 0.5:  # only genuinely flat pieces (inlays, decals)
            continue
        rot = o.matrix_world.to_3x3()
        net_z = sum(p.area * (rot @ p.normal).z for p in o.data.polygons)
        if net_z < 0:
            o.data.flip_normals()
            flipped.append(o.name)
        if abs(min(p.z for p in pts) - floor_top) < 0.005:
            o.location.z += 0.01
            lifted.append(o.name)
    log("flat pieces flipped face-up:", flipped or "none", "| lifted off the floor:", lifted or "none")


# ---------------------------------------------------------------------------------------------
# 2. the layout, measured from the geometry
# ---------------------------------------------------------------------------------------------
def in_walk(x, y):
    return any(b[0] <= x <= b[1] and b[2] <= y <= b[3] for b in WALK["boxes"]) or any(
        math.hypot(x - c[0], y - c[1]) <= c[2] for c in WALK["circles"]
    )


def probe(scene, dg, x, y):
    """('floor'|'step'|'block', height, object) at a point. Casts down from above head height and
    reads face normals: an upward face is something to stand on or bump into, a downward face means
    the ray was inside a solid (a pier, the tomb) or under something hanging."""
    origin = Vector((x, y, 6.0))
    down = Vector((0, 0, -1))
    for _ in range(32):
        hit, loc, n, _i, obj, _m = scene.ray_cast(dg, origin, down)
        if not hit:
            return "floor", 0.0, None
        name = obj.name.lower()
        through = any(t in name for t in WALK_THROUGH)
        if n.z < -0.3:  # underside
            if loc.z < HEAD and not through and not name.startswith(("floor",) + WALKABLE_RAISED):
                return "block", loc.z, obj.name
        elif loc.z <= HEAD + 0.5:  # a top or side within reach
            if name.startswith(WALKABLE_RAISED):
                return ("step" if loc.z > 0.12 else "floor"), max(0.0, loc.z), obj.name
            if name.startswith("floor") or (through and loc.z <= 0.12):
                return "floor", max(0.0, loc.z), obj.name
            if not through:
                return ("floor" if loc.z <= STEP_OVER else "block"), max(0.0, loc.z), obj.name
        origin = loc + down * 1e-3
    return "floor", 0.0, None


def grid_cells():
    xs = [i * CELL for i in range(int(-12 / CELL), int(12 / CELL) + 1)]
    ys = [j * CELL for j in range(int(-2 / CELL), int(28 / CELL) + 1)]
    for y in ys:
        for x in xs:
            if in_walk(x, y):
                yield x, y


def merge_boxes(cells):
    """cells: {(x, y): value}; merge equal-valued cells into rectangles (row runs, then stacked)."""
    rows = {}
    for (x, y), v in cells.items():
        rows.setdefault(y, []).append((x, v))
    runs = []
    for y in sorted(rows):
        row = sorted(rows[y])
        start, prev, val = row[0][0], row[0][0], row[0][1]
        for x, v in row[1:] + [(None, None)]:
            if x is not None and abs(x - prev - CELL) < 1e-6 and v == val:
                prev = x
                continue
            runs.append([start - CELL / 2, prev + CELL / 2, y - CELL / 2, y + CELL / 2, val])
            if x is not None:
                start, prev, val = x, x, v
    merged = []
    for r in runs:
        for m in merged:
            if abs(m[0] - r[0]) < 1e-6 and abs(m[1] - r[1]) < 1e-6 and m[4] == r[4] and abs(m[3] - r[2]) < 1e-6:
                m[3] = r[3]
                break
        else:
            merged.append(list(r))
    return merged


def to_game_box(b):  # Blender (x, y) rectangle -> the game's x/z rectangle (z = -y)
    return {"kind": "box", "minX": round(b[0], 3), "maxX": round(b[1], 3), "minZ": round(-b[3], 3), "maxZ": round(-b[2], 3)}


def nudge(scene, dg, x, y, taken):
    """The nearest clear floor (or dais) point to (x, y), at least 0.9 m from other spawns."""
    def clear(px, py):
        if not in_walk(px, py) or any(math.hypot(px - a, py - b) < 0.9 for a, b in taken):
            return False
        for dx, dy in ((0, 0), (0.35, 0), (-0.35, 0), (0, 0.35), (0, -0.35)):
            if probe(scene, dg, px + dx, py + dy)[0] == "block":
                return False
        return True

    if clear(x, y):
        return x, y, False
    for r in [0.25 * k for k in range(1, 13)]:
        for a in range(0, 360, 20):
            px, py = x + r * math.cos(math.radians(a)), y + r * math.sin(math.radians(a))
            if clear(px, py):
                return round(px, 2), round(py, 2), True
    return x, y, False


def layout(scene):
    dg = bpy.context.evaluated_depsgraph_get()
    blocks, steps, why = {}, {}, {}
    for x, y in grid_cells():
        kind, z, obj = probe(scene, dg, x, y)
        if kind == "block":
            blocks[(x, y)] = 1
            why[obj] = why.get(obj, 0) + 1
        elif kind == "step":
            steps[(x, y)] = round(z * 10) / 10  # 10 cm bands
    log("blockers measured:", dict(sorted(why.items(), key=lambda t: -t[1])))

    spawns, taken, moved = {}, [], []

    def place(kind, p):
        x, y, was_moved = nudge(scene, dg, p[0], p[1], taken)
        taken.append((x, y))
        if was_moved:
            moved.append(f"{kind} {p} -> [{x}, {y}]")
        z = probe(scene, dg, x, y)[1]
        return x, y, max(0.0, z)

    for kind in ("party", "enemies", "npcs"):
        spawns[kind] = [place(kind, p) for p in SPAWNS[kind]]
    spawns["boss"] = place("boss", SPAWNS["boss"])
    log("spawns moved off obstacles:", moved or "none")

    game_pt = lambda p: [round(p[0], 3), round(p[2], 3), round(-p[1], 3)]  # noqa: E731
    out = {
        "bounds": [to_game_box(b) for b in WALK["boxes"]] + [{"kind": "circle", "x": c[0], "z": -c[1], "r": c[2]} for c in WALK["circles"]],
        "colliders": [to_game_box(b) for b in merge_boxes(blocks)],
        "steps": [{**to_game_box(b), "top": b[4]} for b in merge_boxes(steps)],
        "spawns": {
            "party": [game_pt(p) for p in spawns["party"]],
            "enemies": [game_pt(p) for p in spawns["enemies"]],
            "boss": game_pt(spawns["boss"]),
            "npcs": [game_pt(p) for p in spawns["npcs"]],
        },
    }
    log(f"layout: {len(out['colliders'])} blocker boxes, {len(out['steps'])} dais step boxes")
    return out, spawns


def add_spawn_empties(scene, spawns):
    coll = bpy.data.collections.get("Game_Spawns") or bpy.data.collections.new("Game_Spawns")
    if coll.name not in scene.collection.children:
        scene.collection.children.link(coll)
    names = [(f"spawn_player_{i + 1}", p) for i, p in enumerate(spawns["party"])]
    names += [(f"spawn_enemy_{i + 1}", p) for i, p in enumerate(spawns["enemies"])]
    names += [(f"spawn_npc_{i + 1}", p) for i, p in enumerate(spawns["npcs"])]
    names += [("spawn_boss", spawns["boss"])]
    for name, (x, y, z) in names:
        e = bpy.data.objects.new(name, None)
        e.location = (x, y, z)
        e.empty_display_size = 0.4
        coll.objects.link(e)


# ---------------------------------------------------------------------------------------------
# 3. lighter geometry: decimate to a budget, join small props by material
# ---------------------------------------------------------------------------------------------
HERO = ("saint_", "sarcophagus", "tomb_")  # the Hollow Saint: keeps most of its detail
STRUCTURE = ("rotunda_", "archivolts", "bay_", "greatarch", "sidearchwall", "passagewall", "foreground_piers")
HERO_CAP, STRUCTURE_CAP, SMALL = 9_000, 12_000, 600


def decimate(scene, budget):
    """Hero and architecture are capped generously; decoration (chains, candles, bones) takes the cut:
    the largest per-object cap that fits the rest of the budget."""
    meshes = [o for o in scene.objects if o.type == "MESH" and o.data.polygons]
    tris = {o.name: tri_count(o) for o in meshes}
    total = sum(tris.values())

    def cap_of(name):
        n = name.lower()
        if name in NO_DECIMATE:
            return None
        if n.startswith(HERO):
            return HERO_CAP
        if n.startswith(STRUCTURE):
            return STRUCTURE_CAP
        return "decor"

    caps = {n: cap_of(n) for n in tris}
    fixed = sum(min(t, caps[n]) if isinstance(caps[n], int) else t for n, t in tris.items() if caps[n] != "decor")
    decor = {n: t for n, t in tris.items() if caps[n] == "decor"}
    room = max(budget - fixed, 0)
    lo, hi = SMALL, max(decor.values(), default=SMALL)
    while hi - lo > 25:
        c = (lo + hi) // 2
        lo, hi = (c, hi) if sum(min(t, c) for t in decor.values()) <= room else (lo, c)
    for n in decor:
        caps[n] = lo
    done = 0
    for o in meshes:
        c, t = caps[o.name], tris[o.name]
        if c is None or t <= c * 1.05:
            continue
        m = o.modifiers.new("game_decimate", "DECIMATE")
        m.decimate_type = "COLLAPSE"
        m.ratio = c / t
        m.use_collapse_triangulate = True
        select_only([o])
        bpy.ops.object.modifier_apply(modifier=m.name)
        done += 1
    after = sum(tri_count(o) for o in meshes)
    log(f"triangles {total:,} -> {after:,} (decimated {done} objects; decoration capped at {lo:,} each)")


def join_small(scene, max_area=25.0):
    groups = {}
    for o in scene.objects:
        if o.type != "MESH" or o.name in NO_JOIN or not o.data.polygons:
            continue
        if world_area(o) > max_area:
            continue
        mats = tuple(sorted(s.material.name for s in o.material_slots if s.material))
        groups.setdefault((top_collection(o), mats), []).append(o)
    before = sum(1 for o in scene.objects if o.type == "MESH")
    for (coll, mats), objs in groups.items():
        if len(objs) < 2:
            continue
        select_only(objs, objs[0])
        bpy.ops.object.join()
        bpy.context.view_layer.objects.active.name = f"{coll}_{'_'.join(mats)[:40]}".replace(" ", "_").replace("&", "and")
    for o in scene.objects:
        if o.type == "MESH":
            o.data.validate(clean_customdata=False)  # decimating + joining can leave degenerate faces
    after = sum(1 for o in scene.objects if o.type == "MESH")
    log(f"joined small props by material: {before} -> {after} mesh objects")


# ---------------------------------------------------------------------------------------------
# 4. bake procedural base colours, one image per object, each object on its own UVs
# ---------------------------------------------------------------------------------------------
def bake_targets(scene):
    return [o for o in scene.objects if o.type == "MESH" and o.data.polygons and any(s.material and _is_procedural(s.material) for s in o.material_slots)]


def unwrap(scene):
    """Unwrap on the full-detail meshes, before decimation: clean quads give large, coherent UV
    islands, and the decimator keeps them. (Unwrapping a decimated mesh scatters thousands of tiny
    islands and the bake lands as speckles.) Each object gets its own whole 0..1 square."""
    targets = bake_targets(scene)
    for o in targets:
        uv = o.data.uv_layers.get("bake_uv") or o.data.uv_layers.new(name="bake_uv")
        o.data.uv_layers.active = uv
        select_only([o])
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.003)
        bpy.ops.object.mode_set(mode="OBJECT")
    log("unwrapped", len(targets), "objects for baking")


def _surface_link(mat):
    out = next((n for n in mat.node_tree.nodes if n.type == "OUTPUT_MATERIAL" and n.is_active_output), None)
    return out, (out.inputs["Surface"].links[0].from_socket if out and out.inputs["Surface"].is_linked else None)


def bake(scene, a):
    targets = bake_targets(scene)
    if not targets:
        return []
    # pixel budget: size by surface area at `texel` px/m, then scale everything to fit the budget
    areas = {o.name: world_area(o) for o in targets}
    want = {n: a.texel * math.sqrt(max(ar, 0.01) / 0.55) for n, ar in areas.items()}  # 55% UV fill
    total_mp = sum(min(a.max_tex, w) ** 2 for w in want.values()) / 1e6
    k = min(1.0, math.sqrt(a.megapixels / total_mp)) if total_mp else 1.0

    def pow2(v):
        return max(64, min(a.max_tex, 2 ** math.floor(math.log2(max(v, 64)) + 0.25)))  # round down unless close

    sizes = {n: pow2(w * k) for n, w in want.items()}
    log(f"baking {len(targets)} objects, {sum(s * s for s in sizes.values()) / 1e6:.1f} MP of texture")

    images = {}
    for o in targets:
        for slot in o.material_slots:  # every procedural material gets its own copy for this object
            if slot.material and _is_procedural(slot.material):
                slot.material = slot.material.copy()
        o.data.uv_layers.active = o.data.uv_layers["bake_uv"]
        # Repack: joined props arrive with every piece's islands stacked on top of each other.
        select_only([o])
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.average_islands_scale()
        bpy.ops.uv.pack_islands(rotate=True, margin=0.003)
        bpy.ops.object.mode_set(mode="OBJECT")
        img = bpy.data.images.new(f"bake_{o.name}", sizes[o.name], sizes[o.name], alpha=True)
        img.generated_color = (0, 0, 0, 0)  # untouched pixels stay transparent: the check below can tell them apart
        images[o.name] = img
        # Every material on a baked object needs the target image as its active node.
        for slot in o.material_slots:
            m = slot.material
            if not (m and m.node_tree):
                continue
            node = m.node_tree.nodes.new("ShaderNodeTexImage")
            node.name = "game_bake"
            node.image = img
            m.node_tree.nodes.active = node

    # Swap each procedural material's output to an Emission of its base colour: the bake then
    # records exactly the colour, whatever the metallic/transmission/mix shading does to diffuse.
    swaps = []
    for m in {s.material for o in targets for s in o.material_slots if s.material and _is_procedural(s.material)}:
        nt = m.node_tree
        out, orig = _surface_link(m)
        base = _principled(m).inputs["Base Color"]
        em = nt.nodes.new("ShaderNodeEmission")
        nt.links.new(base.links[0].from_socket, em.inputs["Color"])
        nt.links.new(em.outputs[0], out.inputs["Surface"])
        swaps.append((m, out, orig, em))

    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = a.samples
    scene.render.bake.margin = 4
    scene.render.bake.target = "IMAGE_TEXTURES"
    scene.render.bake.use_selected_to_active = False
    select_only(targets)
    bpy.ops.object.bake(type="EMIT", use_clear=True, margin=4)

    # check: no black images
    import numpy as np

    bad = []
    for name, img in images.items():
        px = np.empty(len(img.pixels), dtype=np.float32)
        img.pixels.foreach_get(px)
        px = px.reshape(-1, 4)
        written = px[:, 3] > 0.5  # pixels the bake wrote
        if written.mean() < 0.01:
            bad.append(f"{name} (nothing written)")
            continue
        lit = (px[written, :3].max(axis=1) > 0.02).mean()  # of those, the share with a real colour
        if lit < 0.15:
            bad.append(f"{name} ({lit:.0%} of baked pixels coloured)")
        elif lit < 0.6:
            log(f"note: {name} is mostly dark ({lit:.0%} of baked pixels above black); check it in the preview")
    if bad:
        raise SystemExit(f"build_room_3: {len(bad)} baked textures came out black: {bad[:8]}")

    # restore the shaders and wire the baked image into Base Color (through bake_uv)
    for m, out, orig, em in swaps:
        nt = m.node_tree
        nt.nodes.remove(em)
        p = _principled(m)
        # glTF only carries a Principled BSDF: feed it straight to the output (drops mix/translucent)
        nt.links.new(p.outputs[0], out.inputs["Surface"])
        node = nt.nodes.get("game_bake")
        for link in list(p.inputs["Base Color"].links):
            nt.links.remove(link)
        uvn = nt.nodes.new("ShaderNodeUVMap")
        uvn.uv_map = "bake_uv"
        nt.links.new(uvn.outputs["UV"], node.inputs["Vector"])
        nt.links.new(node.outputs["Color"], p.inputs["Base Color"])
        # procedural roughness / metallic / bump can't travel either: plain values instead
        iron = "iron" in m.name.lower()
        for sock, val in (("Roughness", 0.55 if iron else 0.85), ("Metallic", 0.5 if iron else 0.0)):
            for link in list(p.inputs[sock].links):
                nt.links.remove(link)
                p.inputs[sock].default_value = val
        for link in list(p.inputs["Normal"].links):
            nt.links.remove(link)
    for img in images.values():
        img.pack()
    return list(images)


# ---------------------------------------------------------------------------------------------
# 5. export
# ---------------------------------------------------------------------------------------------
def export(path, a):
    bpy.ops.object.select_all(action="DESELECT")
    opts = dict(
        filepath=path,
        export_format="GLB",
        export_yup=True,
        export_apply=True,
        export_cameras=False,
        export_lights=True,
        export_animations=False,
        export_image_format="JPEG",
        export_jpeg_quality=a.jpeg,
    )
    if not a.no_draco:
        opts.update(export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6)
    try:
        bpy.ops.export_scene.gltf(**opts)
    except Exception as err:  # noqa: BLE001
        if a.no_draco:
            raise
        log("Draco unavailable in this Blender, exporting without it:", err)
        for k in [k for k in opts if k.startswith("export_draco")]:
            opts.pop(k)
        bpy.ops.export_scene.gltf(**opts)
    log(f"wrote {os.path.relpath(path, ROOT)} ({os.path.getsize(path) / 1e6:.1f} MB)")
    if not a.no_draco:
        with open(path, "rb") as f:
            if b"KHR_draco_mesh_compression" not in f.read(200_000):
                log("WARNING: this Blender has no Draco library, so the meshes are uncompressed. Compress with:\n"
                    "    npx @gltf-transform/cli draco client/public/models/room_3.glb client/public/models/room_3.glb")


def main():
    a = parse()
    bpy.ops.wm.open_mainfile(filepath=SOURCE)
    scene = bpy.context.scene
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")

    clean(scene)
    crop_floor(scene)
    fix_flat_surfaces(scene)
    lay, spawns = layout(scene)  # measured on the full-detail room, before anything is simplified
    add_spawn_empties(scene, spawns)
    unwrap(scene)
    decimate(scene, a.tris)
    join_small(scene)
    baked = bake(scene, a)
    log("baked:", len(baked), "objects")
    for o in scene.objects:
        if o.type == "LIGHT":
            o.data.energy *= a.light_boost

    meshes = [o for o in scene.objects if o.type == "MESH"]
    draws = sum(max(1, len(o.material_slots)) for o in meshes)
    log(f"final: {len(meshes)} meshes, {sum(tri_count(o) for o in meshes):,} triangles, ~{draws} draw calls, "
        f"{sum(1 for o in scene.objects if o.type == 'LIGHT')} lamps")

    os.makedirs(MODELS, exist_ok=True)
    export(os.path.join(MODELS, KEY + ".glb"), a)
    with open(os.path.join(MODELS, KEY + ".layout.json"), "w", encoding="utf-8", newline="\n") as f:
        json.dump(lay, f, indent=1)
    log("wrote", KEY + ".layout.json")
    if not a.no_manifest:
        from export_glb import update_manifest

        update_manifest(KEY, None, None)
    if a.save_blend:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(a.save_blend), copy=True)
        log("saved the prepared scene to", a.save_blend)


if __name__ == "__main__":
    main()
