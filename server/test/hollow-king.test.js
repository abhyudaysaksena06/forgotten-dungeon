// The Hollow King (room 4's boss): the Shadow Tide over two lanes, and the roar below half health.
// Kept outside test/quest (the hidden suite), so a planted bug never fails these too.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HOLLOW_KING, LANES, MECHANICS, POISON_ROUNDS, ROOMS } from '../src/quest/data.js';
import { beginFight, createRun, step } from '../src/quest/engine.js';
import { makeProfile } from '../src/quest/teams.js';

const atKing = (seed = 'king') => {
  const s = beginFight(createRun(makeProfile({ teamId: 'k', seed, tier: 'strong' })), 'r4', ROOMS.r4.waves.length - 1);
  s.party[0].hp = s.party[0].maxHp = 5000; // a Kael who outlasts any test
  return s;
};
const king = (s) => s.combat.enemies.find((e) => e.kind === 'hollow_king');
const lines = (before, after) => after.log.slice(before.log.length);

test('room 4 ends with the Hollow King, after its six skeletons', () => {
  assert.equal(ROOMS.r4.waves.length, 2);
  assert.equal(ROOMS.r4.waves[0].length, 6);
  assert.deepEqual(ROOMS.r4.waves[1], ['hollow_king']);
  const s = atKing();
  assert.ok(king(s));
  assert.ok(s.log.some((l) => /hollow crown/.test(l)), 'he is introduced');
});

test('the Shadow Tide floods two marked lanes a round ahead and poisons whoever stands in them', () => {
  let s = atKing('tide');
  king(s).def = 999; // Kael's blows can't end the fight first
  for (let i = 0; i < 8 && s.phase === 'combat'; i++) {
    const d = s.combat.danger;
    if (d && d.round === s.combat.round + 1) {
      assert.equal(d.name, 'Shadow Tide');
      assert.equal(d.lanes.length, MECHANICS.shadow_tide.lanes);
      // Stay in a flooded lane: hit and poisoned.
      const next = step(s, { type: 'defend', lane: d.lanes[0] });
      assert.ok(lines(s, next).some((l) => /floods the .+ with a shadow tide/.test(l)));
      assert.ok(next.party[0].poison > 0 && next.party[0].poison <= POISON_ROUNDS, 'poisoned');
      // The same tide from the one dry lane: nothing.
      const safe = LANES.find((l) => !d.lanes.includes(l));
      const dry = step(s, { type: 'defend', lane: safe });
      assert.ok(lines(s, dry).some((l) => /hits nothing but stone/.test(l)), 'the tide misses');
      assert.equal(dry.party[0].poison, 0);
      return;
    }
    s = step(s, { type: 'defend' });
  }
  assert.fail('no tide was announced within eight rounds');
});

test('below half health he roars, once, and two Skeletons rise; the room is not won while they stand', () => {
  let s = atKing('roar');
  king(s).hp = Math.floor(king(s).maxHp * HOLLOW_KING.roarAt) - 1;
  const after = step(s, { type: 'defend' });
  assert.equal(king(after).roared, true);
  assert.ok(lines(s, after).some((l) => /roars, and the barracks answer/.test(l)));
  const risen = after.combat.enemies.filter((e) => e.kind === 'skeleton_risen');
  assert.equal(risen.length, HOLLOW_KING.summon);
  s = step(after, { type: 'defend' });
  assert.equal(s.combat.enemies.filter((e) => e.kind === 'skeleton_risen').length, HOLLOW_KING.summon, 'only once');
  // The king falls but his Skeletons still stand: the fight goes on.
  king(s).hp = 0;
  s = step(s, { type: 'defend' });
  assert.equal(s.phase, 'combat');
});
