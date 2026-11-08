// The cage locks (server/src/quest/locks.js). Organiser-side: scripts/quest-verify.mjs proves each
// planted bug locks exactly its own round's cage; this proves the clean game locks none.
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { brokenRunes, cageRunes } from '../src/quest/locks.js';
import { QuestRuns } from '../src/quest/runs.js';
import { makeProfile } from '../src/quest/teams.js';

test('the clean game has no broken runes, so every cleared room’s cage opens', () => {
  for (const round of [1, 2, 3, 4]) assert.equal(brokenRunes(round), 0, `round ${round}`);
  const p = makeProfile({ teamId: 'c', seed: 'c', tier: 'strong' });
  const runs = new QuestRuns({ profiles: [p], saveDir: mkdtempSync(join(tmpdir(), 'quest-cage-')) });
  const run = runs.run('c');
  run.state = { ...run.state, fragments: ['r1'], location: 'r1' };
  run.state.party[0].hp = 10;
  assert.equal(cageRunes(run.state), 0);
  assert.equal(runs.view('c').state.cageRunes, 0);
  const kael = runs.act('c', { type: 'healer' }).state.party[0];
  assert.equal(kael.hp, kael.maxHp);
});

test('no cage, no lock: the camp and an uncleared room report none', () => {
  const s = makeProfile({ teamId: 'c', seed: 'c', tier: 'strong' });
  const runs = new QuestRuns({ profiles: [s], saveDir: mkdtempSync(join(tmpdir(), 'quest-cage-')) });
  assert.equal(cageRunes(runs.run('c').state), 0);
});
