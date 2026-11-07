# The Forgotten Dungeon — your build

Hollowbell Studio's co-op dungeon game is cursed. Its last developer left in a hurry, and the build you have
been handed is riddled with bugs, which this studio calls **Curses**. You have **90 minutes** to fix them,
and to ship two features the client will phone through while you work. At the end, you play your own fixed
build for bonus points.

## The game

You are one hero. Three AI companions (the classes you did not pick) fight beside you. The AI Dungeon
Master tells the story, the server runs every rule, and the browser only shows what the server decides.

- **Classes:** Warrior (HP 120, ATK 12, DEF 8, Shield Wall), Mage (80/16/3, Arcane Burst), Rogue (90/11/5, Scout),
  Healer (95/7/5, Mend). Each class gets +3 on checks that match its specialty.
- **Rooms:** your companions vote first and your vote counts double. The server rolls d20 + bonus against DC
  8/12/16. A natural 20 is a critical success. Missing by 1–4 is a partial success that costs 5 HP. A natural 1
  hurts the whole party.
- **Combat:** Attack, Defend, Ability or Use Item, within 30 seconds. A d20 roll of 1–4 misses and a 20 doubles
  damage. Damage = ATK + d6 − DEF (at least 1). Defend halves the damage you take.
- **Stages:** the Broken Gate → the Ashen Library → the Throne of the Forgotten King. Find all 5 Memory Shards
  to double your first hit on the King.

## Run it

Needs Node 22 or later.

```bash
npm install
```

```bash
npm run dev
```

The game runs at http://localhost:5173 and the API at :3001. `npm test` runs your own tests, in `server/test`
and `client/test`.

## The round

| Time | What happens                                                                  |
| ---- | ----------------------------------------------------------------------------- |
| 0:00 | You get this repo. Start hunting Curses.                                      |
| 0:30 | **Client Call 1.** The client rings with a feature request. Listen carefully. |
| 1:00 | **Client Call 2.** A second feature.                                          |
| 1:20 | Code freeze. The organisers run the hidden tests against your repo.           |
| 1:20 | Final run: play your build once. Your Hero Score is your bonus.               |

The **Curse Ledger** (in the game's top bar) lists the Curses hidden in this build. Their symptoms are yours to
find. Hidden tests decide whether each one is lifted.

## Rules

- **Allowed:** any AI coding assistant, your own tests, refactoring.
- **Forbidden:** hard-coding test answers, editing HP or state to cheat, weakening security. These cost points
  or disqualify you.
- **Penalty:** each feature you break that used to work costs points (a regression).
- Never put an API key anywhere under `client/`. Everything there ships to the browser.
