# Running the round — organiser runbook

> **Superseded.** This runbook is for the earlier voting-game build with Client Calls. The current round
> is The Shattered Heart in [QUEST.md](QUEST.md): no Client Calls, bugs grouped by the rulebook's five
> rounds, hints for CTF tokens, and the rubric judge.

**Format.** Each participant gets the same scrambled build of The Forgotten Dungeon: a single-hero game with three AI
companions, carrying 14 planted bugs (Curses). They fix what they can, and the "client" phones in two feature
requests (Client Calls) 30 minutes apart. At the end, each participant plays their own fixed build once; the
Hero Score from that run is their bonus.

## Timeline (90 minutes)

| Clock | What happens                                                                                                                         |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------ |
| −0:15 | Hand out the participant repo (see Prepare). Participants run `npm install` and `npm run dev` and check the game loads.              |
| 0:00  | Briefing (2 min): the game, the Curse Ledger, the rules. On the dashboard: **Start clock**.                                          |
| 0:30  | **Client Call 1 — The King Fights Back.** Dashboard → Release. Read the call aloud, or role-play it as the client; the acceptance criteria stay on the projector. |
| 1:00  | **Client Call 2 — Private Orders.** Same as Call 1.                                                                                   |
| 1:20  | **Code freeze.** Run the judge on every repo (see Judge).                                                                             |
| 1:20  | **Final run (≤10 min).** Each participant plays their own build once. Record the Hero Score from the end screen.                     |
| 1:30  | Scores in. Optional Rune Defense: each participant explains two fixes in 90 seconds.                                                  |

The dashboard (`/#/admin` on the organiser's machine) shows the clock, marks each call "due now" when its time
comes, and puts the released call's script and acceptance criteria on screen for the projector.

## Prepare (the day before)

```bash
node scripts/verify-scramble.mjs
```

This must print "All scenarios behave as designed": every hidden test passes on the clean build, and each Curse
fails only its own test.

```bash
node scripts/scramble.mjs --out ../forgotten-dungeon-participant
```

This writes the participant repo. It contains no hidden tests, no docs, no call scripts and none of these tools.
Push it to a fresh repo, or zip it, for each participant. `.scramble/last-build.json` records which Curses were
planted; the judge reads it.

To plant fewer Curses (recommended for first-year students, see below):

```bash
node scripts/scramble.mjs --out ../forgotten-dungeon-participant --curses E1,E2,E3,E4,M1,M3,M4,A1,A4,R2
```

To see the scrambled game in play next to the clean one, run the `participant-build` preview (port 3002), or
`node scripts/run-participant.mjs`.

## Judge

At the freeze, for each participant (their repo checked out or copied to the organiser's machine):

```bash
node scripts/judge.mjs --repo ../submissions/team07 --json results/team07.json
```

The judge copies their code into `.judge/`, swaps their tests for the hidden ones, runs both suites and prints a
scorecard. The hidden tests never touch the participant's folder. It also counts **regressions**: guard tests (game
rules that worked in the scrambled build) that now fail, at −30 each.

Mid-round banners are optional. If a participant's game is reachable and you know its admin token (printed in their
server console), add `--notify http://<their-ip>:3001 --token <token>` to make the "Curse lifted!" banners appear
in their game.

## Scoring

| Item                            | Points                    | Decided by                          |
| ------------------------------- | ------------------------- | ----------------------------------- |
| Easy Curses E1–E4               | 25 each                   | hidden tests                        |
| Medium Curses M1–M4             | 50 each                   | hidden tests                        |
| Advanced Curses A1–A4           | 75 each                   | hidden tests                        |
| Hidden Relics R1–R2             | 50 each                   | hidden tests                        |
| Client Call 1, Client Call 2    | 150 each                  | hidden tests `[C1]`, `[C2]`         |
| Regression                      | −30 each                  | guard tests                         |
| **Bonus: final run**            | Hero Score ÷ 4 (max 100)  | end screen of the participant's run |

Total without the bonus: 1,000 for all 14 Curses, or less if you plant fewer.

## What participants see

- `README.md` explains the game, how to run it, the timeline and the rules.
- The **Curse Ledger** (top bar) lists the Curse names for this build, with their symptoms hidden.
- The two Client Calls appear in the ledger as titles only. The content arrives by "phone".
- No tests except an example: they are encouraged to write their own.

## The Curses as players meet them

| Id | In play                                                                                                    |
| -- | ---------------------------------------------------------------------------------------------------------- |
| E1 | Attack does nothing (the other three buttons work).                                                       |
| E2 | HP bars are empty at full health and fill up as heroes get hurt.                                           |
| E3 | The dice tray reads "undefined + 3 = NaN".                                                                 |
| E4 | "Watch a run" with a lowercase code says the run doesn't exist.                                            |
| M1 | The vote closes the moment the companions vote, so the hero never gets a say and rooms resolve by themselves. |
| M2 | The narrator never mentions wounds, items or shards (obvious with an LLM; the hidden test checks the context). |
| M3 | A double-click on Attack also spends next round's action.                                                  |
| M4 | Refreshing the page throws you out of your own run.                                                        |
| A1 | Any socket can act for any hero by sending `code` and `playerId` with the action.                          |
| A2 | Adding `damage: 999` to an attack payload one-shots the King.                                              |
| A3 | With two runs on one server, each chronicle shows the other run's events.                                  |
| A4 | Clicking a potion fast (or scripting parallel requests) heals several times for one potion.               |
| R1 | An LLM narrator saying "you win" ends the game in victory.                                                 |
| R2 | `client/.env` holds a (fake) API key, `.gitignore` no longer ignores `.env`, and client code reads the key as a `VITE_` variable (which Vite would bundle into the browser). |

## Recommended set for a 90-minute round

Fourteen Curses plus two features is a lot for 80 minutes of work. For students, plant **10**: all four Easy,
M1, M3, M4, A1, A4, and R2. That keeps one Curse of each kind of thinking (UI, flow, state, security, races, secrets)
and leaves time for the calls. Use the full 14 for experienced teams.
