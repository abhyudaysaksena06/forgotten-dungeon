// Static game data for the Quest — "The Shattered Heart".
// `model` keys are what the 3D client looks up (client/public/models/<model>.glb).

// The four Runewrights. The player picks one to lead; the other three follow as AI companions.
export const CLASSES = {
  knight: {
    name: 'Kael',
    title: 'Kael the Knight',
    role: 'Defence · melee',
    model: 'char_kael',
    hp: 150,
    atk: 9,
    def: 12,
    reach: 'melee',
    startingItem: 'Iron Sword',
    bio: 'A soldier whose grandfather served King Aldric. Brave, honest, a little stubborn.',
    skill: { id: 'bulwark', name: 'Bulwark', cooldown: 3, target: 'none', text: 'The party takes half damage this round and enemies aim at Kael.' },
  },
  mage: {
    name: 'Lyra',
    title: 'Lyra the Mage',
    role: 'Healer · magic',
    model: 'char_lyra',
    hp: 85,
    atk: 13,
    def: 4,
    reach: 'magic',
    startingItem: 'Spark Staff',
    bio: 'A young scholar who taught herself to read runes. Curious, clever, talks to herself.',
    skill: { id: 'mend', name: 'Mend', cooldown: 2, target: 'ally', text: 'Heals an ally for 35, or revives a Fallen ally at 30% HP.' },
  },
  rogue: {
    name: 'Rook',
    title: 'Rook the Rogue',
    role: 'Striker · melee',
    model: 'char_rook',
    hp: 120,
    atk: 14,
    def: 7,
    reach: 'melee',
    startingItem: 'Lockpick',
    bio: 'A thief who came for treasure and stayed for the truth. Funny, quick, secretly kind.',
    skill: { id: 'twin_strike', name: 'Twin Strike', cooldown: 3, target: 'enemy', text: 'A sure double-damage blow.' },
  },
  ranger: {
    name: 'Mira',
    title: 'Mira the Ranger',
    role: 'Long range',
    model: 'char_mira',
    hp: 95,
    atk: 12,
    def: 5,
    reach: 'ranged',
    startingItem: 'Hunting Bow',
    bio: 'A hunter who followed the shadow creatures up to the surface. Calm, patient, sharp-eyed.',
    skill: { id: 'volley', name: 'Volley', cooldown: 3, target: 'none', text: 'Hits every enemy for 70% damage, including flyers.' },
  },
};

export const PARTY_ORDER = ['knight', 'mage', 'rogue', 'ranger'];

// Whoever leads is the Runewright: only the leader's Rune Strike can break Morvath's shadow armour.
export const RUNE_STRIKE = { name: 'Rune Strike', cooldown: 3, text: 'A sure strike that rewrites a broken rune. Only it can break Morvath’s shadow armour.' };

// Melee can't reach flying enemies; magic and ranged can. Magic ignores half of DEF.
export const CAN_HIT_FLYING = new Set(['magic', 'ranged']);

// `part`: drops a monster part for Pip (`partEvery: n`: every n-th of its kind in a fight). `yieldsAt`: gives up (counts as beaten) below this HP share.
export const ENEMIES = {
  // Skeletons are the villains. All three look and are named alike; their numbers differ so each
  // fight keeps its balance: six in every room, six brittle guards before Morvath, and the two
  // Morvath raises in phase 2 (with the stats of the Shadow Crawlers they replace).
  skeleton: { name: 'Skeleton', model: 'enemy_skeleton', hp: 65, atk: 12, def: 5, part: true, partEvery: 2 },
  skeleton_guard: { name: 'Skeleton', model: 'enemy_skeleton', hp: 10, atk: 0, def: 0 },
  skeleton_risen: { name: 'Skeleton', model: 'enemy_skeleton', hp: 34, atk: 11, def: 3, part: true },
  // No room places these any more; the engine still knows their moves.
  shadow_crawler: { name: 'Shadow Crawler', model: 'enemy_shadow_crawler', hp: 34, atk: 11, def: 3, part: true },
  stone_sentinel: { name: 'Stone Sentinel', model: 'boss_stone_sentinel', hp: 150, atk: 16, def: 6, boss: true, move: 'charge' },
  ink_bat: { name: 'Ink Bat', model: 'enemy_ink_bat', hp: 26, atk: 10, def: 1, flying: true },
  hollow_scribe: { name: 'Hollow Scribe', model: 'enemy_hollow_scribe', hp: 40, atk: 13, def: 4 },
  ink_wraith: { name: 'The Ink Wraith', model: 'boss_ink_wraith', hp: 160, atk: 17, def: 4, boss: true, flying: true, move: 'drain', hides: true },
  trial_spirit: { name: 'Trial Spirit', model: 'enemy_trial_spirit', hp: 48, atk: 14, def: 5 },
  brakka: { name: 'Brakka the Warrior', model: 'boss_brakka', hp: 210, atk: 18, def: 7, boss: true, move: 'slam', yieldsAt: 0.2, counter: true },
  hollow_knight: { name: 'Hollow Knight', model: 'enemy_hollow_knight', hp: 50, atk: 15, def: 6, part: true },
  hollow_captain: { name: 'The Hollow Captain', model: 'boss_hollow_captain', hp: 240, atk: 19, def: 9, boss: true, move: 'shadow_tide' },
  // atk is not used in combat (Morvath only uses his telegraphed moves); it feeds threat estimates.
  morvath: { name: 'Morvath, the Shadow Knight', model: 'boss_morvath_knight', hp: 725, atk: 34, def: 8, boss: true, ultimate: true },
};

// The rulebook's five rounds, one room each. Rooms 1–4: six skeletons. Room 5: six skeleton
// guards, then Morvath.
const SKELETONS = Array(6).fill('skeleton');
export const ROOMS = {
  r1: { round: 1, roundName: 'The Entrance', name: 'The Gate Courtyard', tier: 1, model: 'room_1', npc: 'grum', waves: [SKELETONS], loot: { gold: 40, potions: 1 } },
  r2: { round: 2, roundName: 'The Forgotten Hall', name: 'The Hall of Portraits', tier: 2, model: 'room_2', npc: 'ilsa', waves: [SKELETONS], loot: { gold: 60, potions: 1 } },
  r3: { round: 3, roundName: 'The Trial Chambers', name: 'The Hall of Trials', tier: 3, model: 'room_3', npc: 'seraphine', waves: [SKELETONS], loot: { gold: 80, potions: 2 } },
  r4: { round: 4, roundName: 'The Shadow Depths', name: 'The Hollow Barracks', tier: 4, model: 'room_4', npc: 'corin', waves: [SKELETONS], loot: { gold: 100, potions: 2 } },
  r5: { round: 5, roundName: 'The Boss Round', name: 'The Throne of Eternity', tier: 6, model: 'room_5', npc: 'king', waves: [Array(6).fill('skeleton_guard'), ['morvath']], loot: { gold: 0, potions: 0 }, final: true },
};
export const ROOM_IDS = ['r1', 'r2', 'r3', 'r4', 'r5'];
export const CAMP = 'camp';

// Non-player characters. They talk; Pip also trades.
export const NPCS = {
  king: { name: 'King Aldric', title: 'Ghost of the last King', model: 'npc_king_ghost' },
  grum: { name: 'Old Grum', title: 'The Gatekeeper', model: 'npc_grum' },
  ilsa: { name: 'Ilsa', title: 'The Ink-Keeper', model: 'npc_ilsa' },
  venn: { name: 'Venn', title: 'The Scholar', model: 'npc_venn' },
  seraphine: { name: 'Seraphine', title: 'The Oracle', model: 'npc_seraphine' },
  corin: { name: 'Sir Corin', title: 'The last loyal knight', model: 'npc_corin' },
  pip: { name: 'Pip', title: 'Goblin dungeon cook', model: 'npc_pip' },
};

// Corridors. Travel costs one torch per corridor on the shortest path.
// A cleared room's waystone links it to the camp (one torch).
export const EDGES = [
  ['camp', 'r1'],
  ['camp', 'r2'],
  ['r1', 'r2'],
  ['r1', 'r3'],
  ['r2', 'r4'],
  ['r3', 'r4'],
  ['r3', 'r5'],
  ['r4', 'r5'],
];

export const FRAGMENTS_FOR_THRONE = 3;

// ---------- lanes ----------
// Every fight has three lanes across the room. Each hero stands in one; the player's lane comes
// with each input (where they walked to). Bosses mark lanes a round ahead; standing elsewhere dodges.
export const LANES = ['left', 'centre', 'right'];
export const START_LANES = { knight: 'centre', mage: 'centre', rogue: 'left', ranger: 'right' };
// How often a companion steps out of a marked lane on their own (moderate: not always).
export const DODGE_CHANCE = 0.7;
// Boss mechanics.
export const MECHANICS = {
  charge: { mult: 1.6, lanes: 1 }, // Stone Sentinel: the most crowded lane
  shadow_tide: { mult: 0.8, lanes: 2, poison: true }, // Hollow Captain: two of three lanes
  breathLanes: 2, // Morvath's Dragon's Breath covers two of three lanes
  summonFeed: 10, // each living Skeleton heals Morvath this much a round in phase 2
  hide: { every: 4, rounds: 2 }, // Ink Wraith hides in one lane's portrait
  counter: { every: 4, rounds: 2, reflect: 0.5 }, // Brakka's counter stance
};

// Difficulty rises with the room's tier and with how far the run has progressed.
export const TIER_SCALE = 0.12;
export const PROGRESS_SCALE = 0.06;
// Morvath grows by this share for every room cleared beyond the three that open the Throne, so
// clearing everything first earns XP but also wakes him further.
export const FINAL_GROWTH = 0.35;

export const XP_PER_TIER = 70;
export const LEVEL_GROWTH = 0.08;

// Camp preparations. Each is a readiness choice the random forest judges.
export const POWER_UPS = {
  rest: { name: 'Rest by the campfire', torches: 1, gold: 0, text: 'Full heal and revive the whole party.' },
  altar: { name: 'The Rune Altar', torches: 1, gold: 30, text: '+3 ATK and +3 DEF for one hero.' },
  forge: { name: 'The Old Forge', torches: 0, gold: 50, text: '+5 ATK for one hero.' },
};

// Pip's pot: trades at the camp. They cost no torches.
export const PIP = {
  potion: { gold: 25, parts: 0, text: 'A Health Potion (restores 40 HP).' },
  meal: { gold: 0, parts: 3, text: 'A Monster Meal from 3 monster parts (restores 70 HP).' },
};

export const POTION_HEAL = 40;
export const MEAL_HEAL = 70;
export const POISON_DAMAGE = 4;
export const POISON_ROUNDS = 3;

// Morvath: shadow armour blocks all damage until the leader's Rune Strike breaks it.
// Phase 1 Shadow Knight (100–60%), Phase 2 the Change (60–30%: dragon, summons 2
// Skeletons, hits harder), Phase 3 Dragon's Breath (<30%: charges, then breathes, alternately).
export const MORVATH = {
  armourRegrowRounds: 3,
  changeAt: 0.6,
  breathAt: 0.3,
  dragonName: 'Morvath, the Shadow Dragon',
  dragonModel: 'boss_morvath_dragon',
  moves: {
    shadow_blade: { name: 'Shadow Blade', damage: 36, all: false, phase: 1 },
    sweep: { name: 'Black Sweep', damage: 15, all: true, phase: 1 },
    claw: { name: 'Dragon Claw', damage: 36, all: false, phase: 2 },
    shadowflame: { name: 'Shadowflame', damage: 14, all: true, poison: true, phase: 2 },
    charge: { name: 'Draws in Shadow-Fire', damage: 0, all: true, phase: 3 },
    breath: { name: 'Dragon’s Breath', damage: 48, all: true, phase: 3 },
  },
};
