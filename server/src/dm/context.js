// Builds what the Dungeon Master is told. It always carries the live party state (HP, items,
// shards), and it is built only from the game state — chat and whispers never reach it.
import { CLASSES } from '../engine/classes.js';
import { BOSS_ATTACKS, TOTAL_SHARDS } from '../engine/combat.js';
import { SCENES, STAGES } from '../engine/dungeon.js';
import { ITEMS } from '../engine/items.js';

const DM_EVENT_TYPES = new Set([
  'stage', 'vote', 'check', 'partial', 'trap', 'damage', 'shard', 'loot', 'item', 'ability', 'attack', 'enemy_attack',
  'enemy_down', 'fallen', 'status', 'telegraph', 'boss_phase', 'combat_won', 'stage_clear', 'victory', 'defeat', 'fate',
]);

export function buildDmContext(state, trigger) {
  const scene = SCENES[state.sceneIndex];
  return {
    trigger,
    stage: state.stage ? { number: state.stage, name: STAGES[state.stage].name } : null,
    scene: scene ? { id: scene.id, title: scene.title, type: scene.type, intro: scene.intro } : null,
    options: state.vote && !state.vote.closed && scene?.options
      ? state.vote.options.map((id) => scene.options.find((o) => o.id === id).label)
      : [],
    party: state.order.map((id) => {
      const p = state.players[id];
      return {
        name: p.name,
        companion: p.npc,
        class: CLASSES[p.cls]?.name ?? null,
        hp: p.hp,
        maxHp: p.maxHp,
        fallen: p.fallen,
        poisoned: p.poison > 0,
        stunned: p.stun > 0,
        items: p.inventory.map((s) => ITEMS[s.item].name),
      };
    }),
    shards: { found: state.shards.length, total: TOTAL_SHARDS },
    enemies: state.enemies.filter((e) => e.hp > 0).map((e) => ({ name: e.name, hp: e.hp, maxHp: e.maxHp })),
    bossIntent: state.boss?.telegraph
      ? {
          attack: BOSS_ATTACKS[state.boss.telegraph.attack].name,
          target: state.boss.telegraph.targetId ? state.players[state.boss.telegraph.targetId]?.name : 'everyone',
          enraged: state.boss.enraged,
        }
      : null,
    recentEvents: state.log.filter((e) => DM_EVENT_TYPES.has(e.type)).slice(-10).map((e) => e.text),
    phase: state.phase,
  };
}
