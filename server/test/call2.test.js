// Client Call 2 — Private Orders.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildDmContext } from '../src/dm/context.js';
import { publicView } from '../src/engine/view.js';
import { aid, companion, makeManager, startedRoom, toCombat } from './helpers.js';

test('[C2] /whisper gives a companion a private standing order and gets a private reply', async () => {
  const { manager, emitted } = makeManager();
  const { code, state, heroId } = await startedRoom(manager, 'mage');
  const quill = companion(state, 'rogue');
  const logBefore = state.log.length;
  const out = await manager.chat(code, heroId, '/whisper Quill moonlight plan: defend');
  assert.equal(out.kind, 'whisper');
  assert.equal(out.toId, quill.id);
  assert.equal(out.replies.length, 1);
  assert.equal(out.replies[0].fromId, quill.id);
  assert.equal(out.replies[0].toId, heroId);
  assert.equal(state.log.length, logBefore, 'nothing added to the public log');
  for (const leak of [publicView(state, 0), buildDmContext(state, { type: 'scene_intro' }), emitted, state.log]) {
    assert.ok(!JSON.stringify(leak).includes('moonlight'), 'whisper text leaked');
  }
  assert.ok(!JSON.stringify(publicView(state, 0)).includes('"order"'), 'orders are not in the public state');

  // From the next round, the companion follows the order.
  await toCombat(manager, code);
  assert.equal(state.phase, 'combat');
  await manager.perform(code, heroId, { actionId: aid(), type: 'combat_action', payload: { type: 'defend' } });
  if (state.phase === 'combat') assert.equal(state.combat.actions[quill.id]?.type, 'defend');
});

test('[C2] /w works too; gibberish keeps the old order; unknown names are refused', async () => {
  const { manager } = makeManager();
  const { code, state, heroId } = await startedRoom(manager, 'mage');
  const maren = companion(state, 'healer');
  const first = await manager.chat(code, heroId, '/w maren support');
  assert.equal(first.toId, maren.id);
  const confused = await manager.chat(code, heroId, '/w Maren blorp');
  assert.match(confused.replies[0].text, /did not catch/i);
  assert.equal(maren.order, 'support', 'unchanged by gibberish');
  await manager.chat(code, heroId, '/w Maren free');
  assert.equal(maren.order, null);
  await assert.rejects(manager.chat(code, heroId, '/whisper Nobody attack'), { code: 'no_such_player' });
});

test('[C2] ordinary chat is public; whispers never are', async () => {
  const { manager } = makeManager();
  const { code, state, heroId } = await startedRoom(manager);
  await manager.chat(code, heroId, 'hello party');
  assert.ok(state.log.some((e) => e.type === 'chat' && e.text.includes('hello party')));
  assert.ok(!JSON.stringify(buildDmContext(state, { type: 'scene_intro' })).includes('hello party'), 'chat is not DM context');
});
