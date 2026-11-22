// The Curse Ledger. Each Curse has a tagged test in server/test or client/test named "[ID] ...";
// the judge runner lifts a Curse when its tests pass.
export const CURSES = [
  { id: 'E1', tier: 'easy', points: 25, name: 'The Silent Blade', symptom: 'The Attack button does nothing.' },
  { id: 'E2', tier: 'easy', points: 25, name: 'The Lying Vial', symptom: 'HP bars show the wrong amount.' },
  { id: 'E3', tier: 'easy', points: 25, name: 'The Blank Die', symptom: 'Dice show NaN.' },
  { id: 'E4', tier: 'easy', points: 25, name: 'The Sealed Door', symptom: 'Lowercase or spaced run codes fail to open.' },
  { id: 'M1', tier: 'medium', points: 50, name: 'The Hasty Council', symptom: 'The vote closes before the hero can vote.' },
  { id: 'M2', tier: 'medium', points: 50, name: 'The Amnesiac Oracle', symptom: 'The DM forgets HP, items and shards.' },
  { id: 'M3', tier: 'medium', points: 50, name: 'The Echoing Strike', symptom: 'A double-click runs an action twice.' },
  { id: 'M4', tier: 'medium', points: 50, name: 'The Doppelganger', symptom: 'Refreshing the page loses or duplicates your hero.' },
  { id: 'A1', tier: 'advanced', points: 75, name: 'The Open Gate', symptom: 'Anyone (even a spectator) can act in any run.' },
  { id: 'A2', tier: 'advanced', points: 75, name: 'The Gullible Scribe', symptom: 'The server trusts client HP and damage.' },
  { id: 'A3', tier: 'advanced', points: 75, name: 'The Shared Dream', symptom: 'Rooms share global state.' },
  { id: 'A4', tier: 'advanced', points: 75, name: 'The Bottomless Flask', symptom: 'Parallel Use Item drinks one potion twice.' },
  { id: 'R1', tier: 'relic', points: 50, name: 'The Puppet King', symptom: 'The server obeys the AI saying "you win" or changing HP.' },
  { id: 'R2', tier: 'relic', points: 50, name: 'The Exposed Rune', symptom: 'The API key leaks to the frontend or a committed .env.' },
];

