// The scripted dungeon. Same for every team; the seed only decides the dice.
//
// Choice scenes: the party votes on an option, the best-suited voter rolls the check.
//   success / critical_success -> option reward (+ scene.critSuccess on a nat 20)
//   partial                    -> pass, but the roller loses 5 HP and no reward
//   fail                       -> scene.fail hits the roller
//   critical_fail              -> scene.fail hits the whole party
// `grants` are handed out whatever the outcome, so the dungeon can never soft-lock.

export const STAGES = {
  1: { name: 'The Broken Gate', gateItem: null },
  2: { name: 'The Ashen Library', gateItem: 'iron_key' },
  3: { name: 'The Throne of the Forgotten King', gateItem: 'ancient_rune' },
};

export const PARTIAL_COST = 5;

export const SCENES = [
  {
    id: 's1-gate',
    stage: 1,
    type: 'choice',
    title: 'The Gate of Teeth',
    intro:
      'Moonlight spills through the broken teeth of a portcullis. Beyond it, the courtyard flagstones are cracked into a pattern far too regular to be an accident.',
    options: [
      { id: 'force', label: 'Heave the portcullis higher and charge through', skill: 'might', difficulty: 'medium' },
      { id: 'sneak', label: 'Step only where the dust lies undisturbed', skill: 'cunning', difficulty: 'medium' },
      {
        id: 'search',
        label: 'Kneel and read the old blood-marks on the stones',
        skill: 'wisdom',
        difficulty: 'hard',
        reward: { shard: 'shard-gate' },
      },
    ],
    fail: { damage: 10, text: 'A pressure plate clicks and rusted darts hiss from the walls.' },
    critSuccess: { item: 'health_potion' },
  },
  {
    id: 's1-courtyard',
    stage: 1,
    type: 'combat',
    title: 'The Bone Courtyard',
    intro: 'Bones knit themselves together with a sound like dry applause. The dead of the old garrison stand to attention.',
    enemies: (players) => Array.from({ length: Math.max(1, players) }, () => 'skeleton'),
    loot: ['rusty_sword'],
  },
  {
    id: 's1-guardhouse',
    stage: 1,
    type: 'choice',
    title: 'The Guardhouse',
    intro:
      'Lockers lie overturned, a strongbox squats in the corner, and a duty roster still clings to the wall. Somewhere in here is the key to the Library.',
    options: [
      { id: 'rummage', label: 'Rummage through the overturned lockers', skill: 'cunning', difficulty: 'easy' },
      { id: 'smash', label: 'Smash open the iron strongbox', skill: 'might', difficulty: 'easy' },
      {
        id: 'roster',
        label: 'Decode the faded duty roster',
        skill: 'arcana',
        difficulty: 'medium',
        reward: { shard: 'shard-roster' },
      },
    ],
    fail: { damage: 8, text: 'A nest of grave-rats boils out of the debris.' },
    critSuccess: { item: 'antidote' },
    grants: ['iron_key'],
  },
  {
    id: 's2-censers',
    stage: 2,
    type: 'choice',
    title: 'The Hall of Censers',
    intro:
      'The Iron Key turns and the Library breathes out. Bronze censers sway on chains, leaking a green smoke that smells of crushed almonds.',
    options: [
      { id: 'hold', label: 'Hold your breath and recite the warding verse', skill: 'wisdom', difficulty: 'medium' },
      { id: 'dash', label: "Sprint between the censers' pulses", skill: 'cunning', difficulty: 'medium' },
      { id: 'torch', label: 'Burn the smoke away with a Torch', requires: 'torch', noCheck: true },
    ],
    fail: { damage: 4, poison: true, text: 'The green smoke fills your lungs. Poisoned!' },
    critSuccess: { item: 'health_potion' },
  },
  {
    id: 's2-runes',
    stage: 2,
    type: 'choice',
    title: 'The Rune Lectern',
    intro:
      'A sealed book rests on a lectern of black stone. Five runes glow on its cover, and each one hums a different note.',
    options: [
      {
        id: 'decipher',
        label: 'Trace the runes in their true order',
        skill: 'arcana',
        difficulty: 'hard',
        reward: { shard: 'shard-lectern', item: 'health_potion' },
      },
      { id: 'recall', label: 'Recall the hymn the runes were carved from', skill: 'wisdom', difficulty: 'medium' },
      { id: 'pry', label: 'Pry the sealed book open by force', skill: 'might', difficulty: 'hard' },
    ],
    fail: { damage: 12, text: 'The runes flare and lightning arcs up your arms.' },
    critSuccess: { item: 'revive_charm' },
  },
  {
    id: 's2-wraith',
    stage: 2,
    type: 'combat',
    title: 'The Ash Wraith',
    intro: 'The book burns from the inside. Its ashes rise into a shape with too many fingers, clutching a glowing rune.',
    enemies: (players) => ['ash_wraith', ...Array.from({ length: Math.max(0, players - 1) }, () => 'skeleton')],
    loot: ['ancient_rune'],
    shard: 'shard-wraith',
  },
  {
    id: 's3-echoes',
    stage: 3,
    type: 'choice',
    title: 'The Hall of Echoes',
    intro:
      'The Ancient Rune sinks into the throne-room door and the seal cracks. In the hall before it, the walls whisper in a dead king\'s voice.',
    options: [
      {
        id: 'listen',
        label: "Listen to the whispers of the King's lost memories",
        skill: 'wisdom',
        difficulty: 'medium',
        reward: { shard: 'shard-echoes' },
      },
      {
        id: 'loot',
        label: 'Loot the tribute alcoves',
        skill: 'cunning',
        difficulty: 'medium',
        reward: { item: 'health_potion' },
      },
      { id: 'brace', label: 'Brace the doors and steady your weapons', skill: 'might', difficulty: 'easy', reward: { healAll: 10 } },
    ],
    fail: { damage: 8, text: 'The echoes turn to screams that rattle your bones.' },
    critSuccess: { item: 'revive_charm' },
  },
  {
    id: 's3-throne',
    stage: 3,
    type: 'boss',
    title: 'The Throne of the Forgotten King',
    intro:
      'On a throne of fused crowns sits a king made of grave-dust and grief. His eyes open. "You came to take what little I remember?"',
  },
];

export const SHARD_IDS = ['shard-gate', 'shard-roster', 'shard-lectern', 'shard-wraith', 'shard-echoes'];

export function firstSceneOfStage(stage) {
  return SCENES.findIndex((s) => s.stage === stage);
}
