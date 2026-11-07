"""Export a Blender room or character into the game, ready to play.

    blender -b room1.blend --python tools/blender/export_glb.py -- --key room_1
    blender -b kael.blend  --python tools/blender/export_glb.py -- --key char_kael --make-clips
    blender -b morvath.blend --python tools/blender/export_glb.py -- --key boss_morvath_knight --make-clips --height 3.2

Writes client/public/models/<key>.glb and lists the key in client/public/models/manifest.json,
which switches that model on in the game (no code change). It also checks the names the game
looks for and says what's missing.

Rooms (`room_1` … `room_5`), all optional:
  spawn_party_1..4, spawn_enemy_1..N, spawn_boss   empties where characters appear
  collider…    meshes that block movement (walls, pillars, tables); hidden in the game
  bounds… / walk_area…   one flat mesh whose footprint is the walkable area; hidden
  floor… / ground…       meshes characters stand on (otherwise every visible mesh counts)
  The party starts on the -X side and the enemies on +X unless spawn empties say otherwise.

Characters: face -Y (the front view), feet at the origin, metres. Clips named idle, run (or walk),
jump, attack, skill, hit, defend, death, victory. --make-clips adds simple ones for any missing.
"""
import argparse
import json
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from make_clips import BOSS_CLIPS, CHAR_CLIPS, clip_key, make_clips  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
MODELS = os.path.join(ROOT, "client", "public", "models")


def parse():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser(prog="export_glb.py")
    p.add_argument("--key", required=True, help="model key, e.g. room_1, char_kael, boss_morvath_knight")
    p.add_argument("--out", help="output .glb (default: client/public/models/<key>.glb)")
    p.add_argument("--height", type=float, help="rescale the model to this height in metres in the game")
    p.add_argument("--turn", type=float, help="extra turn in degrees (default 90 for characters: -Y front to the game's +X)")
    p.add_argument("--make-clips", action="store_true", help="add simple clips for any the rig is missing")
    p.add_argument("--no-manifest", action="store_true", help="don't switch the model on in the game")
    return p.parse_args(argv)


def check_character(key, make):
    arms = [o for o in bpy.data.objects if o.type == "ARMATURE"]
    need = CHAR_CLIPS + (BOSS_CLIPS if key.startswith("boss_morvath") else [])
    if not arms:
        print("NOTE: no armature: the model is exported as it is (the game still moves it as a whole).")
        return
    if make:
        make_clips(arms[0], need)
    have = {clip_key(a.name) for a in bpy.data.actions}
    if "walk" in have:
        have.add("run")
    missing = [c for c in need if c not in have]
    print("clips found:", sorted(have & set(need)))
    if missing:
        print("clips missing (the game skips them):", missing, "- add --make-clips to generate simple ones")


def check_room():
    names = [o.name.lower() for o in bpy.data.objects]
    spawns = sorted(n for n in names if n.startswith("spawn_"))
    colliders = [n for n in names if n.startswith("collider")]
    floors = [n for n in names if n.startswith(("floor", "ground"))]
    bounds = [n for n in names if n.startswith(("bounds", "walk_area"))]
    print("spawns:", spawns or "none (default positions)")
    print("colliders:", len(colliders), "| floors:", len(floors) or "none (every visible mesh is walkable)", "| bounds:", bounds or "none (the room's outline)")


def export(out, lights=False):
    os.makedirs(os.path.dirname(out), exist_ok=True)
    opts = dict(
        filepath=out,
        export_format="GLB",
        export_yup=True,
        export_apply=True,
        export_animations=True,
        export_cameras=False,
        export_lights=lights,
        export_image_format="JPEG" if lights else "AUTO",  # rooms: baked textures as JPEG keep the file small
        export_jpeg_quality=88,
    )
    try:
        bpy.ops.export_scene.gltf(**opts, export_animation_mode="ACTIONS")
    except TypeError:  # older exporters
        bpy.ops.export_scene.gltf(**opts)
    print("wrote", out, f"({os.path.getsize(out) // 1024} KB)")


def update_manifest(key, height, turn):
    path = os.path.join(MODELS, "manifest.json")
    data = []
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
    data = [e for e in data if (e if isinstance(e, str) else e.get("key")) != key]
    extra = {k: v for k, v in (("height", height), ("turn", turn)) if v is not None}
    data.append({"key": key, **extra} if extra else key)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, indent=2)
        f.write("\n")
    print("manifest:", key, "is now on")


def main():
    a = parse()
    room = a.key.startswith("room_")
    if room:
        check_room()
    else:
        check_character(a.key, a.make_clips)
    out = a.out or os.path.join(MODELS, a.key + ".glb")
    export(out, lights=room)
    if not a.no_manifest:
        update_manifest(a.key, a.height, a.turn)


if __name__ == "__main__":
    main()
