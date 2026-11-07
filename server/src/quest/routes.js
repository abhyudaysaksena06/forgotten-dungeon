// HTTP API for the Quest. Single-player, so plain request/response is enough: every action
// returns the new state, and the 3D client animates from the log of what changed.
import express from 'express';
import { FINAL_GROWTH, CAMP, CLASSES, EDGES, ENEMIES, FRAGMENTS_FOR_THRONE, MORVATH, NPCS, PARTY_ORDER, PIP, POWER_UPS, ROOMS, RUNE_STRIKE } from './data.js';
import { QuestError } from './engine.js';

export function questRouter(runs) {
  const r = express.Router();
  const wrap = (fn) => (req, res) => {
    try {
      res.json({ ok: true, ...fn(req) });
    } catch (err) {
      if (!(err instanceof QuestError)) console.error(err);
      res.status(err instanceof QuestError ? 400 : 500).json({
        ok: false,
        error: err instanceof QuestError ? { code: err.code, message: err.message } : { code: 'server_error', message: 'The dungeon shuddered. Try again.' },
      });
    }
  };
  const team = (req) => runs.checkCode(req.params.teamId, req.get('x-team-code') ?? req.body?.code).teamId;

  r.get('/meta', (req, res) =>
    res.json({ classes: CLASSES, partyOrder: PARTY_ORDER, rooms: ROOMS, edges: EDGES, camp: CAMP, enemies: ENEMIES, npcs: NPCS, morvath: MORVATH, runeStrike: RUNE_STRIKE, powerUps: POWER_UPS, pip: PIP, fragmentsForThrone: FRAGMENTS_FOR_THRONE, finalGrowth: FINAL_GROWTH }),
  );
  r.get('/teams', (req, res) => res.json({ teams: [...runs.profiles.values()].map((p) => ({ id: p.teamId, name: p.teamName, needsCode: Boolean(p.accessCode) })) }));
  r.post('/:teamId/session', wrap((req) => runs.view(team(req))));
  r.get('/:teamId', wrap((req) => runs.view(team(req))));
  r.post('/:teamId/act', wrap((req) => {
    const id = team(req);
    runs.act(id, req.body?.action);
    return runs.view(id);
  }));
  r.post('/:teamId/reset', wrap((req) => {
    const id = team(req);
    runs.reset(id);
    return runs.view(id);
  }));
  // The file a team submits for judging.
  r.get('/:teamId/save', wrap((req) => ({ save: runs.saveFile(team(req)) })));
  return r;
}
