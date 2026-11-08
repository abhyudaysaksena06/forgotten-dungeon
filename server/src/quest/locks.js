// The cage's locks. A cleared room's cage (the Healer and the Weaponsmith) opens only once its round
// has no broken runes left: every check below for that round must hold. Each check plays a tiny
// scene on the engine and asks whether the rules did what the rulebook says; a clean game passes
// them all. They run once per server start, so fix a rune, restart the server, and the lock looks
// again. Rooms 1–4 have cages; the Throne (round 5) has none.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { carefulLeaderAction } from './ai.js';
import { ENEMIES, PIP, POWER_UPS, ROOMS, SWORD, XP_PER_TIER } from './data.js';
import { beginFight, cagesOpen, createRun, distance, routeOptions, step } from './engine.js';
import { QuestRuns, cleanAction } from './runs.js';
import { makeProfile } from './teams.js';

const profile = (seed = 'lock') => makeProfile({ teamId: 'lock', seed, tier: 'strong' });
const fresh = () => createRun(profile());
const kael = (s) => s.party[0];
const atOpenCage = () => ({ ...fresh(), fragments: ['r1'], location: 'r1' });
const finishFight = (s, room) => {
  s.combat.waveIndex = ROOMS[room].waves.length - 1;
  s.combat.enemies = [{ ...s.combat.enemies[0], hp: -1 }]; // already beaten: the next round ends it
  return step(s, { type: 'wait' });
};

const CHECKS = {
  1: [
    () => {
      const s = fresh();
      return s.leaderId === kael(s).id;
    },
    () => cleanAction({ type: 'attack', targetId: 'x' }).type === 'attack' && cleanAction({ type: 'defend' }).type === 'defend',
    () => {
      const s0 = fresh();
      const option = routeOptions(s0).find((o) => o.to === 'r4');
      return step(s0, { type: 'travel', to: 'r4' }).torches === s0.torches - option.cost && option.cost === distance(s0, 'camp', 'r4');
    },
    () => {
      const s = { ...fresh(), fragments: ['r4'] };
      return distance(s, 'camp', 'r4') === 1 && distance(s, 'r4', 'camp') === 1;
    },
  ],
  2: [
    () => {
      const s0 = { ...fresh(), gold: 100 };
      const s = step(s0, { type: 'altar', memberId: 'knight' });
      return kael(s).atk === kael(s0).atk + 3 && kael(s).def === kael(s0).def + 3 && s.gold === 100 - POWER_UPS.altar.gold;
    },
    () => {
      const s0 = fresh();
      kael(s0).hp = 20;
      const s = step(s0, { type: 'rest' });
      return kael(s).hp === kael(s).maxHp;
    },
    () => {
      const after = finishFight(beginFight({ ...fresh(), potions: 5 }, 'r1'), 'r1');
      return after.phase === 'map' && after.potions === 5 + ROOMS.r1.loot.potions;
    },
    () => {
      const s = step({ ...fresh(), gold: 100, potions: 1 }, { type: 'trade', item: 'potion' });
      return s.gold === 100 - PIP.potion.gold && s.potions === 2;
    },
  ],
  3: [
    () => {
      const s0 = atOpenCage();
      Object.assign(kael(s0), { hp: 40, shield: 5 });
      const s = step(s0, { type: 'healer' });
      return kael(s).hp === kael(s).maxHp && kael(s).shield === kael(s).maxShield;
    },
    () => {
      const s = beginFight(fresh(), 'r1');
      kael(s).shield = 999;
      const hp = kael(s).hp;
      const after = step(s, { type: 'defend' });
      return kael(after).shield < 999 && kael(after).hp === hp;
    },
    () => {
      const s0 = fresh();
      kael(s0).hp = 30;
      const s = step(s0, { type: 'potion', targetId: 'knight' });
      return kael(s).hp === Math.min(kael(s).maxHp, 70);
    },
  ],
  4: [
    () =>
      ['r2', 'r3', 'r4'].every((room) =>
        beginFight({ ...fresh(), stats: { ...fresh().stats, roomsCleared: 3 } }, room).combat.enemies.every((e) => e.def <= Math.ceil(ENEMIES[e.kind].def * 1.3)),
      ),
    () => {
      const dir = mkdtempSync(join(tmpdir(), 'quest-lock-'));
      try {
        const p = profile('long-run');
        const a = new QuestRuns({ profiles: [p], saveDir: dir });
        for (let i = 0; i < 70; i++) {
          const s = a.run('lock').state;
          if (s.phase !== 'map' && s.phase !== 'combat') break;
          const opt = routeOptions(s).find((o) => o.fight) ?? routeOptions(s).find((o) => o.type === 'rest') ?? routeOptions(s)[0];
          a.act('lock', s.phase === 'combat' ? { type: 'wait' } : { type: opt.type, to: opt.to, memberId: opt.memberId });
        }
        const b = new QuestRuns({ profiles: [p], saveDir: dir });
        return a.run('lock').state.turn > 40 && JSON.stringify(b.run('lock').state) === JSON.stringify(a.run('lock').state);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
    () => {
      let s = beginFight(fresh(), 'r1');
      for (let i = 0; i < 300 && s.phase === 'combat'; i++) s = step(s, carefulLeaderAction(s));
      return s.phase === 'map' && s.fragments.length === 1 && s.fragments[0] === 'r1';
    },
    () => {
      const s0 = atOpenCage();
      kael(s0).sword = { sharpness: 12, durability: 4 };
      const { sword } = kael(step(s0, { type: 'smith' }));
      return sword.sharpness === SWORD.sharpness && sword.durability === SWORD.durability;
    },
    () => {
      const after = finishFight(beginFight(fresh(), 'r3'), 'r3');
      const earned = (m) => ((m.level - 1) * m.level * 100) / 2 + m.xp;
      return after.phase === 'map' && after.party.every((m) => earned(m) === XP_PER_TIER * ROOMS.r3.tier);
    },
  ],
};

const cache = new Map();
let checking = false;

// How many of a round's checks fail: its broken runes. A check that throws counts as broken.
export function brokenRunes(round) {
  if (!CHECKS[round] || checking) return 0;
  if (!cache.has(round)) {
    checking = true; // a check that plays a run must not ask the lock again
    try {
      cache.set(
        round,
        CHECKS[round].filter((check) => {
          try {
            return !check();
          } catch {
            return true;
          }
        }).length,
      );
    } finally {
      checking = false;
    }
  }
  return cache.get(round);
}

// The broken runes still holding the cage shut in the cleared room Kael stands in (0 = open, or no cage).
export const cageRunes = (state) => (cagesOpen(state) ? brokenRunes(ROOMS[state.location].round) : 0);
