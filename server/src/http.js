import express from 'express';
import { timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CLIENT_CALLS } from './admin/calls.js';
import { CURSES } from './admin/curses.js';
import { runJudge } from './admin/judge.js';
import { CLASSES, SKILLS } from './engine/classes.js';
import { BOSS_ATTACKS, TOTAL_SHARDS } from './engine/combat.js';
import { DC } from './engine/dice.js';
import { STAGES } from './engine/dungeon.js';
import { GameError } from './engine/errors.js';
import { INVENTORY_SLOTS, ITEMS } from './engine/items.js';

const serverDir = fileURLToPath(new URL('..', import.meta.url));
const clientDir = fileURLToPath(new URL('../../client', import.meta.url));
const clientDist = fileURLToPath(new URL('../../client/dist', import.meta.url));

export function errorReply(err) {
  if (err instanceof GameError) return { ok: false, error: { code: err.code, message: err.message } };
  console.error(err);
  return { ok: false, error: { code: 'server_error', message: 'The dungeon shuddered. Try again.' } };
}

function sameSecret(a, b) {
  const x = Buffer.from(String(a ?? ''));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

export function createApp({ manager, control, config, quest, stats = () => ({}) }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '16kb' }));

  const wrap = (fn) => async (req, res) => {
    try {
      res.json({ ok: true, ...(await fn(req, res)) });
    } catch (err) {
      const reply = errorReply(err);
      res.status(err instanceof GameError ? 400 : 500).json(reply);
    }
  };

  if (quest) app.use('/api/quest', quest);

  app.get('/api/health', (req, res) => res.json({ ok: true, uptime: process.uptime(), rooms: manager.rooms.size, dm: manager.dm.mode }));

  app.get('/api/meta', (req, res) =>
    res.json({ classes: CLASSES, items: ITEMS, skills: SKILLS, dc: DC, stages: STAGES, bossAttacks: BOSS_ATTACKS, totalShards: TOTAL_SHARDS, inventorySlots: INVENTORY_SLOTS }),
  );

  app.post('/api/rooms', wrap((req) => manager.createRoom(req.body?.name)));
  app.post('/api/rooms/join', wrap((req) => manager.joinRoom(req.body?.code, req.body?.name, req.body?.token)));
  app.get('/api/event', (req, res) => res.json(control.publicInfo()));

  // ---- organiser dashboard ----
  const admin = express.Router();
  admin.use((req, res, next) => {
    if (sameSecret(req.get('x-admin-token'), config.adminToken)) return next();
    res.status(401).json({ ok: false, error: { code: 'unauthorized', message: 'Admin token required.' } });
  });
  admin.get(
    '/overview',
    wrap(() => {
      const rooms = manager.overview();
      return {
        rooms,
        leaderboard: [...rooms].sort((a, b) => b.score.total - a.score.total || a.retries - b.retries),
        event: control.publicInfo(),
        curses: CURSES,
        calls: CLIENT_CALLS,
        health: { uptime: process.uptime(), memoryMb: Math.round(process.memoryUsage().rss / 1e6), dm: manager.dm.mode, ...stats() },
      };
    }),
  );
  admin.post('/timer/start', wrap(() => (control.startTimer(), { event: control.publicInfo() })));
  admin.post('/calls/:id/release', wrap((req) => ({ released: control.releaseCall(req.params.id) })));
  // Results from scripts/judge.mjs run against this build: lifts Curses and shows the banners.
  admin.post('/judge-results', wrap((req) => ({ lifted: control.recordJudgeRun({ results: req.body?.results ?? {} }) })));
  admin.post(
    '/judge',
    wrap(async () => {
      const run = await runJudge([serverDir, clientDir]);
      const { outputs, ...summary } = run;
      return { ...summary, lifted: control.recordJudgeRun(run) };
    }),
  );
  app.use('/api/admin', admin);

  // Production: serve the built client from the same origin.
  if (existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get(/^(?!\/api|\/socket\.io).*/, (req, res) => res.sendFile('index.html', { root: clientDist }));
  }
  return app;
}
