import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { COMBAT_ACTIONS, createCombatHandlers } from '../src/lib/actions.js';
import { formatRoll, hpPercent, rollBands } from '../src/lib/format.js';
import { normalizeRoomCode } from '../src/lib/roomCode.js';

test('[E1] every combat button has a handler, and Attack sends an attack', async () => {
  const sent = [];
  const handlers = createCombatHandlers(async (type, payload) => sent.push({ type, payload }));
  for (const action of COMBAT_ACTIONS) assert.equal(typeof handlers[action.handler], 'function', `${action.label} -> ${action.handler}`);
  await handlers[COMBAT_ACTIONS.find((a) => a.type === 'attack').handler]({ targetId: 'e1' });
  assert.deepEqual(sent[0], { type: 'combat_action', payload: { type: 'attack', targetId: 'e1' } });
  const panel = readFileSync(new URL('../src/components/CombatPanel.jsx', import.meta.url), 'utf8');
  assert.match(panel, /handlers\[action\.handler\]/, 'buttons call through the handler table');
});

test('[E2] HP bar shows current / max', () => {
  assert.equal(hpPercent(30, 120), 25);
  assert.equal(hpPercent(120, 120), 100);
  assert.equal(hpPercent(0, 95), 0);
  assert.equal(hpPercent(150, 100), 100);
  assert.equal(hpPercent(5, 0), 0);
});

test('[E3] dice display reads the `value` field', () => {
  assert.equal(formatRoll({ die: 'd20', value: 14 }), '14');
  assert.equal(formatRoll({ die: 'd20', value: 9, bonus: 3, total: 12, dc: 12 }), '9 + 3 = 12');
  assert.equal(formatRoll({ die: 'd20', result: 14 }), '—', 'never NaN');
  assert.ok(!formatRoll({ die: 'd6', value: 4 }).includes('NaN'));
  const bands = rollBands({ value: 8, bonus: 3, dc: 12 });
  assert.equal(bands.length, 20);
  assert.equal(bands[0], 'fumble');
  assert.equal(bands[8], 'success');
  assert.equal(bands[19], 'crit');
});

test('[E4] room codes are trimmed, de-spaced and uppercased before joining', () => {
  assert.equal(normalizeRoomCode('  ab c12 '), 'ABC12');
  assert.equal(normalizeRoomCode('xyz9q'), 'XYZ9Q');
});
