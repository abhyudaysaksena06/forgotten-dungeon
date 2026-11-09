// Turns the change between two server states into timed animation cues for the 3D scene.
// The server's chronicle lines are the source of truth for who did what, in what order.

// Morvath changes his name when he transforms, so his cues address 'the boss' instead of a name.
export const BOSS = '__boss__';
// The cage's keepers and the hero, addressed by role.
export const HEALER = '__healer__';
export const SMITH = '__smith__';
const HERO = '__hero__';
export const KEEPER_IDS = { [HEALER]: 'keeper_healer', [SMITH]: 'keeper_smith' };
const BOSS_MOVES = {
  'Shadow Blade': 'boss_strike',
  'Black Sweep': 'boss_sweep',
  'Dragon Claw': 'boss_strike',
  Shadowflame: 'boss_sweep',
  'Dragon’s Breath': 'boss_sweep',
};

// Lines added since `prev`. The log is capped, so match on the last few old lines.
export function newLogLines(prev, next) {
  if (!prev) return [];
  const a = prev.log;
  const b = next.log;
  if (b.length >= a.length && a.every((line, i) => line === b[i])) return b.slice(a.length);
  const tail = a.slice(-3);
  for (let s = b.length - tail.length; s >= 0; s--) {
    if (tail.every((line, i) => line === b[s + i])) return b.slice(s + tail.length);
  }
  return b.slice(-10);
}

// [pattern, (match) => [{ who, kind, amount? }, …]]. The first matching pattern wins.
const PATTERNS = [
  [/^(.+)'s Rune Strike shatters/, () => [{ who: 1, kind: 'rune' }, { who: BOSS, kind: 'armour_break' }]],
  [/^The Healer lays a hand on (.+):/, () => [{ who: HEALER, kind: 'skill' }, { who: 1, kind: 'heal' }]],
  [/^The Weaponsmith hones and mends/, () => [{ who: SMITH, kind: 'attack' }]],
  [/ is cleared! Heart fragment/, () => [{ who: HERO, kind: 'victory' }]],
  [/^The shadow armour drinks (.+)'s blow/, () => [{ who: 1, kind: 'attack' }, { who: BOSS, kind: 'block' }]],
  [/^Morvath’s armour bursts open/, () => [{ who: BOSS, kind: 'transform' }]],
  [/^Morvath holds his breath/, () => [{ who: BOSS, kind: 'skill' }]],
  [/^(.+)'s drain hits (.+) for (\d+)/, () => [{ who: 1, kind: 'skill' }, { who: 2, kind: 'hit', amount: 3 }]],
  [/^(.+) hits (.+) for (\d+)/, (m) => {
    if (m[1] === 'Poison') return [{ who: 2, kind: 'hit', amount: 3, poison: true }];
    if (BOSS_MOVES[m[1]]) return [{ who: BOSS, kind: BOSS_MOVES[m[1]] }, { who: 2, kind: 'hit', amount: 3 }];
    return [{ who: 1, kind: 'attack' }, { who: 2, kind: 'hit', amount: 3 }];
  }],
  [/^(.+) misses (.+)\.$/, () => [{ who: 1, kind: 'attack' }, { who: 2, kind: 'dodge' }]],
  [/^(.+) looses a volley/, () => [{ who: 1, kind: 'skill' }]],
  [/^(.+) raises a Bulwark/, () => [{ who: 1, kind: 'skill' }]],
  [/^(.+) raises a guard/, () => [{ who: 1, kind: 'defend' }]],
  [/^(.+) mends (.+)\.$/, () => [{ who: 1, kind: 'skill' }, { who: 2, kind: 'heal' }]],
  [/^(.+) pulls (.+) back from the dark/, () => [{ who: 1, kind: 'skill' }, { who: 2, kind: 'heal' }]],
  [/^(.+) gives (.+) a potion/, () => [{ who: 2, kind: 'heal' }]],
  [/^(.+) drinks a potion/, () => [{ who: 1, kind: 'heal' }]],
  [/^(.+) (cleaves through the line|slams the ground|summons a shadow tide)/, () => [{ who: 1, kind: 'skill' }]],
  [/^(.+) charges down the /, () => [{ who: 1, kind: 'charge' }]],
  [/^(.+) drives its blade into the floor/, () => [{ who: 1, kind: 'slam' }]],
  [/^(.+) roars as hellfire splits its armour/, () => [{ who: 1, kind: 'transform' }]],
  [/^(.+) floods the .+ with a shadow tide/, () => [{ who: 1, kind: 'skill' }]],
  [/^(.+) roars, and the barracks answer/, () => [{ who: 1, kind: 'transform' }]],
  [/^(.+) lowers his axe and laughs/, () => [{ who: 1, kind: 'defend' }]],
  [/^(.+) has Fallen\.$/, () => [{ who: 1, kind: 'death' }]],
  [/^(.+) falls\.$/, () => [{ who: 1, kind: 'death' }]],
];

export function parseLine(line) {
  for (const [re, make] of PATTERNS) {
    const m = line.match(re);
    if (!m) continue;
    return make(m).map((c) => ({
      ...c,
      who: typeof c.who === 'number' ? m[c.who] : c.who,
      amount: typeof c.amount === 'number' ? Number(m[c.amount]) : undefined,
    }));
  }
  return [];
}

// Everyone the scene can animate, by display name.
export function nameIndex(...states) {
  const ids = new Map(Object.entries(KEEPER_IDS));
  for (const s of states) {
    if (!s) continue;
    for (const m of s.party) {
      ids.set(m.name, m.id);
      if (m.controlled) ids.set(HERO, m.id);
    }
    for (const e of s.combat?.enemies ?? []) {
      ids.set(e.name, e.id);
      if (e.ultimate) ids.set(BOSS, e.id);
    }
  }
  return ids;
}

/**
 * Cues for the 3D scene: { id, kind, at, amount }. `at` is a performance.now() timestamp, so a
 * round plays as a short sequence instead of everything at once.
 */
export function cuesFor(prev, next, now = 0, { step = 300, maxSpan = 3600 } = {}) {
  const ids = nameIndex(prev, next);
  const parsed = newLogLines(prev, next).map(parseLine).filter((cs) => cs.length);
  const gap = parsed.length > 1 ? Math.min(step, maxSpan / parsed.length) : step;
  const cues = [];
  let slot = 0;
  let lastActor = null;
  for (const lineCues of parsed) {
    const actor = lineCues[0].who;
    // Multi-target moves (volley, cleave, Grave Wail) land together.
    if (actor !== lastActor || lineCues[0].kind === 'death') slot++;
    lastActor = actor;
    for (const c of lineCues) {
      const id = ids.get(c.who);
      if (!id) continue;
      const delay = c.kind === 'hit' || c.kind === 'dodge' || c.kind === 'heal' ? 160 : 0;
      cues.push({ id, kind: c.kind, amount: c.amount, poison: c.poison, at: now + (slot - 1) * gap + delay });
    }
  }
  return cues;
}
