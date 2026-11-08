# Level walkthrough — what happens, and when

What a player sees in each of the five rooms, in order, with timings. Fight lengths come from the
simulator: 200 average-tier teams playing carefully (all four leaders, clearing rooms before
Morvath). Real time assumes a player acts about every 3 seconds; idle players get the 6-second round
clock. Enemy numbers are base values; they grow with the room's tier and with every room already
cleared (+12% per tier above 1, +6% per room cleared).

## Every fight, the same skeleton

| When | What happens |
| --- | --- |
| Click a room on the map | 1–2 torches spent. The camera glides from the map into the room (about 1 s). |
| 0 s | **BATTLE START!** banner (1.5 s). The room's NPC speaks in the dialogue box. The quest tracker shows the room's quest. The party stands at the south spawn, enemies to the north, and the camera faces them. |
| From 0 s | Enemies start walking toward the nearest hero at once. Kael steps forward to guard, Rook flanks, Mira backs off to about 6 m, Lyra stays behind whoever is hurt. |
| Each round | The player acts (F, right-click, E, Q, R, H, G) or, after **6 s** of doing nothing, the round plays out anyway. Everyone acts in turn; the animations take about 2–2.5 s (0.3 s per fighter). |
| Every 3rd round | The room boss uses its special move (below). |
| Minions down | **BOSS BATTLE!** banner (1.7 s); the boss appears at the north spawn. The tracker ticks "Defeat …". |
| Boss down | **VICTORY!** (1.7 s), then **QUEST CLEAR!** (2.2 s), then **LEVEL UP!** (1.5 s) if anyone levelled. The NPC's closing line. Back to the map with a Heart fragment, gold, potions and XP. |
| Whole party falls | **DEFEATED…** (1.9 s). The party wakes at the camp at 30% HP, minus 2 torches and half the gold. The room resets. |

A clean playthrough takes about **6–10 minutes**: 4–7 minutes of fighting and 1–3 minutes on the map
and at the camp. Each Blender room preloads while you're on the map, so a fight starts at once.

## Level 1 — The Gate Courtyard (Round 1, "The Entrance")

- **Getting there:** 1 torch from the camp. Open from the start.
- **On entering:** Old Grum, the gatekeeper, stands by the west door: *"Another one? The last
  visitor came four hundred years ago."* Quest: **Mind the Courtyard**.
- **Room:** a candle-lit vault with a pentagram floor, corner piers, the throne with a skeleton to the
  north, lecterns, crates and a barrel.
- **Wave 1:** 3 Shadow Crawlers (34 HP, ATK 11, DEF 3). Each drops a monster part for Pip.
- **Boss:** the Stone Sentinel (150 HP, ATK 16, DEF 6). Every 3rd round it **charges down the most
  crowded lane** (160% damage). The lane glows red a round ahead: spread out and step aside.
- **Length:** about **7 rounds** (6–8): minions 2.6, Sentinel 4.3. Roughly **25–45 s**. About 13% of
  the party's HP is lost.
- **Reward:** fragment 1, 40 gold, 1 potion, 70 XP each. Grum: *"You fixed it. Take the fragment."*
- **Opens next:** The Three Trials and The Last Loyal Knight quests appear.

## Level 2 — The Hall of Portraits (Round 2, "The Forgotten Hall")

- **Getting there:** 1 torch from the camp. Open from the start.
- **On entering:** Ilsa, the ink-keeper: *"The answer is written somewhere in these portraits…"* A
  portrait shows the King and Morvath laughing together. Quest: **The Unfinished Portraits**.
- **Room:** a stone hall with glowing lava cracks, pedestals, braziers and a burning pentagram.
- **Wave 1:** 2 Ink Bats (26 HP, flying) and a Hollow Scribe (40 HP, ATK 13).
- **Boss:** the Ink Wraith (160 HP, ATK 17, flying). Every 3rd round it **drains** a hero and heals
  itself. Every 4th round it **hides in a portrait** in one lane (purple on the floor) for 2 rounds:
  only heroes standing in that lane can hit it, or Mira's Volley tears it out.
- **Watch out:** melee leaders (Kael, Rook) **can't hit flyers**. Lyra's magic and Mira's arrows
  (and her Volley) do the work, so the boss phase is the longest of the early rooms.
- **Length:** about **14 rounds** (12–17): minions 3.4, Wraith 11. Roughly **45–90 s**. The healing
  roughly keeps up with the damage here.
- **Reward:** fragment, 60 gold, 1 potion, 140 XP each. Ilsa: *"Friendship. That was the word."*

## Level 3 — The Hall of Trials (Round 3, "The Trial Chambers")

- **Getting there:** 2 torches from the camp (through the Gate Courtyard).
- **On entering:** Seraphine and Venn wait at the sides of the rotunda. Seraphine: *"Three trials
  guard the Heart."* Venn: *"Bring me the right page, Runewright."* Quest: **The Three Trials**.
- **Room:** the Hollow Saint's cathedral. The party enters from the nave in the south into a round
  rotunda with the saint's tomb on a raised dais (you can step up onto it).
- **Wave 1:** 3 Trial Spirits (48 HP, ATK 14, DEF 5).
- **Boss:** Brakka the Warrior (210 HP, ATK 18). Every 3rd round he **slams** the ground (60% to
  everyone). Two rounds in four he takes a **counter stance**: hits on him do half and he strikes
  back, so defend or heal instead of swinging. He **yields at 20% HP**; that counts as a win.
- **Length:** about **12–13 rounds** (11–14): spirits 5.1, Brakka 7.4. Roughly **40–75 s**. About 15%
  of the party's HP is lost.
- **Reward:** fragment, 80 gold, 2 potions, 210 XP each. Brakka: *"Hit hard enough. It counts."*

## Level 4 — The Hollow Barracks (Round 4, "The Shadow Depths")

- **Getting there:** 2 torches from the camp (through the Hall of Portraits).
- **On entering:** Sir Corin, by the north dais: *"Morvath isn't hiding with the shadows. He became
  one."* Quest: **The Last Loyal Knight**.
- **Room:** a high barracks hall with two rows of piers, a ringed floor and chains overhead.
- **Wave 1:** 2 Shadow Crawlers and a Hollow Knight (50 HP, ATK 15, DEF 6).
- **Boss:** the Hollow Captain (240 HP, ATK 19, DEF 9). Every 3rd round he floods **two of the three lanes** with a shadow tide (80% damage plus poison),
  marked red a round ahead: find the safe lane.
- **Length:** the longest fight: about **19–20 rounds** (18–21). Minions 4.4, Captain 15. Roughly
  **60–120 s**. About 27% of the party's HP is lost; a careful average team wins 84% of attempts.
- **Reward:** fragment, 100 gold, 2 potions, 280 XP each. Corin: *"The Fortress Gate is open."*

## Level 5 — The Throne of Eternity (Round 5, "The Boss Round")

- **Getting there:** opens with **3 Heart fragments**; reached through the Hall of Trials or the
  Barracks. There is **no retreat**.
- **On entering:** **FINAL BATTLE** banner. Morvath: *"You fixed my dungeon, Runewright. Clever.
  But some wishes cannot be undone."* Quest: **The Throne of Eternity**.
- **Room:** the blood-castle arena: towers all round, summoning circles on the floor and the great
  dragon on its pedestal to the north.
- **Only enemy:** Morvath (850 HP, DEF 8, **+35% for every room cleared beyond three**: the map shows his strength). He **announces his next move every round** (top-right
  panel). His **shadow armour** blocks all damage until the leader's **Rune Strike** (Q or
  middle-click) breaks it; it grows back after 3 rounds.

| Phase | Starts | Lasts (avg) | What he does |
| --- | --- | --- | --- |
| 1 · The Shadow Knight | 100% HP | 5.8 rounds | Shadow Blade (36 to one hero) or Black Sweep (15 to all) |
| 2 · The Change | below 60% | 6.4 rounds | **THE CHANGE** banner: he becomes the Shadow Dragon and 2 Shadow Crawlers burst from the floor. **Each living crawler heals him 10 HP a round**: kill them first. Dragon Claw (36 to one) or Shadowflame (14 to all + poison) |
| 3 · Dragon's Breath | below 30% | 6.5 rounds | **DRAGON'S BREATH** banner. He alternates: draws in fire (no damage, a warning), then Dragon's Breath (48 to everyone in **two of the three lanes**, red on the floor). Stand in the safe lane. **Defend (R) on the warning** halves it |

- **Length:** about **19 rounds** (17–22). Roughly **60–110 s**. It costs about 80% of the party's HP.
  A careful average team wins **44%** of its attempts; a team that cleared all four rooms first faces a
  135% Morvath and wins far less. A leader who never uses Rune Strike can't win. Overall, fewer than
  30% of runs reach the ending.
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
