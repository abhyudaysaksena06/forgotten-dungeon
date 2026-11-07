// Guard tests: rules that work in the clean build AND in the participant build. Any failure in a
// participant's repo counts as a regression.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CLASSES, checkBonus } from '../src/engine/classes.js';
import { attackOutcome, bossMaxHp, computeDamage, hitEnemy, mitigate, spawnBoss } from '../src/engine/combat.js';
import { DC, resolveCheck } from '../src/engine/dice.js';
import { SCENES, SHARD_IDS } from '../src/engine/dungeon.js';
import { addPlayer, applyAction, createGame } from '../src/engine/game.js';
import { INVENTORY_SLOTS, giveItem } from '../src/engine/items.js';
import { applyPoison, tickPoison } from '../src/engine/party.js';
import { createRng, hashSeed, scriptedRng } from '../src/engine/rng.js';
import { computeHeroScore } from '../src/engine/score.js';
import { closeVote, openVote, tallyVotes } from '../src/engine/votes.js';
import { aid, companion, heroTurn, makeManager, playToEnd, startedRoom, toCombat } from './helpers.js';

function engineGame(cls = 'warrior') {
  const state = createGame({ code: 'TEST1', seed: 's' });
  const ctx = { now: 0, voteSeconds: 30, actionSeconds: 30, npcSeconds: 2, narrate: [], rng: createRng(state) };
  addPlayer(state, { id: 'hero', name: 'Hero' });
  applyAction(state, 'hero', 'choose_class', { cls }, ctx);
  applyAction(state, 'hero', 'start', {}, ctx);
  return { state, ctx, hero: state.players.hero };
}

test('class stats match the rules sheet', () => {
  assert.deepEqual(
    Object.fromEntries(Object.entries(CLASSES).map(([k, c]) => [k, [c.hp, c.atk, c.def]])),
    { warrior: [120, 12, 8], mage: [80, 16, 3], rogue: [90, 11, 5], healer: [95, 7, 5] },
  );
  assert.equal(checkBonus('rogue', 'cunning'), 3);
  assert.equal(checkBonus('rogue', 'might'), 0);
});

test('checks: nat 20, nat 1, beat DC, partial within 4, fail by 5+', () => {
  assert.deepEqual(DC, { easy: 8, medium: 12, hard: 16 });
  assert.equal(resolveCheck(20, 0, 30), 'critical_success');
  assert.equal(resolveCheck(1, 10, 2), 'critical_fail');
  assert.equal(resolveCheck(9, 3, 12), 'success');
  assert.equal(resolveCheck(8, 0, 12), 'partial');
  assert.equal(resolveCheck(7, 0, 12), 'fail');
});

test('attack d20 bands and damage formula', () => {
  assert.equal(attackOutcome(4), 'miss');
  assert.equal(attackOutcome(5), 'hit');
  assert.equal(attackOutcome(19), 'hit');
  assert.equal(attackOutcome(20), 'critical');
  assert.equal(computeDamage({ atk: 12, bonusDie: 3, def: 3 }), 12);
  assert.equal(computeDamage({ atk: 2, bonusDie: 1, def: 10 }), 1, 'minimum 1');
  assert.equal(computeDamage({ atk: 12, bonusDie: 3, def: 3, critical: true }), 24);
  assert.equal(mitigate(25, { defending: true }), 13);
  assert.equal(mitigate(25, { defending: true, shieldWall: true }), 7);
});

test('seeded RNG is deterministic per seed', () => {
  const seq = (seed) => {
    const r = createRng({ rngState: hashSeed(seed) });
    return Array.from({ length: 10 }, () => r.die(20));
  };
  assert.deepEqual(seq('same'), seq('same'));
  assert.notDeepEqual(seq('same'), seq('other'));
});

test('the hero is joined by one AI companion of each other class', () => {
  const { state } = engineGame('rogue');
  const party = state.order.map((id) => state.players[id]);
  assert.equal(party.length, 4);
  assert.deepEqual(party.map((p) => p.cls).sort(), ['healer', 'mage', 'rogue', 'warrior']);
  assert.equal(party.filter((p) => p.npc).length, 3);
  assert.equal(state.hostId, 'hero');
  assert.ok(party.every((p) => p.hp === p.maxHp && p.inventory.length >= 3));
});

test('[M1] companions vote as the room opens and explain themselves', () => {
  const { state } = engineGame('warrior');
  assert.equal(state.phase, 'scene');
  assert.equal(Object.keys(state.vote.votes).length, 3);
  assert.ok(state.log.some((e) => e.type === 'npc'));
  assert.equal(state.vote.closed, false);
});

test("the hero's vote counts double; ties go to the Fate Die", () => {
  const { state } = engineGame('warrior');
  openVote(state, ['x', 'y', 'z'], 0, 30);
  state.vote.votes = { hero: 'x', 'npc-mage': 'y', 'npc-rogue': 'z', 'npc-healer': 'z' };
  const weight = (id) => (state.players[id].npc ? 1 : 2);
  assert.deepEqual(tallyVotes(state.vote.votes, state.vote.options, weight).leaders, ['x', 'z']);
  assert.equal(closeVote(state, scriptedRng([2])).winner, 'z');
  openVote(state, ['x', 'y'], 0, 30);
  state.vote.votes = { hero: 'x', 'npc-mage': 'y' };
  assert.equal(closeVote(state, scriptedRng([])).winner, 'x');
});

test('no votes at all: the Fate Die picks among every option', () => {
  const state = createGame({ code: 'X', seed: 's' });
  openVote(state, ['x', 'y', 'z'], 0, 30);
  assert.equal(closeVote(state, scriptedRng([3])).winner, 'z');
});

test('poison deals 3 damage for 3 rounds', () => {
  const { state, hero } = engineGame('warrior');
  applyPoison(hero);
  for (let i = 0; i < 4; i++) tickPoison(state);
  assert.equal(hero.hp, 120 - 9);
  assert.equal(hero.poison, 0);
});

test('inventory holds 6; overflow loot goes to a companion, then is lost', () => {
  const { state, hero } = engineGame('warrior');
  for (const p of Object.values(state.players)) while (p.inventory.length < INVENTORY_SLOTS) giveItem(state, 'health_potion', p.id);
  assert.equal(giveItem(state, 'antidote', hero.id), null);
  assert.equal(hero.inventory.length, 6);
});

test('Revive Charm only works on the Fallen; potions do not', async () => {
  const { state, ctx, hero } = engineGame('healer');
  state.phase = 'scene';
  const ally = companion(state, 'warrior');
  ally.hp = 0;
  ally.fallen = true;
  const potion = hero.inventory.find((s) => s.item === 'health_potion');
  await assert.rejects(async () => applyAction(state, 'hero', 'use_item', { itemUid: potion.uid, targetId: ally.id }, ctx), /cannot reach the Fallen/);
  const charm = hero.inventory.find((s) => s.item === 'revive_charm');
  await applyAction(state, 'hero', 'use_item', { itemUid: charm.uid, targetId: ally.id }, ctx);
  assert.equal(ally.hp, 30);
  assert.equal(ally.fallen, false);
});

test('the King has 140 + 60 HP per hero; all 5 shards double only the first hit', () => {
  assert.equal(bossMaxHp(4), 380);
  const { state } = engineGame('mage');
  const king = spawnBoss(state);
  state.shards = [...SHARD_IDS];
  assert.equal(hitEnemy(state, king, 10).dealt, 20);
  assert.equal(hitEnemy(state, king, 10).dealt, 10);
});

test('the dungeon has 3 stages, 5 shards and ends in the boss', () => {
  assert.deepEqual([...new Set(SCENES.map((s) => s.stage))], [1, 2, 3]);
  const shardSources = SCENES.flatMap((s) => [s.shard, ...(s.options ?? []).map((o) => o.reward?.shard)]).filter(Boolean);
  assert.deepEqual(shardSources.sort(), [...SHARD_IDS].sort());
  assert.equal(SCENES.at(-1).type, 'boss');
});

test('hero score adds up to 400 for a perfect run', () => {
  const { state } = engineGame('warrior');
  Object.assign(state.stats, { stagesCleared: [1, 2, 3], bossDefeated: true, startedAt: 0, finishedAt: 60_000, retries: 0 });
  state.shards = [...SHARD_IDS];
  assert.deepEqual(computeHeroScore(state), { stageClears: 100, boss: 150, survival: 50, speed: 50, shards: 50, total: 400 });
  state.stats.retries = 1;
  assert.equal(computeHeroScore(state).speed, 0, 'a retry forfeits the speed bonus');
});

test('companions commit combat actions when the round opens; the hero closes it', async () => {
  const { manager } = makeManager();
  const { code, state, heroId } = await startedRoom(manager, 'mage');
  await toCombat(manager, code);
  assert.equal(state.phase, 'combat');
  assert.equal(Object.keys(state.combat.actions).length, 3);
  const round = state.combat.round;
  await manager.perform(code, heroId, { actionId: aid(), type: 'combat_action', payload: { type: 'defend' } });
  assert.ok(state.phase !== 'combat' || state.combat.round === round + 1);
});

test('the healer companion mends the wounded hero between rooms', async () => {
  const { manager } = makeManager();
  const { code, state, me } = await startedRoom(manager, 'warrior');
  me.hp = 60;
  await toCombat(manager, code);
  while (state.phase === 'combat') await heroTurn(manager, code, { combat: { type: 'defend' } });
  assert.ok(state.log.some((e) => e.type === 'ability' && /Mends Aria/.test(e.text)));
});

test('progress saves at each stage start and a wipe retries from it', async () => {
  const { manager } = makeManager();
  const { code, heroId, state } = await startedRoom(manager, 'warrior');
  assert.ok(state.checkpoint);
  for (const p of Object.values(state.players)) Object.assign(p, { hp: 0, fallen: true });
  state.phase = 'defeat';
  await manager.perform(code, heroId, { actionId: aid(), type: 'retry' });
  assert.notEqual(state.phase, 'defeat');
  assert.equal(state.stage, 1);
  assert.ok(state.players[heroId].hp > 0, 'restored from the checkpoint');
  assert.equal(state.stats.retries, 1);
});

test('full runs always end in victory or defeat with sane numbers', async () => {
  for (const [seed, cls] of [['alpha', 'warrior'], ['beta', 'mage'], ['gamma', 'rogue'], ['delta', 'healer']]) {
    const { manager } = makeManager({ seed });
    const { code } = await startedRoom(manager, cls);
    const state = await playToEnd(manager, code);
    assert.ok(['victory', 'defeat'].includes(state.phase), `${seed} stuck in ${state.phase}`);
  }
});
