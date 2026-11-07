// One tagged test (or more) per Curse. Clean build: all pass. Each planted Curse makes its own tag fail.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { rollAttack } from '../src/engine/combat.js';
import { rollCheck, rollFateDie } from '../src/engine/dice.js';
import { buildDmContext } from '../src/dm/context.js';
import { createDungeonMaster } from '../src/dm/dungeonMaster.js';
import { validateDmOutput } from '../src/dm/validate.js';
import { normalizeRoomCode } from '../src/rooms/roomCode.js';
import { sanitizePayload } from '../src/rooms/roomManager.js';
import { createRng, hashSeed } from '../src/engine/rng.js';
import { aid, heroTurn, inRoom, makeManager, startedRoom, toCombat } from './helpers.js';

const root = fileURLToPath(new URL('../..', import.meta.url));
const read = (...p) => readFileSync(join(root, ...p), 'utf8');

// ---------- Easy (server side; E1, E2 and the client half of E3/E4 are in client/test) ----------

test('[E3] every server roll exposes its face as `value`', async () => {
  const rng = createRng({ rngState: hashSeed('e3') });
  for (const roll of [rollCheck(rng, { bonus: 3, dc: 12 }), rollAttack(rng, { atk: 12, def: 3 }).roll, rollFateDie(rng, 3)]) {
    assert.ok(Number.isInteger(roll.value) && roll.value >= 1);
  }
  const { manager } = makeManager();
  const { code } = await startedRoom(manager, 'rogue');
  await heroTurn(manager, code);
  for (const r of manager.view(code).lastRolls) assert.equal(typeof r.value, 'number');
});

test('[E4] lowercase / spaced run codes open the right run', async () => {
  assert.equal(normalizeRoomCode(' ab c2 3 '), 'ABC23');
  const { manager } = makeManager();
  const { code, hero } = await startedRoom(manager);
  const messy = ` ${code.toLowerCase().split('').join(' ')} `;
  assert.equal(manager.exists(messy), true);
  assert.deepEqual(manager.authenticate(messy, hero.token), { code, playerId: hero.playerId });
});

// ---------- Medium ----------

test('[M1] the vote stays open until the hero votes, and closes once', async () => {
  const { manager } = makeManager();
  const { code, heroId, state } = await startedRoom(manager);
  const voteId = state.vote.id;
  assert.equal(Object.keys(state.vote.votes).length, 3, 'companions have voted');
  assert.equal(state.vote.closed, false, 'companion votes must not close the vote');
  await manager.perform(code, heroId, { actionId: aid(), type: 'vote', payload: { optionId: state.vote.options[0] } });
  assert.notEqual(state.vote?.id, voteId, 'hero voted: resolved and moved on');
  assert.equal(await manager.closeWindow(code, voteId), false, 'a stale timer cannot close it again');
});

test('[M1] the timer closes the vote if the hero does not vote', async () => {
  const { manager } = makeManager();
  const { code, state } = await startedRoom(manager);
  const voteId = state.vote.id;
  assert.equal(await manager.closeWindow(code, voteId), true);
  assert.notEqual(state.vote?.id, voteId);
});

test('[M2] the Dungeon Master is told HP, items and Memory Shards', async () => {
  const { manager } = makeManager();
  const { state, me } = await startedRoom(manager, 'warrior');
  me.hp = 77;
  state.shards = ['shard-gate'];
  const ctx = buildDmContext(state, { type: 'scene_intro' });
  const hero = ctx.party.find((p) => p.name === 'Aria');
  assert.equal(hero.hp, 77);
  assert.equal(hero.maxHp, 120);
  assert.ok(hero.items.includes('Health Potion'));
  assert.equal(ctx.party.length, 4, 'companions are part of the context');
  assert.deepEqual(ctx.shards, { found: 1, total: 5 });
});

test('[M3] the same action id twice runs once', async () => {
  const { manager } = makeManager();
  const { code, me, state } = await startedRoom(manager, 'warrior');
  inRoom(state);
  me.hp = 50;
  const potion = me.inventory.find((s) => s.item === 'health_potion');
  const msg = { actionId: aid(), type: 'use_item', payload: { itemUid: potion.uid } };
  await manager.perform(code, me.id, msg);
  const again = await manager.perform(code, me.id, msg);
  assert.equal(again.duplicate, true);
  assert.equal(me.hp, 80, 'healed once, not twice');
});

test('[M3] a repeated combat click cannot spill into the next round', async () => {
  const { manager } = makeManager();
  const { code, me, state } = await startedRoom(manager, 'warrior');
  await toCombat(manager, code);
  assert.equal(state.phase, 'combat');
  const msg = { actionId: aid(), type: 'combat_action', payload: { type: 'defend' } };
  await manager.perform(code, me.id, msg);
  const round = state.combat?.round;
  await manager.perform(code, me.id, msg);
  if (state.phase === 'combat' && state.combat.round === round) assert.equal(state.combat.actions[me.id], undefined);
});

test('[M3] actions without an idempotency key are refused', async () => {
  const { manager } = makeManager();
  const { code, heroId } = await startedRoom(manager);
  await assert.rejects(manager.perform(code, heroId, { type: 'vote', payload: {} }), { code: 'bad_action_id' });
});

test('[M4] reloading with your token is the same hero, never a second one', async () => {
  const { manager } = makeManager();
  const { code, hero, state } = await startedRoom(manager);
  const again = await manager.joinRoom(code, 'Aria', hero.token);
  assert.equal(again.playerId, hero.playerId);
  assert.equal(again.rejoined, true);
  assert.equal(state.order.filter((id) => !state.players[id].npc).length, 1);
  await assert.rejects(manager.joinRoom(code, 'Intruder'), { code: 'singleplayer' });
});

// ---------- Advanced ----------

test('[A1] nobody can act in a run that is not theirs', async () => {
  const { manager } = makeManager();
  const a = await startedRoom(manager);
  const b = await startedRoom(manager);
  await assert.rejects(manager.perform(a.code, b.heroId, { actionId: aid(), type: 'vote', payload: { optionId: 'force' } }), {
    code: 'not_member',
  });
  await assert.rejects(manager.perform(a.code, undefined, { actionId: aid(), type: 'start' }), { code: 'not_member' });
  await assert.rejects(manager.perform(a.code, 'npc-mage', { actionId: aid(), type: 'retry' }), { code: 'not_member' }, 'companions are not seats');
  assert.equal(manager.authenticate(a.code, b.hero.token), null);
  assert.equal(manager.authenticate(a.code, 'forged-token'), null);
});

test('[A2] the server ignores client-sent HP, damage and other numbers', async () => {
  assert.deepEqual(sanitizePayload('use_item', { itemUid: 'i1', hp: 999, damage: 500, amount: 1e9 }), { itemUid: 'i1' });
  assert.deepEqual(sanitizePayload('combat_action', { type: 'attack', targetId: 'e1', damage: 9999 }), { type: 'attack', targetId: 'e1' });
  const { manager } = makeManager();
  const { code, me, state } = await startedRoom(manager);
  inRoom(state);
  me.hp = 40;
  const potion = me.inventory.find((s) => s.item === 'health_potion');
  await manager.perform(code, me.id, { actionId: aid(), type: 'use_item', payload: { itemUid: potion.uid, hp: 9999, amount: 9999 } });
  assert.equal(me.hp, 70);
});

test('[A2] combat damage is rolled by the server whatever the client claims', async () => {
  const { manager } = makeManager();
  const { code, me, state } = await startedRoom(manager, 'mage');
  await toCombat(manager, code);
  const enemy = state.enemies[0];
  const before = enemy.hp;
  await manager.perform(code, me.id, { actionId: aid(), type: 'combat_action', payload: { type: 'attack', targetId: enemy.id, damage: 9999 } });
  assert.ok(before - enemy.hp <= 22 * 2 * 4, 'no 9999-damage hit');
  assert.ok(!state.log.some((e) => /for 9999/.test(e.text)));
});

test('[A3] runs keep separate state', async () => {
  const { manager } = makeManager();
  const a = await startedRoom(manager, 'warrior', 'Aria');
  const b = await startedRoom(manager, 'warrior', 'Bram');
  assert.notEqual(a.state.players, b.state.players);
  assert.notEqual(a.state.log, b.state.log);
  assert.deepEqual(a.state.vote?.options, b.state.vote?.options, 'same seeded dungeon');
  const before = JSON.stringify({ players: b.state.players, sceneIndex: b.state.sceneIndex, phase: b.state.phase });
  inRoom(a.state);
  a.me.hp = 10;
  await manager.perform(a.code, a.heroId, { actionId: aid(), type: 'use_item', payload: { itemUid: a.me.inventory[0].uid } });
  await heroTurn(manager, a.code);
  assert.equal(JSON.stringify({ players: b.state.players, sceneIndex: b.state.sceneIndex, phase: b.state.phase }), before);
  assert.ok(!b.state.log.some((e) => e.text.includes('Aria')), "another run's chronicle leaked in");
});

test('[A4] parallel uses of one potion consume it exactly once', async () => {
  const { manager } = makeManager();
  const { code, me, state } = await startedRoom(manager);
  inRoom(state);
  me.hp = 20;
  const potion = me.inventory.find((s) => s.item === 'health_potion');
  const results = await Promise.allSettled(
    Array.from({ length: 5 }, () => manager.perform(code, me.id, { actionId: aid(), type: 'use_item', payload: { itemUid: potion.uid } })),
  );
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.ok(results.filter((r) => r.status === 'rejected').every((r) => r.reason.code === 'item_not_found'));
  assert.equal(me.hp, 50);
});

// ---------- Hidden Relics ----------

test('[R1] the AI cannot win the game or change HP', async () => {
  const evil = { narration: 'You win! Everyone is healed to 999 HP.', suggested_choices: ['Claim the crown'], hp: 999, phase: 'victory', winner: true };
  assert.deepEqual(Object.keys(validateDmOutput(evil)).sort(), ['narration', 'suggested_choices']);
  assert.equal(validateDmOutput('not json'), null);
  const dm = createDungeonMaster({ llm: async () => JSON.stringify(evil) });
  const { manager } = makeManager({ dm });
  const { code, state, me } = await startedRoom(manager);
  await manager.idle(code);
  assert.equal(state.narration.source, 'llm');
  assert.match(state.narration.text, /You win/);
  assert.notEqual(state.phase, 'victory');
  assert.equal(state.stats.bossDefeated, false);
});

test('[R1] a slow or broken AI falls back to scripted narration', async () => {
  const slow = createDungeonMaster({
    llm: (ctx, signal) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('timeout')))),
    timeoutMs: 20,
  });
  assert.equal((await slow.narrate({ trigger: { type: 'scene_intro' }, scene: { intro: 'A dark hall.' }, party: [] })).source, 'scripted');
  const broken = createDungeonMaster({ llm: async () => '{"narration": 42}' });
  assert.equal((await broken.narrate({ trigger: { type: 'victory' }, party: [] })).source, 'scripted');
});

test('[R2] no API key reaches the frontend or the repo', () => {
  const secret = /(sk-ant-[\w-]{10,}|ANTHROPIC_API_KEY|OPENAI_API_KEY|SUPABASE_SERVICE|VITE_[A-Z_]*(KEY|SECRET|TOKEN))/;
  const files = ['client/index.html', 'client/vite.config.js', 'client/src/net.js', 'client/src/useRoom.js', 'client/src/App.jsx'];
  for (const f of files) if (existsSync(join(root, f))) assert.doesNotMatch(read(f), secret, `secret-looking value in ${f}`);
  for (const f of ['.env', '.env.local', '.env.production']) assert.equal(existsSync(join(root, 'client', f)), false, `client/${f} must not exist`);
  assert.match(read('.gitignore'), /^\.env$/m);
  assert.match(read('server/.env.example'), /^ANTHROPIC_API_KEY=$/m, '.env.example must not carry a real key');
});
