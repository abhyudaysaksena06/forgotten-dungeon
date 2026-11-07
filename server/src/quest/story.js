// Scripted lines for the Dungeon Master and the NPCs (from the Story Bible: "The Shattered Heart").
// The engine adds them to the chronicle; nothing here changes a number.

export const INTRO = [
  'Long ago, the kingdom of Eldermoor lived around the Heart of Eternity, a crystal that could grant one wish.',
  'Morvath, the King’s guardian, wished his dying King would never die. The Heart broke into five pieces, the kingdom sank, and Morvath became a Shadow Dragon.',
  'King Aldric: “The Heart is broken. The shadows are waking. Only one who can rewrite what was written wrong may enter.”',
];

export const LEAD_LINES = {
  knight: 'Kael: “My grandfather served this King. I will finish what he started.”',
  mage: 'Lyra: “Runes everywhere… and every one of them written wrong. Fascinating.”',
  rogue: 'Rook: “I came for treasure. Fine — I’ll take a kingdom’s worth of truth instead.”',
  ranger: 'Mira: “I followed the shadows up here. Now I follow them down.”',
};

export const ROOM_LINES = {
  r1: {
    enter: ['Old Grum: “Another one? The last visitor came four hundred years ago. He didn’t leave.”', 'Old Grum: “The runes on my gate are wrong. Wrong runes make wrong things. Mind the courtyard.”'],
    clear: ['Old Grum: “Hm. You fixed it. Take the fragment — it was stuck in my lock anyway.”', 'Far below, something huge breathes. Grum mutters: “The Dragon is dreaming again.”'],
  },
  r2: {
    enter: ['Ilsa: “The answer is written somewhere in these portraits… I painted half of them myself. Why can’t I remember?”', 'One portrait shows two young men laughing together: the King and Morvath, as friends.'],
    clear: ['Ilsa: “Friendship. That was the word. The Royal Diary tells how the Heart broke… and here is a piece of it.”'],
  },
  r3: {
    enter: ['Seraphine: “Three trials guard the Heart. Strength, wisdom, judgment. The corruption has made us… unkind.”', 'Venn: “Bring me the right page, Runewright. Or the wrong one. I will know.”'],
    clear: ['Brakka laughs and lowers his axe: “Hit hard enough. It counts.”', 'Seraphine: “The truth lies in the shadows. Take the third fragment.”'],
  },
  r4: {
    enter: ['Sir Corin: “Morvath isn’t hiding with the shadows. He became one. The Heart turned him into a dragon… and the King never blamed him.”'],
    clear: ['Sir Corin: “The Captain is down. The Fortress Gate is open. Go — and spare him if you can.”'],
  },
  r5: {
    enter: ['Morvath: “You fixed my dungeon, Runewright. Clever. But some wishes cannot be undone.”'],
    clear: [],
  },
};

export const CAMP_LINES = {
  first: 'King Aldric (a faint blue light): “Find the fragments, Runewright. I will explain everything.”',
  pip: 'Pip: “Crawler legs? Lovely. Bring me three and I’ll make you a stew.”',
};

export const MORVATH_LINES = {
  change: 'Morvath’s armour bursts open. Scales, wings, a broken crown of shadow: the Shadow Dragon rises!',
  breath: 'Morvath breathes in. Shadow-fire gathers in his throat — brace for the blast!',
};

export const ENDING = [
  'The dragon’s body crumbles into black ash. Out of it falls Morvath, a man again.',
  'King Aldric: “You did not fail me, old friend. You only loved me too much.”',
  'Morvath: “I broke everything… for nothing.”',
  'King Aldric: “Not for nothing. Someone came to fix it.”',
  'The runes are restored. The Heart beats again. Eldermoor remembers its Runewright. Victory!',
];

export const DEFEAT_LINE = 'The last torch gutters out. The shadows claim another soul… but runes can always be rewritten.';
