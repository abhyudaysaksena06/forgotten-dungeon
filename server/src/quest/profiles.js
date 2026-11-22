// Loads team profiles for the server. Accepts one profile, a list, or the organiser registry
// ({ teams: [...] }). With no file, a demo team is used so the game runs out of the box.
import { existsSync, readFileSync } from 'node:fs';
import { makeProfile } from './teams.js';

export function loadProfiles(path) {
  if (!path || !existsSync(path)) return [makeProfile({ teamId: 'demo', teamName: 'Demo Party', seed: 'demo', tier: 'average' })];
  const data = JSON.parse(readFileSync(path, 'utf8'));
  const list = Array.isArray(data) ? data : Array.isArray(data.teams) ? data.teams.map((t) => t.profile ?? t) : [data];
  if (!list.length) throw new Error(`${path} has no team profiles`);
  return list;
}
