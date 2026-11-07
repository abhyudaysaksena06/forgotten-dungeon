// Guard tests for the Quest: rules that no planted bug touches, so they must pass in every
// team's build. A failure in a participant's repo counts as a regression (they broke something).
// Behaviour that a bug can break is checked by that bug's own tagged test in bugs.test.js.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import express from 'express';
import { CLASSES, MORVATH, PIP } from '../../src/quest/data.js';
import { beginFight, createRun, distance, publicState, routeOptions, step } from '../../src/quest/engine.js';
import { replay } from '../../src/quest/replay.js';
import { questRouter } from '../../src/quest/routes.js';
import { ACTION_FIELDS, QuestRuns, cleanAction } from '../../src/quest/runs.js';
import { makeProfile, profileHash } from '../../src/quest/teams.js';

const profile = (tier = 'average', seed = 'guard') => makeProfile({ teamId: 'g', seed, tier });
// Tests here set the leader directly, so they don't depend on the `lead` rule.
const fresh = (tier, leader = 'knight') => {
  const s = createRun(profile(tier));
  s.phase = 'map';
  s.leaderId = leader;
  for (const m of s.party) m.controlled = m.id === leader;
  return s;
};
// Inputs that are legal in every build: lead, travel to a fight, then let the companions act.
const simpleInput = (s) => {
  if (s.phase === 'setup') return { type: 'lead', memberId: 'knight' };
  if (s.phase === 'combat') return { type: 'wait' };
  const opt = routeOptions(s).find((o) => o.fight) ?? routeOptions(s)[0];
  return opt ? { type: opt.type, to: opt.to, memberId: opt.memberId } : null;
};

test('a run starts with Kael, Lyra, Rook and Mira, waiting for a leader', () => {
  const p = profile();
  const s = createRun(p);
  assert.equal(s.phase, 'setup');
  assert.deepEqual(s.party.map((m) => m.name), ['Kael', 'Lyra', 'Rook', 'Mira']);
  assert.equal(s.party[0].hp, p.party.knight.hp);
  assert.equal(s.torches, p.torches);
  assert.equal(CLASSES.ranger.reach, 'ranged');
  assert.throws(() => step(s, { type: 'travel', to: 'r1' }), /choose the Runewright/i);
});

test('teams get different starting stats from their seeds', () => {
  const a = profile('average', 'team-a');
  const b = profile('average', 'team-b');
  assert.notDeepEqual(a.party, b.party);
  assert.ok(profile('strong', 'x').party.rogue.atk > profile('weak', 'x').party.rogue.atk);
  assert.equal(profileHash(a), profileHash(structuredClone(a)));
});

test('the map: corridors between the rooms; the Throne starts sealed', () => {
  const s = fresh();
  assert.equal(distance(s, 'camp', 'r1'), 1);
  assert.equal(distance(s, 'r1', 'r3'), 1);
  assert.equal(distance(s, 'r2', 'r4'), 1);
  assert.equal(distance(s, 'r3', 'r5'), 1);
  assert.ok(routeOptions(s).every((o) => o.to !== 'r5'));
});

test('entering a room costs torches, records a decision, and the room’s NPC speaks', () => {
  const s0 = fresh();
  const s = step(s0, { type: 'travel', to: 'r1' });
  assert.equal(s.phase, 'combat');
  assert.ok(s.torches < s0.torches);
  assert.equal(s.decisions.length, 1);
  assert.equal(s.decisions[0].choice, 'room1');
  assert.equal(s.combat.enemies.length, 3);
  assert.equal(s.speech?.npc, 'grum');
  assert.equal(s0.phase, 'map', 'step never mutates the previous state');
});

test('melee cannot reach flyers; magic and ranged can', () => {
  const s = beginFight(fresh(), 'r2');
  const bat = s.combat.enemies.find((e) => e.flying);
  assert.throws(() => step(s, { type: 'attack', targetId: bat.id }), /reach/);
});

test('the Throne holds only Morvath, armoured, announcing his move; no retreat', () => {
  const s = beginFight(fresh('strong'), 'r5');
  assert.deepEqual(s.combat.enemies.map((e) => e.kind), ['morvath']);
  assert.equal(s.combat.enemies[0].armoured, true);
  assert.ok(s.combat.telegraph);
  assert.throws(() => step(s, { type: 'retreat' }), /no retreat/);
});

test('below 60% HP Morvath becomes the Shadow Dragon and summons two Shadow Crawlers', () => {
  const s = beginFight(fresh('strong'), 'r5');
  const m = s.combat.enemies[0];
  m.hp = Math.floor(m.maxHp * 0.55);
  const after = step(s, { type: 'wait' });
  const dragon = after.combat.enemies.find((e) => e.ultimate);
  assert.equal(dragon.phase, 2);
  assert.equal(dragon.name, MORVATH.dragonName);
  assert.equal(after.combat.enemies.filter((e) => e.kind === 'shadow_crawler').length, 2);
});

test('Brakka yields instead of dying', () => {
  // Clear the first wave so the next round brings Brakka.
  const first = beginFight(fresh('strong', 'rogue'), 'r3');
  first.combat.enemies.forEach((e) => (e.hp = -1));
  const brakkaWave = step(first, { type: 'wait' });
  const brakka = brakkaWave.combat.enemies[0];
  assert.equal(brakka.kind, 'brakka');
  brakka.hp = Math.floor(brakka.maxHp * 0.2) + 1;
  const after = step(brakkaWave, { type: 'skill', targetId: brakka.id });
  assert.ok(after.log.some((l) => /yields/.test(l)));
});

test('Pip cooks a Monster Meal from three monster parts', () => {
  const s0 = { ...fresh(), parts: 3 };
  const s = step(s0, { type: 'trade', item: 'meal' });
  assert.equal(s.meals, 1);
  assert.equal(s.parts, 3 - PIP.meal.parts);
  assert.throws(() => step({ ...fresh(), location: 'r1' }, { type: 'trade', item: 'meal' }), /camp/);
});

test('later rooms hit harder, and so does every room as the run progresses', () => {
  const early = beginFight(fresh(), 'r1').combat.enemies[0];
  const late = beginFight({ ...fresh(), stats: { ...fresh().stats, roomsCleared: 3 } }, 'r1').combat.enemies[0];
  const r3 = beginFight(fresh(), 'r3').combat.enemies[0];
  assert.ok(late.hp > early.hp && late.atk > early.atk);
  assert.ok(r3.hp > early.hp);
});

test('retreat returns to camp', () => {
  const s = step(fresh(), { type: 'travel', to: 'r1' });
  const r = step(s, { type: 'retreat' });
  assert.equal(r.location, 'camp');
  assert.equal(r.phase, 'map');
});

test('spending the last torch on the map is a defeat', () => {
  const r = step({ ...fresh(), torches: 1 }, { type: 'rest' });
  assert.equal(r.phase, 'defeat');
  assert.throws(() => step(r, { type: 'rest' }), /over/);
});

test('runs are deterministic: same profile and inputs, same result', () => {
  const p = profile();
  const play = () => {
    let s = createRun(p);
    for (let i = 0; i < 120 && ['setup', 'map', 'combat'].includes(s.phase); i++) s = step(s, simpleInput(s));
    return s;
  };
  assert.deepEqual(play(), play());
});

test('replay rebuilds a run from its inputs and stops at the first illegal one', () => {
  const p = profile();
  const actions = [{ type: 'lead', memberId: 'ranger' }, { type: 'travel', to: 'r1' }, { type: 'wait' }, { type: 'wait' }];
  let s = createRun(p);
  for (const a of actions) s = step(s, a);
  assert.deepEqual(replay(p, actions).state, s);
  const bad = replay(p, [...actions, { type: 'teleport' }, { type: 'wait' }]);
  assert.equal(bad.invalidAt, 4);
  assert.deepEqual(bad.state, s);
});

test('inputs carry only short ids; the browser never sees the dice state', () => {
  const a = cleanAction({ type: 'attack', targetId: 'x', damage: 999, hp: 1e9 });
  assert.ok(Object.keys(a).every((k) => ACTION_FIELDS.includes(k)));
  assert.equal(a.targetId, 'x');
  const view = publicState(createRun(profile()));
  assert.equal('rngState' in view, false);
  assert.equal('decisions' in view, false);
});

test('autosave: a new server resumes the same run; illegal saved inputs are dropped', () => {
  const dir = mkdtempSync(join(tmpdir(), 'quest-'));
  const p = profile();
  const a = new QuestRuns({ profiles: [p], saveDir: dir });
  a.act('g', { type: 'lead', memberId: 'knight' });
  a.act('g', { type: 'travel', to: 'r1' });
  a.act('g', { type: 'wait' });
  const b = new QuestRuns({ profiles: [p], saveDir: dir });
  assert.deepEqual(b.run('g').state, a.run('g').state);
  const save = JSON.parse(readFileSync(join(dir, 'g.json'), 'utf8'));
  assert.equal(save.profileHash, profileHash(p));
  save.actions.splice(2, 0, { type: 'fly' });
  writeFileSync(join(dir, 'g.json'), JSON.stringify(save));
  const c = new QuestRuns({ profiles: [p], saveDir: dir });
  assert.equal(c.run('g').state.turn, 2);
  assert.match(c.run('g').note, /no longer fit/);
});

test('API: play over HTTP; a team code is required when set', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'quest-'));
  const runs = new QuestRuns({ profiles: [{ ...profile(), accessCode: 'k3y' }], saveDir: dir });
  const app = express().use(express.json()).use('/api/quest', questRouter(runs));
  const server = createServer(app);
  await new Promise((r) => server.listen(0, r));
  const base = `http://localhost:${server.address().port}/api/quest`;
  const post = (path, body, code) =>
    fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(code ? { 'x-team-code': code } : {}) }, body: JSON.stringify(body) }).then((r) => r.json());
  try {
    assert.equal((await post('/g/session', {})).ok, false);
    await post('/g/act', { action: { type: 'lead', memberId: 'mage' } }, 'k3y');
    const ok = await post('/g/act', { action: { type: 'travel', to: 'r1' } }, 'k3y');
    assert.equal(ok.state.phase, 'combat');
    const bad = await post('/g/act', { action: { type: 'fly' } }, 'k3y');
    assert.equal(bad.ok, false);
  } finally {
    server.close();
  }
});

// ---------- lanes and boss mechanics ----------

const atRoom = (room, leader = 'knight', tier = 'strong') => beginFight(fresh(tier, leader), room);
const foe = (s, kind) => s.combat.enemies.find((e) => e.kind === kind);

test('the player walks to a lane with their input, and only real lanes count', () => {
  const s = atRoom('r1');
  const after = step(s, { type: 'defend', lane: 'left' });
  assert.equal(after.party.find((m) => m.controlled).lane, 'left');
  assert.throws(() => step(s, { type: 'defend', lane: 'roof' }), /left, centre and right/);
  assert.ok(ACTION_FIELDS.includes('lane'));
});

test('a marked lane is hit; standing elsewhere dodges', () => {
  const s = atRoom('r1');
  s.combat.waveIndex = 1;
  s.combat.enemies = [{ ...s.combat.enemies[0], kind: 'stone_sentinel', name: 'Stone Sentinel', boss: true, move: 'charge', atk: 30, hp: 999, maxHp: 999, def: 0 }];
  s.combat.round = 2; // the next round is a 3rd round: the charge lands
  s.combat.danger = { by: s.combat.enemies[0].id, name: 'Charge', lanes: ['left'], round: 3, damage: 48 };
  for (const m of s.party) m.lane = 'left';
  const leader = s.party.find((m) => m.controlled);
  const hp = leader.hp;
  const dodged = step(s, { type: 'defend', lane: 'right' });
  assert.equal(dodged.party.find((m) => m.controlled).hp, hp, 'the leader stepped out');
  const stayed = step(s, { type: 'defend' });
  assert.ok(stayed.party.find((m) => m.controlled).hp < hp, 'staying in the lane hurts');
});

test('a hidden Ink Wraith can only be hit from its lane', () => {
  const s = atRoom('r2', 'mage');
  s.combat.waveIndex = 1;
  s.combat.enemies = [{ ...s.combat.enemies[0], kind: 'ink_wraith', name: 'The Ink Wraith', boss: true, flying: true, hp: 500, maxHp: 500, def: 0, hiddenIn: 'right', hiddenFor: 2 }];
  for (const m of s.party) m.lane = 'left';
  for (const m of s.party.filter((p) => !p.controlled)) Object.assign(m, { hp: 0, fallen: true });
  const wrong = step(s, { type: 'attack', targetId: s.combat.enemies[0].id, lane: 'left' });
  assert.equal(foe(wrong, 'ink_wraith').hp, 500);
  const right = step(s, { type: 'attack', targetId: s.combat.enemies[0].id, lane: 'right' });
  assert.ok(foe(right, 'ink_wraith').hp < 500 || right.lastRolls[0].value <= 3);
});

test('Brakka in counter stance takes half and strikes back', () => {
  const s = atRoom('r3', 'rogue');
  s.combat.waveIndex = 1;
  s.combat.enemies = [{ ...s.combat.enemies[0], kind: 'brakka', name: 'Brakka the Warrior', boss: true, hp: 900, maxHp: 900, def: 0, atk: 20, stance: 'counter' }];
  for (const m of s.party.filter((p) => !p.controlled)) Object.assign(m, { hp: 0, fallen: true });
  const after = step(s, { type: 'skill', targetId: s.combat.enemies[0].id });
  assert.match(after.log.join('\n'), /blocked half/);
  assert.match(after.log.join('\n'), /Brakka the Warrior's counter hits/);
});

test('living Shadow Crawlers feed Morvath in phase 2', () => {
  const s = atRoom('r5');
  const b = s.combat.enemies[0];
  Object.assign(b, { phase: 2, hp: 300, armoured: true });
  s.combat.enemies.push({ ...b, id: 'c1', kind: 'shadow_crawler', name: 'Shadow Crawler', ultimate: false, boss: false, hp: 999, maxHp: 999, atk: 1 });
  const after = step(s, { type: 'defend' });
  assert.match(after.log.join('\n'), /feed Morvath/);
  assert.ok(after.combat.enemies.find((e) => e.ultimate).hp > 300);
});
