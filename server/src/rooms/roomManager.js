// Owns every run: its state, lock, reconnect tokens and recent action ids.
import { randomBytes, randomUUID } from 'node:crypto';
import { buildDmContext } from '../dm/context.js';
import { GameError, assert } from '../engine/errors.js';
import { addPlayer, applyAction, closeOpenWindow, createGame, openWindow } from '../engine/game.js';
import { pushLog } from '../engine/party.js';
import { createRng } from '../engine/rng.js';
import { computeHeroScore } from '../engine/score.js';
import { publicView } from '../engine/view.js';
import { parseChat } from './chat.js';
// #region C2 order-import
import { parseOrder } from '../engine/npc.js';
// #endregion C2
import { Mutex } from './mutex.js';
import { generateRoomCode, normalizeRoomCode } from './roomCode.js';

const PROCESSED_LIMIT = 2000;

// Clients send intents, never numbers: only these fields, only short strings/booleans, get through.
const PAYLOAD_FIELDS = {
  choose_class: ['cls'],
  ready: ['ready'],
  start: [],
  vote: ['optionId'],
  combat_action: ['type', 'targetId', 'itemUid'],
  use_item: ['itemUid', 'targetId'],
  use_ability: ['targetId'],
  retry: [],
};

export function sanitizePayload(type, payload) {
  const fields = PAYLOAD_FIELDS[type];
  if (!fields) throw new GameError('unknown_action', `Unknown action "${type}".`);
  const out = {};
  for (const field of fields) {
    const value = payload?.[field];
    if ((typeof value === 'string' && value.length <= 64) || typeof value === 'boolean') out[field] = value;
  }
  return out;
}

class Room {
  constructor(state) {
    this.state = state;
    this.lock = new Mutex();
    this.tokens = new Map(); // token -> playerId (never part of the state)
    this.processed = new Map(); // actionId -> result
    this.timer = null;
    this.timerWindow = null;
    this.narrationQueue = Promise.resolve();
    this.persistedLogSeq = 0;
  }
}

export class RoomManager {
  rooms = new Map();

  constructor({
    store,
    dm,
    emit = () => {},
    clock = Date.now,
    seed = 'forgotten-dungeon',
    voteSeconds = 30,
    actionSeconds = 30,
    npcSeconds = 2,
    speedTargetMinutes = 30,
    autoTimers = true,
  }) {
    Object.assign(this, { store, dm, emit, clock, seed, voteSeconds, actionSeconds, npcSeconds, speedTargetMinutes, autoTimers });
  }

  #room(rawCode) {
    const code = normalizeRoomCode(rawCode);
    const room = this.rooms.get(code);
    if (!room) throw new GameError('room_not_found', `No dungeon with code ${code || '(blank)'}.`);
    return room;
  }

  #ctx() {
    return {
      now: this.clock(),
      voteSeconds: this.voteSeconds,
      actionSeconds: this.actionSeconds,
      npcSeconds: this.npcSeconds,
      narrate: [],
    };
  }

  async createRoom(name) {
    let code;
    do code = generateRoomCode();
    while (this.rooms.has(code));
    this.rooms.set(code, new Room(createGame({ code, seed: this.seed, speedTargetMinutes: this.speedTargetMinutes })));
    return this.joinRoom(code, name);
  }

  // Runs are single-hero. A valid token means "this is me again" (refresh, new tab): same hero, no duplicate.
  async joinRoom(rawCode, name, token) {
    const room = this.#room(rawCode);
    return room.lock.run(async () => {
      const code = room.state.code;
      if (typeof token === 'string' && room.tokens.has(token)) {
        return { code, playerId: room.tokens.get(token), token, rejoined: true };
      }
      assert(room.state.order.length === 0, 'singleplayer', 'This run already has its hero. Use "Watch a run" to spectate it.');
      const playerId = randomUUID();
      addPlayer(room.state, { id: playerId, name });
      const newToken = randomBytes(24).toString('base64url');
      room.tokens.set(newToken, playerId);
      await this.#commit(room, this.#ctx());
      return { code, playerId, token: newToken, rejoined: false };
    });
  }

  exists(rawCode) {
    return this.rooms.has(normalizeRoomCode(rawCode));
  }

  authenticate(rawCode, token) {
    const room = this.rooms.get(normalizeRoomCode(rawCode));
    if (!room || typeof token !== 'string') return null;
    const playerId = room.tokens.get(token);
    return playerId ? { code: room.state.code, playerId } : null;
  }

  // The single door for game actions.
  async perform(rawCode, playerId, { actionId, type, payload } = {}) {
    const room = this.#room(rawCode);
    return room.lock.run(async () => {
      const seat = typeof playerId === 'string' && Object.hasOwn(room.state.players, playerId) && room.state.players[playerId];
      assert(seat && !seat.npc, 'not_member', 'You are not the hero of this run.');
      assert(typeof actionId === 'string' && /^[\w-]{8,64}$/.test(actionId), 'bad_action_id', 'Every action needs an idempotency key.');
      if (room.processed.has(actionId)) return { ...room.processed.get(actionId), duplicate: true };

      const clean = sanitizePayload(type, payload);
      const ctx = this.#ctx();
      ctx.rng = createRng(room.state);
      const result = (await applyAction(room.state, playerId, type, clean, ctx)) ?? {};

      room.processed.set(actionId, result);
      if (room.processed.size > PROCESSED_LIMIT) room.processed.delete(room.processed.keys().next().value);
      await this.store.recordAction(room.state.code, actionId, { playerId, type, payload: clean });
      await this.#commit(room, ctx);
      return result;
    });
  }

  // Timer expiry: closes the vote / combat window exactly once, and only if it is still the same window.
  async closeWindow(rawCode, windowId) {
    const room = this.#room(rawCode);
    return room.lock.run(async () => {
      const ctx = this.#ctx();
      ctx.rng = createRng(room.state);
      const closed = closeOpenWindow(room.state, windowId, ctx);
      if (closed) await this.#commit(room, ctx);
      return closed;
    });
  }

  async setConnected(rawCode, playerId, connected) {
    const room = this.#room(rawCode);
    return room.lock.run(async () => {
      const p = room.state.players[playerId];
      if (!p || p.connected === connected) return;
      p.connected = connected;
      await this.#commit(room, this.#ctx());
    });
  }

  // Public chat goes into the log. Whispers are returned to the socket layer for the two people
  // involved and are never stored, logged or shown to the Dungeon Master.
  async chat(rawCode, playerId, text) {
    const room = this.#room(rawCode);
    return room.lock.run(async () => {
      const sender = room.state.players[playerId];
      assert(sender, 'not_member', 'You are not part of this party.');
      const msg = parseChat(text);
      if (!msg) return null;
      if (msg.kind === 'error') throw new GameError('bad_command', msg.message);
      // #region C2 whisper-orders
      if (msg.kind === 'whisper') {
        const to = Object.values(room.state.players).find((p) => p.name.toLowerCase() === msg.to.toLowerCase());
        assert(to, 'no_such_player', `No one called ${msg.to} is in your party.`);
        assert(to.id !== sender.id, 'bad_target', 'Whispering to yourself? The dungeon is getting to you.');
        const at = this.clock();
        const whisper = { kind: 'whisper', fromId: sender.id, from: sender.name, toId: to.id, to: to.name, text: msg.text, at };
        if (!to.npc) return { ...whisper, replies: [] };
        // A companion takes the whisper as a standing order and answers privately.
        const { understood, order, reply } = parseOrder(msg.text);
        if (understood) to.order = order;
        await this.store.saveRoom(room.state.code, room.state);
        const answer = { kind: 'whisper', fromId: to.id, from: to.name, toId: sender.id, to: sender.name, text: reply, at: at + 1 };
        return { ...whisper, replies: [answer] };
      }
      // #endregion C2
      pushLog(room.state, 'chat', `${sender.name}: ${msg.text}`, { playerId });
      await this.#commit(room, this.#ctx());
      return { kind: 'say' };
    });
  }

  view(rawCode) {
    return publicView(this.#room(rawCode).state, this.clock());
  }

  state(rawCode) {
    return this.#room(rawCode).state;
  }

  overview() {
    return [...this.rooms.values()].map(({ state }) => ({
      code: state.code,
      phase: state.phase,
      stage: state.stage,
      players: state.order.map((id) => {
        const p = state.players[id];
        return { name: p.name, npc: p.npc, cls: p.cls, hp: p.hp, maxHp: p.maxHp, fallen: p.fallen, connected: p.connected };
      }),
      shards: state.shards.length,
      retries: state.stats.retries,
      startedAt: state.stats.startedAt,
      finishedAt: state.stats.finishedAt,
      score: computeHeroScore(state),
    }));
  }

  async #commit(room, ctx) {
    const { state } = room;
    await this.store.saveRoom(state.code, state);
    const fresh = state.log.filter((e) => e.id > room.persistedLogSeq);
    if (fresh.length) {
      room.persistedLogSeq = fresh.at(-1).id;
      await this.store.appendEvents(state.code, fresh);
    }
    if (state.score) await this.store.saveScore(state.code, state.score);
    this.#schedule(room);
    this.emit(state.code, 'state', publicView(state, this.clock()));
    for (const trigger of ctx.narrate) this.#narrate(room, buildDmContext(state, trigger));
  }

  #schedule(room) {
    if (!this.autoTimers) return;
    const window = openWindow(room.state);
    if ((window?.id ?? null) === room.timerWindow) return;
    clearTimeout(room.timer);
    room.timer = null;
    room.timerWindow = window?.id ?? null;
    if (!window) return;
    const code = room.state.code;
    room.timer = setTimeout(() => this.closeWindow(code, window.id).catch(() => {}), Math.max(0, window.endsAt - this.clock()));
    room.timer.unref?.();
  }

  // Narration runs outside the lock (the LLM may take seconds) and in order. Its text is stored
  // as flavour only; nothing in it can change the game.
  #narrate(room, context) {
    room.narrationQueue = room.narrationQueue
      .then(() => this.dm.narrate(context))
      .then((out) =>
        room.lock.run(async () => {
          room.state.narration = { text: out.narration, suggestions: out.suggested_choices, source: out.source, trigger: context.trigger.type };
          pushLog(room.state, 'narration', out.narration);
          await this.#commit(room, { narrate: [] });
        }),
      )
      .catch(() => {});
  }

  // Lets tests wait for narration to settle.
  async idle(rawCode) {
    const room = this.#room(rawCode);
    await room.narrationQueue;
    await room.lock.run(() => {});
  }

  stopTimers() {
    for (const room of this.rooms.values()) clearTimeout(room.timer);
  }
}
