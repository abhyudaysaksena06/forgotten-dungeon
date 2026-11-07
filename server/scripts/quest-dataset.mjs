// Builds the training data for the route-choice random forest.
//
// 1. Plays many teams (all tiers) with varied route styles and records each map decision.
// 2. At a sample of those decisions, tries every available option and estimates its chance of
//    winning the whole run from N simulated continuations with fresh dice.
// 3. Each continuation is scored like the judge scores progression: 10 per room cleared and 40
//    for beating Morvath, out of 80. An option is labelled "good" if its expected score is within
//    MARGIN of the best option there. (Win chance alone stopped working once the game got hard:
//    when no option can win, every option looked equally good.)
//
//   node server/scripts/quest-dataset.mjs --states 1800 --rollouts 8 --out ml/data/route_decisions.csv
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createRng, hashSeed } from '../src/engine/rng.js';
import { createRun, routeOptions, step } from '../src/quest/engine.js';
import { FEATURE_NAMES, decisionFeatures, optionCategory } from '../src/quest/features.js';
import { LEADERS, carefulLeaderAction, routePolicy, upkeep } from '../src/quest/sim.js';
import { makeProfile } from '../src/quest/teams.js';

const args = cliArgs(process.argv.slice(2));
const STATES = Number(args.states ?? 1800);
const ROLLOUTS = Number(args.rollouts ?? 8);
const MARGIN = Number(args.margin ?? 0.05);
const OUT = resolve(args.out ?? 'ml/data/route_decisions.csv');
const rand = createRng({ rngState: hashSeed(args.seed ?? 'dataset-v1') });
const r01 = () => rand.next();

// Continue a run to the end with a sensible player and fresh dice.
function rollout(state, option, k) {
  let s = structuredClone(state);
  s.rngState = hashSeed(`rollout:${r01()}:${k}`);
  s = step(s, option, { mutate: true });
  const route = routePolicy({ boldness: [1, 1.4, 1.8][k % 3], epsilon: 0.05, rng: r01 });
  for (let i = 0; i < 2500 && (s.phase === 'map' || s.phase === 'combat'); i++) {
    const a = s.phase === 'map' ? upkeep(s) ?? route(s) : carefulLeaderAction(s);
    if (!a) break;
    s = step(s, a, { mutate: true });
  }
  const rooms = s.fragments.filter((r) => r !== 'r5').length;
  return (rooms * 10 + (s.phase === 'victory' ? 40 : 0)) / 80;
}

// Collect decision states from exploratory play.
function collectStates() {
  const states = [];
  const tiers = ['weak', 'average', 'strong'];
  for (let t = 0; states.length < STATES * 3; t++) {
    const tier = tiers[t % 3];
    let s = createRun(makeProfile({ teamId: `d${t}`, seed: `ds-${t}`, tier }));
    s = step(s, { type: 'lead', memberId: LEADERS[t % LEADERS.length] }, { mutate: true });
    const route = routePolicy({ boldness: 0.7 + r01() * 1.6, epsilon: 0.3, rng: r01 });
    for (let i = 0; i < 2500 && (s.phase === 'map' || s.phase === 'combat'); i++) {
      if (s.phase === 'map') {
        const prep = upkeep(s);
        if (prep) {
          s = step(s, prep, { mutate: true });
          continue;
        }
        states.push({ team: t, tier, state: structuredClone(s) });
        const a = route(s);
        if (!a) break;
        s = step(s, a, { mutate: true });
      } else s = step(s, carefulLeaderAction(s), { mutate: true });
    }
  }
  // Even sample across the whole collection.
  const picked = [];
  const stride = states.length / STATES;
  for (let i = 0; i < STATES; i++) picked.push(states[Math.floor(i * stride)]);
  return picked;
}

const t0 = Date.now();
const samples = collectStates();
const rows = [];
let done = 0;
for (const { team, tier, state } of samples) {
  // Shrine/forge per member collapse to one representative (the Hero) to keep options comparable.
  const seen = new Set();
  const options = routeOptions(state).filter((o) => {
    const key = o.type === 'travel' ? `${o.type}:${o.to}` : o.type;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (options.length < 2) continue;
  const probs = options.map((o) => {
    let total = 0;
    for (let k = 0; k < ROLLOUTS; k++) total += rollout(state, o, k);
    return total / ROLLOUTS;
  });
  const best = Math.max(...probs);
  options.forEach((o, i) => {
    rows.push([team, tier, optionCategory(state, o), ...decisionFeatures(state, o), probs[i], best, probs[i] >= best - MARGIN ? 1 : 0]);
  });
  if (++done % 200 === 0) console.log(`${done}/${samples.length} decisions · ${rows.length} rows · ${Math.round((Date.now() - t0) / 1000)}s`);
}

mkdirSync(dirname(OUT), { recursive: true });
const header = ['team', 'tier', 'category', ...FEATURE_NAMES, 'win_prob', 'best_prob', 'good'];
writeFileSync(OUT, [header.join(','), ...rows.map((r) => r.join(','))].join('\n') + '\n');
const good = rows.filter((r) => r.at(-1) === 1).length;
console.log(`Wrote ${rows.length} rows (${Math.round((100 * good) / rows.length)}% good) to ${OUT} in ${Math.round((Date.now() - t0) / 1000)}s`);

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
