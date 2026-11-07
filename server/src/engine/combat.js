// Attack math, enemies and the Forgotten King. All numbers are decided here, never by the client or the AI.
import { nextUid, pushLog, alivePlayers, damagePlayer, damageEnemy, applyPoison } from './party.js';

export const ENEMIES = {
  skeleton: { name: 'Skeleton', hp: 22, atk: 9, def: 3 },
  ash_wraith: { name: 'Ash Wraith', hp: 45, atk: 11, def: 4, stunOnCrit: true },
  forgotten_king: { name: 'The Forgotten King', hp: 140, atk: 16, def: 2, boss: true },
};

// Tuned for a hero + 3 companions with server/scripts/balance.mjs (sheet: 100 / 25 / 10).
export const BOSS_HP_PER_PLAYER = 60;
export const ENRAGE_BONUS = 5;
export const SUMMON_THRESHOLD = 0.66;
export const ENRAGE_THRESHOLD = 0.33;
export const TOTAL_SHARDS = 5;

export const BOSS_ATTACKS = {
  crown_strike: { name: 'Crown Strike', damage: 35, all: false, poison: false },
  grave_wail: { name: 'Grave Wail', damage: 12, all: true, poison: true },
};

export function bossMaxHp(playerCount) {
  return ENEMIES.forgotten_king.hp + BOSS_HP_PER_PLAYER * playerCount;
}

// d20: 1-4 miss, 5-19 hit, 20 critical (double damage).
export function attackOutcome(value) {
  if (value <= 4) return 'miss';
  if (value === 20) return 'critical';
  return 'hit';
}

export function computeDamage({ atk, bonusDie, def, critical }) {
  const base = Math.max(1, atk + bonusDie - def);
  return critical ? base * 2 : base;
}

export function rollAttack(rng, { atk, def, autoHit = false }) {
  const roll = { die: 'd20', value: rng.die(20) };
  let outcome = attackOutcome(roll.value);
  if (autoHit && outcome === 'miss') outcome = 'hit';
  if (outcome === 'miss') return { roll, outcome, damage: 0 };
  const bonusDie = rng.die(6);
  return { roll, outcome, bonusDie, damage: computeDamage({ atk, bonusDie, def, critical: outcome === 'critical' }) };
}

// Defend and Shield Wall each halve incoming damage (rounding up, so a hit always stings).
export function mitigate(amount, { defending = false, shieldWall = false }) {
  let dealt = amount;
  if (defending) dealt = Math.ceil(dealt / 2);
  if (shieldWall) dealt = Math.ceil(dealt / 2);
  return dealt;
}

export function spawnEnemy(state, kind, label) {
  const t = ENEMIES[kind];
  const enemy = {
    id: nextUid(state, 'e'),
    kind,
    name: label ? `${t.name} ${label}` : t.name,
    hp: t.hp,
    maxHp: t.hp,
    atk: t.atk,
    def: t.def,
    stun: 0,
    boss: Boolean(t.boss),
  };
  state.enemies.push(enemy);
  return enemy;
}

export function spawnBoss(state) {
  const king = spawnEnemy(state, 'forgotten_king');
  king.maxHp = king.hp = bossMaxHp(state.order.length);
  state.boss = { id: king.id, telegraph: null, summoned: false, enraged: false, shardBonusUsed: false };
  return king;
}

export function getBoss(state) {
  return state.boss ? state.enemies.find((e) => e.id === state.boss.id) : null;
}

// Deals player damage to an enemy, applying the Memory Shard bonus to the first hit on the King.
export function hitEnemy(state, enemy, damage) {
  let amount = damage;
  let shardBonus = false;
  if (enemy.boss && state.shards.length >= TOTAL_SHARDS && !state.boss.shardBonusUsed && amount > 0) {
    amount *= 2;
    shardBonus = true;
    state.boss.shardBonusUsed = true;
  }
  const dealt = damageEnemy(enemy, amount);
  return { dealt, shardBonus };
}

// #region C1 king-moves
// Picks and announces the King's next move so the party can prepare.
export function chooseTelegraph(state, rng) {
  const king = getBoss(state);
  const alive = alivePlayers(state);
  if (!king || king.hp <= 0 || alive.length === 0) {
    if (state.boss) state.boss.telegraph = null;
    return null;
  }
  const attack = rng.pick(Object.keys(BOSS_ATTACKS));
  const targetId = BOSS_ATTACKS[attack].all ? null : rng.pick(alive).id;
  state.boss.telegraph = { attack, targetId };
  const target = targetId ? ` at ${state.players[targetId].name}` : ' at the whole party';
  pushLog(state, 'telegraph', `The Forgotten King prepares ${BOSS_ATTACKS[attack].name}${target}.`, state.boss.telegraph);
  return state.boss.telegraph;
}

export function executeTelegraph(state, shieldWall) {
  const tele = state.boss?.telegraph;
  const king = getBoss(state);
  if (!tele || !king || king.hp <= 0 || king.stun > 0) return;
  const attack = BOSS_ATTACKS[tele.attack];
  const base = attack.damage + (state.boss.enraged ? ENRAGE_BONUS : 0);
  const targets = attack.all ? alivePlayers(state) : [state.players[tele.targetId]].filter((p) => p && !p.fallen);
  for (const p of targets) {
    const dealt = damagePlayer(state, p, mitigate(base, { defending: p.defending, shieldWall }), attack.name);
    pushLog(state, 'enemy_attack', `${attack.name} hits ${p.name} for ${dealt}.`, { playerId: p.id, damage: dealt });
    if (attack.poison && !p.fallen) applyPoison(p);
  }
  if (targets.length === 0) pushLog(state, 'enemy_attack', `${attack.name} finds no one to strike.`);
}

// Phase changes when the King drops below 66% and 33% HP. Each happens once.
export function checkBossThresholds(state) {
  const king = getBoss(state);
  if (!king || king.hp <= 0) return;
  if (!state.boss.summoned && king.hp < king.maxHp * SUMMON_THRESHOLD) {
    state.boss.summoned = true;
    spawnEnemy(state, 'skeleton', 'Thrall I');
    spawnEnemy(state, 'skeleton', 'Thrall II');
    pushLog(state, 'boss_phase', 'The King raises his sceptre — two skeletal thralls claw out of the floor!');
  }
  if (!state.boss.enraged && king.hp < king.maxHp * ENRAGE_THRESHOLD) {
    state.boss.enraged = true;
    pushLog(state, 'boss_phase', 'The Forgotten King is ENRAGED — his attacks deal +5 damage!');
  }
}

// #endregion C1

// A regular enemy picks a living hero at random and swings.
export function enemyAttack(state, rng, enemy, shieldWall) {
  const alive = alivePlayers(state);
  if (alive.length === 0) return;
  const target = rng.pick(alive);
  const attack = rollAttack(rng, { atk: enemy.atk, def: target.def });
  if (attack.outcome === 'miss') {
    pushLog(state, 'enemy_attack', `${enemy.name} swings at ${target.name} and misses.`, { roll: attack.roll });
    return;
  }
  const dealt = damagePlayer(state, target, mitigate(attack.damage, { defending: target.defending, shieldWall }), enemy.name);
  const crit = attack.outcome === 'critical' ? ' — a critical blow!' : '';
  pushLog(state, 'enemy_attack', `${enemy.name} hits ${target.name} for ${dealt}${crit}`, {
    roll: attack.roll,
    playerId: target.id,
    damage: dealt,
  });
  if (attack.outcome === 'critical' && ENEMIES[enemy.kind].stunOnCrit && !target.fallen) {
    target.stun = 1;
    pushLog(state, 'status', `${target.name} is Stunned by the chilling touch.`, { playerId: target.id });
  }
}
