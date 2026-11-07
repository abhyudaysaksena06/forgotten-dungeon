import { createDungeonMaster } from '../src/dm/dungeonMaster.js';
import { MemoryStore } from '../src/db/memoryStore.js';
import { openWindow } from '../src/engine/game.js';
import { RoomManager } from '../src/rooms/roomManager.js';

let counter = 0;
export const aid = () => `test-action-${++counter}`;

export function makeManager(overrides = {}) {
  let now = 1_700_000_000_000;
  const emitted = [];
  const manager = new RoomManager({
    store: new MemoryStore(),
    dm: createDungeonMaster(),
    emit: (code, event, payload) => emitted.push({ code, event, payload }),
    clock: () => now,
    autoTimers: false,
    seed: 'test-seed',
    ...overrides,
  });
  return { manager, emitted, advance: (ms) => (now += ms) };
}

// A started single-hero run: the hero plus three AI companions.
export async function startedRoom(manager, cls = 'warrior', name = 'Aria') {
  const hero = await manager.createRoom(name);
  await manager.perform(hero.code, hero.playerId, { actionId: aid(), type: 'choose_class', payload: { cls } });
  await manager.perform(hero.code, hero.playerId, { actionId: aid(), type: 'start' });
  const state = manager.state(hero.code);
  return { code: hero.code, hero, heroId: hero.playerId, state, me: state.players[hero.playerId] };
}

export const companion = (state, cls) => state.players[`npc-${cls}`];

// Items are used between rooms. Tests about items should not depend on how votes behave,
// so they put the run back in a room explicitly.
export function inRoom(state) {
  state.phase = 'scene';
  state.combat = null;
}

// Plays forward until a fight is open.
export async function toCombat(manager, code) {
  const s = manager.state(code);
  for (let i = 0; i < 10 && s.phase === 'scene'; i++) await heroTurn(manager, code);
  return s;
}

// One step of play for the hero: vote / act if possible, otherwise let the window time out.
// `choose` may pick { optionId } for votes or a combat payload.
export async function heroTurn(manager, code, choose = {}) {
  const s = manager.state(code);
  const hero = s.players[s.hostId];
  const window = openWindow(s);
  if (!window) return;
  if (s.phase === 'scene' && !hero.fallen) {
    const optionId = choose.optionId ?? s.vote.options[0];
    return manager.perform(code, hero.id, { actionId: aid(), type: 'vote', payload: { optionId } });
  }
  if (s.phase === 'combat' && !hero.fallen && hero.stun === 0 && !s.combat.actions[hero.id]) {
    return manager.perform(code, hero.id, { actionId: aid(), type: 'combat_action', payload: choose.combat ?? { type: 'attack' } });
  }
  return manager.closeWindow(code, window.id);
}

export async function playToEnd(manager, code, strategy = () => ({}), limit = 600) {
  const s = manager.state(code);
  for (let i = 0; i < limit && !['victory', 'defeat'].includes(s.phase); i++) {
    await heroTurn(manager, code, strategy(s));
    checkInvariants(s);
  }
  return s;
}

// Jumps to the room before the throne and lets its vote time out, which walks into the boss.
export async function toBoss(manager, code, { lastScene } = {}) {
  const { SCENES } = await import('../src/engine/dungeon.js');
  const state = manager.state(code);
  state.sceneIndex = (lastScene ?? SCENES.findIndex((s) => s.type === 'boss')) - 1;
  state.stage = SCENES[state.sceneIndex].stage;
  state.phase = 'scene';
  state.vote = { id: 'jump', options: [SCENES[state.sceneIndex].options[0].id], votes: {}, endsAt: 0, closed: false, result: null };
  await manager.closeWindow(code, 'jump');
  return state;
}

export function checkInvariants(state) {
  for (const p of Object.values(state.players)) {
    if (p.hp < 0 || p.hp > p.maxHp) throw new Error(`${p.name} hp out of range: ${p.hp}/${p.maxHp}`);
    if (p.inventory.length > 6) throw new Error(`${p.name} carries ${p.inventory.length} items`);
    if (p.fallen !== (p.hp === 0) && state.phase !== 'lobby') throw new Error(`${p.name} fallen flag mismatch`);
  }
  for (const e of state.enemies) if (e.hp < 0 || e.hp > e.maxHp) throw new Error(`${e.name} hp out of range: ${e.hp}`);
}
