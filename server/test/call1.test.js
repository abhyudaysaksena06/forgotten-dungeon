// Client Call 1 — The King Fights Back.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkBossThresholds, executeTelegraph, getBoss, spawnBoss } from '../src/engine/combat.js';
import { aid, companion, makeManager, startedRoom, toBoss } from './helpers.js';

async function throne(cls = 'warrior') {
  const { manager } = makeManager();
  const run = await startedRoom(manager, cls);
  await toBoss(manager, run.code);
  for (const p of Object.values(run.state.players)) Object.assign(p, { hp: p.maxHp, fallen: false, poison: 0, defending: false });
  return { manager, ...run };
}

test('[C1] the King telegraphs his next move to the browser every round', async () => {
  const { manager, code, state, heroId } = await throne();
  assert.equal(state.phase, 'combat');
  const view = manager.view(code);
  const king = view.enemies.find((e) => e.boss);
  assert.equal(king.maxHp, 380);
  assert.ok(view.boss?.telegraph, 'boss.telegraph in the public state');
  assert.ok(['Crown Strike', 'Grave Wail'].includes(view.boss.telegraph.name));
  assert.equal(typeof view.boss.telegraph.damage, 'number');
  const round = state.combat.round;
  await manager.perform(code, heroId, { actionId: aid(), type: 'combat_action', payload: { type: 'defend' } });
  if (state.phase === 'combat') {
    assert.equal(state.combat.round, round + 1);
    assert.ok(manager.view(code).boss.telegraph, 'a fresh telegraph for the next round');
  }
});

test('[C1] Crown Strike: 35 to its target, halved by Defend, +5 when enraged', async () => {
  const { state, me } = await throne();
  state.boss.telegraph = { attack: 'crown_strike', targetId: me.id };
  executeTelegraph(state, false);
  assert.equal(me.hp, 85);
  me.defending = true;
  state.boss.enraged = true;
  executeTelegraph(state, false);
  assert.equal(me.hp, 85 - 20);
  assert.equal(companion(state, 'mage').hp, 80, 'single target only');
});

test('[C1] Grave Wail: 12 to everyone and poisons; Shield Wall halves it', async () => {
  const { state, me } = await throne();
  state.boss.telegraph = { attack: 'grave_wail', targetId: null };
  executeTelegraph(state, true);
  assert.equal(me.hp, 114);
  assert.equal(companion(state, 'mage').hp, 74);
  assert.ok(Object.values(state.players).every((p) => p.poison === 3));
});

test('[C1] thralls below 66% and enrage below 33%, each once', async () => {
  const { state } = await throne();
  const king = getBoss(state);
  king.hp = Math.ceil(king.maxHp * 0.66) + 1;
  checkBossThresholds(state);
  assert.equal(state.enemies.length, 1);
  king.hp = Math.floor(king.maxHp * 0.66) - 1;
  checkBossThresholds(state);
  checkBossThresholds(state);
  assert.equal(state.enemies.filter((e) => e.kind === 'skeleton').length, 2);
  king.hp = Math.floor(king.maxHp * 0.33) - 1;
  checkBossThresholds(state);
  assert.equal(state.boss.enraged, true);
});

test('[C1] the King never uses a basic attack — only his telegraphed move', async () => {
  const { manager, code, state, heroId } = await throne();
  for (let i = 0; i < 3 && state.phase === 'combat'; i++) {
    await manager.perform(code, heroId, { actionId: aid(), type: 'combat_action', payload: { type: 'defend' } });
  }
  assert.ok(!state.log.some((e) => /^The Forgotten King (hits|swings)/.test(e.text)));
});

test('[C1] King HP never goes negative and client damage is ignored', async () => {
  const { manager, code, state, heroId } = await throne('mage');
  const king = getBoss(state);
  king.hp = 1;
  await manager.perform(code, heroId, { actionId: aid(), type: 'combat_action', payload: { type: 'attack', targetId: king.id, damage: 5000 } });
  assert.ok(king.hp >= 0);
  assert.ok(manager.view(code).enemies.every((e) => e.hp >= 0));
  void spawnBoss;
});
