# Blender models

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
- Clips: `idle`, `run` (or `walk`), `jump`, `attack`, `skill`, `hit`, `defend`, `death`, `victory`.
  Morvath (both `boss_morvath_knight` and `boss_morvath_dragon`) also has `boss_strike`, `boss_sweep`,
  `transform` and `armour_break`.
- Room naming (spawn empties, colliders, floors) and every model key are in `docs/QUEST.md`.
