# The Quest — The Shattered Heart

Level-by-level walkthrough with timings: [LEVELS.md](LEVELS.md).

The single-player round of The Forgotten Dungeon. Participants get a cursed copy of this game,
play it, and fix the bugs ("curses") that make it hard or impossible to finish. This doc covers the
game rules, the story, the bugs and hints, the random forest, judging, and the asset contract for the
Blender models. The older voting-round code (`server/src/engine`, `rooms`, `dm`) is separate and untouched.

The story and round structure are adapted from the Round 2 rulebook and the dungeon storyline, not
copied: the camp-and-five-rooms map, torches and readiness choices are this game's own.
Client calls are not part of this round.

## The story

The Heart of Eternity kept Eldermoor alive. Morvath, the King's own knight, broke it into five
pieces and the kingdom sank beneath the earth. The player is a **Runewright**: the dungeon runs on
runes, and the runes are written wrong. That's the in-game reason the code has bugs.

Story text lives in `server/src/quest/story.js`: the intro, a line per leader, each room's enter and
clear lines, camp lines, Morvath's phase lines, the ending and the defeat line.

## The game

| Piece | Rule |
| --- | --- |
| Party | **Kael** the Knight (defence, Bulwark), **Lyra** the Mage (healer, Mend), **Rook** the Rogue (striker, Twin Strike), **Mira** the Ranger (long range, Volley). The player picks one as **leader** at the start; the other three are AI companions (`server/src/quest/ai.js`). |
| Leader | Has every skill of their hero plus **Rune Strike** (cooldown 3). Only the leader's Rune Strike breaks Morvath's shadow armour. |
| Map | Camp plus five rooms joined by corridors: camp–r1, camp–r2, r1–r2, r1–r3, r2–r4, r3–r4, r3–r5, r4–r5. Each corridor costs 1 torch. A cleared room's waystone links it to the camp. Rooms 1–4 can be done in any order. |
| Rooms 1–4 | Six **Skeletons** (65 HP, ATK 12, DEF 5 before scaling); there are no room bosses. Reward: a **Heart fragment**, gold, potions, XP. Every second skeleton to fall drops a monster part (three a room). |
| Room 5 | The Throne of Eternity opens at 3 fragments. Six brittle skeleton guards (10 HP, ATK 0), then **Morvath**. No retreat. Beating him gives the fifth fragment. |
| Difficulty | Enemy strength = 1 + 0.12 × (tier − 1) + 0.06 × rooms already cleared. Higher rooms and later progress hit harder. Morvath grows **+35% for every room cleared beyond the three** that open the Throne (shown on the map), so clearing everything first buys XP at a price. |
| Camp | Rest (1 torch: full heal and revive), Rune Altar (1 torch + 30 gold: +3 ATK and +3 DEF for one hero), Forge (50 gold: +5 ATK for one hero). |
| Pip's Pot | At camp, no torch cost: a Health Potion for 25 gold (heals 40), or a Monster Meal from 3 parts (heals 70). |
| Combat | One input per round: Attack, Defend, Skill, Rune Strike, Potion, Meal, Retreat (−1 torch), or Wait if the leader has fallen. d20 1–3 misses, 20 crits. Damage = ATK + d6 − DEF (magic halves DEF), minimum 1. Melee can't hit flyers. Poison: 4 damage for 3 rounds. |
| Wipe | The party wakes at camp at 30% HP; −2 torches; half the gold. |
| End | Victory when Morvath falls. Defeat when the torches run out on the map. |

### Rooms and NPCs

| Round | Room | Minions | Boss | NPC |
| --- | --- | --- | --- | --- |
| 1 · The Entrance | The Gate Courtyard | 6 Skeletons | none | Old Grum, the gatekeeper |
| 2 · The Forgotten Hall | The Hall of Portraits | 6 Skeletons | none | Ilsa, the ink-keeper |
| 3 · The Trial Chambers | The Hall of Trials | 6 Skeletons | none | Seraphine, the oracle; Venn, the scholar |
| 4 · The Shadow Depths | The Hollow Barracks | 6 Skeletons | none | Sir Corin, the last loyal knight |
| 5 · The Boss Round | The Throne of Eternity | 6 skeleton guards | Morvath | King Aldric's ghost (voice only) |

The skeletons use the model `enemy_skeleton`. Three kinds share it and the name: `skeleton` (the
rooms), `skeleton_guard` (the Throne's first wave) and `skeleton_risen` (Morvath's summons, with the
Shadow Crawlers' old numbers). The old minions and room bosses stay in `ENEMIES` and the engine still
knows their moves, but no room places them.

NPCs speak when you enter and clear their room (`state.speech`; the client shows it as a speech
bubble). King Aldric's ghost and Pip wait at the camp.

### Morvath

725 HP, DEF 8 (more if the party cleared a fourth room first). Each round he announces his next move, so the player can react.

| Phase | When | Moves |
| --- | --- | --- |
| 1 · The Shadow Knight | 100–60% HP | Shadow Blade (36 to one hero) or Black Sweep (15 to all). |
| 2 · The Change | 60–30% | Becomes the Shadow Dragon and summons 2 Skeletons, **each of which heals him 10 HP a round while alive**. Dragon Claw (36 to one) or Shadowflame (14 to all + poison). |
| 3 · Dragon's Breath | below 30% | Alternates: draws in shadow-fire (no damage), then Dragon's Breath (48 to everyone in **two of the three lanes**: stand in the safe one, or Defend to halve it). |

**Shadow armour** blocks all damage until the leader's Rune Strike breaks it. It grows back after
3 rounds. A player who never uses Rune Strike can't win.

Per-team starting stats (`server/src/quest/teams.js`): tier × ±12% per stat per hero, from the team's seed.

| Tier | Stats | Torches | Gold | Potions |
| --- | --- | --- | --- | --- |
| Weak | 0.92× | 13 (±1) | 20 | 2 |
| Average | 1.0× | 14 (±1) | 40 | 2 |
| Strong | 1.10× | 16 (±1) | 60 | 3 |

Balance, from the simulator with the careful leader bot (Rune Strike on armour, Defend before the
breath), averaged over all four leaders. "Prepared" clears every room it can before Morvath,
"Balanced" goes for the throne as soon as it opens, "Reckless" fights early:

| Tier | Prepared route | Balanced route | Reckless route |
| --- | --- | --- | --- |
| Weak | 0% | 10% | — |
| Average | 0% | 12% | — |
| Strong | 0% | 54% | — |

The game is tuned so that **fewer than 30% of runs finish**: even the best route for each tier wins
25% on average (the bot dodges every marked lane and never misses a Rune Strike), and real players win less. A careless
leader wins 0%. Rooms 1–4 stay winnable (teams average 3.4–4 fragments), so progression still
separates teams. Clearing all four rooms before Morvath now backfires, because he grows with each
extra room; going in at three fragments, rested and stocked, is the better play. That's what the
forest judges.

## Lanes and boss mechanics

Every fight has three lanes (left, centre, right) running from the party towards the enemies. Each
hero stands in one. **The player's lane is wherever they are standing when they act**: it travels with
the input (`lane`), so the engine still decides everything and replays stay exact. Companions step
out of a marked lane on their own 70% of the time (`DODGE_CHANCE`), so they help without being
perfect.

| Boss | Mechanic | What to do |
| --- | --- | --- |
| Morvath | Shadow armour (Rune Strike); in phase 2 his skeletons **heal him** each round; in phase 3 his **breath covers 2 of 3 lanes** | Kill the skeletons first; stand in the safe lane |

The room bosses' mechanics (the Stone Sentinel's charge, the Ink Wraith hiding, Brakka's counter, the
Hollow Captain's shadow tide) are still in the engine and its tests, but no room uses them now.

The floor shows it all: faint lane guides, red pulsing strips on lanes hit next round, a purple strip
where the Wraith hides. The action bar shows your lane (red with "move!" when it's marked), and the
enemy panel spells out each boss's tell. All numbers live in `MECHANICS` in `server/src/quest/data.js`.

## Sound

Synthesized in the browser with Web Audio (`client/src/quest/audio.js`): no audio files, works offline.
Effects follow the same timed cues as the animations (slashes, impacts, spells, heals, shatters,
roars, a jump whoosh) and every banner has a stinger. The music is generative: a drone and a slow bell
melody in each room's own key and mood, a heartbeat drum in fights, and heavier drums against
Morvath. Sound starts after the first click or key press (a browser rule). Settings has Volume,
Music, Effects and Mute, remembered in the browser.

## First-fight tutorial

The first fight shows a four-step coach: move, attack (walk into reach, right-click), read the floor
(lanes), then the other keys. Each step clears when the player does it; "Skip tutorial" dismisses it.
It's remembered in the browser. The chronicle starts collapsed to its last three lines.

## Quests

The game plays like a dungeon crawler: fight, win, move on. There are no question prompts. NPCs hand
out quests, and the quest log (`server/src/quest/quests.js`) tracks them. The log is worked out from the
run's state on every view, so it never changes the rules, the dice or the judging.

| Quest | Giver | Opens | Done when |
| --- | --- | --- | --- |
| The Shattered Heart (main) | King Aldric | at the start | Morvath falls (counts fragments) |
| Mind the Courtyard | Old Grum | at the start | Gate Courtyard cleared |
| The Unfinished Portraits | Ilsa | at the start | Hall of Portraits cleared |
| The Three Trials | Seraphine | after the first room | Hall of Trials cleared |
| The Last Loyal Knight | Sir Corin | after the first room | Hollow Barracks cleared |
| The Throne of Eternity (main) | King Aldric | after the first fragment | 3 fragments, then Morvath |
| Monster Stew (side) | Pip | first monster part | a Monster Meal is cooked |
| The Scholar's Lesson (side) | Venn | first level-up | the leader reaches level 3 |

Each room quest has two steps (reach the room, defeat the six skeletons) and lists its
reward: the fragment, gold, potions and XP. The room-clear line in the chronicle states the XP too,
which is how players can spot bug Q18.

## Presentation

- **Cel shading.** Every stand-in model uses a three-band toon material with an ink outline
  (`placeholders.jsx`), and the rooms and map are toon-shaded too. Low spec mode turns the outlines off.
- **Banners** (`client/src/quest/banners.js`): BATTLE START!, BOSS BATTLE!, FINAL BATTLE, THE CHANGE,
  DRAGON'S BREATH, VICTORY!, DEFEATED…, LEVEL UP!, NEW QUEST, QUEST CLEAR!, and a cut-in for each
  skill and Rune Strike. They're worked out from the change between two server states.
- **Dialogue.** NPC lines show in a dialogue box with a name plate.

## Moving in a fight

Every room is a 3D space you walk around in. The camera follows the leader from behind.

| Key | Does |
| --- | --- |
| **W A S D** (or ↑ ↓) | Walk, relative to the camera |
| **Space** | Jump |
| Click the view, then move the mouse | Mouse look, like a shooter: turn and tilt the camera; left-click attacks the enemy in the crosshair. **Esc** frees the cursor for the menus |
| **V** | First person (default, like a shooter) or third person over the shoulder |
| **F1** / ? button | All the controls (they're no longer on screen) |
| Mouse drag, **← →**, wheel | Look around without capturing the mouse, zoom |
| **Right-click** · middle-click · side buttons | Attack · Rune Strike · skill (back) / defend (forward) |
| Settings (top bar) | Mouse sensitivity (0.2–3×, saved in the browser) |
| **F** / click an enemy | Attack (click selects; **Tab** cycles; **1–6** pick from the list) |
| **E** | The leader's skill (Bulwark, Mend, Twin Strike, Volley) |
| **Q** | Rune Strike |
| **R** | Defend |
| **H** / **G** | Potion / Monster Meal |
| **X** | Retreat (costs a torch) |
| **J** | Quest log |

**Reach.** Attacks, Twin Strike and Rune Strike only fire when the leader is close enough to the
target: melee 2.4 m, magic 9 m, ranged 12 m, measured edge to edge. A ring under the target turns
green in reach and red when too far, and the action bar shows the distance. Out of reach, the game
says "move closer" and sends nothing.

**The engine is still the referee.** Movement, jumping, facing and reach live only in the browser
(`client/src/quest/scene/world.js`). Each ability key sends one ordinary input (attack, skill, rune…)
to the same deterministic engine, so autosave by inputs, replay, cheat-proofing and judging are
unchanged. Positions are never saved and never scored.

**Companions act on their own (moderately).**

- **They position themselves by role.** Kael steps between the leader and the closest enemy. Rook
  flanks. Mira keeps about 6 m back. Lyra stays back and to the side of whoever is most hurt. None of
  them strays more than 7 m from the leader. Enemies close in on the nearest hero, and Morvath holds
  his ground.
- **The round clock.** If the leader does nothing for 6 seconds in a fight, the round plays out anyway
  (a plain `wait` input, saved and replayed like any other). The companions use their own AI and the
  enemies strike back. The clock restarts after every round. It pauses while a request is in flight,
  a picker or the quest log is open, a banner is showing, or the window isn't in front, so a team
  reading code in their editor never loses rounds. "Auto rounds: on/off" in the action bar turns it off.

## Cheat-proofing

- **Deterministic engine.** The same profile and the same inputs give the same run, every time
  (`step()` is pure; the dice are seeded).
- **Saves hold inputs only** (`server/saves/<team>.json`). Resume replays them through the current code,
  so after a fix the run is re-simulated under the fixed rules. Inputs that no longer fit are dropped.
- **The judge replays the save on the organiser's clean engine with the official profile** from
  `organiser/registry.json`. Edited stats, torches, engines or saves can't raise the score: the
  replay stops where the inputs stop making sense, and only progress up to that point counts.
  A changed profile is flagged.
- **The browser never sees the dice state** (`publicState` hides `rngState` and the recorded decisions).
  Inputs are cleaned to a type and ids; numbers sent by a client are dropped.
- **The judge's model is not in participant repos**, so teams can't query it to game their choices.
- **Known limit:** a team could copy the engine and search for lucky dice offline. Each team has a
  fixed seed and salt, so restarting never re-rolls the dice.

## The random forest

It judges **readiness choices**: every time the party is on the map and picks a room, rest, the altar
or the forge, the engine records the 29 numbers in `server/src/quest/features.js` (party level, HP,
ATK, DEF, power, torches, gold, potions, meals, parts, fragments, progress, wipes, the option's type,
the target room's tier and threat, travel cost, power-to-threat ratio, who leads, and the leader's HP).

1. `node server/scripts/quest-dataset.mjs --states 3000 --rollouts 40 --out ml/data/route_decisions.csv`
   plays thousands of teams of all tiers and leaders. At each decision it tries every option and
   estimates its win chance from 40 simulated continuations with fresh dice. An option is "good" if it's
   within 10 points of the best option in that exact situation. About 4 minutes.
2. `python ml/train_forest.py` trains a scikit-learn RandomForestClassifier (120 trees, depth 12),
   split by team. Current result (retrained for the skeleton rooms): **71.8% accuracy on unseen
   teams** (majority baseline 53.4%), ROC AUC 0.80, on 16,859 decisions. By tier: weak 76%, average
   71%, strong 68%. Top inputs: party power, power-to-threat ratio, torches, party ATK, gold.
3. The model ships as JSON (`server/src/quest/model/route-forest.json`); `forest.js` evaluates it in
   Node. `server/test/forest.test.js` proves Node and scikit-learn agree, and that the forest beats the
   baseline by at least 10 points.

Re-run steps 1–2 after any change to the game rules.

## The bugs

`scramble/quest-bugs.mjs`, 22 bugs grouped by the rulebook's five rounds. Each has a hidden test in
`server/test/quest/bugs.test.js` and three hint levels. A blocker is worth 100 marks, a hindrance 60.

| Round | Id | Name | Kind | What players see |
| --- | --- | --- | --- | --- |
| 1 | Q01 | Wrong Hands | blocker | You pick one hero but steer the next one in line, so Rune Strike never breaks the armour. |
| 1 | Q02 | Turncoat Buttons | hindrance | Attack defends; Defend tries to attack and errors. |
| 1 | Q11 | Long Way Round | blocker | Every journey burns twice the torches shown. |
| 1 | Q13 | Dead Waystones | hindrance | Cleared rooms don't link back to the camp. |
| 2 | Q07 | Cursed Altar | hindrance | The Rune Altar says +3 ATK but takes 3 away. |
| 2 | Q10 | Cold Ashes | hindrance | Resting never revives the Fallen. |
| 2 | Q14 | Empty Satchel | hindrance | Loot replaces the potion count instead of adding to it. |
| 2 | Q15 | Pip's Short Change | hindrance | Pip takes the gold but no potion arrives. |
| 3 | Q06 | Selfish Mender | hindrance | Lyra heals only allies who are already healthy. |
| 3 | Q16 | Lonely Bulwark | hindrance | Bulwark protects only Kael. |
| 3 | Q17 | Watered Potion | hindrance | Potions restore almost nothing. |
| 4 | Q04 | Iron Skin | blocker | From the second room on, enemies shrug off almost every blow. |
| 4 | Q05 | Short Memory | blocker | After a server restart a long run rewinds. |
| 4 | Q08 | Endless Wave | blocker | A fight never ends after the last enemy falls. |
| 4 | Q19 | Echoing Cooldown | hindrance | One hero's skill puts every hero's skill on cooldown. |
| 4 | Q18 | Stingy Lessons | hindrance | Every room pays only the first room's XP, so the party levels too slowly. |
| 5 | Q03 | The Sealed Throne | blocker | The Throne never opens. |
| 5 | Q09 | Unbreakable Armour | blocker | Rune Strike never breaks the armour. |
| 5 | Q12 | Spent Rune | blocker | Rune Strike never recharges after its first use. |
| 5 | Q21 | No Victory | blocker | Morvath falls but the quest never ends. |
| 5 | Q20 | Fire Through Shields | hindrance | Defending does nothing against Dragon's Breath. |
| 5 | Q22 | Hasty Armour | hindrance | Rune Strike promises 3 rounds, but the armour is back after 2. |

**Per-team mix.** Each team draws, per round: R1 one blocker + one hindrance, R2 two hindrances, R3 two
hindrances, R4 one blocker + one hindrance, R5 one blocker + one hindrance. That's 10 bugs and 720 marks
for every team, but a different set per team. Every round has at least two hindrances to draw from, so no
bug is shared by every team.

How hard the two newest hindrances are (win rate with the prepared route, average teams): clean 84%,
with Q18 59%, with Q22 80% (strong teams on the balanced route: 98% → 59% with Q22). Both make the run
harder without making it impossible, which is what a hindrance should do. `node scripts/quest-verify.mjs` proves each bug fails
only its own test with zero guard regressions, and that every team's build fails exactly its own bugs.

## Hints (CTF tokens)

```bash
node scripts/quest-hints.mjs
```

Writes `organiser/hints/`:

- `ALL_HINTS.md`: every bug with its symptom, three hint levels and the fix (mentors only).
- `<team>.md`: just that team's bugs, numbered per round. This is what a mentor reads from.
- `hint-log.csv`: one row per hint given, to track each team's token spend.

Hints go one level at a time: Level 1 names the mechanic, Level 2 points to the code, Level 3 gives
the direction of the fix. No hint hands over the fix itself.

## Judging (rulebook rubric)

```bash
node scripts/quest-judge.mjs --team team03 --repo ../submissions/team03
```

```bash
node scripts/quest-judge.mjs --all --submissions ../submissions
```

Writes `organiser/results/` (one team: `<team>.csv` and `<team>.json`; all teams: `rubric.csv` and
`cards.json`). Each criterion is scored out of 100, then weighted as in the rulebook:

| Criterion | Weight | How it's scored |
| --- | --- | --- |
| Bug fixes | 35% | Automatic: share of the team's bug marks whose hidden tests now pass. |
| Game progression | 25% | Automatic, from the clean replay: 10 per room 1–4, 40 for beating Morvath, up to 20 for the share of readiness choices the forest judges good. |
| Code quality | 15% | Mentor fills it in the CSV. |
| Testing and stability | 15% | Automatic, earned (an untouched repo scores 0). Up to 60 for coverage: the team's own `server/test` suite runs on the original game with each of their bugs put back one at a time, and a bug counts when a test passes on the original and fails with that bug (weighted by bug points). Up to 40 for stability: the fix score scaled to 40, −10 per guard test the team broke. Tests that only run on the team's own refactors (new exports) fail on the original and don't count; the card lists them. |
| AI use | 10% | Mentor fills it in the CSV. |

The CSV's total column is a formula, so it updates as mentors fill in their two columns. The JSON
card lists each fixed bug, each judged decision and any integrity flags (edited profile, rejected
inputs, missing save).

## Organiser commands

```bash
node scripts/quest-teams.mjs --count 12
```

Creates `organiser/registry.json`: seeds, stats, team codes and bug mixes. Keep it private. Add
`--force` to replace an existing one.

```bash
node scripts/quest-verify.mjs
```

Run this before the event.

```bash
node scripts/quest-build.mjs --out ../builds
```

Writes one repo per team, with its profile and its bugs, and no hidden tests or model.

## API (for the 3D client)

Base `/api/quest`. Send the team code as the `x-team-code` header when the profile has one.

| Call | Does |
| --- | --- |
| `GET /meta` | Classes, rooms, corridors, enemies, NPCs, Morvath, Rune Strike, Pip, power-ups. |
| `GET /teams` | Team ids and names. |
| `POST /:team/session` · `GET /:team` | Current view: `{ team, note, state }`. `state.options` lists the legal map choices and `state.pip` Pip's offers. |
| `POST /:team/act` `{ action }` | One input; returns the new view. Errors are `{ ok: false, error: { code, message } }`. |
| `POST /:team/reset` | New run (the old save is archived). Same seed, same dice. |
| `GET /:team/save` | The save file to submit. |

Inputs:

| Where | Inputs |
| --- | --- |
| Start | `{type:'lead', memberId}` (`knight`, `mage`, `rogue` or `ranger`). |
| Map | `{type:'travel', to}`, `{type:'rest'}`, `{type:'altar'\|'forge', memberId}`, `{type:'trade', item:'potion'\|'meal'}`, `{type:'potion'\|'meal', targetId}`. |
| Fight | `{type:'attack', targetId}`, `{type:'defend'}`, `{type:'skill', targetId?}`, `{type:'rune', targetId}`, `{type:'potion'\|'meal', targetId}`, `{type:'retreat'}`, `{type:'wait'}`. |

The 3D client animates from `state.log` (newest lines last) and `state.lastRolls`.

## For the Blender teammate: asset contract

The game looks up each model by the `model` key in `server/src/quest/data.js`. Send `.blend` files;
`tools/blender/export_glb.py` turns each one into the game's `.glb`, checks the names and switches it
on. If your names differ, send the list and the keys will change instead of you renaming files.

```bash
blender -b room1.blend --python tools/blender/export_glb.py -- --key room_1
```

```bash
blender -b kael.blend --python tools/blender/export_glb.py -- --key char_kael --make-clips
```

`--make-clips` gives a rig without animations simple procedural clips (`tools/blender/make_clips.py`).
It finds bones by name (Mixamo, Rigify FK controls, or plain `thigh.L`-style), and works out the
rotations from the rest pose, so T-pose and A-pose rigs both work. Clips the file already has are
kept. `--height 1.8` rescales a model exported at the wrong size; `--turn` fixes a character that
faces the wrong way.

**The five rooms in the game** come from the teammate's files in `assets/blender/room_1.blend` …
`room_5.blend` (kept out of team builds). They're prepared and exported in one go:

```bash
blender -b --python tools/blender/prepare_room.py -- all
```

**The rooms are used as the artist made them**: same geometry, objects, scale, materials and lamps.
`tools/blender/prepare_room.py` opens each file (never saving it back) and only handles what glTF
can't carry:
- fog, smoke and fire **volumes** are left out (glTF would turn them into solid boxes; the game's fog
  stands in), as are render-hidden helpers; cameras aren't exported;
- curves become meshes, and **procedural node materials are baked** into textures (glTF can't carry
  node textures; they would turn white). Image-textured materials are untouched.

**Room 3 has its own build**, `tools/blender/build_room_3.py` (`blender -b --python
tools/blender/build_room_3.py`). The cathedral was too heavy for `prepare_room.py` (29.7 MB, black
bakes, broken chains), so this script decimates it to a triangle budget, bakes each object on its own
UVs, keeps the 16 lamps around the fight, measures the dais steps and blockers with rays, and exports
with **Draco** mesh compression (3.8 MB). The game decodes Draco with three.js's own decoder, served
from `client/public/draco/` (no CDN needed); `useGLTF.setDecoderPath('/draco/')` is set in
`QuestGame.jsx`.

The game's layout is **not** put into the room. It goes to a separate `room_N.layout.json` next to
the model: walkable areas and raised floors (from `tools/blender/rooms.json`), blockers for every
standing prop, and spawn points. The artist's own `spawn_*` empties are used where they were placed;
`rooms.json` only fills gaps.

In the game the room's lamps keep their exact strength (Blender's exporter multiplies watts by
683 lm/W; the game undoes that so each lamp is as bright as in Blender), with Blender's AgX tone
mapping and no added fill lights or effects. Only the number of lamps is capped (16), because a
browser can't light with dozens.

The dungeon map shows each room as a miniature on its tile: the same model, cropped to the arena
(using the layout file's walkable area plus 3 m of walls), sliced at 2.6 m by a clipping plane so you
look in like a diorama, and lit by one lamp per tile. The slice applies to the miniature's own copies
of the materials, so the full-size room is untouched. Low-spec mode shows simple towers instead.

To move a spawn or widen a walkable area, edit `rooms.json` (Blender metres, x east, y north) or move
the `spawn_*` empties in the .blend, and run it again.

**Rooms** (metres; all names optional):

| Name in Blender | Used for |
| --- | --- |
| `spawn_party_1` … `spawn_party_4` or `spawn_player_*` (empties) | Where the leader (1) and companions start |
| `spawn_npc_1` … (empties) | Where the room's NPCs stand |
| `spawn_enemy_1` … `spawn_enemy_N`, `spawn_boss` (empties) | Where minions and the boss appear |
| `collider…` (meshes) | Block movement (walls, pillars, crates); hidden in the game |
| `bounds…` / `walk_area…` (flat meshes) | The walkable area, as one or more boxes (`circle` in the name: a circle); hidden. Default: the room's outline |
| `nav…` (meshes) | Simple hidden floors for the ground check; when present, only these count |
| `floor…` / `ground…` (meshes) | What characters stand on (steps and platforms work, and you can jump onto them). Default: every visible mesh |

Without spawn empties the party starts on the −X side and the enemies on +X.

**Characters:** face −Y (Blender's front view), feet at the origin, about 1.8 m tall (bosses
bigger). Models are toon-shaded with an ink outline in the game automatically, keeping their colours
and textures; add `"toon": false` to the model's manifest entry to keep the original look.

| Model key | What |
| --- | --- |
| `room_1` … `room_5` | Gate Courtyard, Hall of Portraits, Hall of Trials, Hollow Barracks, Throne of Eternity. Put empties named `spawn_party_1..4`, `spawn_enemy_1..4` and `spawn_boss` where characters stand. |
| `char_kael`, `char_lyra`, `char_rook`, `char_mira` | The party: knight, mage, rogue, ranger. |
| `enemy_skeleton` | Every room's villains, the Throne's guards and Morvath's summons. Shipped (`enemy_skeleton.glb`, clips `Idle` and `Run`). |
| `enemy_shadow_crawler`, `enemy_ink_bat`, `enemy_hollow_scribe`, `enemy_trial_spirit`, `enemy_hollow_knight` | The old minions; no room places them now. |
| `boss_stone_sentinel`, `boss_ink_wraith`, `boss_brakka`, `boss_hollow_captain` | The old room bosses; no room places them now. |
| `boss_morvath_knight`, `boss_morvath_dragon` | Morvath before and after the Change. |
| `npc_king_ghost`, `npc_grum`, `npc_ilsa`, `npc_venn`, `npc_seraphine`, `npc_corin`, `npc_pip` | NPCs (idle only). |

Animation clips, named exactly (case and `Armature|` prefixes don't matter): `idle`, `run` (or
`walk`), `jump`, `attack`, `skill`, `hit`, `defend`, `death`, `victory`. The game crossfades idle,
run and jump as the character moves, and plays the others when the engine says so. Morvath also uses
`boss_strike` (one-target hit), `boss_sweep` (hits everyone, including the breath), `transform`
(the Change) and `armour_break` (Rune Strike shatters the armour). Flyers (ink bat, ink wraith)
should hover in `idle`.

## The 3D client

`client/src/quest/` is the default page (the old voting game is at `/#/legacy`, the dashboard at `/#/admin`).

| File | What |
| --- | --- |
| `QuestApp.jsx` | Title screen and team login (team + code), remembered in this browser. |
| `QuestGame.jsx` | Holds the server state and draws the HUD: party formation, party cards, action bar with reach, the round clock and the ability keys (F, E, Q, R, H, G, X), movement keys feeding `world.js`, enemy list with Morvath's phase and armour panel, NPC dialogue box, quest tracker and quest log (**J**), banners, chronicle with dice, the Journey panel with camp and Pip's Pot, end screen with "Download save". |
| `banners.js` | Works out the anime-style banners from two states. |
| `events.js` | Turns new chronicle lines into timed animation cues, so a round plays as a sequence: lunge, hit, damage number, fall. |
| `scene/Scene.jsx` | The canvas, lights, fog, the map camera and the third-person follow camera (drag, ← →, wheel). |
| `scene/world.js` | Movement in a fight: WASD and jump physics, walls, reach, companion roles, enemy approach. No React or three.js, so it's unit-tested (`client/test/quest-world.test.js`). |
| `scene/toon.js` | Turns a Blender model's materials into toon shading and adds the ink outline. |
| `scene/MapView.jsx` | Camp (with King Aldric's ghost and Pip) and rooms as hex platforms joined by corridors. Each rune rim turns from red to gold when its room is cleared. |
| `scene/Arena.jsx` | The fight room (a themed stand-in, or the Blender room with its spawns, colliders and floors), the NPCs, and everyone moving each frame. |
| `scene/Actor.jsx` | One character: the Blender `.glb` if it's listed in `client/public/models/manifest.json`, else a placeholder. Plays idle/run/jump with movement and the engine's clips on cue. Shows Morvath's shadow armour as a shell. |
| `scene/placeholders.jsx` | A stand-in silhouette per model key, cel-shaded with ink outlines. |

**Adding Blender models:** copy `name.glb` into `client/public/models/` and add `"name"` to
`manifest.json`. That key switches from placeholder to model; nothing else changes. Clips play by the
names in the asset contract above; a missing clip just doesn't play. A "Low spec" toggle turns off
shadows for slow laptops.
