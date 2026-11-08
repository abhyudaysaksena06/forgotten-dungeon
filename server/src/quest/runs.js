// One run per team, autosaved after every action. A save holds only the team id, the profile hash
// and the list of inputs; resuming replays them through the current engine. After a participant
// fixes a bug and restarts, the same inputs rebuild the run under the fixed rules.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { QuestError, publicState, step } from './engine.js';
import { cageRunes } from './locks.js';
import { replay } from './replay.js';
import { codeMatches, profileHash } from './teams.js';

export const ACTION_FIELDS = ['type', 'to', 'memberId', 'targetId', 'item', 'lane'];

// What each button / key sends. The 3D client and the keyboard shortcuts use these names.
export const INPUT_TYPES = {
  attack: 'attack',
  defend: 'defend',
  skill: 'skill',
  rune: 'rune',
  potion: 'potion',
  meal: 'meal',
  retreat: 'retreat',
  wait: 'wait',
  travel: 'travel',
  rest: 'rest',
  altar: 'altar',
  forge: 'forge',
  trade: 'trade',
  healer: 'healer',
  smith: 'smith',
};

// Inputs only: a short type plus ids. Anything else (hp, damage, …) is dropped.
export function cleanAction(raw) {
  const out = {};
  for (const key of ACTION_FIELDS) {
    const v = raw?.[key];
    if (typeof v === 'string' && v.length <= 40) out[key] = v;
  }
  if (out.type !== undefined) out.type = INPUT_TYPES[out.type] ?? out.type;
  return out;
}

export class QuestRuns {
  constructor({ profiles, saveDir }) {
    this.profiles = new Map(profiles.map((p) => [p.teamId, p]));
    this.saveDir = saveDir;
    this.runs = new Map(); // teamId -> { state, actions, note }
    mkdirSync(saveDir, { recursive: true });
  }

  profile(teamId) {
    const p = this.profiles.get(teamId);
    if (!p) throw new QuestError('no_team', `No team called ${teamId}.`);
    return p;
  }

  checkCode(teamId, code) {
    const p = this.profile(teamId);
    if (p.accessCode && !codeMatches(p.accessCode, code)) throw new QuestError('bad_code', 'Wrong team code.');
    return p;
  }

  savePath(teamId) {
    return join(this.saveDir, `${teamId}.json`);
  }

  // Loads (or starts) a team's run. A save is replayed; the first input the current rules
  // reject, and everything after it, is dropped, and the player is told.
  run(teamId) {
    if (this.runs.has(teamId)) return this.runs.get(teamId);
    const profile = this.profile(teamId);
    let actions = [];
    let note = null;
    const path = this.savePath(teamId);
    if (existsSync(path)) {
      const save = JSON.parse(readFileSync(path, 'utf8'));
      actions = Array.isArray(save.actions) ? save.actions.map(cleanAction) : [];
    }
    const result = replay(profile, actions);
    if (result.invalidAt !== null) {
      note = `Resumed at turn ${result.applied}: ${actions.length - result.applied} saved action(s) no longer fit the rules (${result.error}).`;
      actions = actions.slice(0, result.applied);
    }
    const run = { state: result.state, actions, note };
    this.runs.set(teamId, run);
    this.persist(teamId);
    return run;
  }

  act(teamId, raw) {
    const run = this.run(teamId);
    const action = cleanAction(raw);
    if (action.type === 'healer' || action.type === 'smith') {
      const n = cageRunes(run.state);
      if (n > 0) throw new QuestError('cage_locked', `The cage stays shut: ${n} broken rune${n > 1 ? 's' : ''} left in this round’s code.`);
    }
    run.state = step(run.state, action);
    run.actions.push(action);
    run.note = null;
    this.persist(teamId);
    return run;
  }

  persist(teamId) {
    const run = this.runs.get(teamId);
    const path = this.savePath(teamId);
    const body = JSON.stringify(
      { teamId, profileHash: profileHash(this.profile(teamId)), actions: run.actions, turn: run.state.turn, phase: run.state.phase, savedAt: new Date().toISOString() },
      null,
      1,
    );
    writeFileSync(`${path}.tmp`, body);
    renameSync(`${path}.tmp`, path);
  }

  // Starts over (the old save is kept as an archive so organisers can see every attempt).
  reset(teamId) {
    const path = this.savePath(teamId);
    if (existsSync(path)) {
      mkdirSync(join(this.saveDir, 'archive'), { recursive: true });
      renameSync(path, join(this.saveDir, 'archive', `${teamId}-${Date.now()}.json`));
    }
    this.runs.delete(teamId);
    return this.run(teamId);
  }

  view(teamId) {
    const run = this.run(teamId);
    const p = this.profile(teamId);
    return { team: { id: p.teamId, name: p.teamName, tier: p.tier }, note: run.note, state: { ...publicState(run.state), cageRunes: cageRunes(run.state) } };
  }

  saveFile(teamId) {
    this.run(teamId);
    return JSON.parse(readFileSync(this.savePath(teamId), 'utf8'));
  }
}
