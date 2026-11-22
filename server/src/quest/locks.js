// The runes of the rules. Each check below plays a tiny scene on the server's code and asks whether
// it did what the rulebook says; a clean game passes them all. A check that fails is a broken rune.
//
// - A cleared room's cage (the Healer and the Weaponsmith, rooms 1–4) opens only once its round has
//   no broken runes left.
// - The Throne of Eternity's seal holds while any rune of the rules is broken (sealRunes). The
//   browser keeps its own runes for the 3D world (client/src/quest/runes.js), and the Rune Ledger on
//   the map shows both counts.
//
// They run once per server start, so fix a rune, restart the server, and the locks look again.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { carefulLeaderAction } from './ai.js';
import { ENEMIES, MORVATH, PIP, POWER_UPS, ROOMS, SWORD, XP_PER_TIER } from './data.js';
import { beginFight, cagesOpen, createRun, distance, routeOptions, step } from './engine.js';
import { FEATURE_NAMES, decisionFeatures } from './features.js';
import { loadForest, predictGood } from './forest.js';
import { isWise } from './oracle.js';
import { questRouter } from './routes.js';
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
const atThrone = () => {
  const s = beginFight(fresh(), 'r5', ROOMS.r5.waves.length - 1);
  s.leaderId = kael(s).id;
  return s;
};
const boss = (s) => s.combat.enemies.find((e) => e.ultimate);

// The API, called in-process: a run store in a scratch folder and a request straight to a route.
function withApi(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'quest-lock-'));
  try {
    const runs = new QuestRuns({ profiles: [profile('api')], saveDir: dir });
    const router = questRouter(runs);
    const routeFor = (method, path) => router.stack.find((l) => l.route?.methods[method] && l.match(path))?.route;
    const call = (method, path, body = {}) => {
      const layer = router.stack.find((l) => l.route?.methods[method] && l.match(path));
      const out = { status: 200, body: null };
      const res = { status: (n) => ((out.status = n), res), json: (v) => ((out.body = v), res) };
      layer.route.stack[0].handle({ params: layer.params, body, get: () => undefined }, res);
      return out;
    };
    return fn({ runs, routeFor, call });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const CHECKS = {
  1: [
    () => withApi(({ routeFor }) => routeFor('get', '/teams')?.path === '/teams' && routeFor('get', '/meta')?.path === '/meta'),
    () => cleanAction({ type: 'attack', targetId: 'x' }).type === 'attack' && cleanAction({ type: 'defend' }).type === 'defend',
    () => {
      const s0 = fresh();
      const option = routeOptions(s0).find((o) => o.to === 'r4');
      return step(s0, { type: 'travel', to: 'r4' }).torches === s0.torches - option.cost && option.cost === distance(s0, 'camp', 'r4');
    },
    () => {
      const after = finishFight(beginFight({ ...fresh(), potions: 5 }, 'r1'), 'r1');
      return after.phase === 'map' && after.potions === 5 + ROOMS.r1.loot.potions;
    },
    () => {
      let s = beginFight(fresh(), 'r1');
      for (let i = 0; i < 300 && s.phase === 'combat'; i++) s = step(s, carefulLeaderAction(s));
      return s.phase === 'map' && s.fragments.length === 1 && s.fragments[0] === 'r1';
    },
    () =>
      withApi(({ call }) => {
        const out = call('post', '/lock/act', { action: { type: 'travel', to: 'r1' } });
        return out.body?.ok === true && out.body.state.turn === 1 && out.body.state.phase === 'combat';
      }),
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
      const s = step({ ...fresh(), gold: 100, potions: 1 }, { type: 'trade', item: 'potion' });
      return s.gold === 100 - PIP.potion.gold && s.potions === 2;
    },
    () => [0, 0.1, 0.3, 0.49].every((p) => !isWise(p)) && [0.5, 0.8, 1].every(isWise),
    () => {
      const s = beginFight(fresh(), 'r1');
      kael(s).shield = 999;
      const hp = kael(s).hp;
      const after = step(s, { type: 'defend' });
      return kael(after).shield < 999 && kael(after).hp === hp;
    },
    () => {
      const s0 = atOpenCage();
      kael(s0).sword = { sharpness: 12, durability: 4 };
      const { sword } = kael(step(s0, { type: 'smith' }));
      return sword.sharpness === SWORD.sharpness && sword.durability === SWORD.durability;
    },
    () =>
      withApi(({ call }) => {
        call('post', '/lock/act', { action: { type: 'rest' } });
        const out = call('post', '/lock/rewind', { to: 0 });
        return out.body?.ok === true && out.body.state.turn === 0;
      }),
    () =>
      ['r2', 'r3', 'r4'].every((room) =>
        beginFight({ ...fresh(), stats: { ...fresh().stats, roomsCleared: 3 } }, room).combat.enemies.every((e) => e.def <= Math.ceil(ENEMIES[e.kind].def * 1.3)),
      ),
  ],
  3: [
    // The Oracle's forest reads its trees the way scikit-learn built them (its own check vectors).
    () => {
      const forest = loadForest();
      return !forest || forest.checks.every(({ x, p }) => Math.abs(predictGood(forest, x) - p) < 1e-4);
    },
    () => {
      const s = { ...fresh(), torches: 7, gold: 55, potions: 3 };
      const x = decisionFeatures(s, { type: 'rest' });
      return x.length === FEATURE_NAMES.length && x[FEATURE_NAMES.indexOf('torches')] === s.torches && x[FEATURE_NAMES.indexOf('gold')] === s.gold && x[FEATURE_NAMES.indexOf('potions')] === s.potions;
    },
    () => cleanAction({ type: 'wait', lane: 'left' }).lane === 'left',
  ],
  4: [
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
      const play = () => {
        let s = beginFight(fresh(), 'r4', 1);
        for (let i = 0; i < 30 && s.phase === 'combat'; i++) s = step(s, { type: 'defend' });
        return JSON.stringify(s);
      };
      return play() === play();
    },
    () => {
      const s = beginFight(fresh(), 'r4', 1);
      const king = s.combat.enemies.find((e) => e.kind === 'hollow_king');
      king.hp = Math.floor(king.maxHp * 0.4);
      const ids = step(s, { type: 'defend' }).combat.enemies.map((e) => e.id);
      return ids.length > 1 && new Set(ids).size === ids.length;
    },
  ],
  5: [
    () => {
      const s = atThrone();
      Object.assign(boss(s), { hp: -1 });
      const after = step(s, { type: 'wait' });
      return after.phase === 'victory' && after.combat === null;
    },
    () => {
      let s = atThrone();
      s = step(s, { type: 'rune', targetId: boss(s).id });
      for (let i = 0; i < 6 && s.phase === 'combat'; i++) s = step(s, { type: 'defend' });
      return s.phase !== 'combat' || kael(s).runeCooldown === 0;
    },
    () => {
      const s = atThrone();
      Object.assign(boss(s), { phase: 3, charged: true });
      s.combat.telegraph = { move: 'breath', name: MORVATH.moves.breath.name, targetId: null, damage: MORVATH.moves.breath.damage, all: true };
      kael(s).shield = 0;
      const hp = kael(s).hp;
      return hp - kael(step(s, { type: 'defend' })).hp === Math.ceil(MORVATH.moves.breath.damage / 2);
    },
    () => {
      const s = fresh();
      return s.leaderId === kael(s).id;
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
export const cageRunes = (state) => (cagesOpen(state) && ROOMS[state.location].round <= 4 ? brokenRunes(ROOMS[state.location].round) : 0);
// Every broken rune of the rules: the Throne's seal holds while there is one.
export const sealRunes = () => Object.keys(CHECKS).reduce((n, round) => n + brokenRunes(Number(round)), 0);
export const RUNE_COUNT = Object.values(CHECKS).reduce((n, list) => n + list.length, 0);
