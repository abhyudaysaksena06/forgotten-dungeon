// AI companions. Plain deterministic rules (no LLM), so the same choices always replay the same way
// and every participant gets the same dungeon. These functions only decide; game.js carries out.
import { CLASSES, checkBonus } from './classes.js';
import { DC } from './dice.js';
import { alivePlayers, aliveEnemies, partyList } from './party.js';

// One companion per class the hero did not pick. Second names cover a hero who took the first.
export const COMPANIONS = {
  warrior: { names: ['Brannoc', 'Hald'], vote: 'Stand aside. Some doors want a shoulder, not a plan.' },
  mage: { names: ['Ysolde', 'Corvin'], vote: 'Let me read it first. Runes rarely lie.' },
  rogue: { names: ['Quill', 'Wren'], vote: 'Watch where I step, and step there.' },
  healer: { names: ['Maren', 'Ilse'], vote: 'Slowly. The old dead leave warnings for the living.' },
};

export const FOLLOW_LINE = 'Not my trade, but this looks like our best chance.';

const slot = (p, item) => p.inventory.find((s) => s.item === item);
const ratio = (p) => (p.maxHp ? p.hp / p.maxHp : 0);

export function companionName(state, cls) {
  const taken = new Set(partyList(state).map((p) => p.name.toLowerCase()));
  return COMPANIONS[cls].names.find((n) => !taken.has(n.toLowerCase())) ?? `${CLASSES[cls].name}Companion`;
}

// Votes for its own specialty when that is a good bet, otherwise for the party's best odds.
export function npcVote(state, npc, options) {
  const torch = options.find((o) => o.requires && slot(npc, o.requires));
  if (torch) return { optionId: torch.id, line: `I have a ${torch.requires}. No need to roll for this one.` };
  const alive = alivePlayers(state);
  const score = (o) => {
    if (o.noCheck) return -100; // someone else's item; let its holder decide
    const best = Math.max(...alive.map((p) => checkBonus(p.cls, o.skill)));
    const mine = CLASSES[npc.cls].specialty === o.skill ? 3 : 0;
    return best - DC[o.difficulty] + mine + (o.reward?.shard ? 2 : 0);
  };
  const choice = [...options].sort((a, b) => score(b) - score(a))[0];
  const own = CLASSES[npc.cls].specialty === choice.skill;
  return { optionId: choice.id, line: own ? COMPANIONS[npc.cls].vote : FOLLOW_LINE };
}

// Between rooms: equip, cure, drink, heal. Returns intents for game.js to carry out.
export function npcUpkeep(state, npc) {
  const intents = [];
  const fallen = partyList(state).find((p) => p.fallen);
  if (slot(npc, 'rusty_sword')) intents.push({ type: 'item', itemUid: slot(npc, 'rusty_sword').uid, targetId: npc.id });
  if (fallen && slot(npc, 'revive_charm')) intents.push({ type: 'item', itemUid: slot(npc, 'revive_charm').uid, targetId: fallen.id });
  if (npc.poison && slot(npc, 'antidote')) intents.push({ type: 'item', itemUid: slot(npc, 'antidote').uid, targetId: npc.id });
  if (ratio(npc) < 0.5 && slot(npc, 'health_potion')) intents.push({ type: 'item', itemUid: slot(npc, 'health_potion').uid, targetId: npc.id });
  if (npc.cls === 'healer' && npc.cooldown === 0) {
    const target = fallen ?? [...alivePlayers(state)].sort((a, b) => ratio(a) - ratio(b))[0];
    if (target && (target.fallen || target.maxHp - target.hp >= 20)) intents.push({ type: 'ability', targetId: target.id });
  }
  return intents;
}

// One combat action, chosen from what the party can see: HP, the King's telegraph, enemies left.
export function npcCombatAction(state, npc) {
  const enemies = aliveEnemies(state);
  const party = partyList(state);
  const alive = party.filter((p) => !p.fallen);
  const fallen = party.find((p) => p.fallen);
  const lowest = [...alive].sort((a, b) => ratio(a) - ratio(b))[0];
  const tele = state.boss?.telegraph;
  const ready = npc.cooldown === 0;
  const weakMinion = enemies.filter((e) => !e.boss).sort((a, b) => a.hp - b.hp)[0];
  const target = (weakMinion && weakMinion.hp <= 15 ? weakMinion : null) ?? enemies.find((e) => e.boss) ?? weakMinion;
  const attack = { type: 'attack', targetId: target?.id };

  // #region C2 companion-orders
  switch (npc.order) {
    case 'defend':
      return { type: 'defend' };
    case 'attack':
      return attack;
    case 'support':
      if (ready && npc.cls === 'healer') return { type: 'ability', targetId: (fallen ?? lowest).id };
      if (ready && npc.cls !== 'rogue') return { type: 'ability' };
      if (slot(npc, 'health_potion') && ratio(lowest) < 0.6) return { type: 'item', itemUid: slot(npc, 'health_potion').uid, targetId: lowest.id };
      return { type: 'defend' };
    default:
      break;
  }
  // #endregion C2

  if (fallen && slot(npc, 'revive_charm')) return { type: 'item', itemUid: slot(npc, 'revive_charm').uid, targetId: fallen.id };
  if (npc.cls === 'healer' && ready && (fallen || ratio(lowest) < 0.6)) return { type: 'ability', targetId: (fallen ?? lowest).id };
  if (npc.cls === 'warrior' && ready && (tele?.attack === 'grave_wail' || alive.filter((p) => ratio(p) < 0.4).length >= 2)) return { type: 'ability' };
  if (npc.cls === 'mage' && ready && enemies.length > 1) return { type: 'ability' };
  if (ratio(npc) < 0.35 && slot(npc, 'health_potion')) return { type: 'item', itemUid: slot(npc, 'health_potion').uid, targetId: npc.id };
  if (tele?.targetId === npc.id && npc.hp <= 30) return { type: 'defend' };
  if (npc.cls === 'rogue' && ready && target) return { type: 'ability', targetId: target.id };
  return attack;
}

// #region C2 order-parsing
// Orders a hero can whisper to a companion. They last until changed.
export const ORDERS = {
  attack: ['attack', 'strike', 'fight', 'kill'],
  defend: ['defend', 'guard', 'block', 'hold'],
  support: ['support', 'heal', 'help', 'protect'],
  free: ['free', 'yourself', 'judgment', 'judgement', 'whatever'],
};

const REPLIES = {
  attack: 'Understood. Steel first, questions later.',
  defend: 'I will keep my guard up.',
  support: 'I will look after the others.',
  free: 'As you wish. I will use my own judgment.',
};

export function parseOrder(text) {
  const words = String(text).toLowerCase().match(/[a-z]+/g) ?? [];
  const order = Object.keys(ORDERS).find((key) => ORDERS[key].some((w) => words.includes(w)));
  if (!order) return { understood: false, order: null, reply: 'I did not catch that. Try: attack, defend, support or free.' };
  return { understood: true, order: order === 'free' ? null : order, reply: REPLIES[order] };
}
// #endregion C2
