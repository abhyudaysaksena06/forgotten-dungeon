// Simulated players for balance checks and for the random forest's training data.
import { carefulLeaderAction, carelessLeaderAction } from './ai.js';
import { CAMP, PARTY_ORDER, PIP, ROOMS, SWORD } from './data.js';
import { cagesOpen, pipOffers, routeOptions, step } from './engine.js';
import { partyPower, roomThreat } from './features.js';

const hpFrac = (s) => s.party.reduce((n, m) => n + m.hp, 0) / s.party.reduce((n, m) => n + m.maxHp, 0);
const STRIKERS = ['rogue', 'ranger'];

// Small upkeep a sensible player does at camp before choosing where to go (Pip, potions).
// Not a route decision, so the forest doesn't score it directly; it shows up in the stats of the
// next decision instead.
export function upkeep(state) {
  if (state.phase !== 'map') return null;
  // In a cleared room the cage is open: the Healer and the Weaponsmith are free.
  if (cagesOpen(state)) {
    if (state.party.some((m) => m.hp < m.maxHp || m.shield < m.maxShield)) return { type: 'healer' };
    if (state.party.some((m) => m.sword && (m.sword.sharpness < SWORD.sharpness || m.sword.durability < SWORD.durability))) return { type: 'smith' };
  }
  const offers = new Set(pipOffers(state).map((o) => o.item));
  if (offers.has('meal')) return { type: 'trade', item: 'meal' };
  if (offers.has('potion') && state.potions < 2 && state.gold >= PIP.potion.gold + 30) return { type: 'trade', item: 'potion' };
  const hurt = state.party.find((m) => !m.fallen && m.hp / m.maxHp < 0.35);
  if (hurt && state.location !== CAMP) {
    if (state.meals > 0) return { type: 'meal', targetId: hurt.id };
    if (state.potions > 1) return { type: 'potion', targetId: hurt.id };
  }
  return null;
}

// The power-to-threat ratio a planner of boldness 1 wants before a room, and before the Throne,
// calibrated with the simulator for one hero (see docs/QUEST.md, the random forest).
export const ROUTE_NEED = { room: 0.4, final: 0.7 };

// A route planner with a "boldness" knob: how strong the party must feel before a fight.
// Noise (epsilon) makes it explore, which gives the forest varied decisions to learn from.
export function routePolicy({ boldness = 1, epsilon = 0, rng = Math.random } = {}) {
  return (state) => {
    const options = routeOptions(state);
    if (!options.length) return null;
    if (rng() < epsilon) return options[Math.floor(rng() * options.length)];
    const power = partyPower(state);
    const hp = hpFrac(state);
    const score = (o) => {
      if (o.type === 'rest') return hp < 0.75 ? 3 + (1 - hp) * 4 : -2;
      if (o.type === 'altar') return STRIKERS.includes(o.memberId) ? 1.2 : 0.4;
      if (o.type === 'forge') return STRIKERS.includes(o.memberId) ? 1.6 : 0.5;
      if (!o.fight) return o.to === CAMP && hp < 0.6 ? 2.5 : -8;
      const ratio = power / roomThreat(state, o.to);
      const tier = ROOMS[o.to].tier;
      const need = (ROOMS[o.to].final ? ROUTE_NEED.final : ROUTE_NEED.room) / boldness;
      if (ratio < need) return -4 - (need - ratio) * 10;
      if (ROOMS[o.to].final && hp < 0.85) return -6; // never face Morvath hurt
      return 2 + tier * 0.6 - o.cost * 0.5 + (ROOMS[o.to].final ? 3 : 0);
    };
    return [...options].sort((a, b) => score(b) - score(a))[0];
  };
}

export function playRun(state, { route = routePolicy(), hero = carefulLeaderAction, maxSteps = 2500 } = {}) {
  let s = structuredClone(state);
  for (let i = 0; i < maxSteps && ['map', 'combat'].includes(s.phase); i++) {
    let action;
    if (s.phase === 'map') action = upkeep(s) ?? route(s);
    else action = hero(s);
    if (!action) break;
    s = step(s, action, { mutate: true });
  }
  return s;
}

export const LEADERS = PARTY_ORDER;
export { carefulLeaderAction, carelessLeaderAction };
