// Scripted lines for the Dungeon Master and the camp's NPCs (from the Story Bible: "The Shattered Heart").
// The rooms have no NPCs now: Kael goes alone, and each room's cage holds a Healer and a Weaponsmith.
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
    enter: ['The gate grinds open on a courtyard of bones. Six skeletons turn their skulls towards Kael.', 'At the side, behind iron bars, two figures wait in a locked cage: a Healer and a Weaponsmith.'],
    clear: ['The last skeleton falls apart, and the runes on the gate turn gold. The cage opens once no broken rune is left in this round.'],
  },
  r2: {
    enter: ['The Hall of Portraits. Painted eyes follow Kael; six skeletons step out of the frames.', 'One portrait shows two young men laughing together: the King and Morvath, as friends.'],
    clear: ['The hall falls silent. The cage at its side opens once no broken rune is left in this round.'],
  },
  r3: {
    enter: ['The Hall of Trials: a cathedral of candles around the Hollow Saint’s tomb. Six skeletons rise from the dais.'],
    clear: ['The last skeleton falls apart, and the chamber goes quiet. The cage by the tomb opens once no broken rune is left in this round.'],
  },
  r4: {
    enter: ['The Hollow Barracks. Chains sway overhead; six skeletons stand to attention, swords drawn.'],
    clear: ['Their line is broken. The Fortress Gate is open; the cage at the barracks wall opens once no broken rune is left in this round.'],
  },
  r5: {
    enter: ['Morvath: “You fixed my dungeon, Runewright. Clever. But some wishes cannot be undone.”'],
    clear: [],
  },
};

export const CAMP_LINES = {
  first: 'King Aldric (a faint blue light): “Find the fragments, Runewright. I will explain everything.”',
  pip: 'Pip: “Skeleton bones? Lovely. Bring me three and I’ll make you a stew.”',
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
