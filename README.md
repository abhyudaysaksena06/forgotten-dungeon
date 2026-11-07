# The Forgotten Dungeon — organiser repo (clean build)

A single-hero dungeon crawl with three AI companions and an AI Dungeon Master. It is built as the clean reference
for a 90-minute debugging round. Participants get a **scrambled** copy with planted bugs (Curses), take two
**Client Calls** (feature requests) at 0:30 and 1:00, and finish by playing their own build for bonus points.

- **[docs/ROUND.md](docs/ROUND.md):** how to run the day (timeline, prep, judging, scoring).
- **[docs/DESIGN.md](docs/DESIGN.md):** rules, companion AI, boss tuning, the Curse map, open decisions.

## Run the clean game

Needs Node 22 or later.

```bash
npm install
```

```bash
npm run dev
```

The game runs at http://localhost:5173. The organiser dashboard is at http://localhost:5173/#/admin; the server
prints a one-off admin token at startup, or you can set `ADMIN_TOKEN` in `server/.env`.

## Organiser tools

```bash
npm test
```

Runs the 54 hidden and guard tests. All of them pass on the clean build.

```bash
node scripts/verify-scramble.mjs
```

Proves each Curse fails only its own hidden test, that the Client Calls strip cleanly, and that the full scramble
causes zero regressions.

```bash
node scripts/scramble.mjs --out ../forgotten-dungeon-participant
```

Writes the participant repo. Add `--curses E1,E2,...` to plant a subset.

```bash
node scripts/judge.mjs --repo ../submissions/team07
```

Scores a participant repo against the hidden tests, without the tests ever entering their folder.

```bash
node server/scripts/balance.mjs
```

Plays seeded runs with careless and careful heroes and prints win rates.

## Layout

```
server/src/engine/   rules: rng, dice, votes, combat + King, items, companions (npc.js), dungeon script, score
server/src/rooms/    RoomManager (per-run lock, idempotency, tokens, timers, spectators), chat + /whisper
server/src/dm/       context builder, JSON validation, scripted narrator, optional Anthropic narrator, fallbacks
server/src/admin/    Curse Ledger, Client Call scripts, event clock, judge runner
server/test/         hidden tests ([E1]…[R2], [C1], [C2]) and guard tests; never shipped
client/              React + Tailwind: Landing (start / watch), class pick, Game, Admin dashboard
scramble/            Curse patches, Client Call region stubs, the participant README
scripts/             scramble, verify-scramble, judge, run-participant, dev
```
