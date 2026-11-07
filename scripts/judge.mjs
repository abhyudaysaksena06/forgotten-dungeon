// Scores a participant's repo against the hidden tests — without ever putting those tests in
// the participant's folder. Their code is copied into .judge/, the organiser's tagged tests are
// dropped in beside it, and both suites run there.
//
//   node scripts/judge.mjs --repo ../forgotten-dungeon-participant
//   node scripts/judge.mjs --repo ../fd-team7 --notify http://192.168.1.20:3001 --token <their admin token>
//   node scripts/judge.mjs --repo ../fd-team7 --json results/team7.json
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLIENT_CALLS } from '../server/src/admin/calls.js';
import { CURSES } from '../server/src/admin/curses.js';
import { parseTap, runSuite } from '../server/src/admin/judge.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
export const REGRESSION_PENALTY = 30;

const SKIP = new Set(['node_modules', '.git', 'dist', '.scramble', '.judge']);

/** Copies `repo` into a scratch dir under .judge/, adds the hidden tests, runs them. */
export async function judgeRepo(repo, { label = 'run' } = {}) {
  const src = resolve(repo);
  if (!existsSync(join(src, 'server/src')) || !existsSync(join(src, 'client/src'))) throw new Error(`${src} does not look like a Forgotten Dungeon repo.`);
  const work = join(ROOT, '.judge', `${label}-${Date.now()}`);
  rmSync(work, { recursive: true, force: true });
  cpSync(src, work, { recursive: true, filter: (p) => !p.slice(src.length).split(sep).some((part) => SKIP.has(part)) });
  // Participants' own tests are theirs; the judge only runs the organiser's.
  for (const side of ['server', 'client']) {
    rmSync(join(work, side, 'test'), { recursive: true, force: true });
    cpSync(join(ROOT, side, 'test'), join(work, side, 'test'), { recursive: true });
  }
  const outputs = await Promise.all([runSuite(join(work, 'server')), runSuite(join(work, 'client'))]);
  const results = {};
  const regressions = [];
  for (const { out } of outputs) {
    const parsed = parseTap(out);
    for (const [id, pass] of Object.entries(parsed.results)) results[id] = (results[id] ?? true) && pass;
    regressions.push(...parsed.regressions);
  }
  rmSync(work, { recursive: true, force: true });
  return { results, regressions, raw: outputs.map((o) => o.out).join('\n') };
}

export function scorecard({ results, regressions }, planted = CURSES.map((c) => c.id)) {
  const rows = [];
  let total = 0;
  for (const c of CURSES.filter((x) => planted.includes(x.id))) {
    const pass = results[c.id] === true;
    rows.push({ id: c.id, name: c.name, kind: c.tier, pass, points: pass ? c.points : 0, max: c.points });
    if (pass) total += c.points;
  }
  for (const c of CLIENT_CALLS) {
    const pass = results[c.id] === true;
    rows.push({ id: c.id, name: c.name, kind: 'client call', pass, points: pass ? c.points : 0, max: c.points });
    if (pass) total += c.points;
  }
  const penalty = regressions.length * REGRESSION_PENALTY;
  return { rows, regressions, penalty, total: total - penalty, max: rows.reduce((n, r) => n + r.max, 0) };
}

function printCard(card) {
  for (const r of card.rows) {
    console.log(`${r.pass ? '✔' : '✖'} ${r.id.padEnd(3)} ${r.name.padEnd(40)} ${String(r.points).padStart(4)} / ${r.max}`);
  }
  for (const name of card.regressions) console.log(`✖ regression: ${name}  (−${REGRESSION_PENALTY})`);
  console.log(`\nTotal ${card.total} / ${card.max}${card.penalty ? ` (includes −${card.penalty} for regressions)` : ''}`);
}

// ---- CLI ----
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = cliArgs(process.argv.slice(2));
  if (!args.repo) {
    console.error('Usage: node scripts/judge.mjs --repo <participant repo> [--notify <url> --token <admin token>] [--json <file>]');
    process.exit(2);
  }
  const manifest = join(ROOT, '.scramble', 'last-build.json');
  const planted = args.curses?.split(',') ?? (existsSync(manifest) ? JSON.parse(readFileSync(manifest, 'utf8')).curses : undefined);
  const run = await judgeRepo(args.repo, { label: 'judge' });
  const card = scorecard(run, planted);
  printCard(card);
  if (args.json) {
    mkdirSync(dirname(resolve(args.json)), { recursive: true });
    writeFileSync(args.json, JSON.stringify({ repo: resolve(args.repo), at: new Date().toISOString(), ...card }, null, 2));
  }
  if (args.notify) {
    // Shows "Curse lifted!" banners in the participant's running game.
    const res = await fetch(new URL('/api/admin/judge-results', args.notify), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-token': args.token ?? '' },
      body: JSON.stringify({ results: run.results }),
    }).catch((err) => ({ ok: false, statusText: err.message }));
    console.log(res.ok ? `Banners sent to ${args.notify}.` : `Could not notify ${args.notify}: ${res.statusText}`);
  }
  void readdirSync;
}

// --name value or --name=value
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
