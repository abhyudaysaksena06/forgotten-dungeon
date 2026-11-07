// The Quest's bug pool ("corrupted runes"), grouped by the rulebook's five rounds.
// Each team draws a mix per round (see ROUND_MIX and scripts/quest-teams.mjs), so every team has
// several bugs in every round at the same total difficulty.
// A blocker makes the run impossible to finish; a hindrance makes it much harder.
// Every `find` must match the clean source exactly once; run scripts/quest-verify.mjs after
// changing the clean code. `hints` are the three hint levels teams can buy with CTF tokens.

const E = 'server/src/quest/engine.js';
const RUNS = 'server/src/quest/runs.js';

export const ROUNDS = {
  1: 'The Entrance — action handling, navigation, initial state',
  2: 'The Forgotten Hall — interactions, room transitions, responses to actions',
  3: 'The Trial Chambers — turn order, inventory, health, NPC logic',
  4: 'The Shadow Depths — combat, shared state, repeated actions, progression',
  5: 'The Boss Round — boss combat, health, victory and completion',
};

// How many of each kind every team gets per round.
export const ROUND_MIX = {
  1: { blocker: 1, hindrance: 1 },
  2: { hindrance: 2 },
  3: { hindrance: 2 },
  4: { blocker: 1, hindrance: 1 },
  5: { blocker: 1, hindrance: 1 },
};

export const POINTS = { blocker: 100, hindrance: 60 };

export const QUEST_BUGS = [
  // ---------- Round 1: The Entrance ----------
  {
    id: 'Q01',
    round: 1,
    name: 'Wrong Hands',
    kind: 'blocker',
    symptom: 'You choose one hero but steer the next one in line. Rune Strike from that hero never breaks Morvath’s armour.',
    patches: [{ file: E, find: '  const leader = state.party[PARTY_ORDER.indexOf(memberId)];', replace: '  const leader = state.party[(PARTY_ORDER.indexOf(memberId) + 1) % PARTY_ORDER.length];' }],
    hints: [
      'Check which hero the party cards say you control right after choosing your leader.',
      'Look at how the leader is chosen in the quest engine (the `lead` function).',
      'The hero you control should be the exact one you picked; compare the index used with the id stored as the leader.',
    ],
  },
  {
    id: 'Q02',
    round: 1,
    name: 'Turncoat Buttons',
    kind: 'hindrance',
    symptom: 'Attack makes the hero defend; Defend tries to attack and errors.',
    patches: [{ file: RUNS, find: "  attack: 'attack',\n  defend: 'defend',", replace: "  attack: 'defend',\n  defend: 'attack'," }],
    hints: [
      'Press Attack and read what the chronicle says your hero did.',
      'Inputs pass through a translation table before reaching the engine (server/src/quest/runs.js).',
      'Each input name should map to the action of the same name.',
    ],
  },
  {
    id: 'Q11',
    round: 1,
    name: 'Long Way Round',
    kind: 'blocker',
    symptom: 'Every journey burns twice the torches shown, so the party runs out of light.',
    patches: [{ file: E, find: '  state.torches -= cost;', replace: '  state.torches -= cost * 2;' }],
    hints: [
      'Compare the torch cost shown on the map with how many torches you have after the trip.',
      'Look at the `travel` function in the quest engine.',
      'A journey should cost exactly the corridor distance, the same number the map shows.',
    ],
  },
  {
    id: 'Q13',
    round: 1,
    name: 'Dead Waystones',
    kind: 'hindrance',
    symptom: 'Cleared rooms no longer link back to the camp, so every return trip is long.',
    patches: [{ file: E, find: '  for (const r of state.fragments) link(CAMP, r); // waystones', replace: '  for (const r of state.fragments) link(r, r); // waystones' }],
    hints: [
      'After clearing a room, check the torch cost of going back to the camp.',
      'Distances come from the corridor graph built in the quest engine.',
      'A cleared room’s waystone should connect that room to the camp.',
    ],
  },

  // ---------- Round 2: The Forgotten Hall ----------
  {
    id: 'Q07',
    round: 2,
    name: 'Cursed Altar',
    kind: 'hindrance',
    symptom: 'The Rune Altar says +3 ATK but takes 3 ATK away.',
    patches: [{ file: E, find: '    m.atk += 3;', replace: '    m.atk -= 3;' }],
    hints: [
      'Watch a hero’s ATK on their card before and after using the Rune Altar.',
      'Look at the camp preparations (`powerUp`) in the quest engine.',
      'The altar should raise both ATK and DEF by the amounts it announces.',
    ],
  },
  {
    id: 'Q10',
    round: 2,
    name: 'Cold Ashes',
    kind: 'hindrance',
    symptom: 'Resting heals the living but never revives the Fallen.',
    patches: [
      {
        file: E,
        find: '    for (const m of state.party) Object.assign(m, { hp: m.maxHp, fallen: false, poison: 0 });',
        replace: '    for (const m of state.party) if (!m.fallen) Object.assign(m, { hp: m.maxHp, poison: 0 });',
      },
    ],
    hints: [
      'Rest at the campfire while a companion is Fallen.',
      'Look at what resting does in `powerUp`.',
      'Resting should restore every hero, including the Fallen.',
    ],
  },
  {
    id: 'Q14',
    round: 2,
    name: 'Empty Satchel',
    kind: 'hindrance',
    symptom: 'Room loot replaces the potion count instead of adding to it.',
    patches: [{ file: E, find: '  state.potions += room.loot.potions;', replace: '  state.potions = room.loot.potions;' }],
    hints: [
      'Count your potions before and after clearing a room.',
      'Look at how rewards are given when a room is won (`winRoom`).',
      'Loot should add to what the party already carries.',
    ],
  },
  {
    id: 'Q15',
    round: 2,
    name: 'Pip’s Short Change',
    kind: 'hindrance',
    symptom: 'Pip takes your gold for a potion, but the satchel stays the same.',
    patches: [
      {
        file: E,
        find: "  if (item === 'potion') state.potions += 1;\n  else state.meals += 1;",
        replace: "  if (item === 'meal') state.meals += 1;",
      },
    ],
    hints: [
      'Buy a potion from Pip and check your gold and potion counts.',
      'Look at Pip’s `trade` function in the quest engine.',
      'Every paid trade should hand over the item that was paid for.',
    ],
  },

  // ---------- Round 3: The Trial Chambers ----------
  {
    id: 'Q06',
    round: 3,
    name: 'Selfish Mender',
    kind: 'hindrance',
    symptom: 'Lyra only heals allies who are already healthy.',
    patches: [{ file: 'server/src/quest/ai.js', find: '      if (ready && lowest && frac(lowest) < 0.55)', replace: '      if (ready && lowest && frac(lowest) > 0.55)' }],
    hints: [
      'Watch whom Lyra mends when a companion is badly hurt.',
      'Companion decisions live in server/src/quest/ai.js.',
      'The healer should mend the most wounded ally when they drop low.',
    ],
  },
  {
    id: 'Q16',
    round: 3,
    name: 'Lonely Bulwark',
    kind: 'hindrance',
    symptom: 'Bulwark protects only Kael; the rest of the party takes full damage.',
    patches: [{ file: E, find: '  if (state.combat?.bulwark) dmg = Math.ceil(dmg / 2);', replace: "  if (state.combat?.bulwark && m.id === 'knight') dmg = Math.ceil(dmg / 2);" }],
    hints: [
      'Compare the damage the party takes in a Bulwark round with a normal round.',
      'Damage to heroes goes through the `hurt` function in the quest engine.',
      'Bulwark halves damage for the whole party, not just the knight.',
    ],
  },
  {
    id: 'Q17',
    round: 3,
    name: 'Watered Potion',
    kind: 'hindrance',
    symptom: 'Health Potions restore almost nothing.',
    patches: [{ file: 'server/src/quest/data.js', find: 'export const POTION_HEAL = 40;', replace: 'export const POTION_HEAL = 4;' }],
    hints: [
      'Drink a potion and check how much HP comes back.',
      'Healing amounts are game data, shared by the map and combat.',
      'A Health Potion should restore 40 HP.',
    ],
  },

  // ---------- Round 4: The Shadow Depths ----------
  {
    id: 'Q04',
    round: 4,
    name: 'Iron Skin',
    kind: 'blocker',
    symptom: 'From the second room on, enemies shrug off almost every blow.',
    patches: [{ file: E, find: '    def: Math.round(t.def * (1 + (scale - 1) / 3)),', replace: '    def: Math.round(t.def * (1 + (scale - 1) * 10)),' }],
    hints: [
      'Check enemy DEF in later rooms against early ones.',
      'Enemy stats are created in `spawn` in the quest engine.',
      'Armour should grow gently with tier and progress, not tenfold.',
    ],
  },
  {
    id: 'Q05',
    round: 4,
    name: 'Short Memory',
    kind: 'blocker',
    symptom: 'After a server restart (needed after every fix) a long run rewinds.',
    patches: [
      {
        file: RUNS,
        find: '      { teamId, profileHash: profileHash(this.profile(teamId)), actions: run.actions, turn:',
        replace: '      { teamId, profileHash: profileHash(this.profile(teamId)), actions: run.actions.slice(-40), turn:',
      },
    ],
    hints: [
      'Play a while, restart the server, and compare where you are.',
      'Saves are written by `persist` in server/src/quest/runs.js.',
      'A save must keep every input from the start; resuming replays all of them.',
    ],
  },
  {
    id: 'Q08',
    round: 4,
    name: 'Endless Wave',
    kind: 'blocker',
    symptom: 'A fight never ends after the last enemy falls; the party is stuck in the room.',
    patches: [{ file: E, find: '  return state.combat.enemies.every((e) => e.hp <= 0);', replace: '  return state.combat.enemies.every((e) => e.hp < 0);' }],
    hints: [
      'Defeat every enemy in a room and see whether the next wave or the reward comes.',
      'Look at how the engine decides a wave is cleared.',
      'A defeated enemy sits at exactly 0 HP.',
    ],
  },
  {
    id: 'Q19',
    round: 4,
    name: 'Echoing Cooldown',
    kind: 'hindrance',
    symptom: 'When any hero uses a skill, every hero’s skill goes on cooldown.',
    patches: [
      {
        file: E,
        find: '      m.cooldown = skill.cooldown + 1; // ticks down at the end of this round',
        replace: '      for (const p of state.party) p.cooldown = skill.cooldown + 1; // ticks down at the end of this round',
      },
    ],
    hints: [
      'Use a skill and look at every party card’s cooldown.',
      'Skills are handled in `act` in the quest engine.',
      'A cooldown belongs to the hero who used the skill.',
    ],
  },
  {
    id: 'Q18',
    round: 4,
    name: 'Stingy Lessons',
    kind: 'hindrance',
    symptom: 'Every room pays only the first room’s XP, so the party levels far too slowly for the later rooms.',
    patches: [{ file: E, find: '  gainXp(state, XP_PER_TIER * room.tier);', replace: '  gainXp(state, XP_PER_TIER);' }],
    hints: [
      'Clear a room and compare the XP the chronicle promises with what the heroes actually gain.',
      'Room rewards are handed out in `winRoom`; experience goes through `gainXp`.',
      'A harder room should teach more: the XP should grow with the room’s tier.',
    ],
  },

  // ---------- Round 5: The Boss Round ----------
  {
    id: 'Q03',
    round: 5,
    name: 'The Sealed Throne',
    kind: 'blocker',
    symptom: 'The Throne of Eternity never opens, however many fragments the party holds.',
    patches: [
      { file: E, find: '  ROOMS,\n  RUNE_STRIKE,', replace: '  ROOMS,\n  ROOM_IDS,\n  RUNE_STRIKE,' },
      { file: E, find: '  return state.fragments.length >= FRAGMENTS_FOR_THRONE;', replace: '  return state.fragments.length >= ROOM_IDS.length;' },
    ],
    hints: [
      'Hold three Heart fragments and look for the Throne on the map.',
      'Look at `throneOpen` in the quest engine.',
      'The Throne opens with FRAGMENTS_FOR_THRONE fragments.',
    ],
  },
  {
    id: 'Q09',
    round: 5,
    name: 'Unbreakable Armour',
    kind: 'blocker',
    symptom: 'Rune Strike never breaks Morvath’s shadow armour.',
    patches: [{ file: E, find: '    if (rune && attacker.id === state.leaderId) {', replace: '    if (rune && attacker.id === state.leaderID) {' }],
    hints: [
      'Use Rune Strike on Morvath and read what the chronicle says.',
      'The armour check is in `hitEnemy` in the quest engine.',
      'Compare the property names used there with the ones the state actually has.',
    ],
  },
  {
    id: 'Q12',
    round: 5,
    name: 'Spent Rune',
    kind: 'blocker',
    symptom: 'The player’s Rune Strike never recharges after its first use.',
    patches: [{ file: E, find: '    if (m.runeCooldown > 0) m.runeCooldown -= 1;', replace: '    if (m.runeCooldown > 0 && !m.controlled) m.runeCooldown -= 1;' }],
    hints: [
      'Use Rune Strike, then watch its cooldown over the next rounds.',
      'Cooldowns tick down in `endOfRound` in the quest engine.',
      'Every hero’s Rune Strike cooldown should tick down, the player’s included.',
    ],
  },
  {
    id: 'Q21',
    round: 5,
    name: 'No Victory',
    kind: 'blocker',
    symptom: 'When Morvath falls, the quest never ends: the party is left standing on the map.',
    patches: [{ file: E, find: "    state.phase = 'victory';", replace: "    state.phase = 'map';" }],
    hints: [
      'Defeat Morvath and see whether the ending plays.',
      'Look at what happens when the final room is won (`winRoom`).',
      'Winning the final room should end the run in victory.',
    ],
  },
  {
    id: 'Q20',
    round: 5,
    name: 'Fire Through Shields',
    kind: 'hindrance',
    symptom: 'Defending does nothing against Dragon’s Breath.',
    patches: [
      {
        file: E,
        find: '  for (const m of targets) {\n    hurt(state, m, move.damage, move.name);',
        replace: "  for (const m of targets) {\n    if (t.move === 'breath') m.defending = false;\n    hurt(state, m, move.damage, move.name);",
      },
    ],
    hints: [
      'Defend on the turn Dragon’s Breath lands and compare the damage.',
      'Morvath’s moves are carried out in `morvathTurn`.',
      'Defend should halve Dragon’s Breath like any other hit.',
    ],
  },
  {
    id: 'Q22',
    round: 5,
    name: 'Hasty Armour',
    kind: 'hindrance',
    symptom: 'Rune Strike says Morvath can be hurt for 3 rounds, but his armour is back after 2.',
    patches: [{ file: E, find: '    if (!boss.armoured && --boss.armourDown <= 0) {', replace: '    if (!boss.armoured && --boss.armourDown <= 1) {' }],
    hints: [
      'Count the rounds between Rune Strike and “The shadow armour knits itself back together”.',
      'The armour grows back at the end of a round, in `endOfRound`.',
      'The countdown starts at `MORVATH.armourRegrowRounds`; the armour should return only when it reaches zero.',
    ],
  },
];

for (const bug of QUEST_BUGS) bug.points = POINTS[bug.kind];

export const BUG_IDS = QUEST_BUGS.map((b) => b.id);
export const bugById = (id) => QUEST_BUGS.find((b) => b.id === id);
