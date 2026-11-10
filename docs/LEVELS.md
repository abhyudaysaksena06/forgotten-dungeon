# Level walkthrough — what happens, and when

What a player sees in each of the five rooms, in order, with timings. Fight lengths come from the
simulator: 200 average-tier teams playing carefully (Kael alone with sword and shield, the careful
route planner, boldness 1.2, every open cage used). Real time assumes a player acts about every 3 seconds; idle players get the 6-second round
clock. Enemy numbers are base values; they grow with the room's tier and with every room already
cleared (+12% per tier above 1, +6% per room cleared).

## Every fight, the same skeleton

| When | What happens |
| --- | --- |
| Click a room on the map | 1–2 torches spent. The camera glides from the map into the room (about 1 s). |
| 0 s | **BATTLE START!** banner (1.5 s). The narrator sets the scene in the dialogue box. The quest tracker shows the room's quest. Kael stands at the south spawn, the skeletons to the north, and the room's **cage** (Healer and Weaponsmith behind locked bars) at the side. |
| From 0 s | The skeletons start walking toward Kael at once. His shield takes their blows before his health does. |
| Each round | The player acts (F, right-click, E, Q, R, H, G) or, after **6 s** of doing nothing, the round plays out anyway. Kael acts, then the skeletons; the animations take about 2–2.5 s (0.3 s per fighter). Every blow that lands dulls and wears the Iron Sword. |
| Six skeletons | Rooms 1–4 hold six skeletons; rooms 3 and 4 have a boss who steps out after all six are down: the **Hell Nemesis** and the **Hollow King**. Three stand at the room's enemy spawns, the rest in a row behind them. |
| Last skeleton down | **VICTORY!** (1.7 s) with "The cage is open" (or "The cage stays shut: n broken runes left in this round" while the round's bugs are still in the code), then **QUEST CLEAR!** (2.2 s), then **LEVEL UP!** (1.5 s) if Kael levelled. A Heart fragment, gold, potions and XP. The room stays on screen: the cage doors swing open once the round has no broken runes. |
| The open cage | Opens only when the room is cleared **and** the round's glitches (bugs) are fixed in the code. Walk up to the Healer's door and press **E** (health and shield back to full), then to the Weaponsmith's (sharpness and durability back to full). Free, and open again whenever Kael comes back. Then choose the next room from the Journey list. |
| Kael falls | **DEFEATED…** (1.9 s). He wakes at the camp at 30% health and shield, minus 2 torches and half the gold. The room resets. |

A clean playthrough takes about **6–10 minutes**: 4–7 minutes of fighting and 1–3 minutes on the map
and at the camp. Each Blender room preloads while you're on the map, so a fight starts at once.

## Level 1 — The Gate Courtyard (Round 1, "The Entrance")

- **Getting there:** 1 torch from the camp. Open from the start.
- **On entering:** *"The gate grinds open on a courtyard of bones."* Quest: **Mind the Courtyard**.
- **Room:** a candle-lit vault with a pentagram floor, corner piers, the throne with a skeleton to the
  north, lecterns, crates and a barrel.
- **Enemies:** 6 Skeletons (65 HP, ATK 12, DEF 5). Every second one to fall drops a monster part
  for Pip: three a room, enough for one Monster Meal.
- **Length:** about **16 rounds** (14–17). Roughly **50–95 s**. About 17% of Kael's health is lost
  (after his shield); every careful first attempt wins.
- **Reward:** fragment 1, 40 gold, 1 potion, 100 XP. The gate's runes turn gold and the cage opens.
- **Opens next:** The Three Trials and The Last Loyal Knight quests appear.

## Level 2 — The Hall of Portraits (Round 2, "The Forgotten Hall")

- **Getting there:** 1 torch from the camp. Open from the start.
- **On entering:** painted eyes follow Kael; one portrait shows the King and Morvath laughing together.
  Quest: **The Unfinished Portraits**.
- **Room:** a stone hall with glowing lava cracks, pedestals, braziers and a burning pentagram.
- **Enemies:** 6 Skeletons, 15% stronger than in room 1 (and 7% more for every room already
  cleared), then 5% off: round 2 is a gentler step.
- **Length:** about **20 rounds** (17–22). Roughly **60–120 s**. About 41% of Kael's health is lost;
  96% of attempts win.
- **Reward:** fragment, 60 gold, 1 potion, 200 XP. Round 2's skeletons are 5% weaker than the curve, and Kael comes in at level 2. The cage at the hall's side swings open.

## Level 3 — The Hall of Trials (Round 3, "The Trial Chambers")

- **Getting there:** 2 torches from the camp (through the Gate Courtyard).
- **On entering:** a cathedral of candles around the Hollow Saint's tomb. Quest: **The Three Trials**.
- **Room:** the Hollow Saint's cathedral. Kael enters from the nave in the south into a round
  rotunda with the saint's tomb on a raised dais (you can step up onto it).
- **Enemies:** 6 Skeletons, 30% stronger than in room 1 (plus progress). Only when all six are down
  does the **Hell Nemesis** step out (**BOSS BATTLE!** banner): 150 HP, ATK 15, DEF 4 before scaling.
  Kael catches his breath as it appears: his shield is full again and he gets 25% of his health
  back (no breather before Morvath). Its moves:
  - **Hellfire Charge**, every third round: it lowers its head at the lane Kael stands in ("Move
    out!"), and the next round dashes down it for 1.6× its attack. Step into another lane.
  - **Enraged** below half health, once (**ENRAGED!** banner, hellfire glowing inside it): +25% to
    its blows, and a special every second round instead of every third.
  - **Infernal Slam**, enraged, alternating with the Charge: it raises its blade over its head
    and the next round slams it into the floor, a shockwave of hellfire across **all three lanes**
    (1.3× its attack). No lane is safe: **Defend (R)** or **Bulwark (E)** halves it.
- **Length:** about **40 rounds** (37–43), 17 of them against the Nemesis. Roughly **2–4 minutes**.
  Kael ends about 40% down on health (after the breather); 53% of first attempts win: the room where
  a weaker Kael starts to fall. Still easier than room 4 (25% of first attempts straight from round 2), and the route
  planner knows it.
- **Reward:** fragment, 80 gold, 2 potions, 300 XP. *"The last skeleton falls apart, and the
  chamber goes quiet."*

## Level 4 — The Hollow Barracks (Round 4, "The Shadow Depths")

- **Getting there:** 2 torches from the camp (through the Hall of Portraits).
- **On entering:** chains sway overhead; six skeletons stand to attention. Quest: **The Last Loyal Knight**.
- **Room:** a high barracks hall with two rows of piers, a ringed floor and chains overhead.
- **Enemies:** 6 Skeletons, 45% stronger than in room 1 (plus progress), then 5% off (`ease`). Only when all six are down
  does the **Hollow King** rise (**BOSS BATTLE!** banner): the barracks' dead king, crowned by Morvath
  in hollow iron, 3.4 m tall. 110 HP, ATK 16, DEF 4 before scaling. Kael catches his breath first
  (full shield, +25% health). His moves:
  - **Shadow Tide**, every third round: he raises a tide over **two of the three lanes** (they glow
    venom green, "Move out!"), and the next round plunges his blade into the floor and floods them
    for 0.8× his attack **plus poison** (4 a round for 3 rounds). Stand in the dry lane.
  - **The roar**, below half health, once: two Skeletons claw out of the floor. The room is not won
    while they stand.
- **Length:** about **42 rounds** (40–45), 18 of them against the King. Kael ends about half down
  on health; 25% of first attempts win straight from round 2 (r1 → r2 → r4); the route through room 3 is still the stronger play.
- **Reward:** fragment, 100 gold, 2 potions, 400 XP. *"Their line is broken. The Fortress Gate is open."*

## Level 5 — The Throne of Eternity (Round 5, "The Boss Round")

- **Getting there:** opens with **3 Heart fragments**; reached through the Hall of Trials or the
  Barracks. There is **no retreat**.
- **On entering:** **FINAL BATTLE** banner. Morvath: *"You fixed my dungeon, Runewright. Clever.
  But some wishes cannot be undone."* Quest: **The Throne of Eternity**.
- **Room:** the blood-castle arena: towers all round, summoning circles on the floor and the great
  dragon on its pedestal to the north.
- **First wave:** six brittle skeleton guards (10 HP, ATK 0): about **2–3 rounds**, then the
  **BOSS BATTLE!** banner as Morvath steps out.
- **Then:** Morvath (350 HP, DEF 8, **+35% for every room cleared beyond three**: the map shows his strength). He **announces his next move every round** (top-right
  panel). His **shadow armour** blocks all damage until the leader's **Rune Strike** (Q or
  middle-click) breaks it; it grows back after 3 rounds.

| Phase | Starts | Lasts (avg) | What he does |
| --- | --- | --- | --- |
| 1 · The Shadow Knight | 100% HP | 9 rounds | Shadow Blade (27) or Black Sweep (11) |
| 2 · The Change | below 60% | 18 rounds | **THE CHANGE** banner: he becomes the Shadow Dragon and 2 Skeletons burst from the floor. **Each living skeleton heals him 10 HP a round**: kill them first. Dragon Claw (27) or Shadowflame (11 + poison) |
| 3 · Dragon's Breath | below 30% | 13 rounds | **DRAGON'S BREATH** banner. He alternates: draws in fire (no damage, a warning), then Dragon's Breath (36 in **two of the three lanes**, red on the floor). Stand in the safe lane. **Defend (R) on the warning** halves it |

- **Length:** about **47 rounds** with the guards (41–52). Roughly **2.5–5 minutes**. It costs about
  78% of Kael's health. A careful average Kael wins **49%** of his attempts; one who cleared all four
  rooms first faces a 135% Morvath and wins far less. A Kael who never uses Rune Strike can't win.
  Overall, about **42%** of careful average runs reach the ending.
- **Ending:** **VICTORY!**, the fifth fragment, the ending scene (King Aldric forgives Morvath) and
  the end screen with "Download save".

## Where the bugs show up

Useful for mentors when a team says "it's broken here".

| Level | Bugs a team might hit there |
| --- | --- |
| Map / camp | Q02 buttons swapped, Q11 double torch cost, Q13 no waystones, Q07 altar, Q10 rest, Q15 Pip, Q14 loot (after any win) |
| A cleared room's cage | Q06 the Healer leaves the shield broken, Q19 the Weaponsmith barely mends the sword |
| Any fight | Q16 the shield doesn't stop blows, Q17 potions, Q08 fights never end, Q18 slow levelling (visible from level 2) |
| Level 2 onward | Q04 enemies shrug off hits |
| Level 5 | Q01 Rune Strike never counts (a round-1 bug in the start state), Q03 throne never opens, Q09 armour never breaks, Q12 Rune Strike never recharges, Q22 armour back too soon, Q20 Defend useless vs breath, Q21 no victory |
| After a restart | Q05 long runs rewind |
