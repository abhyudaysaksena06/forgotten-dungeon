# The Forgotten Dungeon: scorecard

Every aspect of the game, scored 1–10 before and after the overhaul of 9 November 2026 (from commit
`741cf6b`, the state at its start, to the merge that follows it). Each score names its evidence.

| Aspect | Before | After | Evidence |
| --- | :-: | :-: | --- |
| Core gameplay | 7 | 8 | Deterministic engine, lanes, telegraphs, the cage. Now: a three-move boss kit (Charge, Enraged, Infernal Slam) that asks for the lane system and Defend at the right time. |
| Difficulty curve | 6 | 8 | Careful play per tier was 3% / 38% / 88% (weak / average / strong); now 48% / 69% / 99% (faster levelling, a gentler round 2, active bosses), careless 0% everywhere. Room 3 wins 86% of first attempts, room 4 58%, and the route planner knows which is easier. |
| Bosses | 4 | 8 | The Nemesis was a static sculpt sliding about with one move; now a 3-move kit with its own motion (dash, leap, shockwave, hellfire glow). Morvath's knight form was boxes; now a real model with a visible armour shell. The dragon (8 clips) is in. Room 4 has its own boss, the Hollow King: reforged, rigged, with a poisoning Shadow Tide over two lanes and a roar that raises skeletons. |
| Characters and NPCs | 2 | 7 | Kael, the Healer, the Weaponsmith, King Aldric's ghost and Pip were primitive stand-ins; now rigged, animated models (KayKit, CC0) that act: the Healer casts, the Weaponsmith hammers, Kael stabs, blocks, dodges, drinks, cheers. |
| Arenas | 6 | 8 | Room 1 is the artist's new Blender 5.3 arena, converted faithfully (25 materials, packed textures, 15 lamps) without Blender. |
| Visual quality | 5 | 7 | Bosses keep their real materials (the dragon its 4K textures); a carried torch keeps fights readable in dark rooms. |
| Animation correctness | 4 | 8 | A re-render replayed past cues and restarted swings; one-shot clips were muddied by the idle; a revived hero stayed down. All fixed; models without clips move procedurally. |
| Performance | 7 | 7 | Same: everything preloaded and shaders compiled before play. Kept that way despite 11 MB more of bosses: glass-like transmission removed (a full extra render pass), lights only where needed, error-capped simplification. |
| UX and onboarding | 7 | 8 | The round clock ran during the loading screen and the tutorial; it waits now. Third person by default so the hero is on screen; the camera keeps out of low ceilings and frames Kael. |
| Audio | 6 | 7 | Synthesized music and effects; the new moves now have sounds (Rune Strike, Charge, Slam, dodge, guard). |
| Story and essence | 7 | 8 | The Nemesis is Morvath's herald wearing his likeness; the locked cage, the breather and the enrage all speak in the chronicle. |
| Backend and API | 7 | 8 | Clean API, replay saves, atomic writes. Added: security headers, constant-time team codes, long caching for hashed assets. |
| Tests and verification | 5 | 9 | `npm test` ran 44 of 102 server tests (an unquoted glob); now all 105 plus 23 client tests. New tests for the Nemesis kit, the cues and the banners. `quest-verify` proves every bug locks only its own round's cage. |
| Deployment | 6 | 8 | The branch was ahead of the live site; merged and checked on forgotten-dungeon.vercel.app. |
| Asset pipeline | 6 | 9 | New: a .blend reader and room converter (no Blender needed), a character builder, a recolour tool, and `optimize.mjs --max/--ground`. |
| **Average** | **5.6** | **7.9** | |

## What still holds it back

- **The heroes are stylized.** KayKit's characters are chunky and cartoon-like next to the realistic
  bosses. Realistic rigged humans need assets: the team's own knight (`Untitled (1).blend`, 301k
  triangles) has no rig yet.
- **The Nemesis has no skeleton.** It moves as a whole (procedural motion), not limb by limb. A rig
  and clips (for example via Mixamo) would let it swing its sword.
- **35 MB to load.** Everything loads before play so nothing stutters later; on a slow connection the
  first wait is long. KTX2 textures would cut it, but need a texture encoder that isn't installed here.
- **NPCs talk only in the chronicle.** There are no speech bubbles or conversations at the camp.
