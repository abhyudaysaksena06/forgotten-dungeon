# Level walkthrough — what happens, and when

What a player sees in each of the five rooms, in order, with timings. Fight lengths come from the
simulator: 200 average-tier teams playing carefully (all four leaders, the careful route planner,
boldness 1.2), measured after the switch to skeleton rooms. Real time assumes a player acts about every 3 seconds; idle players get the 6-second round
clock. Enemy numbers are base values; they grow with the room's tier and with every room already
cleared (+12% per tier above 1, +6% per room cleared).

## Every fight, the same skeleton

| When | What happens |
| --- | --- |
| Click a room on the map | 1–2 torches spent. The camera glides from the map into the room (about 1 s). |
| 0 s | **BATTLE START!** banner (1.5 s). The room's NPC speaks in the dialogue box. The quest tracker shows the room's quest. The party stands at the south spawn, enemies to the north, and the camera faces them. |
| From 0 s | Enemies start walking toward the nearest hero at once. Kael steps forward to guard, Rook flanks, Mira backs off to about 6 m, Lyra stays behind whoever is hurt. |
| Each round | The player acts (F, right-click, E, Q, R, H, G) or, after **6 s** of doing nothing, the round plays out anyway. Everyone acts in turn; the animations take about 2–2.5 s (0.3 s per fighter). |
| Six skeletons | Rooms 1–4 hold six skeletons and no boss. Three stand at the room's enemy spawns, the rest in a row behind them. |
| Last skeleton down | **VICTORY!** (1.7 s), then **QUEST CLEAR!** (2.2 s), then **LEVEL UP!** (1.5 s) if anyone levelled. The NPC's closing line. Back to the map with a Heart fragment, gold, potions and XP. |
| Whole party falls | **DEFEATED…** (1.9 s). The party wakes at the camp at 30% HP, minus 2 torches and half the gold. The room resets. |

A clean playthrough takes about **6–10 minutes**: 4–7 minutes of fighting and 1–3 minutes on the map
and at the camp. Each Blender room preloads while you're on the map, so a fight starts at once.

## Level 1 — The Gate Courtyard (Round 1, "The Entrance")

- **Getting there:** 1 torch from the camp. Open from the start.
- **On entering:** Old Grum, the gatekeeper, stands by the west door: *"Another one? The last
  visitor came four hundred years ago."* Quest: **Mind the Courtyard**.
- **Room:** a candle-lit vault with a pentagram floor, corner piers, the throne with a skeleton to the
  north, lecterns, crates and a barrel.
- **Enemies:** 6 Skeletons (65 HP, ATK 12, DEF 5). Every second one to fall drops a monster part
  for Pip: three a room, enough for one Monster Meal.
- **Length:** about **10 rounds** (9–10). Roughly **30–60 s**. About 27% of the party's HP is lost:
  the first room is the sharpest test for a level-1 party.
- **Reward:** fragment 1, 40 gold, 1 potion, 70 XP each. Grum: *"You fixed it. Take the fragment."*
- **Opens next:** The Three Trials and The Last Loyal Knight quests appear.

## Level 2 — The Hall of Portraits (Round 2, "The Forgotten Hall")

- **Getting there:** 1 torch from the camp. Open from the start.
- **On entering:** Ilsa, the ink-keeper: *"The answer is written somewhere in these portraits…"* A
  portrait shows the King and Morvath laughing together. Quest: **The Unfinished Portraits**.
- **Room:** a stone hall with glowing lava cracks, pedestals, braziers and a burning pentagram.
- **Enemies:** 6 Skeletons, 12% stronger than in room 1 (and 6% more for every room already
  cleared).
- **Length:** about **12 rounds** (11–13). Roughly **40–75 s**. About 7% of the party's HP is lost;
  95% of attempts win.
- **Reward:** fragment, 60 gold, 1 potion, 140 XP each. Ilsa: *"Friendship. That was the word."*

## Level 3 — The Hall of Trials (Round 3, "The Trial Chambers")

- **Getting there:** 2 torches from the camp (through the Gate Courtyard).
- **On entering:** Seraphine and Venn wait at the sides of the rotunda. Seraphine: *"Three trials
  guard the Heart."* Venn: *"Bring me the right page, Runewright."* Quest: **The Three Trials**.
- **Room:** the Hollow Saint's cathedral. The party enters from the nave in the south into a round
  rotunda with the saint's tomb on a raised dais (you can step up onto it).
- **Enemies:** 6 Skeletons, 24% stronger than in room 1 (plus progress).
- **Length:** about **14 rounds** (13–15). Roughly **45–85 s**. About 17% of the party's HP is lost;
  80% of attempts win.
- **Reward:** fragment, 80 gold, 2 potions, 210 XP each. *"The last skeleton falls apart, and the
  chamber goes quiet."*

## Level 4 — The Hollow Barracks (Round 4, "The Shadow Depths")

- **Getting there:** 2 torches from the camp (through the Hall of Portraits).
- **On entering:** Sir Corin, by the north dais: *"Morvath isn't hiding with the shadows. He became
  one."* Quest: **The Last Loyal Knight**.
- **Room:** a high barracks hall with two rows of piers, a ringed floor and chains overhead.
- **Enemies:** 6 Skeletons, 36% stronger than in room 1 (plus progress).
- **Length:** about **12 rounds** (10–12). Roughly **40–75 s**. About 16% of the party's HP is lost.
  Careful teams rarely come here: most take rooms 1–3 and go to the Throne (11 of 200 in the
  simulator did).
- **Reward:** fragment, 100 gold, 2 potions, 280 XP each. Corin: *"Their line is broken. The Fortress
  Gate is open."*

## Level 5 — The Throne of Eternity (Round 5, "The Boss Round")

- **Getting there:** opens with **3 Heart fragments**; reached through the Hall of Trials or the
  Barracks. There is **no retreat**.
- **On entering:** **FINAL BATTLE** banner. Morvath: *"You fixed my dungeon, Runewright. Clever.
  But some wishes cannot be undone."* Quest: **The Throne of Eternity**.
- **Room:** the blood-castle arena: towers all round, summoning circles on the floor and the great
  dragon on its pedestal to the north.
- **First wave:** six brittle skeleton guards (10 HP, ATK 0): about **2–3 rounds**, then the
  **BOSS BATTLE!** banner as Morvath steps out.
- **Then:** Morvath (725 HP, DEF 8, **+35% for every room cleared beyond three**: the map shows his strength). He **announces his next move every round** (top-right
  panel). His **shadow armour** blocks all damage until the leader's **Rune Strike** (Q or
  middle-click) breaks it; it grows back after 3 rounds.

| Phase | Starts | Lasts (avg) | What he does |
| --- | --- | --- | --- |
| 1 · The Shadow Knight | 100% HP | 9 rounds | Shadow Blade (36 to one hero) or Black Sweep (15 to all) |
| 2 · The Change | below 60% | 13 rounds | **THE CHANGE** banner: he becomes the Shadow Dragon and 2 Skeletons burst from the floor. **Each living skeleton heals him 10 HP a round**: kill them first. Dragon Claw (36 to one) or Shadowflame (14 to all + poison) |
| 3 · Dragon's Breath | below 30% | 14 rounds | **DRAGON'S BREATH** banner. He alternates: draws in fire (no damage, a warning), then Dragon's Breath (48 to everyone in **two of the three lanes**, red on the floor). Stand in the safe lane. **Defend (R) on the warning** halves it |

- **Length:** about **39 rounds** with the guards (31–41). Roughly **2–4 minutes**. It costs about
  76% of the party's HP. A careful average team wins **13%** of its attempts; a team that cleared all
  four rooms first faces a 135% Morvath and wins far less. A leader who never uses Rune Strike can't
  win. Overall, about **17%** of careful average runs reach the ending (14% before the skeleton
  rooms, measured the same way).
- **Ending:** **VICTORY!**, the fifth fragment, the ending scene (King Aldric forgives Morvath) and
  the end screen with "Download save".

## Where the bugs show up

Useful for mentors when a team says "it's broken here".

| Level | Bugs a team might hit there |
| --- | --- |
| Map / camp | Q02 buttons swapped, Q11 double torch cost, Q13 no waystones, Q07 altar, Q10 rest, Q15 Pip, Q14 loot (after any win) |
| Any fight | Q01 wrong hero, Q06 Lyra heals the wrong allies, Q16 Bulwark, Q17 potions, Q19 shared cooldowns, Q08 fights never end, Q18 slow levelling (visible from level 2) |
| Level 2 onward | Q04 enemies shrug off hits |
| Level 5 | Q03 throne never opens, Q09 armour never breaks, Q12 Rune Strike never recharges, Q22 armour back too soon, Q20 Defend useless vs breath, Q21 no victory |
| After a restart | Q05 long runs rewind |
