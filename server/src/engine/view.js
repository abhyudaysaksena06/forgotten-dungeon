// What clients are allowed to see. Tokens never live on the state, and hidden DCs stay hidden
// until a Rogue scouts.
import { CLASSES } from './classes.js';
import { DC } from './dice.js';
import { BOSS_ATTACKS, TOTAL_SHARDS } from './combat.js';
import { SCENES, STAGES } from './dungeon.js';
import { playerAtk } from './party.js';

export const PUBLIC_LOG_SIZE = 80;

export function publicView(state, now) {
  const scene = SCENES[state.sceneIndex] ?? null;
  const next = SCENES[state.sceneIndex + 1] ?? null;
  const reveal = state.scouted;

  return {
    code: state.code,
    phase: state.phase,
    hostId: state.hostId,
    stage: state.stage,
    stageName: STAGES[state.stage]?.name ?? null,
    scene: scene && { id: scene.id, title: scene.title, type: scene.type, intro: scene.intro },
    nextRoom: reveal && next ? next.title : null,
    scouted: reveal,
    players: state.order.map((id) => {
      const p = state.players[id];
      return {
        id: p.id,
        name: p.name,
        npc: p.npc,
        cls: p.cls,
        ready: p.ready,
        hp: p.hp,
        maxHp: p.maxHp,
        atk: playerAtk(p),
        def: p.def,
        poison: p.poison,
        stun: p.stun,
        fallen: p.fallen,
        defending: p.defending,
        cooldown: p.cooldown,
        connected: p.connected,
        ability: p.cls ? CLASSES[p.cls].ability.id : null,
        inventory: p.inventory.map((s) => ({ uid: s.uid, item: s.item })),
      };
    }),
    enemies: state.enemies.map((e) => ({ id: e.id, kind: e.kind, name: e.name, hp: e.hp, maxHp: e.maxHp, def: e.def, stun: e.stun, boss: e.boss })),
    // #region C1 boss-view
    boss: state.boss && {
      id: state.boss.id,
      summoned: state.boss.summoned,
      enraged: state.boss.enraged,
      shardBonusReady: state.shards.length >= TOTAL_SHARDS && !state.boss.shardBonusUsed,
      telegraph: state.boss.telegraph && {
        ...state.boss.telegraph,
        name: BOSS_ATTACKS[state.boss.telegraph.attack].name,
        damage: BOSS_ATTACKS[state.boss.telegraph.attack].damage,
        all: BOSS_ATTACKS[state.boss.telegraph.attack].all,
        poison: BOSS_ATTACKS[state.boss.telegraph.attack].poison,
      },
    },
    // #endregion C1
    shards: { found: state.shards.length, total: TOTAL_SHARDS },
    vote: state.vote && scene?.options && {
      id: state.vote.id,
      options: state.vote.options.map((id) => {
        const o = scene.options.find((x) => x.id === id);
        return {
          id: o.id,
          label: o.label,
          skill: o.skill ?? null,
          requires: o.requires ?? null,
          noCheck: Boolean(o.noCheck),
          difficulty: reveal ? o.difficulty ?? null : null,
          dc: reveal && o.difficulty ? DC[o.difficulty] : null,
        };
      }),
      votes: state.vote.votes,
      endsAt: state.vote.endsAt,
      closed: state.vote.closed,
      result: state.vote.result,
    },
    combat: state.combat && {
      round: state.combat.round,
      submitted: Object.keys(state.combat.actions),
      endsAt: state.combat.endsAt,
      closed: state.combat.closed,
    },
    lastRolls: state.lastRolls,
    narration: state.narration,
    log: state.log.slice(-PUBLIC_LOG_SIZE),
    stats: state.stats,
    score: state.score,
    serverNow: now,
  };
}
