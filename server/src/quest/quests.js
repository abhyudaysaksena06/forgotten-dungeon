// The quest log: what the people of Eldermoor ask of the party. It is worked out from the run's
// state on every view, so it never changes the rules, the dice or the judging; it only tells the
// player what to do next, the way a quest log does in any dungeon game.
import { CAMP, ENEMIES, FRAGMENTS_FOR_THRONE, NPCS, ROOMS, XP_PER_TIER } from './data.js';

const cleared = (s, room) => s.fragments.includes(room);
const fightingIn = (s, room) => s.phase === 'combat' && s.combat?.roomId === room;
const the = (name) => (name.startsWith('The ') ? `the ${name.slice(4)}` : /^[A-Z][a-z]+ the /.test(name) ? name : `the ${name}`);
const waveDone = (s, room, i) => cleared(s, room) || (fightingIn(s, room) && s.combat.waveIndex > i);

function roomQuest({ id, room, giver, title, text, opensWhen }) {
  const r = ROOMS[room];
  const [minions, [bossKind]] = r.waves;
  const counts = {};
  for (const k of minions) counts[k] = (counts[k] ?? 0) + 1;
  const minionText = Object.entries(counts)
    .map(([k, n]) => `${n} ${ENEMIES[k].name}${n > 1 ? 's' : ''}`)
    .join(' and ');
  return {
    id,
    kind: 'room',
    room,
    giver,
    title,
    text,
    opensWhen,
    reward: `Heart fragment · ${r.loot.gold} gold · ${r.loot.potions} potion${r.loot.potions === 1 ? '' : 's'} · ${XP_PER_TIER * r.tier} XP`,
    steps: (s) => [
      { text: `Reach ${the(r.name)}`, done: cleared(s, room) || s.location === room },
      { text: `Defeat ${minionText}`, done: waveDone(s, room, 0) },
      { text: `Defeat ${the(ENEMIES[bossKind].name)}`, done: cleared(s, room) },
    ],
  };
}

export const QUESTS = [
  {
    id: 'heart',
    kind: 'main',
    giver: 'king',
    title: 'The Shattered Heart',
    text: 'Recover the five pieces of the Heart of Eternity and bring the light back to Eldermoor.',
    reward: 'Eldermoor’s freedom',
    opensWhen: () => true,
    steps: (s) => [{ text: 'Recover the Heart fragments', done: s.phase === 'victory', count: [s.fragments.length, 5] }],
  },
  roomQuest({
    id: 'gate',
    room: 'r1',
    giver: 'grum',
    title: 'Mind the Courtyard',
    text: 'Old Grum’s gate runes are wrong, and wrong runes make wrong things. Clear his courtyard.',
    opensWhen: () => true,
  }),
  roomQuest({
    id: 'portraits',
    room: 'r2',
    giver: 'ilsa',
    title: 'The Unfinished Portraits',
    text: 'Ink has come alive in the Hall of Portraits. Ilsa needs the Ink Wraith gone to remember what she painted.',
    opensWhen: () => true,
  }),
  roomQuest({
    id: 'trials',
    room: 'r3',
    giver: 'seraphine',
    title: 'The Three Trials',
    text: 'Seraphine guards the Trial Chambers. Prove your strength against Brakka the Warrior.',
    opensWhen: (s) => cleared(s, 'r1') || cleared(s, 'r2') || s.location === 'r3',
  }),
  roomQuest({
    id: 'barracks',
    room: 'r4',
    giver: 'corin',
    title: 'The Last Loyal Knight',
    text: 'Sir Corin has held the Hollow Barracks alone for four hundred years. Break the Hollow Captain’s line.',
    opensWhen: (s) => cleared(s, 'r1') || cleared(s, 'r2') || s.location === 'r4',
  }),
  {
    id: 'throne',
    kind: 'main',
    giver: 'king',
    title: 'The Throne of Eternity',
    text: 'Morvath waits on the throne he stole. Unseal it, then end his reign.',
    reward: 'The last Heart fragment',
    opensWhen: (s) => s.fragments.length >= 1,
    steps: (s) => [
      {
        text: 'Unseal the Throne with Heart fragments',
        done: s.fragments.filter((r) => !ROOMS[r].final).length >= FRAGMENTS_FOR_THRONE,
        count: [Math.min(FRAGMENTS_FOR_THRONE, s.fragments.filter((r) => !ROOMS[r].final).length), FRAGMENTS_FOR_THRONE],
      },
      { text: 'Defeat Morvath', done: s.phase === 'victory' },
    ],
  },
  {
    id: 'stew',
    kind: 'side',
    giver: 'pip',
    title: 'Monster Stew',
    text: 'Pip the goblin cook wants crawler legs. Bring three monster parts back to camp.',
    reward: 'A Monster Meal (heals 70)',
    opensWhen: (s) => s.parts > 0 || s.stats.mealsCooked > 0 || s.fragments.length > 0,
    steps: (s) => [
      { text: 'Collect monster parts', done: s.parts >= 3 || s.stats.mealsCooked > 0, count: [Math.min(3, s.stats.mealsCooked > 0 ? 3 : s.parts), 3] },
      { text: 'Cook a Monster Meal at Pip’s pot', done: s.stats.mealsCooked > 0 },
    ],
  },
  {
    id: 'lesson',
    kind: 'side',
    giver: 'venn',
    title: 'The Scholar’s Lesson',
    text: 'Venn says a Runewright who stops learning stops writing. Grow your leader to level 3.',
    reward: 'Venn’s respect',
    opensWhen: (s) => s.location === 'r3' || cleared(s, 'r3') || s.party.some((m) => m.level >= 2),
    steps: (s) => {
      const lvl = s.party.find((m) => m.id === s.leaderId)?.level ?? 1;
      return [{ text: 'Raise your leader to level 3', done: lvl >= 3, count: [Math.min(lvl, 3), 3] }];
    },
  },
];

// The player's quest log for this state: open quests first, finished ones after.
export function questLog(state) {
  if (state.phase === 'setup') return [];
  return QUESTS.filter((q) => q.opensWhen(state)).map((q) => {
    const steps = q.steps(state);
    const done = steps.every((st) => st.done);
    const at = q.room ?? null;
    return {
      id: q.id,
      kind: q.kind,
      title: q.title,
      text: q.text,
      giver: NPCS[q.giver]?.name ?? null,
      reward: q.reward,
      room: at,
      here: at ? state.location === at : q.id === 'throne' ? state.location === 'r5' : state.location === CAMP,
      steps,
      done,
    };
  });
}
