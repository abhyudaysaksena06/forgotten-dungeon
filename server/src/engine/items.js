import { assert } from './errors.js';
import { healPlayer, nextUid, partyList, playerAtk, pushLog, revivePlayer } from './party.js';

export const INVENTORY_SLOTS = 6;

// target: who the item can be used on. 'story' items are spent by the dungeon itself.
export const ITEMS = {
  health_potion: { name: 'Health Potion', target: 'ally', description: 'Restores 30 HP.' },
  antidote: { name: 'Antidote', target: 'ally', description: 'Cures poison.' },
  revive_charm: { name: 'Revive Charm', target: 'fallen', description: 'Revives a Fallen ally at 30 HP.' },
  rusty_sword: { name: 'Rusty Sword', target: 'self', description: '+3 ATK for the rest of the run.' },
  torch: { name: 'Torch', target: 'story', description: 'Some rooms offer a choice only a Torch can make.' },
  iron_key: { name: 'Iron Key', target: 'story', description: 'Opens the doors of the Ashen Library.' },
  ancient_rune: { name: 'Ancient Rune', target: 'story', description: 'Unseals the Throne of the Forgotten King.' },
};

export function hasFreeSlot(player) {
  return player.inventory.length < INVENTORY_SLOTS;
}

export function findItemHolder(state, itemId) {
  for (const p of partyList(state)) {
    const slot = p.inventory.find((s) => s.item === itemId);
    if (slot) return { player: p, slot };
  }
  return null;
}

export function removeSlot(player, uid) {
  const index = player.inventory.findIndex((s) => s.uid === uid);
  if (index === -1) return null;
  return player.inventory.splice(index, 1)[0];
}

// Gives loot to the preferred player, else the first living player with room.
export function giveItem(state, itemId, preferredId) {
  const party = partyList(state);
  const candidates = [state.players[preferredId], ...party.filter((p) => !p.fallen), ...party].filter(Boolean);
  const receiver = candidates.find(hasFreeSlot);
  const name = ITEMS[itemId].name;
  if (!receiver) {
    pushLog(state, 'loot', `Every pack is full — the ${name} is left behind.`, { item: itemId, lost: true });
    return null;
  }
  const slot = { uid: nextUid(state, 'i'), item: itemId };
  receiver.inventory.push(slot);
  pushLog(state, 'loot', `${receiver.name} takes the ${name}.`, { item: itemId, playerId: receiver.id });
  return slot;
}

// Uses an item from the user's pack. The slot is removed only after every check passes,
// and callers hold the room lock, so one slot can never be spent twice.
export function useItem(state, userId, uid, targetId) {
  const user = state.players[userId];
  assert(user && !user.fallen, 'fallen', 'Fallen heroes cannot use items.');
  const slot = user.inventory.find((s) => s.uid === uid);
  assert(slot, 'item_not_found', 'That item is no longer in your pack.');
  const def = ITEMS[slot.item];
  assert(def.target !== 'story', 'cannot_use_here', `The ${def.name} is used by the dungeon itself.`);

  const target = state.players[targetId ?? userId];
  assert(target, 'bad_target', 'No such ally.');

  let text;
  switch (slot.item) {
    case 'health_potion': {
      assert(!target.fallen, 'bad_target', 'A potion cannot reach the Fallen — use Mend or a Revive Charm.');
      const healed = healPlayer(target, 30);
      text = `${user.name} gives ${target.name} a Health Potion (+${healed} HP).`;
      break;
    }
    case 'antidote':
      assert(!target.fallen, 'bad_target', 'The Fallen cannot drink.');
      target.poison = 0;
      text = `${user.name} cures ${target.name}'s poison.`;
      break;
    case 'revive_charm':
      assert(target.fallen, 'bad_target', `${target.name} has not Fallen.`);
      revivePlayer(target, 30);
      text = `${user.name} shatters a Revive Charm — ${target.name} rises with 30 HP!`;
      break;
    case 'rusty_sword':
      assert(target.id === user.id, 'bad_target', 'You can only equip a sword yourself.');
      user.atkBonus += 3;
      text = `${user.name} straps on the Rusty Sword (ATK ${playerAtk(user)}).`;
      break;
    default:
      assert(false, 'cannot_use_here', 'Nothing happens.');
  }

  removeSlot(user, uid);
  pushLog(state, 'item', text, { playerId: user.id, targetId: target.id, item: slot.item });
  return { item: slot.item, targetId: target.id };
}
