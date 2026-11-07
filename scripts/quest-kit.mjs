// Shared organiser tooling for the Quest round: team registry, per-team builds, hidden-test runs.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { QUEST_BUGS, bugById } from '../scramble/quest-bugs.mjs';
import { parseTap, runSuite } from '../server/src/admin/judge.js';

export const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
export const REGISTRY = join(ROOT, 'organiser', 'registry.json');
export const QUEST_TESTS = 'test/quest/**/*.test.js';

// Never shipped: hidden tests, the judge's model, organiser data and tools, old-round tooling.
const ORGANISER_ONLY = [
  'node_modules', '.git', '.claude', '.vercel', '.scramble', '.judge', 'organiser', 'docs', 'scramble', 'ml', 'assets', 'tools',
  'api', 'vercel.json', // the hosted (Vercel) build of the clean game
  'server/test', 'client/test', 'server/scripts', 'server/saves', 'server/teams', 'server/.env', 'client/dist',
  'server/src/quest/model', 'server/src/quest/forest.js',
  'scripts/scramble.mjs', 'scripts/verify-scramble.mjs', 'scripts/judge.mjs', 'scripts/run-participant.mjs',
  'scripts/quest-kit.mjs', 'scripts/quest-teams.mjs', 'scripts/quest-build.mjs', 'scripts/quest-verify.mjs', 'scripts/quest-judge.mjs',
];

export function loadRegistry(path = REGISTRY) {
  if (!existsSync(path)) throw new Error(`No registry at ${path}. Run: node scripts/quest-teams.mjs`);
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function teamFrom(registry, teamId) {
  const team = registry.teams.find((t) => t.teamId === teamId);
  if (!team) throw new Error(`Team ${teamId} is not in the registry.`);
  return team;
}

function applyPatch(dir, bugId, patch) {
  const path = join(dir, patch.file);
  const text = readFileSync(path, 'utf8');
  const n = text.split(patch.find).length - 1;
  if (n !== 1) throw new Error(`Bug ${bugId}: expected 1 match in ${patch.file}, found ${n}:\n${patch.find}`);
  writeFileSync(path, text.replace(patch.find, () => patch.replace));
}

/** Copies the clean repo to `out`, plants `bugs`, and (for real builds) adds the team's profile. */
export function buildRepo({ out, bugs = [], profile = null, participant = true }) {
  const dest = resolve(out);
  if (dest === ROOT) throw new Error('Refusing to build into the clean repo itself.');
  rmSync(dest, { recursive: true, force: true });
  const skip = new Set((participant ? ORGANISER_ONLY : ['node_modules', '.git', '.scramble', '.judge', 'organiser', 'server/saves', 'assets', 'tools']).map((p) => join(ROOT, p)));
  for (const name of readdirSync(ROOT)) {
    if (skip.has(join(ROOT, name))) continue;
    cpSync(join(ROOT, name), join(dest, name), { recursive: true, filter: (src) => !skip.has(src) && !src.split(sep).includes('node_modules') });
  }
  // Apply in id order so overlapping files patch predictably.
  for (const id of [...bugs].sort()) {
    const bug = bugById(id);
    if (!bug) throw new Error(`Unknown bug ${id}`);
    for (const p of bug.patches) applyPatch(dest, id, p);
  }
  if (profile) {
    mkdirSync(join(dest, 'server', 'teams'), { recursive: true });
    writeFileSync(join(dest, 'server', 'teams', 'profile.json'), JSON.stringify(profile, null, 2));
  }
  if (participant) {
    cpSync(join(ROOT, 'scramble', 'participant', 'QUEST_README.md'), join(dest, 'README.md'));
    mkdirSync(join(dest, 'server', 'test'), { recursive: true });
    writeFileSync(
      join(dest, 'server', 'test', 'example.test.js'),
      "// Your tests go here (node:test). Run with: npm test -w server\nimport assert from 'node:assert/strict';\nimport { test } from 'node:test';\n\ntest('the test runner works', () => assert.equal(1 + 1, 2));\n",
    );
  }
  return dest;
}

/** Runs the organiser's quest tests against a copy of `repo`. The copy lives under .judge/. */
export async function runHiddenTests(repo, label = 'judge') {
  const src = resolve(repo);
  const work = join(ROOT, '.judge', `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
  cpSync(src, work, { recursive: true, filter: (p) => !p.slice(src.length).split(sep).some((part) => ['node_modules', '.git'].includes(part)) });
  rmSync(join(work, 'server', 'test'), { recursive: true, force: true });
  cpSync(join(ROOT, 'server', 'test', 'quest'), join(work, 'server', 'test', 'quest'), { recursive: true });
  const { out } = await runSuite(join(work, 'server'), QUEST_TESTS);
  rmSync(work, { recursive: true, force: true });
  return { ...parseTap(out), raw: out };
}

// ---- The team's own tests: which of their planted bugs do they catch? ----
// A test catches a bug when it passes on the original (clean) game and fails once that bug is put
// back. The team's server/test folder runs on a copy of the clean server: twice as is (a test that
// fails either time is ignored, so flaky tests earn nothing), then once per planted bug with only
// that bug applied. All planted bugs live in server/ files, so only server/ is copied; packages
// resolve from the root node_modules because .judge/ sits inside the repo.
export const TEAM_TEST_LIMITS = { perTestMs: 20000, perSuiteMs: 120000, parallel: 4 };
const REFERENCE_SKIP = ['node_modules', 'test', 'saves', 'teams', '.env'];

/** Top-level TAP results as { "test name": passed }. A name that appears twice must pass both times. */
export function parseTapTests(tap) {
  const tests = {};
  for (const line of tap.split(/\r?\n/)) {
    const m = line.match(/^(not )?ok \d+ - (.*)$/);
    if (!m) continue;
    const name = m[2].replace(/\s+#\s*(SKIP|TODO)\b.*$/i, '').trim();
    if (/\s#\s*(SKIP|TODO)\b/i.test(m[2])) continue; // skipped and todo tests prove nothing
    tests[name] = (tests[name] ?? true) && !m[1];
  }
  return tests;
}

// When the judge itself runs inside a test, node sets NODE_TEST_CONTEXT, which would make the
// nested `node --test` report to that parent instead of printing TAP.
function testEnv() {
  const env = { ...process.env, NODE_ENV: 'test' };
  delete env.NODE_TEST_CONTEXT;
  return env;
}

function killTree(child) {
  if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else child.kill('SIGKILL');
}

// Like runSuite, but participant code can hang, so every test and the whole run have a time limit.
function runTeamSuite(serverDir) {
  return new Promise((done) => {
    const args = ['--test', '--test-reporter=tap', `--test-timeout=${TEAM_TEST_LIMITS.perTestMs}`, 'test/**/*.test.js'];
    const child = spawn(process.execPath, args, { cwd: serverDir, env: testEnv() });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    const timer = setTimeout(() => killTree(child), TEAM_TEST_LIMITS.perSuiteMs);
    child.on('close', () => (clearTimeout(timer), done(out)));
    child.on('error', (err) => (clearTimeout(timer), done(String(err))));
  });
}

async function inBatches(jobs, size) {
  const results = [];
  for (let i = 0; i < jobs.length; i += size) results.push(...(await Promise.all(jobs.slice(i, i + size).map((job) => job()))));
  return results;
}

/**
 * Runs the team's own server tests against the clean game with each of `bugs` put back alone.
 * Returns { caught: [bug ids], baselineTests: n tests passing on the clean game, failingOnReference: [names] }.
 */
export async function runTeamTestsAgainstBugs(repo, bugs, profile = null, label = 'tests') {
  const teamTests = join(resolve(repo), 'server', 'test');
  if (!existsSync(teamTests)) return { caught: [], baselineTests: 0, failingOnReference: [] };
  const base = join(ROOT, '.judge', `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
  const cleanServer = join(ROOT, 'server');
  const skip = new Set(REFERENCE_SKIP.map((p) => join(cleanServer, p)));
  const variant = (name, bugIds) => {
    const dir = join(base, name);
    cpSync(cleanServer, join(dir, 'server'), { recursive: true, filter: (p) => !skip.has(p) && !p.split(sep).includes('node_modules') });
    for (const id of bugIds) for (const p of bugById(id).patches) applyPatch(dir, id, p);
    if (profile) {
      mkdirSync(join(dir, 'server', 'teams'), { recursive: true });
      writeFileSync(join(dir, 'server', 'teams', 'profile.json'), JSON.stringify(profile, null, 2));
    }
    cpSync(teamTests, join(dir, 'server', 'test'), { recursive: true, filter: (p) => !p.split(sep).includes('node_modules') });
    return join(dir, 'server');
  };
  try {
    const runs = [
      { key: 'clean-1', bugs: [] },
      { key: 'clean-2', bugs: [] },
      ...bugs.map((id) => ({ key: id, bugs: [id] })),
    ];
    const outputs = await inBatches(
      runs.map((r) => () => runTeamSuite(variant(r.key, r.bugs)).then(parseTapTests)),
      TEAM_TEST_LIMITS.parallel,
    );
    const [first, second] = outputs;
    const steady = Object.keys(first).filter((name) => first[name] && second[name] === true);
    const failingOnReference = Object.keys({ ...first, ...second }).filter((name) => !steady.includes(name));
    const caught = bugs.filter((id, i) => steady.some((name) => outputs[i + 2][name] !== true));
    return { caught, baselineTests: steady.length, failingOnReference };
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}

export { QUEST_BUGS, bugById };
