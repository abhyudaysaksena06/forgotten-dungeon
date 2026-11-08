// The Hell Nemesis (room 3's boss): Charge, Enrage below half health, the Infernal Slam.
// Kept outside test/quest (the hidden suite), so a planted bug never fails these too.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LANES, MECHANICS, NEMESIS, ROOMS } from '../src/quest/data.js';
import { beginFight, createRun, step } from '../src/quest/engine.js';
import { makeProfile } from '../src/quest/teams.js';

const atNemesis = (seed = 'nemesis') => {
  const s = beginFight(createRun(makeProfile({ teamId: 'n', seed, tier: 'strong' })), 'r3', ROOMS.r3.waves.length - 1);
  s.party[0].hp = s.party[0].maxHp = 5000; // a Kael who outlasts any test
  return s;
};
const boss = (s) => s.combat.enemies.find((e) => e.kind === 'nemesis');
const lines = (before, after) => after.log.slice(before.log.length);

test('the Nemesis enrages once, below half health: harder blows, specials every second round', () => {
  let s = atNemesis();
  const atk = boss(s).atk;
  boss(s).hp = Math.floor(boss(s).maxHp * NEMESIS.enrageAt) - 1;
  const after = step(s, { type: 'defend' });
  assert.equal(boss(after).enraged, true);
  assert.equal(boss(after).atk, Math.round(atk * NEMESIS.enragedAtk));
  assert.ok(lines(s, after).some((l) => /Enraged/.test(l)));
  s = step(after, { type: 'defend' });
  assert.equal(boss(s).atk, boss(after).atk, 'only once');
});

test('Enraged, it alternates the Charge with the Infernal Slam, which floods every lane a round ahead', () => {
  let s = atNemesis('slam');
  boss(s).hp = Math.floor(boss(s).maxHp * NEMESIS.enrageAt) - 1;
  boss(s).def = 999; // Kael's blows can't end the fight first
  const seen = [];
  for (let i = 0; i < 14 && s.phase === 'combat'; i++) {
    const d = s.combat.danger;
    if (d && !seen.includes(d.name)) seen.push(d.name);
    if (d?.slam) {
      assert.deepEqual(d.lanes, LANES, 'no safe lane');
      assert.equal(d.round, s.combat.round + 1, 'announced a round ahead');
      const hp = s.party[0].hp + s.party[0].shield;
      const next = step(s, { type: 'defend' });
      assert.ok(lines(s, next).some((l) => /hellfire bursts across every lane/.test(l)));
      const lost = hp - (next.party[0].hp + next.party[0].shield);
      assert.ok(lost >= Math.ceil(d.damage / 2), 'the slam lands everywhere');
      assert.ok(lost < d.damage * 2, 'defending halves it');
      s = next;
      continue;
    }
    s = step(s, { type: 'defend' });
  }
  assert.deepEqual(seen.slice(0, 2).sort(), ['Charge', 'Infernal Slam']);
});

test('stepping out of a charged lane dodges the Charge', () => {
  let s = atNemesis('charge');
  boss(s).def = 999;
  for (let i = 0; i < 6 && s.phase === 'combat'; i++) {
    const d = s.combat.danger;
    if (d && !d.slam && d.round === s.combat.round + 1) {
      const safe = LANES.find((l) => !d.lanes.includes(l));
      const hp = s.party[0].hp + s.party[0].shield;
      const next = step(s, { type: 'defend', lane: safe });
      assert.ok(lines(s, next).some((l) => /hits nothing but stone/.test(l)), 'the charge misses');
      assert.ok(hp - (next.party[0].hp + next.party[0].shield) < Math.round(boss(s).atk * MECHANICS.charge.mult), 'no charge damage');
      return;
    }
    s = step(s, { type: 'defend' });
  }
  assert.fail('no charge was announced within six rounds');
});
