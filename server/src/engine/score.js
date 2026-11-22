// Hero Score (max 400): stage clears 100, boss 150, survival 50, speed 50, Memory Shards 50.
import { alivePlayers } from './party.js';

export function computeHeroScore(state) {
  const { stats } = state;
  const cleared = new Set(stats.stagesCleared).size;
  const stageClears = Math.round((100 * cleared) / 3);
  const boss = stats.bossDefeated ? 150 : 0;
  const total = state.order.length;
  const survival = stats.bossDefeated && total ? Math.round((50 * alivePlayers(state).length) / total) : 0;

  // Full 50 inside the target time; fades to 0 at twice the target. Any retry forfeits it.
  let speed = 0;
  if (stats.bossDefeated && stats.retries === 0 && stats.startedAt != null && stats.finishedAt != null) {
    const elapsed = stats.finishedAt - stats.startedAt;
    const target = state.speedTargetMs;
    speed = elapsed <= target ? 50 : Math.max(0, Math.round(50 * (1 - (elapsed - target) / target)));
  }
  const shards = 10 * state.shards.length;
  return { stageClears, boss, survival, speed, shards, total: stageClears + boss + survival + speed + shards };
}
