// The Quest judge's Testing & stability score is earned, never free: an untouched repo scores 0, and
// a team's own test counts only for the planted bugs it really catches.
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { bugById } from '../../scramble/quest-bugs.mjs';
import { TESTING, judgeTeam } from '../../scripts/quest-judge.mjs';
import { makeProfile } from '../src/quest/teams.js';

const SERVER = fileURLToPath(new URL('..', import.meta.url));
const BUGS = ['Q11', 'Q07']; // a blocker (journeys cost double torches) and a hindrance (the altar)
const team = { teamId: 'jt', teamName: 'Judge Test', tier: 'strong', bugs: BUGS, profile: makeProfile({ teamId: 'jt', seed: 'judge-test', tier: 'strong' }) };
const registry = { teams: [team] };
const dirs = [];
after(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

// A team repo as they'd hand it in: the server with their bugs, the example test, and `extra` tests.
function teamRepo(bugs, extra = {}) {
  const repo = mkdtempSync(join(tmpdir(), 'judge-test-'));
  dirs.push(repo);
  const skip = ['node_modules', 'test', 'saves', 'teams'].map((p) => join(SERVER, p));
  cpSync(SERVER, join(repo, 'server'), { recursive: true, filter: (p) => !skip.some((s) => p === s || p.startsWith(s + sep)) });
  for (const id of bugs) {
    for (const { file, find, replace } of bugById(id).patches) {
      const path = join(repo, file);
      writeFileSync(path, readFileSync(path, 'utf8').replace(find, () => replace));
    }
  }
  cpSync(fileURLToPath(new URL('../../scramble/participant/example.test.js', import.meta.url)), join(repo, 'server', 'test', 'example.test.js'));
  for (const [name, body] of Object.entries(extra)) writeFileSync(join(repo, 'server', 'test', name), body);
  return repo;
}

const JOURNEY_TEST = `import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRun, routeOptions, step } from '../src/quest/engine.js';
import { makeProfile } from '../src/quest/teams.js';

test('a journey costs exactly the torches shown', () => {
  const s0 = createRun(makeProfile({ teamId: 'me', seed: 'mine', tier: 'average' }));
  s0.phase = 'map';
  s0.leaderId = 'knight';
  for (const m of s0.party) m.controlled = m.id === 'knight';
  const option = routeOptions(s0).find((o) => o.to === 'r1');
  assert.equal(step(s0, { type: 'travel', to: 'r1' }).torches, s0.torches - option.cost);
});
`;
// Relies on a helper the team added themselves, so it can't run on the original game.
const OWN_HELPER_TEST = `import { test } from 'node:test';
import { myNewHelper } from '../src/quest/engine.js';
test('uses my own helper', () => myNewHelper());
`;

test('an untouched repo scores 0 for testing and stability', { timeout: 180000 }, async () => {
  const card = await judgeTeam({ teamId: 'jt', repo: teamRepo(BUGS), registry, forest: null });
  assert.equal(card.scores.fixes, 0);
  assert.equal(card.scores.testing, 0);
  assert.deepEqual(card.detail.tests.caught, []);
});

test('a team test that catches one of their bugs earns that bug’s share of coverage', { timeout: 180000 }, async () => {
  const repo = teamRepo(BUGS, { 'journey.test.js': JOURNEY_TEST, 'helper.test.js': OWN_HELPER_TEST });
  const card = await judgeTeam({ teamId: 'jt', repo, registry, forest: null });
  const [q11, q07] = BUGS.map((id) => bugById(id).points);
  assert.deepEqual(card.detail.tests.caught, ['Q11']);
  assert.equal(card.scores.testing, Math.round((TESTING.coverage * q11) / (q11 + q07)));
  assert.ok(card.detail.tests.failingOnReference.some((n) => n.includes('helper')), 'a test that fails on the original game is reported, not counted');
});

test('fixing every bug with a catching test earns stability as well', { timeout: 180000 }, async () => {
  const card = await judgeTeam({ teamId: 'jt', repo: teamRepo([], { 'journey.test.js': JOURNEY_TEST }), registry, forest: null });
  const [q11, q07] = BUGS.map((id) => bugById(id).points);
  assert.equal(card.scores.fixes, 100);
  assert.equal(card.scores.testing, Math.round((TESTING.coverage * q11) / (q11 + q07) + TESTING.stability));
});
