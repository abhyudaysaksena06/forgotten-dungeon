// The Quest API for the hosted (Vercel) build. Same game, same engine, same answers as
// server/src/quest/routes.js, but stateless: a serverless function keeps nothing between requests,
// so the browser holds the run's list of inputs and sends it with every call. The run is rebuilt
// from those inputs on the real engine each time (a run is only its inputs; see replay.js), so the
// rules and numbers still live on the server.
//
// vercel.json rewrites /api/quest/<path> to this function as ?path=<path>.
import { CAMP, CLASSES, EDGES, ENEMIES, FINAL_GROWTH, FRAGMENTS_FOR_THRONE, MORVATH, NPCS, PARTY_ORDER, PIP, POWER_UPS, ROOMS, RUNE_STRIKE } from '../server/src/quest/data.js';
import { QuestError, publicState, step } from '../server/src/quest/engine.js';
import { loadProfiles } from '../server/src/quest/profiles.js';
import { replay } from '../server/src/quest/replay.js';
import { cleanAction } from '../server/src/quest/runs.js';
import { profileHash } from '../server/src/quest/teams.js';

const MAX_ACTIONS = 5000; // far more than a full run; bounds the replay work per request
const profiles = new Map(loadProfiles(process.env.QUEST_TEAMS).map((p) => [p.teamId, p]));

const META = { classes: CLASSES, partyOrder: PARTY_ORDER, rooms: ROOMS, edges: EDGES, camp: CAMP, enemies: ENEMIES, npcs: NPCS, morvath: MORVATH, runeStrike: RUNE_STRIKE, powerUps: POWER_UPS, pip: PIP, fragmentsForThrone: FRAGMENTS_FOR_THRONE, finalGrowth: FINAL_GROWTH };

function teamFor(teamId, code) {
  const p = profiles.get(teamId);
  if (!p) throw new QuestError('no_team', `No team called ${teamId}.`);
  if (p.accessCode && p.accessCode !== code) throw new QuestError('bad_code', 'Wrong team code.');
  return p;
}

// The run the browser says it has: its inputs replayed on the engine. Inputs the rules reject (and
// everything after them) are dropped, exactly like resuming a save on the local server.
function rebuild(profile, raw) {
  let actions = Array.isArray(raw) ? raw.slice(0, MAX_ACTIONS).map(cleanAction) : [];
  const result = replay(profile, actions);
  let note = null;
  if (result.invalidAt !== null) {
    note = `Resumed at turn ${result.applied}: ${actions.length - result.applied} saved action(s) no longer fit the rules (${result.error}).`;
    actions = actions.slice(0, result.applied);
  }
  return { state: result.state, actions, note };
}

const view = (p, run) => ({ team: { id: p.teamId, name: p.teamName, tier: p.tier }, note: run.note, state: publicState(run.state), actions: run.actions });

function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try {
    return JSON.parse(req.body || '{}');
  } catch {
    return {};
  }
}

function handle(req) {
  const parts = String(req.query?.path ?? '').split('/').filter(Boolean).map(decodeURIComponent);
  if (req.method === 'GET' && parts[0] === 'meta' && parts.length === 1) return META;
  if (req.method === 'GET' && parts[0] === 'teams' && parts.length === 1) {
    return { teams: [...profiles.values()].map((p) => ({ id: p.teamId, name: p.teamName, needsCode: Boolean(p.accessCode) })) };
  }
  const [teamId, verb] = parts;
  if (parts.length !== 2 || req.method !== 'POST') throw new QuestError('not_found', 'No such Quest request.');
  const body = readBody(req);
  const profile = teamFor(teamId, req.headers['x-team-code'] ?? body.code);
  if (verb === 'reset') return view(profile, rebuild(profile, []));
  const run = rebuild(profile, body.actions);
  if (verb === 'session') return view(profile, run);
  if (verb === 'act') {
    const action = cleanAction(body.action);
    run.state = step(run.state, action);
    run.actions.push(action);
    run.note = null;
    return view(profile, run);
  }
  if (verb === 'save') {
    const save = { teamId, profileHash: profileHash(profile), actions: run.actions, turn: run.state.turn, phase: run.state.phase, savedAt: new Date().toISOString() };
    return { save, actions: run.actions };
  }
  throw new QuestError('not_found', 'No such Quest request.');
}

export default function questHandler(req, res) {
  res.setHeader('cache-control', 'no-store');
  try {
    const out = handle(req);
    res.status(200).json(out === META || out.teams ? out : { ok: true, ...out });
  } catch (err) {
    const known = err instanceof QuestError;
    if (!known) console.error(err);
    res.status(known ? (err.code === 'not_found' ? 404 : 400) : 500).json({
      ok: false,
      error: known ? { code: err.code, message: err.message } : { code: 'server_error', message: 'The dungeon shuddered. Try again.' },
    });
  }
}
