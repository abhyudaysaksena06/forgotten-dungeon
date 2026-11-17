// Seraphine the Oracle: after each judged choice (a route, a rest, a potion, a skipped heal...) she
// says whether it was wise, by the same random forest the judge uses. She speaks after the choice,
// never before it, so she teaches rather than plays for you.
import { loadForest, predictGood } from './forest.js';

let forest;
const model = () => (forest === undefined ? (forest = loadForest()) : forest);

const WHAT = {
  rest: 'Resting by the fire',
  altar: 'The Rune Altar',
  forge: 'The forge',
  move: 'That journey',
  potion: 'That potion',
  meal: 'That meal',
  healer: 'Calling on the Healer',
  smith: 'Calling on the Weaponsmith',
  skip: 'Fighting on without healing',
};

// The verdict on the choice made by the last step, or null if it made none (or there's no model).
export function counsel(state) {
  const f = model();
  const d = state.decisions?.at(-1);
  if (!f || !d || d.turn !== state.turn - 1) return null;
  const p = predictGood(f, d.features);
  const wise = p >= 0.5;
  const what = WHAT[d.choice] ?? (d.choice.startsWith('room') ? 'Entering that room now' : 'That choice');
  return { choice: d.choice, p: Math.round(p * 100) / 100, wise, line: `${what} was ${wise ? 'wise' : 'unwise'}.` };
}
