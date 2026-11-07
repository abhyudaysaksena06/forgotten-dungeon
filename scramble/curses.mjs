// How each Curse is planted into a copy of the clean build. Every `find` must match the clean
// source exactly once (the scrambler refuses to run otherwise), so if you edit the clean code,
// re-run `node scripts/verify-scramble.mjs` and fix any patch it reports.
//
// Patches are applied in id order. Two Curses never touch the same lines.

export const CURSE_PATCHES = {
  E1: [
    {
      file: 'client/src/lib/actions.js',
      find: '// Combat buttons are wired by handler name, so the button list and the handlers must agree.',
      replace: '// The combat buttons and what each one sends.',
    },
    {
      file: 'client/src/lib/actions.js',
      find: "    onAttack: ({ targetId } = {}) => send('combat_action', { type: 'attack', targetId }),",
      replace: "    onAtack: ({ targetId } = {}) => send('combat_action', { type: 'attack', targetId }),",
    },
  ],

  E2: [
    { file: 'client/src/lib/format.js', find: '// HP bar fill: current / max as a 0–100 percentage.', replace: '// HP bar fill as a 0–100 percentage.' },
    {
      file: 'client/src/lib/format.js',
      find: '  return Math.round(Math.min(1, Math.max(0, hp / maxHp)) * 100);',
      replace: '  return Math.round(Math.min(1, Math.max(0, (maxHp - hp) / maxHp)) * 100);',
    },
  ],

  E3: [
    {
      file: 'client/src/lib/format.js',
      find: "// Rolls from the server look like { die: 'd20', value: 14, bonus?, total?, dc?, outcome? }.",
      replace: '// Formats a roll from the server for display.',
    },
    {
      file: 'client/src/lib/format.js',
      find: [
        "  if (!roll || typeof roll.value !== 'number') return '—';",
        "  if (typeof roll.bonus === 'number' && roll.bonus !== 0) return `${roll.value} + ${roll.bonus} = ${roll.total}`;",
        '  return String(roll.value);',
      ].join('\n'),
      replace: [
        "  if (!roll) return '—';",
        "  if (typeof roll.bonus === 'number' && roll.bonus !== 0) return `${roll.result} + ${roll.bonus} = ${roll.result + roll.bonus}`;",
        '  return String(Number(roll.result));',
      ].join('\n'),
    },
  ],

  E4: [
    ...['server/src/rooms/roomCode.js', 'client/src/lib/roomCode.js'].map((file) => ({
      file,
      find: "  return String(raw ?? '')\n    .replace(/\\s+/g, '')\n    .toUpperCase();",
      replace: "  return String(raw ?? '').trim();",
    })),
    { file: 'server/src/rooms/roomCode.js', find: '// " ab c12 " -> "ABC12": players type codes however they like.\n', replace: '' },
    { file: 'client/src/lib/roomCode.js', find: '// Mirrors the server: " ab c12 " -> "ABC12".', replace: '// Room codes as typed by players.' },
  ],

  M1: [
    {
      file: 'server/src/engine/votes.js',
      find: '  return alive.length > 0 && alive.every((p) => state.vote.votes[p.id] !== undefined);',
      replace: '  return alive.length > 0 && alive.some((p) => state.vote.votes[p.id] !== undefined);',
    },
  ],

  M2: [
    { file: 'server/src/dm/context.js', find: '        hp: p.hp,\n        maxHp: p.maxHp,\n', replace: '' },
    { file: 'server/src/dm/context.js', find: '        items: p.inventory.map((s) => ITEMS[s.item].name),\n', replace: '' },
    { file: 'server/src/dm/context.js', find: '    shards: { found: state.shards.length, total: TOTAL_SHARDS },\n', replace: '' },
    {
      file: 'server/src/dm/context.js',
      find: '// Builds what the Dungeon Master is told. It always carries the live party state (HP, items,\n// shards), and it is built only from the game state — chat and whispers never reach it.',
      replace: '// Builds what the Dungeon Master is told. Built only from the game state — chat never reaches it.',
    },
  ],

  M3: [
    {
      file: 'client/src/useRoom.js',
      find: [
        '  // Sends an intent. `key` names the intent (e.g. "this potion", "my action this round") and is',
        '  // used as the idempotency key, so a double-click or a lost-ack retry is recognised by the server',
        '  // instead of running twice.',
      ].join('\n'),
      replace: '  // Sends an intent to the server.',
    },
    {
      file: 'server/src/rooms/roomManager.js',
      find: '      if (room.processed.has(actionId)) return { ...room.processed.get(actionId), duplicate: true };\n',
      replace: '',
    },
    {
      file: 'client/src/components/CombatPanel.jsx',
      find: [
        '  // One intent per hero per round: a double-click or retry reuses the key, so it can never act twice.',
        '  const roundKey = combat && `round-${state.code}-${state.sceneIndex}-${combat.round}`;',
      ].join('\n'),
      replace: '  const roundKey = undefined;',
    },
    {
      file: 'client/src/components/CombatPanel.jsx',
      find: '  const locked = busy || combat.closed || submitted || me.fallen || me.stun > 0;',
      replace: '  const locked = combat.closed || submitted || me.fallen || me.stun > 0;',
    },
  ],

  M4: [
    {
      file: 'server/src/rooms/roomManager.js',
      find: [
        "      if (typeof token === 'string' && room.tokens.has(token)) {",
        '        return { code, playerId: room.tokens.get(token), token, rejoined: true };',
        '      }',
        "      assert(room.state.order.length === 0, 'singleplayer', 'This run already has its hero. Use \"Watch a run\" to spectate it.');",
        '',
      ].join('\n'),
      replace: '',
    },
    {
      file: 'server/src/rooms/roomManager.js',
      find: '  // Runs are single-hero. A valid token means "this is me again" (refresh, new tab): same hero, no duplicate.',
      replace: '  // Adds the hero to the run.',
    },
  ],

  A1: [
    {
      file: 'server/src/rooms/roomManager.js',
      find: [
        "      const seat = typeof playerId === 'string' && Object.hasOwn(room.state.players, playerId) && room.state.players[playerId];",
        "      assert(seat && !seat.npc, 'not_member', 'You are not the hero of this run.');",
        '',
      ].join('\n'),
      replace: '',
    },
    {
      file: 'server/src/sockets.js',
      find: '        const result = await manager.perform(code, playerId, msg ?? {});',
      replace: '        const result = await manager.perform(msg?.code ?? code, msg?.playerId ?? playerId, msg ?? {});',
    },
  ],

  A2: [
    {
      file: 'server/src/rooms/roomManager.js',
      find: '// Clients send intents, never numbers: only these fields, only short strings/booleans, get through.',
      replace: '// The fields each action can carry.',
    },
    {
      file: 'server/src/rooms/roomManager.js',
      find: [
        '  const out = {};',
        '  for (const field of fields) {',
        '    const value = payload?.[field];',
        "    if ((typeof value === 'string' && value.length <= 64) || typeof value === 'boolean') out[field] = value;",
        '  }',
        '  return out;',
      ].join('\n'),
      replace: '  return { ...payload };',
    },
    {
      file: 'server/src/engine/game.js',
      find: "      assert(target, 'bad_target', 'No enemy to attack.');\n      return { type, targetId: target.id };",
      replace: "      assert(target, 'bad_target', 'No enemy to attack.');\n      return { type, targetId: target.id, damage: payload.damage };",
    },
    {
      file: 'server/src/engine/game.js',
      find: '      return playerStrike(state, p, action.targetId, ctx, rolls, false);',
      replace: '      return playerStrike(state, p, action.targetId, ctx, rolls, false, action.damage);',
    },
    {
      file: 'server/src/engine/game.js',
      find: [
        'function playerStrike(state, p, targetId, ctx, rolls, autoHit) {',
        '  const target = state.enemies.find((e) => e.id === targetId && e.hp > 0) ?? firstAliveEnemy(state);',
        '  if (!target) return;',
        '  const attack = rollAttack(ctx.rng, { atk: playerAtk(p), def: target.def, autoHit });',
      ].join('\n'),
      replace: [
        'function playerStrike(state, p, targetId, ctx, rolls, autoHit, shownDamage) {',
        '  const target = state.enemies.find((e) => e.id === targetId && e.hp > 0) ?? firstAliveEnemy(state);',
        '  if (!target) return;',
        '  const attack = rollAttack(ctx.rng, { atk: playerAtk(p), def: target.def, autoHit });',
        "  if (shownDamage !== undefined && attack.outcome !== 'miss') attack.damage = Number(shownDamage); // match the damage preview",
      ].join('\n'),
    },
  ],

  A3: [
    {
      file: 'server/src/engine/game.js',
      find: 'export function createGame({ code, seed, speedTargetMinutes = 30 }) {',
      replace: 'const chronicle = [];\n\nexport function createGame({ code, seed, speedTargetMinutes = 30 }) {',
    },
    { file: 'server/src/engine/game.js', find: '    log: [],', replace: '    log: chronicle,' },
  ],

  A4: [
    {
      file: 'server/src/rooms/roomManager.js',
      find: [
        '  async perform(rawCode, playerId, { actionId, type, payload } = {}) {',
        '    const room = this.#room(rawCode);',
        '    return room.lock.run(async () => {',
      ].join('\n'),
      replace: [
        '  async perform(rawCode, playerId, { actionId, type, payload } = {}) {',
        '    const room = this.#room(rawCode);',
        "    // Items only touch the hero's own pack, so they skip the queue.",
        "    const run = type === 'use_item' ? (fn) => fn() : (fn) => room.lock.run(fn);",
        '    return run(async () => {',
      ].join('\n'),
    },
    { file: 'server/src/engine/items.js', find: 'export function useItem(state, userId, uid, targetId) {', replace: 'export async function useItem(state, userId, uid, targetId) {' },
    {
      file: 'server/src/engine/items.js',
      find: "  assert(target, 'bad_target', 'No such ally.');\n\n  let text;",
      replace: "  assert(target, 'bad_target', 'No such ally.');\n  await new Promise((r) => setTimeout(r, 15)); // let the drink animation finish\n\n  let text;",
    },
    {
      file: 'server/src/engine/game.js',
      find: '        useItem(state, p.id, action.itemUid, action.targetId);',
      replace: '        useItem(state, p.id, action.itemUid, action.targetId).catch(() => {});',
    },
    {
      file: 'server/src/engine/game.js',
      find: "    if (intent.type === 'item') useItem(state, npc.id, intent.itemUid, intent.targetId);",
      replace: "    if (intent.type === 'item') useItem(state, npc.id, intent.itemUid, intent.targetId).catch(() => {});",
    },
    {
      file: 'server/src/engine/items.js',
      find: "// Uses an item from the user's pack. The slot is removed only after every check passes,\n// and callers hold the room lock, so one slot can never be spent twice.",
      replace: "// Uses an item from the user's pack.",
    },
  ],

  R1: [
    {
      file: 'server/src/rooms/roomManager.js',
      find: [
        '  // Narration runs outside the lock (the LLM may take seconds) and in order. Its text is stored',
        '  // as flavour only; nothing in it can change the game.',
      ].join('\n'),
      replace: '  // Narration runs outside the lock (the LLM may take seconds) and in order.',
    },
    {
      file: 'server/src/rooms/roomManager.js',
      find: "          pushLog(room.state, 'narration', out.narration);",
      replace: [
        "          pushLog(room.state, 'narration', out.narration);",
        "          if (/\\byou (win|have won|are victorious)\\b/i.test(out.narration)) room.state.phase = 'victory';",
      ].join('\n'),
    },
  ],

  R2: [
    { file: 'client/.env', create: 'VITE_ANTHROPIC_API_KEY=sk-ant-api03-FAKE-hollowbell-preview-key-0000000000\n' },
    { file: '.gitignore', find: 'dist/\n.env\n', replace: 'dist/\n' },
    {
      file: 'client/src/net.js',
      find: 'export async function api(',
      replace: '// Used by the narrator preview panel.\nexport const DM_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY;\n\nexport async function api(',
    },
  ],
};

// Region replacements for the Client Calls. A region in the clean source looks like
//   // #region C1 boss-view   …   // #endregion C1
// and is replaced in the participant build by the text below ('' removes it).
export const REGION_REPLACEMENTS = {
  // Client Call 1 — The King Fights Back
  'king-moves': [
    "// The King's moves and phases.",
    'export function chooseTelegraph() {',
    '  return null;',
    '}',
    '',
    'export function executeTelegraph() {}',
    '',
    'export function checkBossThresholds() {}',
  ].join('\n'),
  'king-skips-basic-attack': '',
  'boss-view': 'boss: null,',
  'telegraph-panel': '',
  'boss-targets': 'const targetCards = state.enemies;',
  'boss-panel': '',
  // Client Call 2 — Private Orders
  'companion-orders': '',
  'order-parsing': '',
  'order-import': '',
  'whisper-parse': '',
  'whisper-orders': '',
  'whisper-delivery': '',
  'whisper-listener': '',
};
