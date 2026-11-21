# The Forgotten Dungeon — organiser repo (clean build)

**The Shattered Heart**: a 3D single-hero dungeon crawl (Kael against Morvath, five rooms and a camp),
built as the clean reference for a debugging event. Teams get a copy of the game with planted bugs
("broken runes"), play it, fix the code, write tests, and are scored by hidden tests, a clean replay of
their save and a random-forest judge of their choices.

> **This repo holds the answer key** (`scramble/quest-bugs.mjs`: every bug, its fix and its hints) and
> the hidden tests. Keep it **private**, and hand teams only the packages built below.

- **[docs/QUEST.md](docs/QUEST.md):** the game, the 23 bugs, per-team mixes, hints, judging.
- **[docs/LEVELS.md](docs/LEVELS.md):** rooms, enemies and which bugs bite where.
- **[desktop/README.md](desktop/README.md):** the desktop app (Windows / Mac).
- The earlier voting game (`/#/legacy`, [docs/ROUND.md](docs/ROUND.md)) is superseded but still builds.

## Run the clean game

Needs Node 22 or later.

```bash
npm install
npm run dev
```

The game runs at http://localhost:5173. The organiser dashboard is at http://localhost:5173/#/admin;
the server prints a one-off admin token at startup, or set `ADMIN_TOKEN` in `server/.env`.

## Event prep, step by step

```bash
node scripts/quest-teams.mjs --count 12          # 1. the team list: seeds, codes, stats, bug mix
node scripts/quest-verify.mjs                     # 2. proves every bug and every team build is fair
node scripts/quest-hints.mjs                      # 3. hint sheets + the full answer list (organiser/hints/)
node scripts/quest-package.mjs --all-teams --out ../packages --zip   # 4. one ready-to-play repo per team
```

1. `organiser/registry.json` holds each team's seed, access code, starting stats and bugs. It is
   git-ignored: keep it safe and private, and don't regenerate it after packages are out (`--force`
   gives every team new seeds and bugs).
2. `quest-verify` builds the clean game, each bug alone and every team's build, and checks each one
   fails exactly its own hidden tests and keeps exactly its own cages shut.
3. `organiser/hints/ALL_HINTS.md` is the answer list: every bug's round, symptom, three hints and fix.
   `organiser/hints/<team>.md` is what a mentor reads from when a team pays for a hint.
4. Each package (`../packages/forgotten-dungeon-team03/`) is a complete git repo with one commit:
   the game with that team's bugs, that team's official profile, a player README and `npm start`. No
   answer key, hidden tests, ML training data or organiser tools go in. Push each to its own private
   repo and add the team, or hand out the zip:

   ```bash
   cd ../packages/forgotten-dungeon-team03
   git remote add origin git@github.com:<you>/forgotten-dungeon-team03.git
   git push -u origin main
   ```

   A team clones it and runs **`npm start`**: it installs, builds the game once, starts the server and
   opens http://localhost:3001. The server restarts by itself on every save in `server/src`, so a team
   fixes a rune, saves, and reloads the page.

**Practice package** (all 23 bugs, a practice profile, not judged): for trying the event out yourself,
or a warm-up. `node scripts/quest-package.mjs --practice --out ../packages --zip`

**Desktop app per team** (no Node needed on the event PCs): `cd desktop && npm install && node build.mjs --team team03 && cd stage && npx electron-builder --win --x64`
(see [desktop/README.md](desktop/README.md)). The "Bugged" app on the Releases page is a practice build:
it plants all 23 bugs with the practice profile, so its saves can't be judged.

## Judge

```bash
node scripts/quest-judge.mjs --team team03 --repo ../submissions/team03
node scripts/quest-judge.mjs --all --submissions ../submissions      # every team -> results/rubric.csv
```

The judge rebuilds each run from the team's saved inputs on the clean engine with the team's
official profile, runs the hidden tests on the team's code, runs the team's own tests against each of
their bugs put back, and scores the rubric (bug fixes 35%, progression 25%, code quality 15%,
testing 15%, AI use 10%; the mentor fills in code quality and AI use).

## Tests

```bash
npm test                          # server + client tests (hidden tests included)
node scripts/quest-verify.mjs     # every bug and every team build behaves as designed
```

Both run on GitHub on every push and pull request (`.github/workflows/test.yml`).

## Layout

```
server/src/quest/    the Quest: engine, data, runs + saves, replay, cage locks, teams, forest + Oracle
server/src/          http + socket server; engine/ rooms/ dm/ admin/ are the legacy voting game
server/test/quest/   hidden bug tests and guard tests; never shipped
client/src/quest/    the 3D game (react-three-fiber), HUD, camp, fights
scramble/            quest-bugs.mjs (the answer key), the participant README and npm start launcher
scripts/             quest-teams, quest-verify, quest-hints, quest-package, quest-build, quest-judge
desktop/             the Electron app
ml/                  forest training (scikit-learn); the model ships as server/src/quest/model/
api/, vercel.json    the hosted (Vercel) clean build
```
