// Pure display helpers (no React) so they can be tested with node --test.

// HP bar fill: current / max as a 0–100 percentage.
export function hpPercent(hp, maxHp) {
  if (!maxHp || maxHp <= 0) return 0;
  return Math.round(Math.min(1, Math.max(0, hp / maxHp)) * 100);
}

export function hpTone(hp, maxHp) {
  const pct = hpPercent(hp, maxHp);
  if (pct === 0) return 'fallen';
  if (pct <= 33) return 'low';
  if (pct <= 66) return 'mid';
  return 'high';
}

// Rolls from the server look like { die: 'd20', value: 14, bonus?, total?, dc?, outcome? }.
export function formatRoll(roll) {
  if (!roll || typeof roll.value !== 'number') return '—';
  if (typeof roll.bonus === 'number' && roll.bonus !== 0) return `${roll.value} + ${roll.bonus} = ${roll.total}`;
  return String(roll.value);
}

export const OUTCOME_LABELS = {
  critical_success: 'Critical success',
  success: 'Success',
  partial: 'Partial — costs 5 HP',
  fail: 'Fail',
  critical_fail: 'Critical fail',
  miss: 'Miss',
  hit: 'Hit',
  critical: 'Critical hit',
};

export function outcomeLabel(outcome) {
  return OUTCOME_LABELS[outcome] ?? '';
}

// Which band each d20 face falls in, for the roll ruler.
export function rollBands(roll) {
  return Array.from({ length: 20 }, (_, i) => {
    const face = i + 1;
    if (roll?.dc != null) {
      if (face === 20) return 'crit';
      if (face === 1) return 'fumble';
      const total = face + (roll.bonus ?? 0);
      if (total >= roll.dc) return 'success';
      if (roll.dc - total <= 4) return 'partial';
      return 'fail';
    }
    if (face <= 4) return 'fail';
    if (face === 20) return 'crit';
    return 'success';
  });
}

export function secondsLeft(endsAt, now) {
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}

export function formatClock(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
