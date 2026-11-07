// The Quest engine. Pure and deterministic: step(state, action) returns a new state, and the
// same profile + the same list of actions always produces the same run. That is what makes
// autosave (replay the log) and the judge's cheat check (replay on a clean copy) work.
import { createRng, hashSeed } from '../engine/rng.js';
import {
  CAMP,
  CAN_HIT_FLYING,
  CLASSES,
  EDGES,
  ENEMIES,
  DODGE_CHANCE,
  FINAL_GROWTH,
  LANES,
  MECHANICS,
  START_LANES,
  FRAGMENTS_FOR_THRONE,
  LEVEL_GROWTH,
  MEAL_HEAL,
  MORVATH,
  NPCS,
  PARTY_ORDER,
  PIP,
  POISON_DAMAGE,
  POISON_ROUNDS,
  POTION_HEAL,
  POWER_UPS,
  PROGRESS_SCALE,
  ROOMS,
  RUNE_STRIKE,
  TIER_SCALE,
  XP_PER_TIER,
} from './data.js';
import { companionAction } from './ai.js';
import { decisionFeatures, optionCategory } from './features.js';
import { CAMP_LINES, DEFEAT_LINE, ENDING, INTRO, LEAD_LINES, MORVATH_LINES, ROOM_LINES } from './story.js';
import { questLog } from './quests.js';

export class QuestError extends Error {
  constructor(code, message) {
    super(message ?? code);
    this.code = code;
  }
}
const need = (cond, code, message) => {
  if (!cond) throw new QuestError(code, message);
};

const LOG_LIMIT = 120;

// ---------- creation ----------

// A run starts in 'setup': the first input picks which hero the player leads.
export function createRun(profile) {
  const party = PARTY_ORDER.map((cls) => {
    const base = CLASSES[cls];
    const s = profile.party[cls];
    return {
      id: cls,
      cls,
      name: base.name,
      controlled: false,
      level: 1,
      xp: 0,
      hp: s.hp,
      maxHp: s.hp,
      atk: s.atk,
      def: s.def,
      cooldown: 0,
      runeCooldown: 0,
      fallen: false,
      defending: false,
      poison: 0,
      lane: START_LANES[cls],
    };
  });
  return {
    version: 2,
    teamId: profile.teamId,
    rngState: hashSeed(`${profile.seed}:${profile.salt ?? ''}`),
    turn: 0,
    phase: 'setup',
    leaderId: null,
    location: CAMP,
    torches: profile.torches,
    gold: profile.gold,
    potions: profile.potions,
    meals: 0,
    parts: 0,
    fragments: [],
    party,
    combat: null,
    decisions: [],
    speech: null,
    stats: { roomsCleared: 0, wipes: 0, wipedIn: [], retreats: 0, kills: 0, rounds: 0, mealsCooked: 0 },
    log: [...INTRO, 'Choose the Runewright who will lead the party.'],
    lastRolls: [],
  };
}

// ---------- helpers ----------

function say(state, text) {
  state.log.push(text);
  if (state.log.length > LOG_LIMIT) state.log.splice(0, state.log.length - LOG_LIMIT);
}

// An NPC line: goes to the chronicle and becomes the current speech bubble.
function speak(state, line) {
  say(state, line);
  const who = Object.entries(NPCS).find(([, n]) => line.startsWith(`${n.name}`))?.[0] ?? null;
  state.speech = { npc: who, text: line };
}

export const member = (state, id) => state.party.find((m) => m.id === id);
export const controlled = (state) => state.party.find((m) => m.controlled);
const alive = (state) => state.party.filter((m) => !m.fallen);
const liveEnemies = (state) => (state.combat ? state.combat.enemies.filter((e) => e.hp > 0) : []);

function graph(state) {
  const adj = new Map();
  const link = (a, b) => {
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a).add(b);
    adj.get(b).add(a);
  };
  for (const [a, b] of EDGES) link(a, b);
  for (const r of state.fragments) link(CAMP, r); // waystones
  return adj;
}

// Shortest number of corridors between two places.
export function distance(state, from, to) {
  if (from === to) return 0;
  const adj = graph(state);
  const seen = new Map([[from, 0]]);
  const queue = [from];
  while (queue.length) {
    const at = queue.shift();
    for (const next of adj.get(at) ?? []) {
      if (seen.has(next)) continue;
      seen.set(next, seen.get(at) + 1);
      if (next === to) return seen.get(next);
      queue.push(next);
    }
  }
  return Infinity;
}

// Morvath only grows for rooms cleared beyond the three that open the Throne.
export function finalScale(state) {
  return 1 + FINAL_GROWTH * Math.max(0, state.stats.roomsCleared - FRAGMENTS_FOR_THRONE);
}

export function enemyScale(state, roomId) {
  return 1 + TIER_SCALE * (ROOMS[roomId].tier - 1) + PROGRESS_SCALE * state.stats.roomsCleared;
}

export function throneOpen(state) {
  return state.fragments.length >= FRAGMENTS_FOR_THRONE;
}

function spawn(state, kind, index, tag = state.combat.waveIndex) {
  const t = ENEMIES[kind];
  const scale = t.ultimate ? finalScale(state) : enemyScale(state, state.combat.roomId);
  const hp = Math.round(t.hp * scale);
  return {
    id: `${kind}-${tag}-${index}`,
    kind,
    name: t.name,
    model: t.model,
    hp,
    maxHp: hp,
    atk: Math.round(t.atk * scale),
    def: Math.round(t.def * (1 + (scale - 1) / 3)),
    flying: Boolean(t.flying),
    boss: Boolean(t.boss),
    ultimate: Boolean(t.ultimate),
    move: t.move ?? null,
    poison: 0,
    ...(t.ultimate ? { armoured: true, armourDown: 0, phase: 1, charged: false } : {}),
  };
}

function nameDuplicates(enemies) {
  const count = new Map();
  for (const e of enemies) count.set(e.name, (count.get(e.name) ?? 0) + 1);
  enemies.forEach((e, i) => {
    if (count.get(e.name) > 1) e.name = `${e.name} ${'ABCDEF'[i]}`;
  });
}

function startWave(state) {
  const room = ROOMS[state.combat.roomId];
  const kinds = room.waves[state.combat.waveIndex];
  state.combat.enemies = kinds.map((kind, i) => spawn(state, kind, i));
  state.combat.danger = null;
  nameDuplicates(state.combat.enemies);
  say(state, `${kinds.length > 1 ? 'Enemies' : 'A foe'} rise: ${state.combat.enemies.map((e) => e.name).join(', ')}.`);
  const morvath = state.combat.enemies.find((e) => e.ultimate);
  if (morvath) telegraphMorvath(state, createRng(state), morvath);
}

// ---------- setup: choosing the leader ----------

function lead(state, { memberId }) {
  need(PARTY_ORDER.includes(memberId), 'bad_target', 'Choose Kael, Lyra, Rook or Mira.');
  const leader = state.party[PARTY_ORDER.indexOf(memberId)];
  state.leaderId = memberId;
  for (const m of state.party) m.controlled = m.id === leader.id;
  state.phase = 'map';
  say(state, `${CLASSES[memberId].title} leads the party. The other three follow.`);
  say(state, LEAD_LINES[memberId]);
  speak(state, CAMP_LINES.first);
}

// ---------- the map: route decisions ----------

// Every choice the player can make on the map. Each one is a readiness / route decision that
// the random forest judges afterwards.
export function routeOptions(state) {
  if (state.phase !== 'map') return [];
  const options = [];
  const cleared = new Set(state.fragments);
  for (const place of [CAMP, ...Object.keys(ROOMS)]) {
    if (place === state.location) continue;
    if (place === 'r5' && !throneOpen(state)) continue;
    const cost = distance(state, state.location, place);
    if (cost > state.torches) continue;
    options.push({ type: 'travel', to: place, cost, fight: place !== CAMP && !cleared.has(place) });
  }
  if (state.location === CAMP) {
    if (state.torches >= POWER_UPS.rest.torches) options.push({ type: 'rest' });
    for (const m of state.party) {
      if (state.torches >= POWER_UPS.altar.torches && state.gold >= POWER_UPS.altar.gold) options.push({ type: 'altar', memberId: m.id });
      if (state.gold >= POWER_UPS.forge.gold) options.push({ type: 'forge', memberId: m.id });
    }
  }
  return options;
}

// Pip's trades on offer right now (camp only, no torches).
export function pipOffers(state) {
  if (state.phase !== 'map' || state.location !== CAMP) return [];
  return Object.entries(PIP)
    .filter(([, o]) => state.gold >= o.gold && state.parts >= o.parts)
    .map(([item]) => ({ type: 'trade', item }));
}

function recordDecision(state, action) {
  state.decisions.push({
    turn: state.turn,
    at: state.location,
    choice: optionCategory(state, action),
    action: { ...action },
    features: decisionFeatures(state, action),
  });
}

function travel(state, { to }) {
  need(Object.hasOwn(ROOMS, to) || to === CAMP, 'bad_place', 'No such place.');
  need(to !== state.location, 'bad_place', 'You are already here.');
  if (to === 'r5') need(throneOpen(state), 'sealed', `The Throne is sealed. You need ${FRAGMENTS_FOR_THRONE} Heart fragments.`);
  const cost = distance(state, state.location, to);
  need(cost <= state.torches, 'no_torches', 'Not enough torches to get there.');
  state.torches -= cost;
  state.location = to;
  const name = to === CAMP ? 'the camp' : ROOMS[to].name;
  say(state, `The party walks to ${name} (${cost} torch${cost === 1 ? '' : 'es'}, ${state.torches} left).`);
  if (to !== CAMP && !state.fragments.includes(to)) beginFight(state, to);
}

// Starts a room's first wave. Exported for tests that set up a fight directly; they can start at
// a later wave (Morvath is the Throne's second).
export function beginFight(state, roomId, waveIndex = 0) {
  state.phase = 'combat';
  state.location = roomId;
  state.combat = { roomId, waveIndex, enemies: [], round: 0, telegraph: null, bulwark: false };
  say(state, `Round ${ROOMS[roomId].round} — ${ROOMS[roomId].roundName}: ${ROOMS[roomId].name}.`);
  for (const line of ROOM_LINES[roomId].enter) speak(state, line);
  startWave(state);
  return state;
}

function powerUp(state, action) {
  need(state.location === CAMP, 'not_at_camp', 'Preparations are only at the camp.');
  const p = POWER_UPS[action.type];
  need(state.torches >= p.torches, 'no_torches', 'Not enough torches.');
  need(state.gold >= p.gold, 'no_gold', `You need ${p.gold} gold.`);
  state.torches -= p.torches;
  state.gold -= p.gold;
  if (action.type === 'rest') {
    for (const m of state.party) Object.assign(m, { hp: m.maxHp, fallen: false, poison: 0 });
    say(state, `The party rests by the campfire. Everyone is healed (${state.torches} torches left).`);
    return;
  }
  const m = member(state, action.memberId);
  need(m, 'bad_target', 'No such hero.');
  if (action.type === 'altar') {
    m.atk += 3;
    m.def += 3;
    say(state, `${m.name} kneels at the Rune Altar: +3 ATK, +3 DEF.`);
  } else {
    m.atk += 5;
    say(state, `${m.name}'s weapon is reforged at the Old Forge: +5 ATK.`);
  }
}

function trade(state, { item }) {
  need(state.location === CAMP, 'not_at_camp', 'Pip only cooks at the camp.');
  const offer = PIP[item];
  need(offer, 'bad_trade', 'Pip only trades potions and meals.');
  need(state.gold >= offer.gold, 'no_gold', `Pip wants ${offer.gold} gold for that.`);
  need(state.parts >= offer.parts, 'no_parts', `Pip needs ${offer.parts} monster parts for a meal.`);
  state.gold -= offer.gold;
  state.parts -= offer.parts;
  if (item === 'potion') state.potions += 1;
  else state.meals += 1;
  if (item === 'meal') state.stats.mealsCooked += 1;
  if (!state.log.includes(CAMP_LINES.pip)) speak(state, CAMP_LINES.pip);
  say(state, `Pip hands over ${item === 'potion' ? 'a Health Potion' : 'a steaming Monster Meal'}.`);
}

// Potions and meals: used from the satchel on the map or in combat.
function consume(state, user, { type, targetId }) {
  const pool = type === 'meal' ? 'meals' : 'potions';
  need(state[pool] > 0, 'none_left', `No ${pool} left.`);
  const t = member(state, targetId ?? user?.id);
  need(t && !t.fallen, 'bad_target', 'Food and potions cannot reach the Fallen.');
  state[pool] -= 1;
  t.hp = Math.min(t.maxHp, t.hp + (type === 'meal' ? MEAL_HEAL : POTION_HEAL));
  say(state, user && user.id !== t.id ? `${user.name} gives ${t.name} a ${type === 'meal' ? 'Monster Meal' : 'potion'}.` : `${t.name} drinks a ${type === 'meal' ? 'Monster Meal' : 'potion'}.`);
}

// ---------- combat ----------

function strike(state, rng, attacker, target, { mult = 1, sure = false } = {}) {
  const roll = rng.die(20);
  if (roll <= 3 && !sure) return { roll, miss: true, damage: 0 };
  const crit = roll === 20;
  const reach = CLASSES[attacker.cls]?.reach;
  const def = reach === 'magic' ? target.def / 2 : target.def;
  let damage = Math.max(1, Math.round(attacker.atk * mult + rng.die(6) - def));
  if (crit) damage *= 2;
  return { roll, crit, miss: false, damage };
}

export function canReach(attacker, enemy) {
  return !enemy.flying || CAN_HIT_FLYING.has(CLASSES[attacker.cls].reach);
}

function hitEnemy(state, attacker, enemy, result, { rune = false, volley = false } = {}) {
  if (result.miss) {
    say(state, `${attacker.name} misses ${enemy.name}.`);
    return;
  }
  if (enemy.hiddenIn) {
    if (volley) {
      enemy.hiddenIn = null;
      enemy.hiddenFor = 0;
      say(state, `${attacker.name}'s arrows find the right portrait: ${enemy.name} is torn out of hiding!`);
    } else if (attacker.lane !== enemy.hiddenIn) {
      say(state, `${attacker.name} strikes only ink: ${enemy.name} hides in the ${enemy.hiddenIn} portrait.`);
      return;
    }
  }
  if (enemy.ultimate && enemy.armoured) {
    if (rune && attacker.id === state.leaderId) {
      enemy.armoured = false;
      enemy.armourDown = MORVATH.armourRegrowRounds;
      say(state, `${attacker.name}'s Rune Strike shatters Morvath's shadow armour! He can be hurt for ${MORVATH.armourRegrowRounds} rounds.`);
    } else {
      say(state, `The shadow armour drinks ${attacker.name}'s blow. Only the leader's Rune Strike can break it.`);
      return;
    }
  }
  const countering = enemy.stance === 'counter';
  const dealt = Math.min(enemy.hp, countering ? Math.ceil(result.damage / 2) : result.damage);
  enemy.hp -= dealt;
  say(state, `${attacker.name} hits ${enemy.name} for ${dealt}${result.crit ? ' (critical!)' : ''}${countering ? ' (blocked half)' : ''}.`);
  if (countering && enemy.hp > 0) hurt(state, attacker, Math.round(enemy.atk * MECHANICS.counter.reflect), `${enemy.name}'s counter`);
  const t = ENEMIES[enemy.kind];
  if (t.yieldsAt && enemy.hp > 0 && enemy.hp <= enemy.maxHp * t.yieldsAt) {
    enemy.hp = 0;
    say(state, `${enemy.name} lowers his axe and laughs: he yields.`);
  }
  if (enemy.hp === 0) {
    state.stats.kills += 1;
    say(state, `${enemy.name} falls.`);
    if (t.part) {
      state.parts += 1;
      say(state, `A monster part for Pip's pot (${state.parts}).`);
    }
  }
}

function hurt(state, m, amount, source) {
  if (m.fallen) return 0;
  let dmg = amount;
  if (m.defending) dmg = Math.ceil(dmg / 2);
  if (state.combat?.bulwark) dmg = Math.ceil(dmg / 2);
  const dealt = Math.min(m.hp, dmg);
  m.hp -= dealt;
  say(state, `${source} hits ${m.name} for ${dealt}.`);
  if (m.hp === 0) {
    m.fallen = true;
    m.poison = 0;
    say(state, `${m.name} has Fallen.`);
  }
  return dealt;
}

function heal(state, healer, target) {
  if (target.fallen) {
    target.fallen = false;
    target.hp = Math.round(target.maxHp * 0.3);
    say(state, `${healer.name} pulls ${target.name} back from the dark.`);
  } else {
    target.hp = Math.min(target.maxHp, target.hp + 35);
    say(state, `${healer.name} mends ${target.name}.`);
  }
}

// One hero's action. `commanded` marks the player's own input.
function act(state, rng, m, action, commanded) {
  const skill = CLASSES[m.cls].skill;
  const enemyById = (id) => state.combat.enemies.find((e) => e.id === id && e.hp > 0);
  switch (action.type) {
    case 'attack': {
      const target = enemyById(action.targetId);
      need(target, 'bad_target', 'Choose a living enemy.');
      need(canReach(m, target), 'out_of_reach', `${m.name} cannot reach a flying enemy.`);
      const r = strike(state, rng, m, target);
      state.lastRolls.push({ by: m.id, value: r.roll });
      return hitEnemy(state, m, target, r);
    }
    case 'defend':
      m.defending = true;
      return say(state, `${m.name} raises a guard.`);
    case 'rune': {
      need(commanded, 'not_leader', 'Only the Runewright you command can use Rune Strike.');
      need(m.runeCooldown === 0, 'cooldown', `Rune Strike is recharging (${m.runeCooldown}).`);
      const target = enemyById(action.targetId);
      need(target && canReach(m, target), 'bad_target', `Choose an enemy ${m.name} can reach.`);
      const r = strike(state, rng, m, target, { mult: 1.2, sure: true });
      state.lastRolls.push({ by: m.id, value: r.roll });
      hitEnemy(state, m, target, r, { rune: true });
      m.runeCooldown = RUNE_STRIKE.cooldown + 1; // ticks down at the end of this round
      return;
    }
    case 'skill': {
      need(m.cooldown === 0, 'cooldown', `${skill.name} is recharging (${m.cooldown}).`);
      if (skill.id === 'twin_strike') {
        const target = enemyById(action.targetId);
        need(target && canReach(m, target), 'bad_target', `Choose an enemy ${m.name} can reach.`);
        const r = strike(state, rng, m, target, { mult: 2, sure: true });
        state.lastRolls.push({ by: m.id, value: r.roll });
        hitEnemy(state, m, target, r);
      } else if (skill.id === 'mend') {
        const target = member(state, action.targetId ?? m.id);
        need(target, 'bad_target', 'Choose an ally.');
        heal(state, m, target);
      } else if (skill.id === 'bulwark') {
        state.combat.bulwark = true;
        m.defending = true;
        say(state, `${m.name} raises a Bulwark: the party takes half damage this round.`);
      } else if (skill.id === 'volley') {
        say(state, `${m.name} looses a volley!`);
        for (const e of liveEnemies(state)) hitEnemy(state, m, e, strike(state, rng, m, e, { mult: 0.7, sure: true }), { volley: true });
      }
      m.cooldown = skill.cooldown + 1; // ticks down at the end of this round
      return;
    }
    case 'potion':
    case 'meal':
      return consume(state, m, action);
    case 'wait':
      return;
    default:
      throw new QuestError('bad_action', 'Choose Attack, Defend, Skill, Rune Strike, Potion, Meal or Retreat.');
  }
}

function waveCleared(state) {
  return state.combat.enemies.every((e) => e.hp <= 0);
}

function enemyTarget(state, rng) {
  const knight = member(state, 'knight');
  if (state.combat.bulwark && knight && !knight.fallen) return knight;
  const living = alive(state);
  return living[Math.floor(rng.next() * living.length)];
}

// ---------- lanes ----------

// Lanes about to be hit this round: a boss's marked lanes, or Morvath's breath.
export function threatenedLanes(state) {
  const c = state.combat;
  const lanes = new Set();
  if (!c) return lanes;
  if (c.danger && c.danger.round === c.round) c.danger.lanes.forEach((l) => lanes.add(l));
  if (c.telegraph?.lanes) c.telegraph.lanes.forEach((l) => lanes.add(l));
  return lanes;
}

// Companions step out of a marked lane (most of the time) and go after a hidden Wraith.
function companionsMove(state, rng) {
  const threat = threatenedLanes(state);
  const hidden = liveEnemies(state).find((e) => e.hiddenIn);
  for (const m of state.party) {
    if (m.controlled || m.fallen) continue;
    if (hidden && canReach(m, hidden) && m.lane !== hidden.hiddenIn && !threat.has(hidden.hiddenIn) && rng.next() < 0.6) m.lane = hidden.hiddenIn;
    if (threat.has(m.lane) && rng.next() < DODGE_CHANCE) {
      const safe = LANES.filter((l) => !threat.has(l));
      if (safe.length) m.lane = safe.includes('centre') ? 'centre' : safe[Math.floor(rng.next() * safe.length)];
    }
  }
}

// n lanes to mark: the most crowded one (a charge), or n of the three at random.
function pickLanes(state, rng, n, crowded) {
  if (crowded) {
    const count = (l) => alive(state).filter((m) => m.lane === l).length;
    const most = Math.max(...LANES.map(count));
    const top = LANES.filter((l) => count(l) === most);
    return [top[Math.floor(rng.next() * top.length)]];
  }
  const pool = [...LANES];
  const out = [];
  while (out.length < n) out.push(pool.splice(Math.floor(rng.next() * pool.length), 1)[0]);
  return LANES.filter((l) => out.includes(l));
}

const laneList = (lanes) => (lanes.length > 1 ? `${lanes.join(' and ')} lanes` : `${lanes[0]} lane`);

// ---------- Morvath ----------

function telegraphMorvath(state, rng, boss) {
  const living = alive(state);
  let move;
  if (boss.phase === 3) move = boss.charged ? 'breath' : 'charge';
  else {
    const pool = boss.phase === 1 ? ['shadow_blade', 'sweep'] : ['claw', 'shadowflame'];
    move = rng.next() < 0.5 ? pool[0] : pool[1];
  }
  const m = MORVATH.moves[move];
  const targetId = m.all ? null : living[Math.floor(rng.next() * living.length)]?.id ?? null;
  const lanes = move === 'breath' ? pickLanes(state, rng, MECHANICS.breathLanes, false) : null;
  state.combat.telegraph = { move, name: m.name, targetId, damage: m.damage, all: m.all, poison: Boolean(m.poison), lanes };
  if (move === 'charge') say(state, MORVATH_LINES.breath);
  else if (lanes) say(state, `Dragon's Breath will scorch the ${laneList(lanes)}. Get to the ${LANES.find((l) => !lanes.includes(l))} lane, or Defend.`);
  else say(state, `Morvath prepares ${m.name}${targetId ? ` against ${member(state, targetId).name}` : ''}.`);
}

function morvathTurn(state, boss) {
  const t = state.combat.telegraph;
  if (!t) return;
  if (t.move === 'charge') {
    boss.charged = true;
    return say(state, 'Morvath holds his breath. The air burns.');
  }
  if (t.move === 'breath') boss.charged = false;
  const move = MORVATH.moves[t.move];
  const targets = move.all ? alive(state).filter((m) => !t.lanes || t.lanes.includes(m.lane)) : [member(state, t.targetId)].filter((m) => m && !m.fallen);
  if (t.lanes && !targets.length) say(state, `${move.name} scorches empty stone.`);
  for (const m of targets) {
    hurt(state, m, move.damage, move.name);
    if (move.poison && !m.fallen) m.poison = POISON_ROUNDS;
  }
}

// Phase changes happen at the end of a round, once each.
function morvathPhases(state, boss) {
  if (boss.phase === 1 && boss.hp < boss.maxHp * MORVATH.changeAt) {
    boss.phase = 2;
    boss.name = MORVATH.dragonName;
    boss.model = MORVATH.dragonModel;
    say(state, MORVATH_LINES.change);
    const summoned = [0, 1].map((i) => spawn(state, 'skeleton_risen', i, `summon${state.combat.round}`));
    state.combat.enemies.push(...summoned);
    nameDuplicates(state.combat.enemies.filter((e) => e.kind === 'skeleton_risen'));
    say(state, 'Two Skeletons claw out of the floor!');
  }
  if (boss.phase === 2 && boss.hp < boss.maxHp * MORVATH.breathAt) {
    boss.phase = 3;
    say(state, 'Morvath rears back. From now on, every second turn brings Dragon’s Breath.');
  }
}

function enemyTurn(state, rng, e) {
  if (e.ultimate) return morvathTurn(state, e);
  const special = e.boss && e.move && state.combat.round % 3 === 0;
  if (!special) {
    const t = enemyTarget(state, rng);
    if (!t) return;
    const r = strike(state, rng, e, t);
    if (r.miss) return say(state, `${e.name} misses ${t.name}.`);
    return hurt(state, t, r.damage, e.name);
  }
  const living = alive(state);
  switch (e.move) {
    case 'charge':
    case 'shadow_tide': {
      const spec = MECHANICS[e.move];
      const d = state.combat.danger;
      const lanes = d && d.by === e.id ? d.lanes : LANES.slice(0, spec.lanes);
      state.combat.danger = null;
      say(state, e.move === 'charge' ? `${e.name} charges down the ${laneList(lanes)}!` : `${e.name} floods the ${laneList(lanes)} with a shadow tide!`);
      const hit = living.filter((h) => lanes.includes(h.lane));
      if (!hit.length) say(state, 'It hits nothing but stone.');
      for (const h of hit) {
        hurt(state, h, Math.round(e.atk * spec.mult), e.name);
        if (spec.poison && !h.fallen) h.poison = POISON_ROUNDS;
      }
      return;
    }
    case 'drain': {
      const t = enemyTarget(state, rng);
      const dealt = hurt(state, t, e.atk, `${e.name}'s drain`);
      e.hp = Math.min(e.maxHp, e.hp + dealt);
      return;
    }
    case 'slam':
      say(state, `${e.name} slams the ground!`);
      for (const t of living) hurt(state, t, Math.round(e.atk * 0.6), e.name);
      return;
  }
}

function endOfRound(state, rng) {
  for (const m of state.party) {
    if (m.poison > 0 && !m.fallen) {
      m.poison -= 1;
      hurt(state, m, POISON_DAMAGE, 'Poison');
    }
    if (m.cooldown > 0) m.cooldown -= 1;
    if (m.runeCooldown > 0) m.runeCooldown -= 1;
    m.defending = false;
  }
  state.combat.bulwark = false;
  bossMechanics(state, rng);
  const boss = state.combat.enemies.find((e) => e.ultimate && e.hp > 0);
  if (boss) {
    morvathPhases(state, boss);
    const summoned = liveEnemies(state).filter((e) => e.kind === 'skeleton_risen').length;
    if (boss.phase >= 2 && summoned > 0 && boss.hp < boss.maxHp) {
      const fed = Math.min(boss.maxHp - boss.hp, summoned * MECHANICS.summonFeed);
      boss.hp += fed;
      say(state, `The Skeletons feed Morvath: +${fed} HP. Kill them!`);
    }
    if (!boss.armoured && --boss.armourDown <= 0) {
      boss.armoured = true;
      say(state, 'The shadow armour knits itself back together.');
    }
    telegraphMorvath(state, rng, boss);
  }
}

// The room bosses' tells, decided at the end of a round for the next one.
function bossMechanics(state, rng) {
  const c = state.combat;
  const next = c.round + 1;
  for (const e of liveEnemies(state)) {
    if (e.ultimate) continue;
    const t = ENEMIES[e.kind];
    if ((e.move === 'charge' || e.move === 'shadow_tide') && next % 3 === 0) {
      const spec = MECHANICS[e.move];
      const lanes = pickLanes(state, rng, spec.lanes, e.move === 'charge');
      c.danger = { by: e.id, name: e.move === 'charge' ? 'Charge' : 'Shadow Tide', lanes, round: next, damage: Math.round(e.atk * spec.mult), poison: Boolean(spec.poison) };
      say(state, `${e.name} ${e.move === 'charge' ? 'lowers its head at' : 'raises a shadow tide over'} the ${laneList(lanes)}. Move out!`);
    }
    if (t.hides) {
      if (e.hiddenFor > 0) {
        e.hiddenFor -= 1;
        if (e.hiddenFor === 0) {
          e.hiddenIn = null;
          say(state, `${e.name} slides out of the portrait.`);
        }
      } else if (next % MECHANICS.hide.every === 0) {
        e.hiddenIn = LANES[Math.floor(rng.next() * LANES.length)];
        e.hiddenFor = MECHANICS.hide.rounds;
        say(state, `${e.name} melts into a portrait in the ${e.hiddenIn} lane: only heroes in that lane can reach it, or a Volley.`);
      }
    }
    if (t.counter) {
      const stance = next % MECHANICS.counter.every >= MECHANICS.counter.every - MECHANICS.counter.rounds ? 'counter' : 'open';
      if (stance !== (e.stance ?? 'open')) say(state, stance === 'counter' ? `${e.name} takes a counter stance: hits on him are halved, and he strikes back.` : `${e.name} drops his guard.`);
      e.stance = stance;
    }
  }
}

function gainXp(state, amount) {
  for (const m of alive(state)) {
    m.xp += amount;
    while (m.xp >= m.level * 100) {
      m.xp -= m.level * 100;
      m.level += 1;
      m.maxHp = Math.round(m.maxHp * (1 + LEVEL_GROWTH));
      m.atk = Math.round(m.atk * (1 + LEVEL_GROWTH));
      m.def = Math.round(m.def * (1 + LEVEL_GROWTH));
      m.hp = Math.min(m.maxHp, m.hp + Math.round(m.maxHp * 0.2));
      say(state, `${m.name} reaches level ${m.level}!`);
    }
  }
}

function winRoom(state) {
  const roomId = state.combat.roomId;
  const room = ROOMS[roomId];
  state.combat = null;
  if (room.final) {
    state.phase = 'victory';
    state.fragments.push(roomId);
    for (const line of ENDING) speak(state, line);
    return;
  }
  state.phase = 'map';
  state.fragments.push(roomId);
  state.stats.roomsCleared += 1;
  state.gold += room.loot.gold;
  state.potions += room.loot.potions;
  for (const m of state.party) {
    m.cooldown = 0; // skills are fresh for the next room
    m.runeCooldown = 0;
  }
  gainXp(state, XP_PER_TIER * room.tier);
  say(state, `${room.name} is cleared! Heart fragment ${state.fragments.length}, ${room.loot.gold} gold, ${room.loot.potions} potion(s), ${XP_PER_TIER * room.tier} XP for each hero standing. Its runes turn from red to gold.`);
  for (const line of ROOM_LINES[roomId].clear) speak(state, line);
  if (throneOpen(state) && state.fragments.length === FRAGMENTS_FOR_THRONE) say(state, 'The Throne of Eternity’s seal cracks open.');
  checkDarkness(state);
}

function wipe(state) {
  state.stats.wipes += 1;
  state.stats.wipedIn.push(state.combat.roomId);
  state.combat = null;
  state.phase = 'map';
  state.location = CAMP;
  state.torches = Math.max(0, state.torches - 2);
  state.gold = Math.floor(state.gold / 2);
  for (const m of state.party) Object.assign(m, { fallen: false, hp: Math.round(m.maxHp * 0.3), poison: 0, defending: false, cooldown: 0, runeCooldown: 0 });
  say(state, `The whole party falls… and wakes by the campfire. 2 torches and half the gold are lost (${state.torches} torches left).`);
  checkDarkness(state);
}

function checkDarkness(state) {
  if (state.phase === 'map' && state.torches <= 0) {
    state.phase = 'defeat';
    say(state, DEFEAT_LINE);
  }
}

function combatRound(state, action) {
  const rng = createRng(state);
  const c = state.combat;
  c.round += 1;
  state.stats.rounds += 1;
  state.lastRolls = [];
  const me = controlled(state);

  if (action.type === 'retreat') {
    need(!ROOMS[c.roomId].final, 'no_retreat', 'There is no retreat from the Throne.');
    state.stats.retreats += 1;
    state.combat = null;
    state.phase = 'map';
    state.location = CAMP;
    state.torches = Math.max(0, state.torches - 1);
    say(state, `The party flees to the camp (1 torch, ${state.torches} left).`);
    return checkDarkness(state);
  }

  // 1. The player's hero, in the lane they walked to.
  if (action.lane !== undefined) {
    need(LANES.includes(action.lane), 'bad_lane', 'Lanes are left, centre and right.');
    me.lane = action.lane;
  }
  if (me.fallen) need(action.type === 'wait', 'fallen', `${me.name} has Fallen; wait for your companions.`);
  act(state, rng, me, action, true);

  // 2. Companions step aside if they can, then act, in party order.
  if (state.combat) companionsMove(state, rng);
  for (const m of state.party) {
    if (m.controlled || m.fallen || !state.combat) continue;
    if (liveEnemies(state).length === 0) break;
    try {
      act(state, rng, m, companionAction(state, m), false);
    } catch (err) {
      if (!(err instanceof QuestError)) throw err;
      act(state, rng, m, { type: 'defend' }, false);
    }
  }

  // 3. Wave or room won?
  if (waveCleared(state)) {
    if (c.waveIndex + 1 < ROOMS[c.roomId].waves.length) {
      c.waveIndex += 1;
      c.round = 0;
      startWave(state);
      for (const m of state.party) m.defending = false;
      c.bulwark = false;
      return;
    }
    return winRoom(state);
  }

  // 4. Enemies.
  for (const e of liveEnemies(state)) {
    if (alive(state).length === 0) break;
    enemyTurn(state, rng, e);
  }
  for (const e of liveEnemies(state)) {
    if (e.poison > 0) e.poison -= 1;
  }

  // 5. End of round.
  if (alive(state).length > 0) endOfRound(state, rng);
  if (alive(state).length === 0) wipe(state);
}

// ---------- the single entry point ----------

// mutate: simulations skip the defensive copy (callers own the state).
export function step(prev, action, { mutate = false } = {}) {
  need(action && typeof action.type === 'string', 'bad_action', 'Every action needs a type.');
  need(prev.phase !== 'victory' && prev.phase !== 'defeat', 'run_over', 'This run is over.');
  const state = mutate ? prev : structuredClone(prev);
  state.speech = null;
  if (state.phase === 'setup') {
    need(action.type === 'lead', 'choose_leader', 'First choose the Runewright who leads the party.');
    lead(state, action);
  } else if (state.phase === 'map') {
    if (action.type === 'potion' || action.type === 'meal') consume(state, null, action);
    else if (action.type === 'trade') trade(state, action);
    else {
      const isRoute = ['travel', 'rest', 'altar', 'forge'].includes(action.type);
      need(isRoute, 'bad_action', 'On the map you can travel, rest, use the altar or forge, trade with Pip, or eat and drink.');
      recordDecision(state, action);
      if (action.type === 'travel') travel(state, action);
      else powerUp(state, action);
      checkDarkness(state);
    }
  } else if (state.phase === 'combat') {
    combatRound(state, action);
  }
  state.turn += 1;
  return state;
}

// What the browser may see: no RNG state, so dice can't be predicted from the client.
export function publicState(state) {
  const { rngState, decisions, ...rest } = state;
  const room = state.combat ? state.combat.roomId : state.location !== CAMP ? state.location : null;
  return {
    ...rest,
    decisionsMade: decisions.length,
    options: routeOptions(state),
    pip: pipOffers(state),
    throneOpen: throneOpen(state),
    quests: questLog(state),
    room: room ? { id: room, ...ROOMS[room], waves: undefined } : null,
  };
}
