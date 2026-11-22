export const SPECIALTY_BONUS = 3;

export const SKILLS = {
  might: 'Might',
  arcana: 'Arcana',
  cunning: 'Cunning',
  wisdom: 'Wisdom',
};

// cooldown N: used in round r, usable again in round r + N (out of combat, a scene counts as a round).
export const CLASSES = {
  warrior: {
    name: 'Warrior',
    hp: 120,
    atk: 12,
    def: 8,
    specialty: 'might',
    ability: {
      id: 'shield_wall',
      name: 'Shield Wall',
      cooldown: 3,
      combatOnly: true,
      target: 'none',
      description: 'The whole party takes half damage this round.',
    },
    startingItems: ['health_potion', 'health_potion', 'torch'],
  },
  mage: {
    name: 'Mage',
    hp: 80,
    atk: 16,
    def: 3,
    specialty: 'arcana',
    ability: {
      id: 'arcane_burst',
      name: 'Arcane Burst',
      cooldown: 3,
      combatOnly: true,
      target: 'none',
      description: 'Strikes every enemy at once. Cannot miss.',
    },
    startingItems: ['health_potion', 'health_potion', 'antidote'],
  },
  rogue: {
    name: 'Rogue',
    hp: 90,
    atk: 11,
    def: 5,
    specialty: 'cunning',
    ability: {
      id: 'scout',
      name: 'Scout',
      cooldown: 2,
      combatOnly: false,
      target: 'enemy',
      description: 'Out of combat: reveals every DC and the next room. In combat: a strike that cannot miss.',
    },
    startingItems: ['health_potion', 'health_potion', 'torch'],
  },
  healer: {
    name: 'Healer',
    hp: 95,
    atk: 7,
    def: 5,
    specialty: 'wisdom',
    ability: {
      id: 'mend',
      name: 'Mend',
      cooldown: 2,
      combatOnly: false,
      target: 'ally',
      description: '+20 HP to an ally, or revives a Fallen ally at 20 HP.',
    },
    startingItems: ['health_potion', 'health_potion', 'antidote', 'revive_charm'],
  },
};

export function checkBonus(cls, skill) {
  return CLASSES[cls]?.specialty === skill ? SPECIALTY_BONUS : 0;
}
