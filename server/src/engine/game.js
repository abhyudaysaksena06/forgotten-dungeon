// The rule engine's entry points. Every function mutates `state` in place and must be
// called under the room lock. `ctx` = { rng, now, voteSeconds, actionSeconds, npcSeconds, narrate: [] };
// anything pushed to ctx.narrate is handed to the AI Dungeon Master after the lock is released.
import { CLASSES, SKILLS, checkBonus } from './classes.js';
import { DC, isSuccess, rollCheck } from './dice.js';
import { STAGES, SCENES, PARTIAL_COST, firstSceneOfStage } from './dungeon.js';
import { GameError, assert } from './errors.js';
import { ITEMS, findItemHolder, giveItem, removeSlot, useItem } from './items.js';
import {
  alivePlayers,
  aliveEnemies,
  applyPoison,
  damagePlayer,
  everyoneFallen,
  healPlayer,
  nextUid,
  partyList,
  playerAtk,
  pushLog,
  revivePlayer,
  tickCooldowns,
  tickPoison,
} from './party.js';
import {
  checkBossThresholds,
  chooseTelegraph,
  computeDamage,
  enemyAttack,
  executeTelegraph,
  getBoss,
  hitEnemy,
  rollAttack,
  spawnBoss,
  spawnEnemy,
} from './combat.js';
import { allEligibleVoted, castVote, closeVote, openVote } from './votes.js';
import { computeHeroScore } from './score.js';
import { hashSeed } from './rng.js';
import { companionName, npcCombatAction, npcUpkeep, npcVote } from './npc.js';

export const MAX_PLAYERS = 4;
export const NAME_MAX = 16;
export const MEND_AMOUNT = 20;

export function createGame({ code, seed, speedTargetMinutes = 30 }) {
  return {
    code,
    seed,
    rngState: hashSeed(String(seed)),
    speedTargetMs: speedTargetMinutes * 60_000,
    phase: 'lobby',
    hostId: null,
    players: {},
    order: [],
    stage: 0,
    sceneIndex: -1,
    enemies: [],
    boss: null,
    shards: [],
    vote: null,
    combat: null,
    scouted: false,
    lastRolls: [],
    narration: null,
    log: [],
    seq: { uid: 0, log: 0, vote: 0 },
    stats: { startedAt: null, finishedAt: null, retries: 0, stagesCleared: [], bossDefeated: false },
    checkpoint: null,
    score: null,
  };
}

// Names are one word so /whisper <name> is unambiguous.
export function cleanName(name) {
  return String(name ?? '')
    .replace(/[^\p{L}\p{N}_'-]/gu, '')
    .slice(0, NAME_MAX);
}

export function addPlayer(state, { id, name, npc = false }) {
  assert(state.phase === 'lobby', 'game_started', 'This party has already entered the dungeon.');
  assert(state.order.length < MAX_PLAYERS, 'room_full', 'The party is full (4 heroes).');
  const clean = cleanName(name);
  assert(clean.length > 0, 'bad_name', 'Pick a name (letters and numbers, no spaces).');
  const taken = partyList(state).some((p) => p.name.toLowerCase() === clean.toLowerCase());
  assert(!taken, 'name_taken', `Someone in this party is already called ${clean}.`);
  state.players[id] = {
    id,
    name: clean,
    npc,
    order: null, // a standing order whispered by the hero (companions only; never sent to clients)
    cls: null,
    ready: false,
    hp: 0,
    maxHp: 0,
    atk: 0,
    atkBonus: 0,
    def: 0,
    poison: 0,
    stun: 0,
    fallen: false,
    defending: false,
    cooldown: 0,
    inventory: [],
    connected: false,
  };
  state.order.push(id);
  if (!npc) state.hostId ??= id;
  pushLog(state, 'join', npc ? `${clean} the ${CLASSES[npc].name} joins you as a companion.` : `${clean} joins the party.`, { playerId: id });
  return state.players[id];
}

// Fills the party to four with one AI companion for each class the hero did not take.
function addCompanions(state) {
  const taken = new Set(partyList(state).map((p) => p.cls));
  for (const cls of Object.keys(CLASSES)) {
    if (taken.has(cls) || state.order.length >= MAX_PLAYERS) continue;
    const id = `npc-${cls}`;
    addPlayer(state, { id, name: companionName(state, cls), npc: cls }); // npc carries the class for the join line
    Object.assign(state.players[id], { npc: true, cls, ready: true });
  }
}

function humans(state) {
  return alivePlayers(state).filter((p) => !p.npc);
}

// The full window when the hero can act; a short beat when only companions are left to decide.
function windowSeconds(state, ctx, seconds, canAct) {
  return humans(state).some(canAct) ? seconds : ctx.npcSeconds;
}

// Companion upkeep is best-effort: an intent that no longer fits the state is skipped.
function runNpcIntent(state, npc, intent) {
  try {
    if (intent.type === 'item') useItem(state, npc.id, intent.itemUid, intent.targetId);
    else if (intent.type === 'ability' && npc.cooldown === 0) {
      mend(state, npc, state.players[intent.targetId]);
      npc.cooldown = CLASSES[npc.cls].ability.cooldown;
    }
  } catch (err) {
    if (!(err instanceof GameError)) throw err;
  }
}

export function applyAction(state, actorId, type, payload, ctx) {
  switch (type) {
    case 'choose_class':
      return chooseClass(state, actorId, payload.cls);
    case 'ready':
      return setReady(state, actorId, payload.ready);
    case 'start':
      return startGame(state, actorId, ctx);
    case 'vote':
      return voteAction(state, actorId, payload.optionId, ctx);
    case 'combat_action':
      return submitCombatAction(state, actorId, payload, ctx);
    case 'use_item':
      return useItemAction(state, actorId, payload);
    case 'use_ability':
      return useAbilityAction(state, actorId, payload);
    case 'retry':
      return retryFromCheckpoint(state, ctx);
    default:
      throw new GameError('unknown_action', `Unknown action "${type}".`);
  }
}

// ---------- lobby ----------

function chooseClass(state, actorId, cls) {
  assert(state.phase === 'lobby', 'game_started', 'Classes are locked once the run begins.');
  assert(Object.hasOwn(CLASSES, cls), 'bad_class', 'Unknown class.');
  const p = state.players[actorId];
  p.cls = cls;
  p.ready = false;
  return { cls };
}

function setReady(state, actorId, ready) {
  assert(state.phase === 'lobby', 'game_started', 'The run has already begun.');
  const p = state.players[actorId];
  assert(p.cls, 'no_class', 'Choose a class first.');
  p.ready = Boolean(ready);
  return { ready: p.ready };
}

function startGame(state, actorId, ctx) {
  assert(state.phase === 'lobby', 'game_started', 'The run has already begun.');
  assert(actorId === state.hostId, 'not_host', 'Only the party leader can open the dungeon.');
  assert(state.players[actorId].cls, 'no_class', 'Choose your class first.');
  addCompanions(state);
  const party = partyList(state);

  for (const p of party) {
    const c = CLASSES[p.cls];
    Object.assign(p, { hp: c.hp, maxHp: c.hp, atk: c.atk, def: c.def, ready: true });
    p.inventory = c.startingItems.map((item) => ({ uid: nextUid(state, 'i'), item }));
  }
  state.stats.startedAt = ctx.now;
  pushLog(state, 'start', 'The party descends into the Forgotten Dungeon.');
  enterStage(state, 1, ctx);
  return { started: true };
}

// ---------- flow ----------

function enterStage(state, stage, ctx) {
  state.stage = stage;
  state.sceneIndex = firstSceneOfStage(stage);
  const gateItem = STAGES[stage].gateItem;
  pushLog(state, 'stage', `Stage ${stage}: ${STAGES[stage].name}`, { stage });
  if (gateItem) {
    const held = findItemHolder(state, gateItem);
    if (held) {
      removeSlot(held.player, held.slot.uid);
      pushLog(state, 'item', `${held.player.name} uses the ${ITEMS[gateItem].name}. The way opens.`, { item: gateItem });
    } else {
      pushLog(state, 'trap', `Without the ${ITEMS[gateItem].name}, the party batters the door down (5 damage each).`);
      for (const p of alivePlayers(state)) damagePlayer(state, p, 5, 'the sealed door');
      if (everyoneFallen(state)) return defeat(state, ctx);
    }
  }
  saveCheckpoint(state);
  enterScene(state, ctx);
}

function enterScene(state, ctx) {
  const scene = SCENES[state.sceneIndex];
  state.scouted = false;
  state.vote = null;
  state.combat = null;
  state.enemies = [];
  state.boss = null;
  ctx.narrate.push({ type: 'scene_intro', sceneId: scene.id });

  if (scene.type === 'choice') {
    state.phase = 'scene';
    for (const npc of alivePlayers(state).filter((p) => p.npc)) {
      for (const intent of npcUpkeep(state, npc)) runNpcIntent(state, npc, intent);
    }
    const options = availableOptions(state, scene);
    openVote(state, options.map((o) => o.id), ctx.now, windowSeconds(state, ctx, ctx.voteSeconds, () => true));
    // Companions speak up first; the hero's vote counts double and usually settles it.
    for (const npc of alivePlayers(state).filter((p) => p.npc)) {
      const { optionId, line } = npcVote(state, npc, options);
      castVote(state, npc.id, optionId);
      pushLog(state, 'npc', `${npc.name}: “${line}”`, { playerId: npc.id, optionId });
    }
    if (humans(state).length && allEligibleVoted(state)) closeSceneVote(state, ctx);
    return;
  }
  state.phase = 'combat';
  if (scene.type === 'boss') {
    spawnBoss(state);
  } else {
    const kinds = scene.enemies(state.order.length);
    const letters = 'ABCDEF';
    kinds.forEach((kind, i) => spawnEnemy(state, kind, kinds.filter((k) => k === kind).length > 1 ? letters[i] : ''));
  }
  startCombatRound(state, ctx);
}

export function availableOptions(state, scene) {
  return scene.options.filter((o) => !o.requires || alivePlayers(state).some((p) => p.inventory.some((s) => s.item === o.requires)));
}

function advanceScene(state, ctx) {
  const current = SCENES[state.sceneIndex];
  const next = SCENES[state.sceneIndex + 1];
  if (!next) return;
  if (next.stage !== current.stage) {
    state.stats.stagesCleared.push(current.stage);
    pushLog(state, 'stage_clear', `Stage ${current.stage} cleared!`, { stage: current.stage });
    enterStage(state, next.stage, ctx);
  } else {
    state.sceneIndex += 1;
    enterScene(state, ctx);
  }
}

function saveCheckpoint(state) {
  const { checkpoint, log, ...rest } = state;
  state.checkpoint = structuredClone(rest);
}

function retryFromCheckpoint(state, ctx) {
  assert(state.phase === 'defeat', 'not_defeated', 'You can only retry after the party falls.');
  assert(state.checkpoint, 'no_checkpoint', 'No checkpoint to return to.');
  const connected = Object.fromEntries(partyList(state).map((p) => [p.id, p.connected]));
  const keep = { log: state.log, seq: state.seq, rngState: state.rngState, stats: state.stats, checkpoint: state.checkpoint };
  Object.assign(state, structuredClone(state.checkpoint), keep);
  for (const p of partyList(state)) p.connected = connected[p.id];
  state.stats.retries += 1;
  state.score = null;
  state.lastRolls = [];
  pushLog(state, 'checkpoint', `The party wakes at the start of ${STAGES[state.stage].name}. (Retry ${state.stats.retries})`);
  enterScene(state, ctx);
  return { retried: true };
}

function defeat(state, ctx) {
  state.phase = 'defeat';
  state.vote = null;
  state.combat = null;
  state.score = computeHeroScore(state);
  pushLog(state, 'defeat', 'The whole party has Fallen. The dungeon forgets you... for now.');
  ctx.narrate.push({ type: 'defeat' });
}

function victory(state, ctx) {
  state.phase = 'victory';
  state.combat = null;
  state.stats.bossDefeated = true;
  state.stats.finishedAt = ctx.now;
  state.stats.stagesCleared.push(3);
  state.score = computeHeroScore(state);
  pushLog(state, 'victory', 'The Forgotten King crumbles to dust. The dungeon remembers your names.');
  ctx.narrate.push({ type: 'victory' });
}

// ---------- choice scenes ----------

function voteAction(state, actorId, optionId, ctx) {
  assert(state.phase === 'scene', 'no_vote', 'There is nothing to vote on right now.');
  const { allVoted } = castVote(state, actorId, optionId);
  if (allVoted) closeSceneVote(state, ctx);
  return { optionId, closed: state.vote?.closed ?? true };
}

// Called when everyone has voted, or by the room timer when the window runs out.
export function closeOpenWindow(state, windowId, ctx) {
  if (state.phase === 'scene' && state.vote?.id === windowId && !state.vote.closed) {
    closeSceneVote(state, ctx);
    return true;
  }
  if (state.phase === 'combat' && combatWindowId(state) === windowId && !state.combat.closed) {
    resolveCombatRound(state, ctx);
    return true;
  }
  return false;
}

export function openWindow(state) {
  if (state.phase === 'scene' && state.vote && !state.vote.closed) return { id: state.vote.id, endsAt: state.vote.endsAt };
  if (state.phase === 'combat' && state.combat && !state.combat.closed) {
    return { id: combatWindowId(state), endsAt: state.combat.endsAt };
  }
  return null;
}

function combatWindowId(state) {
  return state.combat ? `c${state.sceneIndex}-${state.combat.round}-${state.combat.opensAt}` : null;
}

function closeSceneVote(state, ctx) {
  const result = closeVote(state, ctx.rng);
  if (!result) return;
  const scene = SCENES[state.sceneIndex];
  const option = scene.options.find((o) => o.id === result.winner);
  pushLog(state, 'vote', `The party chooses: ${option.label}.`, { optionId: option.id, counts: result.counts });

  const outcome = resolveOption(state, scene, option, ctx);
  for (const item of scene.grants ?? []) giveItem(state, item, outcome.rollerId);

  tickPoison(state);
  tickCooldowns(state);
  ctx.narrate.push({ type: 'check_result', sceneId: scene.id, optionId: option.id, outcome: outcome.outcome });
  if (everyoneFallen(state)) return defeat(state, ctx);
  advanceScene(state, ctx);
}

// The best-suited hero among those who voted for the option makes the roll.
function pickRoller(state, option) {
  const alive = alivePlayers(state);
  const voters = alive.filter((p) => state.vote.votes[p.id] === option.id);
  const pool = voters.length ? voters : alive;
  return pool.reduce((best, p) => (checkBonus(p.cls, option.skill) > checkBonus(best.cls, option.skill) ? p : best));
}

function resolveOption(state, scene, option, ctx) {
  if (option.noCheck) {
    const held = findItemHolder(state, option.requires);
    if (held) {
      removeSlot(held.player, held.slot.uid);
      pushLog(state, 'item', `${held.player.name} uses a ${ITEMS[option.requires].name}. No roll needed.`, { item: option.requires });
    }
    state.lastRolls = [];
    applyReward(state, option.reward, held?.player.id);
    return { outcome: 'success', rollerId: held?.player.id };
  }

  const roller = pickRoller(state, option);
  const roll = rollCheck(ctx.rng, { bonus: checkBonus(roller.cls, option.skill), dc: DC[option.difficulty] });
  Object.assign(roll, { playerId: roller.id, label: `${roller.name} · ${SKILLS[option.skill]}` });
  state.lastRolls = [roll];
  pushLog(state, 'check', `${roller.name} rolls ${roll.value}+${roll.bonus} = ${roll.total} vs DC ${roll.dc}: ${roll.outcome.replace('_', ' ')}.`, {
    roll,
  });

  const fail = scene.fail;
  switch (roll.outcome) {
    case 'critical_success':
      applyReward(state, option.reward, roller.id);
      applyReward(state, scene.critSuccess, roller.id);
      break;
    case 'success':
      applyReward(state, option.reward, roller.id);
      break;
    case 'partial': {
      const dealt = damagePlayer(state, roller, PARTIAL_COST, 'the effort');
      pushLog(state, 'partial', `${roller.name} makes it through, barely (−${dealt} HP).`, { playerId: roller.id });
      break;
    }
    case 'fail':
      applyFail(state, fail, [roller]);
      break;
    case 'critical_fail':
      pushLog(state, 'trap', 'A critical failure — the whole party pays for it.');
      applyFail(state, fail, alivePlayers(state));
      break;
  }
  return { outcome: roll.outcome, rollerId: roller.id, success: isSuccess(roll.outcome) };
}

function applyFail(state, fail, targets) {
  pushLog(state, 'trap', fail.text);
  for (const p of targets) {
    if (fail.damage) {
      const dealt = damagePlayer(state, p, fail.damage, 'the trap');
      pushLog(state, 'damage', `${p.name} takes ${dealt} damage.`, { playerId: p.id, damage: dealt });
    }
    if (fail.poison) applyPoison(p);
  }
}

function applyReward(state, reward, receiverId) {
  if (!reward) return;
  if (reward.shard && !state.shards.includes(reward.shard)) {
    state.shards.push(reward.shard);
    pushLog(state, 'shard', `A Memory Shard glows with a stolen memory (${state.shards.length}/5).`, { shard: reward.shard });
  }
  if (reward.item) giveItem(state, reward.item, receiverId);
  if (reward.healAll) {
    for (const p of alivePlayers(state)) healPlayer(p, reward.healAll);
    pushLog(state, 'heal', `The party catches its breath (+${reward.healAll} HP each).`);
  }
}

// ---------- out-of-combat actions ----------

function useItemAction(state, actorId, { itemUid, targetId }) {
  assert(state.phase !== 'combat', 'use_combat_action', 'In combat, using an item is your action for the round.');
  assert(state.phase === 'scene', 'not_now', 'You cannot use items right now.');
  return useItem(state, actorId, itemUid, targetId);
}

function useAbilityAction(state, actorId, { targetId }) {
  assert(state.phase !== 'combat', 'use_combat_action', 'In combat, your ability is your action for the round.');
  assert(state.phase === 'scene', 'not_now', 'You cannot use abilities right now.');
  const p = state.players[actorId];
  assert(!p.fallen, 'fallen', 'The Fallen cannot act.');
  const ability = CLASSES[p.cls].ability;
  assert(!ability.combatOnly, 'combat_only', `${ability.name} only works in combat.`);
  assert(p.cooldown === 0, 'cooldown', `${ability.name} is recharging (${p.cooldown}).`);

  if (ability.id === 'scout') {
    state.scouted = true;
    const next = SCENES[state.sceneIndex + 1];
    pushLog(state, 'ability', `${p.name} scouts ahead: every DC is revealed${next ? `, and beyond lies ${next.title}` : ''}.`);
  } else if (ability.id === 'mend') {
    mend(state, p, state.players[targetId ?? actorId]);
  }
  p.cooldown = ability.cooldown;
  return { ability: ability.id };
}

function mend(state, healer, target) {
  assert(target, 'bad_target', 'No such ally.');
  if (target.fallen) {
    revivePlayer(target, MEND_AMOUNT);
    pushLog(state, 'ability', `${healer.name}'s Mend pulls ${target.name} back from the dark (${MEND_AMOUNT} HP).`);
  } else {
    const healed = healPlayer(target, MEND_AMOUNT);
    pushLog(state, 'ability', `${healer.name} Mends ${target.name} (+${healed} HP).`);
  }
}

// ---------- combat ----------

function combatActors(state) {
  return alivePlayers(state).filter((p) => p.stun === 0);
}

function startCombatRound(state, ctx) {
  const round = (state.combat?.round ?? 0) + 1;
  const seconds = windowSeconds(state, ctx, ctx.actionSeconds, (p) => p.stun === 0);
  state.combat = { round, actions: {}, opensAt: ctx.now, endsAt: ctx.now + seconds * 1000, closed: false };
  if (state.boss) chooseTelegraph(state, ctx.rng);
  // Companions commit as the round opens, after seeing the King's telegraph.
  for (const npc of combatActors(state).filter((p) => p.npc)) {
    try {
      state.combat.actions[npc.id] = validateCombatAction(state, npc, npcCombatAction(state, npc));
    } catch (err) {
      if (!(err instanceof GameError)) throw err;
      state.combat.actions[npc.id] = validateCombatAction(state, npc, { type: 'attack' });
    }
  }
}

function firstAliveEnemy(state) {
  return aliveEnemies(state)[0] ?? null;
}

function validateCombatAction(state, p, payload) {
  const type = payload.type;
  const aliveEnemy = (id) => state.enemies.find((e) => e.id === id && e.hp > 0);
  switch (type) {
    case 'attack': {
      const target = aliveEnemy(payload.targetId) ?? firstAliveEnemy(state);
      assert(target, 'bad_target', 'No enemy to attack.');
      return { type, targetId: target.id };
    }
    case 'defend':
      return { type };
    case 'ability': {
      const ability = CLASSES[p.cls].ability;
      assert(p.cooldown === 0, 'cooldown', `${ability.name} is recharging (${p.cooldown}).`);
      if (ability.target === 'enemy') {
        const target = aliveEnemy(payload.targetId) ?? firstAliveEnemy(state);
        assert(target, 'bad_target', 'No enemy to target.');
        return { type, targetId: target.id };
      }
      if (ability.target === 'ally') {
        const target = state.players[payload.targetId ?? p.id];
        assert(target, 'bad_target', 'No such ally.');
        return { type, targetId: target.id };
      }
      return { type };
    }
    case 'item': {
      const slot = p.inventory.find((s) => s.uid === payload.itemUid);
      assert(slot, 'item_not_found', 'That item is no longer in your pack.');
      assert(ITEMS[slot.item].target !== 'story', 'cannot_use_here', `The ${ITEMS[slot.item].name} is used by the dungeon itself.`);
      const targetId = payload.targetId ?? p.id;
      assert(state.players[targetId], 'bad_target', 'No such ally.');
      return { type, itemUid: slot.uid, targetId };
    }
    default:
      throw new GameError('bad_action', 'Choose Attack, Defend, Ability or Use Item.');
  }
}

function submitCombatAction(state, actorId, payload, ctx) {
  assert(state.phase === 'combat' && state.combat && !state.combat.closed, 'not_in_combat', 'There is no fight right now.');
  const p = state.players[actorId];
  assert(!p.fallen, 'fallen', 'The Fallen cannot act.');
  assert(p.stun === 0, 'stunned', 'You are Stunned this round.');
  assert(!Object.hasOwn(state.combat.actions, actorId), 'already_acted', 'You have already acted this round.');
  const action = validateCombatAction(state, p, payload);
  state.combat.actions[actorId] = action;
  const resolved = combatActors(state).every((a) => Object.hasOwn(state.combat.actions, a.id));
  if (resolved) resolveCombatRound(state, ctx);
  return { action: action.type, resolved };
}

function playerStrike(state, p, targetId, ctx, rolls, autoHit) {
  const target = state.enemies.find((e) => e.id === targetId && e.hp > 0) ?? firstAliveEnemy(state);
  if (!target) return;
  const attack = rollAttack(ctx.rng, { atk: playerAtk(p), def: target.def, autoHit });
  rolls.push({ ...attack.roll, playerId: p.id, label: `${p.name} → ${target.name}`, outcome: attack.outcome });
  if (attack.outcome === 'miss') {
    pushLog(state, 'attack', `${p.name} attacks ${target.name} and misses.`, { roll: attack.roll });
    return;
  }
  const { dealt, shardBonus } = hitEnemy(state, target, attack.damage);
  const notes = [attack.outcome === 'critical' ? 'critical!' : '', shardBonus ? 'the Memory Shards double it!' : '']
    .filter(Boolean)
    .join(' ');
  pushLog(state, 'attack', `${p.name} hits ${target.name} for ${dealt}${notes ? ` — ${notes}` : '.'}`, {
    roll: attack.roll,
    enemyId: target.id,
    damage: dealt,
  });
  if (target.hp === 0) pushLog(state, 'enemy_down', `${target.name} is destroyed.`, { enemyId: target.id });
}

function runPlayerAction(state, p, action, ctx, rolls) {
  const ability = CLASSES[p.cls].ability;
  switch (action.type) {
    case 'attack':
      return playerStrike(state, p, action.targetId, ctx, rolls, false);
    case 'item':
      try {
        useItem(state, p.id, action.itemUid, action.targetId);
      } catch (err) {
        if (!(err instanceof GameError)) throw err;
        pushLog(state, 'item', `${p.name}'s item fizzles: ${err.message}`);
      }
      return;
    case 'ability':
      p.cooldown = ability.cooldown;
      if (ability.id === 'scout') {
        pushLog(state, 'ability', `${p.name} spots a weak point — this strike cannot miss.`);
        return playerStrike(state, p, action.targetId, ctx, rolls, true);
      }
      if (ability.id === 'mend') return mend(state, p, state.players[action.targetId]);
      if (ability.id === 'arcane_burst') {
        pushLog(state, 'ability', `${p.name} unleashes an Arcane Burst!`);
        for (const enemy of aliveEnemies(state)) {
          const bonusDie = ctx.rng.die(6);
          rolls.push({ die: 'd6', value: bonusDie, playerId: p.id, label: `Burst → ${enemy.name}` });
          const { dealt, shardBonus } = hitEnemy(state, enemy, computeDamage({ atk: playerAtk(p), bonusDie, def: enemy.def }));
          pushLog(state, 'attack', `The burst sears ${enemy.name} for ${dealt}${shardBonus ? ' — doubled by the Memory Shards!' : '.'}`, {
            enemyId: enemy.id,
            damage: dealt,
          });
          if (enemy.hp === 0) pushLog(state, 'enemy_down', `${enemy.name} is destroyed.`, { enemyId: enemy.id });
        }
      }
      return;
  }
}

export function resolveCombatRound(state, ctx) {
  const combat = state.combat;
  if (!combat || combat.closed) return;
  combat.closed = true;
  const rolls = [];
  let shieldWall = false;

  // 1. Stances first: defenders and Shield Wall protect the whole round.
  const acting = [];
  for (const p of alivePlayers(state)) {
    if (p.stun > 0) {
      p.stun -= 1;
      pushLog(state, 'status', `${p.name} is Stunned and loses the turn.`, { playerId: p.id });
      continue;
    }
    const action = combat.actions[p.id] ?? { type: 'defend', auto: true };
    if (action.type === 'defend') {
      p.defending = true;
      pushLog(state, 'defend', action.auto ? `${p.name} hesitates and raises a guard.` : `${p.name} takes a defensive stance.`);
    } else if (action.type === 'ability' && CLASSES[p.cls].ability.id === 'shield_wall') {
      shieldWall = true;
      p.cooldown = CLASSES[p.cls].ability.cooldown;
      pushLog(state, 'ability', `${p.name} raises a Shield Wall — the party takes half damage this round.`);
    } else {
      acting.push([p, action]);
    }
  }

  // 2. Everyone else acts in party order. The King can fall mid-round.
  for (const [p, action] of acting) {
    if (p.fallen) continue;
    runPlayerAction(state, p, action, ctx, rolls);
    const king = getBoss(state);
    if (king && king.hp === 0) {
      state.lastRolls = rolls;
      return victory(state, ctx);
    }
  }
  checkBossThresholds(state);

  const scene = SCENES[state.sceneIndex];
  if (aliveEnemies(state).length === 0) {
    state.lastRolls = rolls;
    return winCombat(state, scene, ctx);
  }

  // 3. Enemy phase: the King's telegraphed move, then his minions.
  executeTelegraph(state, shieldWall);
  for (const enemy of aliveEnemies(state)) {
    // #region C1 king-skips-basic-attack
    if (enemy.boss) continue;
    // #endregion C1
    if (enemy.stun > 0) {
      enemy.stun -= 1;
      continue;
    }
    enemyAttack(state, ctx.rng, enemy, shieldWall);
  }

  // 4. End of round.
  tickPoison(state);
  tickCooldowns(state);
  for (const p of partyList(state)) p.defending = false;
  state.lastRolls = rolls;
  if (everyoneFallen(state)) return defeat(state, ctx);
  ctx.narrate.push({ type: 'combat_round', round: combat.round });
  startCombatRound(state, ctx);
}

function winCombat(state, scene, ctx) {
  state.combat = null;
  for (const p of partyList(state)) p.defending = false;
  pushLog(state, 'combat_won', `${scene.title}: the fight is won.`);
  for (const item of scene.loot ?? []) giveItem(state, item, alivePlayers(state)[0]?.id);
  applyReward(state, scene.shard ? { shard: scene.shard } : null);
  ctx.narrate.push({ type: 'combat_won', sceneId: scene.id });
  state.enemies = [];
  advanceScene(state, ctx);
}
