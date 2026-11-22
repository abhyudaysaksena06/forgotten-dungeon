// AI for the three companions (and for the simulated player used to train the forest).
// Pure functions of the state: no randomness, so runs stay replayable.
import { CAN_HIT_FLYING, CLASSES, LANES } from './data.js';

const frac = (m) => (m.maxHp ? m.hp / m.maxHp : 0);
const reachable = (state, m) =>
  state.combat.enemies.filter((e) => e.hp > 0 && (!e.flying || CAN_HIT_FLYING.has(CLASSES[m.cls].reach)));
// A hidden Wraith can only be hit from its lane; Brakka in counter stance is better left alone.
const hittable = (m, e) => !e.hiddenIn || e.hiddenIn === m.lane;

// Finish the weakest first; leave an armoured Morvath and a countering Brakka alone if anything else
// is there to hit.
function pickTarget(state, m) {
  const can = reachable(state, m).filter((e) => hittable(m, e));
  const good = can.filter((e) => !(e.ultimate && e.armoured) && e.stance !== 'counter');
  const pool = good.length ? good : can.filter((e) => e.stance !== 'counter');
  return [...pool].sort((a, b) => a.hp - b.hp)[0] ?? null;
}

// Lanes about to be hit (the same rule as the engine's threatenedLanes).
export function dangerLanes(state) {
  const c = state.combat;
  const lanes = new Set();
  if (c?.danger && c.danger.round === c.round + 1) c.danger.lanes.forEach((l) => lanes.add(l));
  if (c?.telegraph?.lanes) c.telegraph.lanes.forEach((l) => lanes.add(l));
  return lanes;
}

export function companionAction(state, m) {
  const party = state.party;
  const fallen = party.find((p) => p.fallen);
  const living = party.filter((p) => !p.fallen);
  const lowest = [...living].sort((a, b) => frac(a) - frac(b))[0];
  const ready = m.cooldown === 0;
  const tele = state.combat.telegraph;
  const enemies = state.combat.enemies.filter((e) => e.hp > 0);
  const target = pickTarget(state, m);
  const attack = target ? { type: 'attack', targetId: target.id } : { type: 'defend' };

  switch (m.cls) {
    case 'mage':
      if (ready && fallen) return { type: 'skill', targetId: fallen.id };
      if (ready && lowest && frac(lowest) < 0.55) return { type: 'skill', targetId: lowest.id };
      if (state.potions > 0 && lowest && frac(lowest) < 0.25) return { type: 'potion', targetId: lowest.id };
      return attack;
    case 'knight': {
      const avg = living.reduce((n, p) => n + frac(p), 0) / Math.max(1, living.length);
      const big = (tele && tele.damage >= 20) || Boolean(state.combat.danger);
      if (ready && (big || avg < 0.6 || enemies.some((e) => e.boss))) return { type: 'skill' };
      if (frac(m) < 0.3) return { type: 'defend' };
      return attack;
    }
    case 'ranger': {
      const hidden = enemies.some((e) => e.hiddenIn);
      if (ready && (hidden || enemies.filter((e) => !(e.ultimate && e.armoured)).length >= 2)) return { type: 'skill' };
      return attack;
    }
    case 'rogue':
      if (ready && target && (target.boss || target.hp > 30)) return { type: 'skill', targetId: target.id };
      return attack;
    default:
      return attack;
  }
}

// The lane a careful player walks to: out of any marked lane, towards a hidden Wraith they can hit.
function carefulLane(state, me) {
  const threat = dangerLanes(state);
  const hidden = state.combat.enemies.find((e) => e.hp > 0 && e.hiddenIn && (!e.flying || CAN_HIT_FLYING.has(CLASSES[me.cls].reach)));
  if (hidden && !threat.has(hidden.hiddenIn)) return hidden.hiddenIn;
  if (threat.has(me.lane)) return LANES.find((l) => !threat.has(l)) ?? me.lane;
  return me.lane;
}

// A sensible player. Steps out of marked lanes, uses Rune Strike on an armoured Morvath, eats or
// drinks when low, and plays Kael the way a lone knight has to (other heroes play like companions).
export function carefulLeaderAction(state) {
  const me = state.party.find((p) => p.controlled);
  if (me.fallen) return { type: 'wait' };
  const lane = carefulLane(state, me);
  const moved = { ...me, lane };
  const withLane = (a) => (lane !== me.lane ? { ...a, lane } : a);
  const boss = state.combat.enemies.find((e) => e.ultimate && e.hp > 0);
  if (boss && boss.armoured && me.runeCooldown === 0 && (!boss.flying || CAN_HIT_FLYING.has(CLASSES[me.cls].reach))) {
    return withLane({ type: 'rune', targetId: boss.id });
  }
  if (state.meals > 0 && frac(me) < 0.3) return withLane({ type: 'meal', targetId: me.id });
  if (state.potions > 0 && frac(me) < 0.3) return withLane({ type: 'potion', targetId: me.id });
  const tele = state.combat.telegraph;
  const safe = !dangerLanes(state).has(lane);
  if (tele?.move === 'breath' && !safe && me.cls !== 'knight') return withLane({ type: 'defend' });
  if (tele?.targetId === me.id && tele.damage >= 30 && frac(me) < 0.5) return withLane({ type: 'defend' });
  if (me.cls === 'knight') {
    // Alone, Kael saves Bulwark (half damage, and he guards: a quarter) for the blows he is warned
    // of, spends every opening in Morvath's armour on Morvath, and otherwise clears the skeletons.
    const warned = (tele && tele.damage >= 30 && (tele.all || tele.targetId === me.id)) || tele?.move === 'charge' || Boolean(state.combat.danger);
    if (me.cooldown === 0 && warned) return withLane({ type: 'skill' });
    // Every lane marked (the Nemesis's Infernal Slam) and no Bulwark: guard.
    if (dangerLanes(state).size === LANES.length && !safe) return withLane({ type: 'defend' });
    const feeder = state.combat.enemies.find((e) => e.hp > 0 && e.kind === 'skeleton_risen');
    if (feeder) return withLane({ type: 'attack', targetId: feeder.id }); // they heal Morvath: first
    if (boss && !boss.armoured) return withLane({ type: 'attack', targetId: boss.id });
    const target = pickTarget(state, moved);
    if (target?.ultimate && target.armoured) return withLane({ type: 'defend' }); // nothing gets through: guard until Rune Strike is back
    return withLane(target ? { type: 'attack', targetId: target.id } : { type: 'defend' });
  }
  // Look at the board from the lane we're moving to.
  return withLane(companionAction({ ...state, party: state.party.map((p) => (p.id === me.id ? moved : p)) }, moved));
}

// A careless player: always attacks the first thing it can reach, never moves.
export function carelessLeaderAction(state) {
  const me = state.party.find((p) => p.controlled);
  if (me.fallen) return { type: 'wait' };
  const t = reachable(state, me)[0];
  return t ? { type: 'attack', targetId: t.id } : { type: 'defend' };
}
