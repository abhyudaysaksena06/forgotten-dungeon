# Blender models

`client/preview.html` (dev server only) renders any model here side by side, posed mid-clip:
`http://localhost:5173/preview.html?p=boss_hollow_king:0.6:attack:0.32:1,boss_nemesis:0.6:attack:0.32:1`
(key : yaw : clip : time : zoom, one panel per comma).

The easy way: export straight from the `.blend` file. This writes the `.glb` here and switches it on:

```bash
blender -b kael.blend --python tools/blender/export_glb.py -- --key char_kael --make-clips
```

By hand: drop `<key>.glb` here and add the key to `manifest.json`. An entry can carry options:

```json
["room_1", { "key": "char_kael", "height": 1.8 }, { "key": "boss_morvath_knight", "height": 3.2, "toon": false }]
```

- `height`: rescale to this many metres. `turn`: degrees to turn (default 90 for characters, so a
  Blender front view, −Y, faces the enemies). `toon: false`: keep the model's own materials instead of
  the game's cel shading and ink outline.
- Any key not listed keeps its placeholder shape, so models can arrive one at a time.
- Clips: `idle`, `run` (or `walk`), `jump`, `attack`, `rune`, `skill`, `hit`, `dodge`, `defend`,
  `block`, `heal`, `interact`, `death`, `victory`. Morvath (both `boss_morvath_knight` and
  `boss_morvath_dragon`) also has `boss_strike`, `boss_sweep`, `transform` and `armour_break`. A model
  with no clips (the Hell Nemesis) is moved by the game itself: a breath at rest, a stride bob when it
  walks, lunges, the Charge's dash and the Slam's leap.
- Room naming (spawn empties, colliders, floors) and every model key are in `docs/QUEST.md`.

## Keep them light

After an export, shrink the file (same look: Meshopt geometry, WebP textures, merged materials,
instanced props) and, for a room, make its map miniature:

```bash
cd tools/models && npm install
node optimize.mjs full room_1          # rewrites room_1.glb in place
node optimize.mjs mini room_1          # writes room_1.mini.glb and sets "mini": true in manifest.json
```

The game shows a loading screen until every model listed here is downloaded and each room's shaders
are compiled (`client/src/quest/preload.js` and the preloader in `scene/Scene.jsx`), so a fight never
waits for a download. Re-exporting a room from Blender drops its `mini` flag: the map then shows the
full room until `mini` is run again.

## What's here

| Key | What | From |
| --- | --- | --- |
| `room_1` | The Gate Courtyard | The artist's Blender 5.3 scene (`assets/blender/room_1.blend`), converted without Blender by `tools/blender/blend2room.py` (below) |
| `room_2` … `room_5` | The other rooms | `tools/blender/prepare_room.py` (and `build_room_3.py`) |
| `enemy_skeleton` | The skeletons | A rigged skeleton (2 clips) |
| `boss_nemesis` | The Hell Nemesis, room 3's boss | A 78 MB, 1.9-million-triangle sculpt with no rig: `optimize.mjs full boss_nemesis --simplify 0.2 --ground` keeps 20% (372k triangles; at 2–10% the chest's highlights go faceted), its own PBR materials (`toon: false`); then `node rig-nemesis.mjs` (on the unrigged file) fits an 18-bone skeleton and keys 14 clips: idle, run, walk, a sword slash, an overhead two-handed strike, a horizontal sweep, the Hellfire Charge, the leaping Infernal Slam, the enraged roar, hit, stagger, guard, victory and death, then `node lighten.mjs boss_nemesis` (weld + error-capped simplify, 0.05%: 372k → 149k triangles, 4.2 → 2.5 MB, no visible change) |
| `boss_hollow_king` | The Hollow King, room 4's boss | The team's "dung king" (an AI-made single mesh with no normals and a 1K texture): `node reforge-king.mjs <dung_king.glb>` grounds it, smooths its normals across the texture seams, grades the texture at 2K (armour darker, cloth dried blood, gold tarnished), and makes its hot reds glow (sword, gems, eyes); then `node rig-king.mjs` fits the same 18-bone skeleton and move set as the Nemesis (`rig-lib.mjs`), the broad blade bound by its own texture charts, plus his Shadow Tide clip (`skill`). Manifest: 3.4 m, `turn: 180` |
| `boss_morvath_knight` | Morvath, the Shadow Knight (phase 1) | The Nemesis sculpt in Morvath's violet shadow-fire: `node variant.mjs boss_nemesis boss_morvath_knight --hue 292 --saturation 1.1 --brightness 0.92 --height 3.6` (the story calls the Nemesis his herald, wearing his likeness), then `node lighten.mjs boss_morvath_knight` (4.8 → 2.6 MB) |
| `boss_morvath_dragon` | Morvath after the Change | The artist's dragon (below): `--simplify 0.5 --max 4096` keeps its 4K body textures and all 8 clips |
| `char_kael`, `npc_healer`, `npc_smith`, `npc_king_ghost`, `npc_pip` | Kael, the cage's keepers, the camp | KayKit Adventurers (Kay Lousberg, **CC0**): Knight, Mage, Barbarian, Knight as a ghost, Barbarian with his mug, built by `tools/models/character.mjs` |

### Characters (KayKit Adventurers, CC0)

Download the source characters from
`https://raw.githubusercontent.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0/main/addons/kaykit_character_pack_adventures/Characters/gltf/<Knight|Mage|Barbarian>.glb`
(CC0 1.0: free for any use, no attribution required), then, from `tools/models`:

```bash
node character.mjs Knight.glb char_kael --height 1.85 --drop 1H_Sword_Offhand,Rectangle_Shield,Round_Shield,Spike_Shield,2H_Sword --clips idle=Idle,run=Running_A,walk=Walking_A,jump=Jump_Full_Short,attack=1H_Melee_Attack_Slice_Diagonal,rune=1H_Melee_Attack_Stab,skill=Block,defend=Blocking,block=Block_Hit,hit=Hit_A,dodge=Dodge_Backward,heal=Use_Item,interact=Interact,death=Death_A,victory=Cheer
node character.mjs Mage.glb npc_healer --height 1.75 --drop Spellbook,Spellbook_open,1H_Wand --clips idle=Idle,skill=Spellcast_Raise,attack=Spellcast_Shoot,interact=Interact,hit=Hit_A,victory=Cheer
node character.mjs Barbarian.glb npc_smith --height 1.95 --drop 1H_Axe_Offhand,Barbarian_Round_Shield,2H_Axe,Mug --clips idle=Idle,attack=1H_Melee_Attack_Chop,interact=Interact,hit=Hit_A,victory=Cheer
node character.mjs Knight.glb npc_king_ghost --height 2.0 --ghost --tint '#a8dcff' --drop 1H_Sword_Offhand,Rectangle_Shield,Round_Shield,Spike_Shield,1H_Sword,Badge_Shield --clips idle=Idle,interact=Interact,victory=Cheer
node character.mjs Barbarian.glb npc_pip --height 1.35 --drop 1H_Axe_Offhand,Barbarian_Round_Shield,2H_Axe,1H_Axe,Barbarian_Hat --clips idle=Idle,interact=Interact,victory=Cheer,attack=Throw
```

It keeps only the clips the game plays (renamed to its clip names), drops the accessories a character
shouldn't carry, and compresses the rest: about 0.2–0.5 MB each instead of 3.6 MB.

### Room 1 without Blender

The round 1 arena was saved by Blender 5.3. `tools/blender/blend2room.py` reads the .blend itself (its
SDNA, through `tools/blender/blendfile.py`) and writes the room exactly as modelled: every mesh with its
Principled BSDF material (colour or packed texture, metal, roughness, glow), the lamps in the units
Blender's exporter uses, and the spawn empties; then the layout from `tools/blender/rooms.json`:

```bash
python3 tools/blender/blend2room.py assets/blender/room_1.blend client/public/models/room_1.glb --layout=room_1
cd tools/models && node optimize.mjs full room_1 && node optimize.mjs mini room_1
```

## Morvath, the Shadow Dragon

`boss_morvath_dragon.glb` is built from `assets/blender/boss_morvath_dragon.blend` (no armature: separate
parts and procedural materials) by:

```bash
blender -b --disable-autoexec assets/blender/boss_morvath_dragon.blend --python tools/blender/build_dragon.py
```

It bakes the materials to textures, adds pivots for the body, head, jaw, throat glow and both wings, makes
the clips `idle`, `boss_strike`, `boss_sweep`, `skill`, `transform`, `armour_break`, `hit` and `death`, and
exports the .glb. The manifest shows it at 4.8 m with its own materials (`toon: false`), turned 180° (it
faces -X in Blender).

## Rooms are played at twice their modelled size

After exporting a room (and its layout), scale it: the characters are life-size, the rooms were modelled
small. `tools/models/scale-room.mjs` scales the model, its lamps (intensity × factor², so each lights its
part of the bigger room as before) and its layout file together:

```bash
cd tools/models && node scale-room.mjs room_1 2
```

All five rooms are at 2×. The game loads them in batches (rooms 1–2 with the characters open the game;
rooms 3–4 with the Nemesis, then the Throne with Morvath, follow in the background).
