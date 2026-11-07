# The Forgotten Dungeon — refined design

> **Superseded.** This is the design of the earlier voting-game build (`server/src/engine`, `rooms`, `dm`).
> The current round is The Shattered Heart in [QUEST.md](QUEST.md), which drops the Client Calls.

The clean reference build for a 90-minute **single-player** debugging round. One human hero plays alongside three
AI companions. Participants receive a scrambled copy, fix the Curses, ship two Client Calls, then play their build
for bonus points. How to run the day is in [ROUND.md](ROUND.md).

Core rule, unchanged: **the AI tells the story, the server runs the rules, the database remembers.**

---

## 1. Decisions still open

1. **How many Curses to plant.** All 14 is heavy for 80 minutes. The runbook recommends 10 for students
   (`--curses E1,E2,E3,E4,M1,M3,M4,A1,A4,R2`).
2. **Bonus conversion.** The runbook uses Hero Score ÷ 4 (max 100). Change it if the bonus should weigh more.
3. **Trusting the final run.** Participants play their own build, so they could tamper with it. The cheapest guard
   is an organiser watching each final run live ("Watch a run" with the run code) and reading the score off the
   end screen. A stronger guard, not built: replay the run's action log on the clean engine and compare scores. The
   engine is deterministic for a given seed, so this is feasible.
4. **LLM or scripted narrator.** Scripted is the default and needs nothing. With `DM_PROVIDER=anthropic`, M2 and R1
   become visible in play rather than only in the tests.

---

## 2. Single-player rules

| Topic        | Rule                                                                                                                                                                                                                                                                  |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Party        | The hero picks a class; one AI companion joins for each other class: Brannoc (Warrior), Ysolde (Mage), Quill (Rogue), Maren (Healer). A second name is used if the hero takes the first.                                                                  |
| Runs         | One hero per run. A run code lets anyone **watch** (read-only spectating). A refresh re-claims the same hero via the saved token. A second join is refused.                                                                                                  |
| Votes        | When a room opens, the companions vote at once, each with a one-line reason. **The hero's vote counts 2**, each companion's 1. The vote closes when the hero votes, or after 30 s. Ties go to the Fate Die. If the hero has Fallen, the companions decide after a 2-second beat. |
| Who rolls    | The best-suited hero among those who voted for the winner (often a companion).                                                                                                                                                                                       |
| Combat       | Companions commit their actions when the round opens, after seeing the King's telegraph. The round resolves when the hero acts, or after 30 s (no action means Defend). With the hero Fallen or Stunned, rounds resolve after a 2-second beat.                       |
| Companion AI | Deterministic rules (`server/src/engine/npc.js`), so the same seed and choices replay identically. They revive with charms, the Healer Mends below 60%, the Warrior raises Shield Wall against Grave Wail, the Mage bursts groups, they drink below 35%, and they defend when Crown Strike targets them at low HP. Between rooms they equip, cure, drink and Mend. |
| Orders       | (Client Call 2) `/w <Companion> attack \| defend \| support \| free` sets a standing order from the next round. It is private: never in the log, the public state, spectator sockets or the DM's context.                                                            |

Everything else (checks, combat math, status, items, stages, shards, checkpoints, Hero Score) is as the original
sheet describes. The details are listed below.

| Topic      | Rule                                                                                                                                                                                                 |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Checks     | d20 + 3 if the skill is the class's specialty, vs DC 8/12/16. Nat 20: critical success. Meet or beat: success. Miss by 1–4: partial (−5 HP, no reward). Miss by 5+: fail. Nat 1: the trap hits everyone. DCs are hidden until Scout. |
| Abilities  | Shield Wall (CD 3), Arcane Burst (CD 3, cannot miss), Scout (CD 2), Mend (CD 2, +20 or revive at 20). Cooldown N means usable again N rounds later.                                                  |
| Attack     | d20: 1–4 miss, 5–19 hit, 20 double. Damage = ATK + d6 − DEF, minimum 1. Defend and Shield Wall each halve, rounding up, and they stack.                                                                |
| Items      | 6 slots. Every hero starts with 2 potions plus a class kit. Using an item in combat is your action for the round.                                                                                    |
| No soft-lock | Key items are always granted. A lost key costs 5 HP each to batter the door down.                                                                                                                  |

## 3. The King (tuned for hero + 3 companions)

HP **140 + 60 per hero = 380**, DEF 2. He telegraphs every round: **Crown Strike 35** to one named hero, or **Grave
Wail 12** to all plus poison. Below 66% HP he summons two thralls (once); below 33% he enrages for +5 (once). All 5
Memory Shards double the first hit on him. The sheet's 100/25/10 made the fight unloseable with three competent
companions.

`node server/scripts/balance.mjs`, 40 seeded runs per class, wins:

| Hero class | Careless (always attacks, first option) | Careful (reads the telegraph, heals, defends) |
| ---------- | --------------------------------------- | --------------------------------------------- |
| Warrior    | 30%                                      | 83%                                           |
| Mage       | 20%                                      | 95%                                           |
| Rogue      | 50%                                      | 90%                                           |
| Healer     | 3%                                       | 90%                                           |

So the final run rewards playing well, which is what a bonus should do.

## 4. Client Calls (the two mid-round updates)

The scripts and acceptance criteria are in `server/src/admin/calls.js` and appear on the dashboard once released.
In the clean source, each feature is wrapped in `#region C1 …` / `#region C2 …` blocks. The scrambler replaces
those blocks with the stubs in `scramble/curses.mjs`.

| Call | Participant build starts with                                                                                        | Done when (hidden tests `[C1]` / `[C2]`)                                                                                            |
| ---- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **C1 — The King Fights Back** (0:30) | The King hits like a big skeleton: no telegraph, no phases, no HP bar or telegraph panel.                     | The `boss` view carries the telegraph; Crown Strike and Grave Wail work with Defend and Shield Wall; thralls appear once, enrage triggers once; the King makes no basic attacks; HP never goes negative. |
| **C2 — Private Orders** (1:00)       | `/whisper` is an unknown command; companions ignore orders.                                                     | Whispers and replies reach only the hero; standing orders change companion actions; nothing leaks to the log, spectators or the DM. |

## 5. Curses

Each one is an exact find/replace in `scramble/curses.mjs`, with a tagged hidden test. The symptoms in play are
listed in [ROUND.md](ROUND.md). The verifier proves that each Curse fails only its own tag and that the full build
causes zero guard regressions.

| Id | Where it lives                                                                 | Hidden test                                   |
| -- | ------------------------------------------------------------------------------ | --------------------------------------------- |
| E1 | `client/src/lib/actions.js` handler name                                        | `client/test/lib.test.js`                     |
| E2 | `client/src/lib/format.js` `hpPercent`                                          | `client/test/lib.test.js`                     |
| E3 | `client/src/lib/format.js` `formatRoll` reads `result`                          | `client/test/lib.test.js`                     |
| E4 | `normalizeRoomCode` (server and client)                                         | `curses`, `sockets`, `lib` tests              |
| M1 | `engine/votes.js` `allEligibleVoted` uses `some`                                | `curses`, `engine` (`[M1]`)                   |
| M2 | `dm/context.js` drops HP, items, shards                                         | `curses.test.js`                              |
| M3 | `roomManager.perform` dedupe removed + combat click key + busy guard            | `curses.test.js`                              |
| M4 | `roomManager.joinRoom` ignores the token                                        | `curses`, `sockets`                           |
| A1 | Seat check removed; sockets trust `msg.code` / `msg.playerId`                   | `curses`, `sockets`                           |
| A2 | `sanitizePayload` passes everything; attacks use the client's `damage`          | `curses.test.js`                              |
| A3 | A module-level `chronicle` array shared by every run                            | `curses.test.js`                              |
| A4 | `use_item` skips the room lock; `useItem` awaits between check and spend        | `curses.test.js`                              |
| R1 | Narration matching "you win" sets `phase = 'victory'`                           | `curses.test.js`                              |
| R2 | `client/.env` with a fake key, `.env` un-ignored, key referenced in `net.js`    | `curses.test.js`                              |

Tests that are not tagged (`server/test/engine.test.js`) are **guards**: rules that hold in both the clean and
the scrambled build. A guard failing in a participant's repo is a regression (−30).

If you change the clean code, run `node scripts/verify-scramble.mjs`. A patch whose `find` text no longer
matches makes the scrambler stop and name the Curse.

## 6. AI Dungeon Master contract

The input is `buildDmContext` (`server/src/dm/context.js`): the stage, the room, the open options, every hero's
class, HP, items and status (companions flagged), shards, living enemies, the King's telegraph, and the last 10 game
events. It never includes chat, whispers or orders. The output is `{ narration, suggested_choices }`, validated, and
stored as text only. The chain is optional LLM (8 s) → scripted narrator → 20 fallback lines.

## 7. Data model

`server/src/db/schema.sql` defines seven Postgres/Supabase tables, ready for deployment. The running server uses
`MemoryStore`, so a restart ends every run.
