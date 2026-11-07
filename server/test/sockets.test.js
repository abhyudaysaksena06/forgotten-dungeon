// End-to-end over real HTTP + Socket.IO on a random port.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, test } from 'node:test';
import { Server } from 'socket.io';
import { io as connect } from 'socket.io-client';
import { EventControl } from '../src/admin/eventControl.js';
import { MemoryStore } from '../src/db/memoryStore.js';
import { createDungeonMaster } from '../src/dm/dungeonMaster.js';
import { createApp } from '../src/http.js';
import { RoomManager } from '../src/rooms/roomManager.js';
import { attachSockets } from '../src/sockets.js';

let base, httpServer, io, manager;
const sockets = [];

before(async () => {
  httpServer = createServer();
  io = new Server(httpServer);
  manager = new RoomManager({
    store: new MemoryStore(),
    dm: createDungeonMaster(),
    emit: (code, event, payload) => io.to(`room:${code}`).emit(event, payload),
    autoTimers: false,
  });
  const control = new EventControl({ broadcast: (e, p) => io.emit(e, p) });
  httpServer.on('request', createApp({ manager, control, config: { adminToken: 'test-admin-token' } }));
  attachSockets(io, { manager, control });
  await new Promise((r) => httpServer.listen(0, r));
  base = `http://localhost:${httpServer.address().port}`;
});

after(async () => {
  sockets.forEach((s) => s.close());
  io.close();
  await new Promise((r) => httpServer.close(r));
});

const post = (path, body, headers = {}) =>
  fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) }).then((r) => r.json());

function open(auth) {
  return new Promise((resolve, reject) => {
    const s = connect(base, { auth, transports: ['websocket'], forceNew: true });
    sockets.push(s);
    s.received = { whisper: [], state: [] };
    s.on('whisper', (w) => s.received.whisper.push(w));
    s.on('state', (st) => s.received.state.push(st));
    s.on('connect', () => resolve(s));
    s.on('connect_error', reject);
  });
}

const emit = (s, event, payload) => new Promise((r) => s.emit(event, payload, r));
const settle = () => new Promise((r) => setTimeout(r, 80));

async function startedRun(name = 'Aria') {
  const run = await post('/api/rooms', { name });
  const hero = await open({ code: run.code, token: run.token });
  await emit(hero, 'action', { actionId: `cls-${run.code}`, type: 'choose_class', payload: { cls: 'mage' } });
  await emit(hero, 'action', { actionId: `start-${run.code}`, type: 'start', payload: {} });
  return { run, hero };
}

test('[A1] sockets need a valid token; spectators cannot act', async () => {
  const { run } = await startedRun();
  await assert.rejects(open({ code: run.code, token: 'forged' }), /not_member/);
  const watcher = await open({ code: run.code, spectate: true });
  const reply = await emit(watcher, 'action', { actionId: 'spectator-vote-1', type: 'vote', payload: { optionId: 'force' }, playerId: run.playerId });
  assert.equal(reply.ok, false);
  assert.equal(manager.state(run.code).vote?.votes[run.playerId], undefined);
});

test('[A1] socket actions are bound to the authenticated seat', async () => {
  const { run: a } = await startedRun('Aria');
  const { hero: b } = await startedRun('Bram');
  const before = JSON.stringify(manager.view(a.code).players);
  await emit(b, 'action', { actionId: 'spoof-action-1', type: 'retry', payload: {}, code: a.code, playerId: a.playerId });
  await emit(b, 'action', { actionId: 'spoof-action-2', type: 'vote', payload: { optionId: 'force' }, code: a.code, playerId: a.playerId });
  assert.equal(manager.state(a.code).vote?.votes[a.playerId], undefined);
  assert.equal(JSON.stringify(manager.view(a.code).players), before);
});

test('[E4] spectating accepts a messy run code', async () => {
  const { run } = await startedRun();
  const watcher = await open({ code: ` ${run.code.toLowerCase()} `, spectate: true });
  await settle();
  assert.ok(watcher.received.state.length > 0);
});

test('[M4] REST rejoin with the token returns the same hero; strangers cannot join', async () => {
  const { run } = await startedRun();
  const again = await post('/api/rooms/join', { code: run.code, name: 'Aria', token: run.token });
  assert.equal(again.playerId, run.playerId);
  const stranger = await post('/api/rooms/join', { code: run.code, name: 'Zed' });
  assert.equal(stranger.ok, false);
});

test('[C2] a whisper and its reply reach only the hero — not spectators', async () => {
  const { run, hero } = await startedRun();
  const watcher = await open({ code: run.code, spectate: true });
  const ack = await emit(hero, 'chat', { text: '/w Quill defend the lectern' });
  assert.equal(ack.ok, true);
  await settle();
  assert.equal(hero.received.whisper.length, 2, 'own whisper + companion reply');
  assert.equal(watcher.received.whisper.length, 0);
  assert.ok(!JSON.stringify(watcher.received.state).includes('lectern'));
});

test('admin endpoints need the admin token', async () => {
  assert.equal(await fetch(`${base}/api/admin/overview`).then((r) => r.status), 401);
  const ok = await fetch(`${base}/api/admin/overview`, { headers: { 'x-admin-token': 'test-admin-token' } }).then((r) => r.json());
  assert.equal(ok.ok, true);
  assert.ok(Array.isArray(ok.leaderboard));
});
