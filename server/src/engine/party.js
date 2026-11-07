// Small helpers shared by every rule module. They mutate the game state in place;
// callers always hold the room lock while doing so.

export const LOG_LIMIT = 200;
export const POISON_DAMAGE = 3;
export const POISON_ROUNDS = 3;

export function nextUid(state, prefix) {
  state.seq.uid += 1;
  return `${prefix}${state.seq.uid}`;
}

export function pushLog(state, type, text, data) {
  state.seq.log += 1;
  const entry = { id: state.seq.log, type, text };
  if (data !== undefined) entry.data = data;
  state.log.push(entry);
  if (state.log.length > LOG_LIMIT) state.log.splice(0, state.log.length - LOG_LIMIT);
  return entry;
}

export function partyList(state) {
  return state.order.map((id) => state.players[id]);
}

export function alivePlayers(state) {
  return partyList(state).filter((p) => !p.fallen);
}

export function aliveEnemies(state) {
  return state.enemies.filter((e) => e.hp > 0);
}

export function playerAtk(player) {
  return player.atk + player.atkBonus;
}

// HP never goes below 0 or above max.
export function damagePlayer(state, player, amount, source) {
  if (player.fallen) return 0;
  const dealt = Math.min(player.hp, Math.max(0, amount));
  player.hp -= dealt;
  if (player.hp === 0) {
    player.fallen = true;
    player.poison = 0;
    player.stun = 0;
    player.defending = false;
    pushLog(state, 'fallen', `${player.name} has Fallen${source ? ` to ${source}` : ''}.`, { playerId: player.id });
  }
  return dealt;
}

export function healPlayer(player, amount) {
  if (player.fallen) return 0;
  const healed = Math.min(player.maxHp - player.hp, Math.max(0, amount));
  player.hp += healed;
  return healed;
}

export function revivePlayer(player, hp) {
  player.fallen = false;
  player.hp = Math.min(player.maxHp, hp);
}

export function damageEnemy(enemy, amount) {
  const dealt = Math.min(enemy.hp, Math.max(0, amount));
  enemy.hp -= dealt;
  return dealt;
}

export function applyPoison(player) {
  if (!player.fallen) player.poison = POISON_ROUNDS;
}

// One status tick: poison deals 3 and counts down.
export function tickPoison(state) {
  for (const p of alivePlayers(state)) {
    if (p.poison > 0) {
      p.poison -= 1;
      const dealt = damagePlayer(state, p, POISON_DAMAGE, 'poison');
      pushLog(state, 'status', `Poison burns ${p.name} for ${dealt}.`, { playerId: p.id, damage: dealt });
    }
  }
}

export function tickCooldowns(state) {
  for (const p of partyList(state)) {
    if (p.cooldown > 0) p.cooldown -= 1;
  }
}

export function everyoneFallen(state) {
  return state.order.length > 0 && alivePlayers(state).length === 0;
}
