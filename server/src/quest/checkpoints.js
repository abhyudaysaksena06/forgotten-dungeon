// Where each round began in a run's list of inputs: the first time Kael travelled into its room.
// Rewinding a run to one of these replays it up to just before that journey, so the round (and
// everything after it) can be played again. A run is only its inputs, so this costs nothing to keep.
import { ROOMS } from './data.js';

export function checkpoints(actions) {
  const seen = new Map();
  actions.forEach((a, i) => {
    if (a?.type === 'travel' && ROOMS[a.to] && !seen.has(a.to)) seen.set(a.to, i);
  });
  return [...seen].map(([room, at]) => ({ room, round: ROOMS[room].round, name: ROOMS[room].name, at })).sort((a, b) => a.round - b.round);
}
