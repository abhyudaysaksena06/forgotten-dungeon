// The camp's paid Healer and Weaponsmith, and rewinding a run to the start of a round.
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { CAMP_SERVICES, SWORD } from '../src/quest/data.js';
import { createRun, publicState, step } from '../src/quest/engine.js';
import { QuestRuns } from '../src/quest/runs.js';
import { makeProfile } from '../src/quest/teams.js';

const profile = makeProfile({ teamId: 'c', seed: 'camp', tier: 'strong' });

test('the camp Healer and Weaponsmith work only once a cage has freed them, for gold', () => {
  const fresh = createRun(profile);
  assert.equal(publicState(fresh).campHelpers, false);
  assert.throws(() => step(fresh, { type: 'camp_healer' }), /free them/);
  const s0 = { ...createRun(profile), fragments: ['r1'], gold: 100 };
  Object.assign(s0.party[0], { hp: 5, shield: 0, poison: 2, sword: { sharpness: 1, durability: 1 } });
  assert.equal(publicState(s0).campHelpers, true);
  const healed = step(s0, { type: 'camp_healer' });
  assert.equal(healed.party[0].hp, healed.party[0].maxHp);
  assert.equal(healed.party[0].shield, healed.party[0].maxShield);
  assert.equal(healed.gold, 100 - CAMP_SERVICES.healer.gold);
  const mended = step(healed, { type: 'camp_smith' });
  assert.equal(mended.party[0].sword.sharpness, SWORD.sharpness);
  assert.equal(mended.party[0].sword.durability, SWORD.durability);
  assert.throws(() => step({ ...s0, gold: 0 }, { type: 'camp_smith' }), /asks 20 gold/);
});

test('a run rewinds to just before a round began, and keeps a checkpoint per round entered', () => {
  const runs = new QuestRuns({ profiles: [profile], saveDir: mkdtempSync(join(tmpdir(), 'quest-rewind-')) });
  runs.act('c', { type: 'travel', to: 'r1' });
  for (let i = 0; i < 4; i++) runs.act('c', { type: 'defend' });
  const v = runs.view('c');
  assert.deepEqual(v.checkpoints.map((c) => [c.room, c.at]), [['r1', 0]]);
  assert.equal(v.state.turn, 5);
  runs.rewind('c', v.checkpoints[0].at);
  const back = runs.view('c');
  assert.equal(back.state.location, 'camp');
  assert.equal(back.state.turn, 0);
  assert.deepEqual(back.checkpoints, []);
});
