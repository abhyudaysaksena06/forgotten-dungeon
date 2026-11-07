// Creates the organiser's team registry: per team a seed, starting stats, an access code and a
// bug mix drawn round by round (ROUND_MIX in scramble/quest-bugs.mjs), so every team has bugs in
// every round at the same total difficulty. Keep organiser/registry.json private.
//
//   node scripts/quest-teams.mjs --count 12 [--tiers weak,average,strong] [--force]
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { makeProfile } from '../server/src/quest/teams.js';
import { ROUND_MIX } from '../scramble/quest-bugs.mjs';
import { QUEST_BUGS, REGISTRY } from './quest-kit.mjs';

const args = cliArgs(process.argv.slice(2));
const count = Number(args.count ?? 12);
const tiers = (args.tiers ?? 'weak,average,strong').split(',');
if (existsSync(REGISTRY) && !args.force) {
  console.error(`${REGISTRY} already exists. Pass --force to replace it (this changes every team's seed and bugs).`);
  process.exit(1);
}

// Rotating windows spread every bug in a round across the teams evenly.
const pick = (list, n, i) => Array.from({ length: n }, (_, k) => list[(i * n + k) % list.length]);
function bugsFor(i) {
  const chosen = [];
  for (const [round, mix] of Object.entries(ROUND_MIX)) {
    for (const [kind, n] of Object.entries(mix)) {
      const pool = QUEST_BUGS.filter((b) => b.round === Number(round) && b.kind === kind).map((b) => b.id);
      if (pool.length < n) throw new Error(`Round ${round} has only ${pool.length} ${kind} bug(s); the mix asks for ${n}.`);
      chosen.push(...pick(pool, n, i));
    }
  }
  return chosen.sort();
}

const teams = Array.from({ length: count }, (_, i) => {
  const teamId = `team${String(i + 1).padStart(2, '0')}`;
  const tier = tiers[i % tiers.length];
  const seed = randomBytes(8).toString('hex');
  const salt = randomBytes(4).toString('hex');
  const accessCode = randomBytes(3).toString('hex').toUpperCase();
  const profile = { ...makeProfile({ teamId, teamName: `Team ${i + 1}`, seed, tier, salt }), accessCode };
  return { teamId, teamName: profile.teamName, tier, accessCode, bugs: bugsFor(i), profile };
});

mkdirSync(dirname(REGISTRY), { recursive: true });
writeFileSync(REGISTRY, JSON.stringify({ createdAt: new Date().toISOString(), mix: ROUND_MIX, teams }, null, 2));
const points = (t) => t.bugs.reduce((n, id) => n + QUEST_BUGS.find((b) => b.id === id).points, 0);
console.log(`Wrote ${teams.length} teams to ${REGISTRY}`);
for (const t of teams) console.log(`${t.teamId}  ${t.tier.padEnd(8)} code ${t.accessCode}  bugs ${t.bugs.join(' ')}  (${points(t)} pts)  torches ${t.profile.torches}`);

function cliArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const m = argv[i].match(/^--([^=]+)(?:=(.*))?$/s);
    if (!m) continue;
    if (m[2] !== undefined) out[m[1]] = m[2];
    else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) out[m[1]] = argv[++i];
    else out[m[1]] = true;
  }
  return out;
}
