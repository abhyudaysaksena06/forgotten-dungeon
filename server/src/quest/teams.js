// Team profiles: each team starts with different stats, torches, gold and potions, derived from a
// seed. The organiser's registry is the source of truth; a participant's copy is never trusted.
import { createHash } from 'node:crypto';
import { createRng, hashSeed } from '../engine/rng.js';
import { CLASSES, PARTY_ORDER } from './data.js';

export const TIERS = {
  weak: { mult: 0.92, torches: 13, gold: 20, potions: 2 },
  average: { mult: 1.0, torches: 14, gold: 40, potions: 2 },
  strong: { mult: 1.1, torches: 16, gold: 60, potions: 3 },
};

export function makeProfile({ teamId, teamName = teamId, seed, tier = 'average', salt = '' }) {
  const t = TIERS[tier];
  if (!t) throw new Error(`Unknown tier ${tier}`);
  const rng = createRng({ rngState: hashSeed(`profile:${seed}`) });
  const jitter = () => 1 + (rng.next() * 0.24 - 0.12);
  const party = Object.fromEntries(
    PARTY_ORDER.map((cls) => {
      const c = CLASSES[cls];
      return [cls, { hp: Math.round(c.hp * t.mult * jitter()), atk: Math.max(1, Math.round(c.atk * t.mult * jitter())), def: Math.max(0, Math.round(c.def * t.mult * jitter())) }];
    }),
  );
  return {
    teamId,
    teamName,
    seed: String(seed),
    salt: String(salt),
    tier,
    torches: t.torches + rng.die(3) - 2,
    gold: t.gold,
    potions: t.potions,
    party,
  };
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}

export function profileHash(profile) {
  return createHash('sha256').update(stable(profile)).digest('hex');
}
