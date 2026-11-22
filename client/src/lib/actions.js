// Combat buttons are wired by handler name, so the button list and the handlers must agree.
export const COMBAT_ACTIONS = [
  { type: 'attack', label: 'Attack', handler: 'onAttack', key: 'A' },
  { type: 'defend', label: 'Defend', handler: 'onDefend', key: 'D' },
  { type: 'ability', label: 'Ability', handler: 'onAbility', key: 'S' },
  { type: 'item', label: 'Use item', handler: 'onUseItem', key: 'I' },
];

// send(type, payload) -> Promise. Payloads carry intents only: never HP or damage.
export function createCombatHandlers(send) {
  return {
    onAttack: ({ targetId } = {}) => send('combat_action', { type: 'attack', targetId }),
    onDefend: () => send('combat_action', { type: 'defend' }),
    onAbility: ({ targetId } = {}) => send('combat_action', { type: 'ability', targetId }),
    onUseItem: ({ itemUid, targetId } = {}) => send('combat_action', { type: 'item', itemUid, targetId }),
  };
}

// Every click gets a fresh idempotency key; a retry of the same click reuses it.
export function newActionId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `a-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
