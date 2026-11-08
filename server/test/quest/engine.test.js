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
import { CLASSES, MORVATH, PIP, SHIELD, SWORD } from '../../src/quest/data.js';
import { beginFight, createRun, distance, publicState, routeOptions, step } from '../../src/quest/engine.js';
import { replay } from '../../src/quest/replay.js';
import { questRouter } from '../../src/quest/routes.js';
import { ACTION_FIELDS, QuestRuns, cleanAction } from '../../src/quest/runs.js';
import { makeProfile, profileHash } from '../../src/quest/teams.js';

const profile = (tier = 'average', seed = 'guard') => makeProfile({ teamId: 'g', seed, tier });
// The quest has one hero, Kael, in command from the start.
const fresh = (tier) => createRun(profile(tier));
// Inputs that are legal in every build: travel to a fight, then wait.
const simpleInput = (s) => {
  if (s.phase === 'combat') return { type: 'wait' };
  const opt = routeOptions(s).find((o) => o.fight) ?? routeOptions(s)[0];
  return opt ? { type: opt.type, to: opt.to, memberId: opt.memberId } : null;
};

test('a run starts on the map with Kael alone: his Iron Sword sharp and whole, his shield full', () => {
  const p = profile();
  const s = createRun(p);
  assert.equal(s.phase, 'map');
  assert.deepEqual(s.party.map((m) => m.name), ['Kael']);
  assert.equal(s.party[0].controlled, true);
  assert.equal(s.party[0].hp, p.party.knight.hp);
  assert.equal(s.party[0].shield, SHIELD.max);
  assert.ok(s.party[0].sword, 'Kael carries his sword'); // how sharp it starts is hidden test [Q01]
  assert.equal(s.torches, p.torches);
  assert.equal(CLASSES.knight.startingItem, SWORD.name);
  assert.throws(() => step(s, { type: 'lead', memberId: 'knight' }), /On the map you can/);
});

test('teams get different starting stats from their seeds', () => {
  const a = profile('average', 'team-a');
  const b = profile('average', 'team-b');
  assert.notDeepEqual(a.party, b.party);
  assert.ok(profile('strong', 'x').party.knight.atk > profile('weak', 'x').party.knight.atk);
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

test('entering a room costs torches, records a decision, and the narrator sets the scene', () => {
  const s0 = fresh();
  const s = step(s0, { type: 'travel', to: 'r1' });
  assert.equal(s.phase, 'combat');
  assert.ok(s.torches < s0.torches);
  assert.equal(s.decisions.length, 1);
  assert.equal(s.decisions[0].choice, 'room1');
  assert.deepEqual(s.combat.enemies.map((e) => e.kind), Array(6).fill('skeleton'));
  assert.equal(s.speech?.npc, null); // no NPC in the rooms now
  assert.match(s.speech.text, /cage/);
  assert.equal(s0.phase, 'map', 'step never mutates the previous state');
});

test('melee cannot reach flyers; magic and ranged can', () => {
  const s = beginFight(fresh(), 'r2');
  const bat = Object.assign(s.combat.enemies[0], { flying: true });
  assert.throws(() => step(s, { type: 'attack', targetId: bat.id }), /reach/);
});

test('the Throne holds six skeleton guards, then Morvath, armoured, announcing his move; no retreat', () => {
  const s = beginFight(fresh('strong'), 'r5');
  assert.deepEqual(s.combat.enemies.map((e) => e.kind), Array(6).fill('skeleton_guard'));
  assert.throws(() => step(s, { type: 'retreat' }), /no retreat/);
  s.combat.enemies.forEach((e) => (e.hp = -1));
  const morvathWave = step(s, { type: 'wait' });
  assert.deepEqual(morvathWave.combat.enemies.map((e) => e.kind), ['morvath']);
  assert.equal(morvathWave.combat.enemies[0].armoured, true);
  assert.ok(morvathWave.combat.telegraph);
  assert.throws(() => step(morvathWave, { type: 'retreat' }), /no retreat/);
});

test('below 60% HP Morvath becomes the Shadow Dragon and summons two Skeletons', () => {
  const s = beginFight(fresh('strong'), 'r5', 1);
  const m = s.combat.enemies[0];
  m.hp = Math.floor(m.maxHp * 0.55);
  const after = step(s, { type: 'wait' });
  const dragon = after.combat.enemies.find((e) => e.ultimate);
  assert.equal(dragon.phase, 2);
  assert.equal(dragon.name, MORVATH.dragonName);
  assert.equal(after.combat.enemies.filter((e) => e.kind === 'skeleton_risen').length, 2);
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
  const actions = [{ type: 'travel', to: 'r1' }, { type: 'wait' }, { type: 'wait' }, { type: 'wait' }];
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
  a.act('g', { type: 'travel', to: 'r1' });
  a.act('g', { type: 'wait' });
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
    const ok = await post('/g/act', { action: { type: 'travel', to: 'r1' } }, 'k3y');
    assert.equal(ok.state.phase, 'combat');
    const bad = await post('/g/act', { action: { type: 'fly' } }, 'k3y');
    assert.equal(bad.ok, false);
  } finally {
    server.close();
  }
});

// ---------- lanes and boss mechanics ----------

const atRoom = (room, tier = 'strong') => beginFight(fresh(tier), room);
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
  for (const m of s.party) Object.assign(m, { lane: 'left', shield: 0 }); // the whole blow reaches health
  const leader = s.party.find((m) => m.controlled);
  const hp = leader.hp;
  const dodged = step(s, { type: 'defend', lane: 'right' });
  assert.equal(dodged.party.find((m) => m.controlled).hp, hp, 'the leader stepped out');
  const stayed = step(s, { type: 'defend' });
  assert.ok(stayed.party.find((m) => m.controlled).hp < hp, 'staying in the lane hurts');
});

test('living Skeletons feed Morvath in phase 2', () => {
  const s = beginFight(fresh('strong'), 'r5', 1);
  const b = s.combat.enemies[0];
  Object.assign(b, { phase: 2, hp: 300, armoured: true });
  s.combat.enemies.push({ ...b, id: 'c1', kind: 'skeleton_risen', name: 'Skeleton', ultimate: false, boss: false, hp: 999, maxHp: 999, atk: 1 });
  const after = step(s, { type: 'defend' });
  assert.match(after.log.join('\n'), /feed Morvath/);
  assert.ok(after.combat.enemies.find((e) => e.ultimate).hp > 300);
});

test('every second skeleton to fall leaves a monster part: three a room', () => {
  const s = beginFight({ ...fresh('strong'), parts: 0 }, 'r1');
  s.combat.enemies.forEach((e) => (e.hp = 1));
  for (const m of s.party) m.atk = 999;
  // Count the parts as the six fall; whether the fight then ends is another test's business.
  let after = s;
  for (let i = 0; i < 12 && after.combat?.enemies.some((e) => e.hp > 0); i++) after = step(after, { type: 'attack', targetId: after.combat.enemies.find((e) => e.hp > 0).id });
  assert.equal(after.parts, 3);
});

test('the cage stays shut until its room is cleared; then the Healer and the Weaponsmith put Kael right', () => {
  const s = fresh();
  assert.throws(() => step(s, { type: 'healer' }), /opens once this room is cleared/);
  const won = { ...fresh(), fragments: ['r1'], location: 'r1' };
  Object.assign(won.party[0], { hp: 10, shield: 0, sword: { sharpness: 5, durability: 0 } });
  assert.equal(publicState(won).cages, true);
  // (The shield and the sword's durability are hidden tests [Q06] and [Q19].)
  const healed = step(won, { type: 'healer' });
  assert.equal(healed.party[0].hp, healed.party[0].maxHp);
  const mended = step(healed, { type: 'smith' });
  assert.equal(mended.party[0].sword.sharpness, SWORD.sharpness);
  const throne = { ...fresh(), fragments: ['r1', 'r2', 'r3', 'r5'], location: 'r5' };
  assert.equal(publicState(throne).cages, false, 'the Throne has no cage');
});

test('every blow that lands dulls and wears the Iron Sword; a broken sword hits for half', () => {
  const whole = () => ({ sharpness: SWORD.sharpness, durability: SWORD.durability }); // not how a run starts: that is [Q01]
  let s = beginFight(fresh('strong'), 'r1');
  s.party[0].sword = whole();
  for (let i = 0; i < 8 && s.phase === 'combat'; i++) s = step(s, { type: 'attack', targetId: s.combat.enemies.find((e) => e.hp > 0).id });
  const sword = s.party[0].sword;
  assert.ok(sword.sharpness < SWORD.sharpness && sword.durability < SWORD.durability);
  assert.equal(SWORD.sharpness - sword.sharpness, ((SWORD.durability - sword.durability) / SWORD.wearPerHit) * SWORD.dullPerHit);
  // Same dice, sword whole against sword broken.
  const a = beginFight(fresh('strong'), 'r1');
  a.party[0].sword = whole();
  const b = structuredClone(a);
  b.party[0].sword.durability = 0;
  const target = a.combat.enemies[0].id;
  const hitA = step(a, { type: 'attack', targetId: target }).combat.enemies[0];
  const hitB = step(b, { type: 'attack', targetId: target }).combat.enemies[0];
  const lostA = a.combat.enemies[0].hp - hitA.hp;
  const lostB = b.combat.enemies[0].hp - hitB.hp;
  // Halved before a critical doubles it, so allow one point either way.
  if (lostA > 6) assert.ok(Math.abs(lostB - lostA / 2) <= 1, `${lostA} whole, ${lostB} broken`);
});

test('room 3’s boss, the Hell Nemesis, steps out only after its six skeletons fall', () => {
  const s = beginFight(createRun(makeProfile({ teamId: 'b', seed: 'b', tier: 'strong' })), 'r3');
  assert.deepEqual(s.combat.enemies.map((e) => e.kind), Array(6).fill('skeleton'), 'six skeletons and no boss at first');
  s.party[0].shield = 10;
  s.combat.enemies.forEach((e) => (e.hp = -1)); // all six down: the next round brings the boss
  const after = step(s, { type: 'wait' });
  assert.equal(after.phase, 'combat');
  assert.equal(after.combat.waveIndex, 1);
  assert.deepEqual(after.combat.enemies.map((e) => e.kind), ['nemesis']);
  assert.ok(after.combat.enemies[0].boss);
  assert.equal(after.party[0].shield, after.party[0].maxShield, 'Kael raises his shield again before the boss');
});
