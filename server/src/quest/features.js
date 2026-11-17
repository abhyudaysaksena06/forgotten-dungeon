// The numbers the random forest sees for one decision: a readiness / route choice on the map, or a
// care choice (a potion, a meal, the Healer or the Weaponsmith; or skipping a heal while hurt). Shared by the simulator
// (training data), the engine (recorded at decision time) and the judge (scoring).
import { CAMP, ENEMIES, FINAL_GROWTH, FRAGMENTS_FOR_THRONE, POWER_UPS, PROGRESS_SCALE, ROOMS, SWORD, TIER_SCALE } from './data.js';

export const FEATURE_NAMES = [
  'avg_level',
  'hp_frac',
  'fallen',
  'party_atk',
  'party_def',
  'party_power',
  'torches',
  'gold',
  'potions',
  'meals',
  'parts',
  'fragments',
  'rooms_cleared',
  'wipes',
  'opt_rest',
  'opt_altar',
  'opt_forge',
  'opt_fight',
  'opt_move',
  'target_tier',
  'travel_cost',
  'torches_after',
  'target_threat',
  'power_ratio',
  'leader_knight',
  'leader_mage',
  'leader_rogue',
  'leader_ranger',
  'leader_hp_frac',
  // Care decisions (added after the route features, so their order never changes):
  'in_combat',
  'sword_frac',
  'foes_threat',
  'opt_potion',
  'opt_meal',
  'opt_healer',
  'opt_smith',
  'opt_skip',
];

export const CATEGORIES = ['rest', 'altar', 'forge', 'room1', 'room2', 'room3', 'room4', 'room5', 'move', 'potion', 'meal', 'healer', 'smith', 'skip'];

// The choices that tend to Kael (the camp's paid helpers count as the Healer and the Weaponsmith).
export const CARE_TYPES = new Set(['potion', 'meal', 'healer', 'smith', 'camp_healer', 'camp_smith']);

// A moment that calls for care in a fight: the leader is hurt (under 60%) and has something to heal
// with. Whatever is done then is judged, so skipping the heal counts as a choice too ('skip').
export function careMoment(state) {
  const leader = state.party.find((m) => m.id === state.leaderId);
  return Boolean(leader && !leader.fallen && leader.hp < leader.maxHp * 0.6 && (state.potions > 0 || state.meals > 0));
}

export function optionCategory(state, action) {
  if (action.type === 'camp_healer') return 'healer';
  if (action.type === 'camp_smith') return 'smith';
  if (action.type !== 'travel') return action.type;
  const fight = action.to !== CAMP && !state.fragments.includes(action.to);
  return fight ? `room${action.to.slice(1)}` : 'move';
}

// Rough strength of the party right now: offence (with the sword's edge, halved when it is broken)
// and defence, discounted by missing health and shield.
export function partyPower(state) {
  return state.party.reduce((n, m) => {
    if (m.fallen) return n;
    const edge = m.sword ? ((SWORD.edge * m.sword.sharpness) / SWORD.sharpness) * (m.sword.durability > 0 ? 1 : 0.5) : 0;
    const pool = (m.hp + (m.shield ?? 0)) / (m.maxHp + (m.maxShield ?? 0));
    return n + ((m.atk + edge) * 2 + m.def) * (0.4 + 0.6 * pool);
  }, 0);
}

// How much a room's boss counts towards its danger, after the breather before it (see roomThreat).
const BOSS_WEIGHT = 0.25;

// Rough danger of a room if entered now (scales like the engine's spawns).
export function roomThreat(state, roomId) {
  const room = ROOMS[roomId];
  const scale = room.final ? 1 + FINAL_GROWTH * Math.max(0, state.stats.roomsCleared - FRAGMENTS_FOR_THRONE) : 1 + TIER_SCALE * (room.tier - 1) + PROGRESS_SCALE * state.stats.roomsCleared;
  let threat = 0;
  // A room's boss (a later wave, not the Throne's) comes after a breather: Kael's shield is full
  // again and he gets some health back, so the boss adds only a share of its weight.
  room.waves.forEach((wave, w) => {
    const weight = w > 0 && !room.final ? BOSS_WEIGHT : 1;
    for (const kind of wave) threat += (ENEMIES[kind].hp / 10 + ENEMIES[kind].atk * 2) * scale * weight;
  });
  return threat;
}

// The leader's sword, 0 (blunt and broken) to 1 (sharp and whole).
function swordFrac(state) {
  const sword = state.party.find((m) => m.id === state.leaderId)?.sword;
  return sword ? Math.round(((sword.sharpness / SWORD.sharpness + sword.durability / SWORD.durability) / 2) * 1000) / 1000 : 0;
}

// How much fight is left in the room right now (0 on the map).
function foesThreat(state) {
  if (state.phase !== 'combat' || !state.combat) return 0;
  return Math.round(state.combat.enemies.filter((e) => e.hp > 0).reduce((n, e) => n + e.hp / 10 + e.atk * 2, 0));
}

function leaderHp(state) {
  const leader = state.party.find((m) => m.id === state.leaderId);
  return leader && !leader.fallen ? Math.round((leader.hp / leader.maxHp) * 1000) / 1000 : 0;
}

export function decisionFeatures(state, action) {
  const party = state.party;
  const living = party.filter((m) => !m.fallen);
  const hpFrac = party.reduce((n, m) => n + m.hp, 0) / party.reduce((n, m) => n + m.maxHp, 0);
  const cat = optionCategory(state, action);
  const fight = cat.startsWith('room');
  const target = action.type === 'travel' && action.to !== CAMP ? action.to : null;
  const cost = action.type === 'travel' ? action.cost ?? 0 : POWER_UPS[action.type]?.torches ?? 0;
  const threat = fight ? roomThreat(state, target) : 0;
  const power = partyPower(state);
  return [
    party.reduce((n, m) => n + m.level, 0) / party.length,
    Math.round(hpFrac * 1000) / 1000,
    party.length - living.length,
    living.reduce((n, m) => n + m.atk, 0),
    living.reduce((n, m) => n + m.def, 0),
    Math.round(power),
    state.torches,
    state.gold,
    state.potions,
    state.meals,
    state.parts,
    state.fragments.length,
    state.stats.roomsCleared,
    state.stats.wipes,
    cat === 'rest' ? 1 : 0,
    cat === 'altar' ? 1 : 0,
    cat === 'forge' ? 1 : 0,
    fight ? 1 : 0,
    cat === 'move' ? 1 : 0,
    fight ? ROOMS[target].tier : 0,
    cost,
    state.torches - cost,
    Math.round(threat),
    fight ? Math.round((power / threat) * 1000) / 1000 : 0,
    // Who leads matters: only the leader can break Morvath's armour, so they must survive.
    ...['knight', 'mage', 'rogue', 'ranger'].map((c) => (state.leaderId === c ? 1 : 0)),
    leaderHp(state),
    state.phase === 'combat' ? 1 : 0,
    swordFrac(state),
    foesThreat(state),
    cat === 'potion' ? 1 : 0,
    cat === 'meal' ? 1 : 0,
    cat === 'healer' ? 1 : 0,
    cat === 'smith' ? 1 : 0,
    cat === 'skip' ? 1 : 0,
  ];
}
