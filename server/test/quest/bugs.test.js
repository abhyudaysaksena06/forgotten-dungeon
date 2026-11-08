// Hidden tests, one tag per Quest bug ("corrupted rune"). Never shipped to participants.
// Clean build: all pass. A team's build fails exactly the tags of the bugs planted in it.
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { carefulLeaderAction, companionAction } from '../../src/quest/ai.js';
import { ENEMIES, MORVATH, PIP, POWER_UPS, ROOMS, XP_PER_TIER } from '../../src/quest/data.js';
import { beginFight, createRun, distance, routeOptions, step, throneOpen } from '../../src/quest/engine.js';
import { QuestRuns, cleanAction } from '../../src/quest/runs.js';
import { makeProfile } from '../../src/quest/teams.js';

const profile = (tier = 'strong', seed = 'hidden') => makeProfile({ teamId: 'h', seed, tier });
// Each test sets up only what its own bug touches (the leader is set directly, not via `lead`),
// so one bug never fails another bug's test.
const fresh = (tier, leader = 'knight') => {
  const s = createRun(profile(tier));
  s.phase = 'map';
  s.leaderId = leader;
  for (const m of s.party) m.controlled = m.id === leader;
  return s;
};
const atThrone = (leader) => beginFight(fresh('strong', leader), 'r5', ROOMS.r5.waves.length - 1); // Morvath's wave
const boss = (s) => s.combat.enemies.find((e) => e.ultimate);
const hero = (s, id) => s.party.find((m) => m.id === id);

// ---------- Round 1 ----------

test('[Q01] the player steers exactly the hero they chose to lead', () => {
  for (const id of ['knight', 'mage', 'rogue', 'ranger']) {
    const s = step(createRun(profile()), { type: 'lead', memberId: id });
    assert.equal(s.leaderId, id);
    assert.deepEqual(s.party.filter((m) => m.controlled).map((m) => m.id), [id]);
  }
});

test('[Q02] the Attack input attacks and the Defend input defends', () => {
  assert.equal(cleanAction({ type: 'attack', targetId: 'x' }).type, 'attack');
  assert.equal(cleanAction({ type: 'defend' }).type, 'defend');
});

test('[Q11] a journey costs exactly the torches shown', () => {
  const s0 = fresh();
  const option = routeOptions(s0).find((o) => o.to === 'r4');
  const s = step(s0, { type: 'travel', to: 'r4' });
  assert.equal(s.torches, s0.torches - option.cost);
  assert.equal(option.cost, distance(s0, 'camp', 'r4'));
});

test('[Q13] a cleared room’s waystone leads straight back to camp', () => {
  const s = { ...fresh(), fragments: ['r4'] };
  assert.equal(distance(s, 'camp', 'r4'), 1);
  assert.equal(distance(s, 'r4', 'camp'), 1);
});

// ---------- Round 2 ----------

test('[Q07] the Rune Altar adds +3 ATK and +3 DEF', () => {
  const s0 = { ...fresh(), gold: 100 };
  const s = step(s0, { type: 'altar', memberId: 'ranger' });
  assert.equal(hero(s, 'ranger').atk, hero(s0, 'ranger').atk + 3);
  assert.equal(hero(s, 'ranger').def, hero(s0, 'ranger').def + 3);
  assert.equal(s.gold, 100 - POWER_UPS.altar.gold);
});

test('[Q10] resting revives the Fallen', () => {
  const s0 = fresh();
  Object.assign(s0.party[1], { hp: 0, fallen: true });
  const s = step(s0, { type: 'rest' });
  assert.equal(s.party[1].fallen, false);
  assert.equal(s.party[1].hp, s.party[1].maxHp);
});

test('[Q14] room loot adds potions to the satchel', () => {
  const s = beginFight({ ...fresh(), potions: 5 }, 'r1');
  s.combat.waveIndex = ROOMS.r1.waves.length - 1;
  s.combat.enemies = [{ ...s.combat.enemies[0], hp: -1 }]; // already beaten: the next round ends the fight
  const after = step(s, { type: 'wait' });
  assert.equal(after.phase, 'map');
  assert.equal(after.potions, 5 + ROOMS.r1.loot.potions);
});

test('[Q15] Pip hands over the potion that was paid for', () => {
  const s0 = { ...fresh(), gold: 100, potions: 1 };
  const s = step(s0, { type: 'trade', item: 'potion' });
  assert.equal(s.gold, 100 - PIP.potion.gold);
  assert.equal(s.potions, 2);
});

// ---------- Round 3 ----------

test('[Q06] Lyra mends the most wounded ally', () => {
  const s = beginFight(fresh(), 'r1');
  hero(s, 'rogue').hp = Math.round(hero(s, 'rogue').maxHp * 0.3);
  hero(s, 'mage').cooldown = 0;
  assert.deepEqual(companionAction(s, hero(s, 'mage')), { type: 'skill', targetId: 'rogue' });
});

test('[Q16] Bulwark halves damage for the whole party', () => {
  const s = atThrone('knight');
  s.combat.telegraph = { move: 'sweep', name: MORVATH.moves.sweep.name, targetId: null, damage: MORVATH.moves.sweep.damage, all: true };
  const mageHp = hero(s, 'mage').hp;
  const after = step(s, { type: 'skill' }); // Kael raises Bulwark
  assert.equal(mageHp - hero(after, 'mage').hp, Math.ceil(MORVATH.moves.sweep.damage / 2));
});

test('[Q17] a Health Potion restores 40 HP', () => {
  const s0 = fresh();
  hero(s0, 'rogue').hp = 30;
  const s = step(s0, { type: 'potion', targetId: 'rogue' });
  assert.equal(hero(s, 'rogue').hp, Math.min(hero(s, 'rogue').maxHp, 70));
});

// ---------- Round 4 ----------

test('[Q04] enemy armour grows gently with tier and progress', () => {
  for (const room of ['r2', 'r3', 'r4']) {
    const s = beginFight({ ...fresh(), stats: { ...fresh().stats, roomsCleared: 3 } }, room);
    for (const e of s.combat.enemies) assert.ok(e.def <= Math.ceil(ENEMIES[e.kind].def * 1.3), `${e.name} has DEF ${e.def}`);
  }
});

test('[Q05] a long run survives a server restart', () => {
  const dir = mkdtempSync(join(tmpdir(), 'quest-hidden-'));
  const p = profile('strong', 'long-run');
  const a = new QuestRuns({ profiles: [p], saveDir: dir });
  a.act('h', { type: 'lead', memberId: 'knight' });
  for (let i = 0; i < 70; i++) {
    const s = a.run('h').state;
    if (s.phase !== 'map' && s.phase !== 'combat') break;
    const opt = routeOptions(s).find((o) => o.fight) ?? routeOptions(s).find((o) => o.type === 'rest') ?? routeOptions(s)[0];
    a.act('h', s.phase === 'combat' ? { type: 'wait' } : { type: opt.type, to: opt.to, memberId: opt.memberId });
  }
  assert.ok(a.run('h').state.turn > 40, 'the run was long enough to test');
  const b = new QuestRuns({ profiles: [p], saveDir: dir });
  assert.equal(b.run('h').state.turn, a.run('h').state.turn);
  assert.deepEqual(b.run('h').state, a.run('h').state);
});

test('[Q08] a fight ends when the last enemy falls', () => {
  let s = beginFight(fresh('strong'), 'r1');
  for (let i = 0; i < 300 && s.phase === 'combat'; i++) s = step(s, carefulLeaderAction(s));
  assert.equal(s.phase, 'map');
  assert.deepEqual(s.fragments, ['r1']);
});

test('[Q19] a skill’s cooldown belongs to the hero who used it', () => {
  const s = beginFight(fresh(), 'r1');
  for (const id of ['mage', 'rogue', 'ranger']) Object.assign(hero(s, id), { hp: 0, fallen: true });
  const after = step(s, { type: 'skill' }); // only Kael acts
  assert.ok(hero(after, 'knight').cooldown > 0);
  for (const id of ['mage', 'rogue', 'ranger']) assert.equal(hero(after, id).cooldown, 0, `${id} cooldown`);
});

test('[Q18] a harder room teaches more: XP grows with the room’s tier', () => {
  const s = beginFight(fresh(), 'r3');
  s.combat.waveIndex = ROOMS.r3.waves.length - 1;
  s.combat.enemies = [{ ...s.combat.enemies[0], hp: -1 }]; // already beaten: the next round ends the fight
  const after = step(s, { type: 'wait' });
  assert.equal(after.phase, 'map');
  // Total XP earned = the thresholds already passed (100 × each level so far) + what's left over.
  const earned = (m) => ((m.level - 1) * m.level * 100) / 2 + m.xp;
  for (const m of after.party) assert.equal(earned(m), XP_PER_TIER * ROOMS.r3.tier, m.id);
});

// ---------- Round 5 ----------

test('[Q03] the Throne opens with three Heart fragments', () => {
  const s = { ...fresh(), fragments: ['r1', 'r2', 'r4'], location: 'r4' };
  assert.equal(throneOpen(s), true);
  assert.ok(routeOptions(s).some((o) => o.to === 'r5'));
});

test('[Q09] the leader’s Rune Strike breaks Morvath’s armour', () => {
  for (const leader of ['knight', 'mage']) {
    const s = atThrone(leader);
    const after = step(s, { type: 'rune', targetId: boss(s).id });
    assert.equal(boss(after).armoured, false, `${leader} leading`);
    assert.ok(boss(after).hp < boss(s).hp);
  }
});

test('[Q12] the player’s Rune Strike recharges', () => {
  let s = atThrone('knight');
  s = step(s, { type: 'rune', targetId: boss(s).id });
  for (let i = 0; i < 6 && s.phase === 'combat'; i++) s = step(s, { type: 'defend' });
  if (s.phase === 'combat') assert.equal(hero(s, 'knight').runeCooldown, 0);
});

test('[Q21] defeating Morvath ends the quest in victory', () => {
  const s = atThrone('rogue');
  Object.assign(boss(s), { hp: -1 }); // already beaten: the next round ends the fight
  const after = step(s, { type: 'wait' });
  assert.equal(after.phase, 'victory');
  assert.equal(after.combat, null);
});

test('[Q22] broken shadow armour stays down for the promised rounds', () => {
  let s = atThrone('knight');
  Object.assign(boss(s), { armoured: false, armourDown: MORVATH.armourRegrowRounds }); // as if just shattered
  for (let i = 1; i < MORVATH.armourRegrowRounds; i++) {
    s = step(s, { type: 'defend' });
    assert.equal(boss(s).armoured, false, `still broken after round ${i}`);
  }
  s = step(s, { type: 'defend' });
  assert.equal(boss(s).armoured, true, 'back after the last promised round');
});

test('[Q20] Defend halves Dragon’s Breath', () => {
  const s = atThrone('knight');
  Object.assign(boss(s), { phase: 3, charged: true });
  s.combat.telegraph = { move: 'breath', name: MORVATH.moves.breath.name, targetId: null, damage: MORVATH.moves.breath.damage, all: true };
  const hp = hero(s, 'knight').hp;
  const after = step(s, { type: 'defend' });
  assert.equal(hp - hero(after, 'knight').hp, Math.ceil(MORVATH.moves.breath.damage / 2));
});
