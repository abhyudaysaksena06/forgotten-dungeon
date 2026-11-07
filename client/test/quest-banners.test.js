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

test('choosing a leader hands out the first quests', () => {
  const s0 = createRun(makeProfile({ teamId: 't', seed: 't', tier: 'strong' }));
  const s1 = step(s0, { type: 'lead', memberId: 'rogue' });
  const b = bannersFor(view(s0), view(s1), meta);
  assert.deepEqual(titles(b), ['New Quests']);
  assert.match(b[0].sub, /The Shattered Heart/);
});

test('entering a room starts a battle; clearing it shows victory and a quest clear', () => {
  const map = step(createRun(makeProfile({ teamId: 't', seed: 't', tier: 'strong' })), { type: 'lead', memberId: 'rogue' });
  const fight = step(map, { type: 'travel', to: 'r1' });
  assert.deepEqual(titles(bannersFor(view(map), view(fight), meta)), ['Battle Start!']);
  const last = beginFight(structuredClone(map), 'r1');
  last.combat.waveIndex = ROOMS.r1.waves.length - 1;
  last.combat.enemies = [{ ...last.combat.enemies[0], hp: -1 }];
  const won = step(last, { type: 'wait' });
  const t = titles(bannersFor(view(last), view(won), meta));
  assert.equal(t[0], 'Victory!');
  assert.ok(t.includes('Quest Clear!'));
});

test('skills get a cut-in, plain attacks do not', () => {
  const me = { name: 'Rook', cls: 'rogue' };
  assert.equal(cutInFor({ type: 'skill' }, me, meta).title, 'Twin Strike!');
  assert.equal(cutInFor({ type: 'rune' }, me, meta).title, 'Rune Strike!');
  assert.equal(cutInFor({ type: 'attack' }, me, meta), null);
});
