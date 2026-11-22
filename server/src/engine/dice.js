// Skill checks: d20 + class bonus vs a difficulty class.
// Every roll object exposes the face as `value` — the client reads that field.

export const DC = { easy: 8, medium: 12, hard: 16 };

export function resolveCheck(value, bonus, dc) {
  const total = value + bonus;
  if (value === 20) return 'critical_success';
  if (value === 1) return 'critical_fail';
  if (total >= dc) return 'success';
  if (dc - total <= 4) return 'partial';
  return 'fail';
}

export function rollCheck(rng, { bonus = 0, dc }) {
  const value = rng.die(20);
  return { die: 'd20', value, bonus, total: value + bonus, dc, outcome: resolveCheck(value, bonus, dc) };
}

export function isSuccess(outcome) {
  return outcome === 'success' || outcome === 'critical_success';
}

// Breaks vote ties: one face per tied option.
export function rollFateDie(rng, sides) {
  return { die: `d${sides}`, value: rng.die(sides) };
}
