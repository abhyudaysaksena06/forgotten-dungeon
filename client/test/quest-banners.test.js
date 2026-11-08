// The anime-style banners follow real engine transitions.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bannersFor, cutInFor } from '../src/quest/banners.js';
import { ROOMS } from '../../server/src/quest/data.js';
import { beginFight, createRun, publicState, step } from '../../server/src/quest/engine.js';
import { makeProfile } from '../../server/src/quest/teams.js';

const meta = { rooms: ROOMS, classes: { rogue: { skill: { name: 'Twin Strike' } } } };
const view = (s) => publicState(s);
const titles = (list) => list.map((b) => b.title);

test('a new run hands out the first quests', () => {
  const s0 = createRun(makeProfile({ teamId: 't', seed: 't', tier: 'strong' }));
  const b = bannersFor(null, view(s0), meta);
  assert.deepEqual(titles(b), ['New Quests']);
  assert.match(b[0].sub, /The Shattered Heart/);
  assert.deepEqual(bannersFor(null, view(step(s0, { type: 'travel', to: 'r1' })), meta), [], 'not when resuming a run');
});

test('entering a room starts a battle; clearing it shows victory and a quest clear', () => {
  const map = createRun(makeProfile({ teamId: 't', seed: 't', tier: 'strong' }));
  const fight = step(map, { type: 'travel', to: 'r1' });
  assert.deepEqual(titles(bannersFor(view(map), view(fight), meta)), ['Battle Start!']);
  const last = beginFight(structuredClone(map), 'r1');
  last.combat.waveIndex = ROOMS.r1.waves.length - 1;
  last.combat.enemies = [{ ...last.combat.enemies[0], hp: -1 }];
  const won = step(last, { type: 'wait' });
  const b = bannersFor(view(last), view(won), meta);
  const t = titles(b);
  assert.equal(t[0], 'Victory!');
  assert.match(b[0].note, /cage is open/);
  assert.ok(t.includes('Quest Clear!'));
  // With broken runes left in the round (counted by the server), the cage stays shut.
  const locked = bannersFor(view(last), { ...view(won), cageRunes: 2 }, meta);
  assert.match(locked[0].note, /stays shut: 2 broken runes/);
});

test('skills get a cut-in, plain attacks do not', () => {
  const me = { name: 'Rook', cls: 'rogue' };
  assert.equal(cutInFor({ type: 'skill' }, me, meta).title, 'Twin Strike!');
  assert.equal(cutInFor({ type: 'rune' }, me, meta).title, 'Rune Strike!');
  assert.equal(cutInFor({ type: 'attack' }, me, meta), null);
});

test('an Enraged boss gets its banner, once', () => {
  const nem = (enraged) => ({ id: 'nemesis-1-0', name: 'The Hell Nemesis', boss: true, hp: 60, enraged });
  const at = (enraged) => ({ phase: 'combat', fragments: [], party: [], stats: { wipes: 0 }, combat: { roomId: 'r3', waveIndex: 1, enemies: [nem(enraged)] } });
  const b = bannersFor(at(false), at(true), meta);
  assert.deepEqual(titles(b), ['Enraged!']);
  assert.deepEqual(bannersFor(at(true), at(true), meta), []);
});
