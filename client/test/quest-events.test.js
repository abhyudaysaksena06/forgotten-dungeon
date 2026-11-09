import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BOSS, cuesFor, newLogLines, parseLine } from '../src/quest/events.js';

const party = [
  { id: 'knight', name: 'Kael' },
  { id: 'mage', name: 'Lyra' },
  { id: 'rogue', name: 'Rook' },
  { id: 'ranger', name: 'Mira' },
];
const state = (log, enemies = [{ id: 'shadow_crawler-0-0', name: 'Shadow Crawler A' }]) => ({ log, party, combat: { enemies } });

test('chronicle lines become actor cues', () => {
  assert.deepEqual(parseLine('Kael hits Shadow Crawler A for 14.'), [
    { who: 'Kael', kind: 'attack', amount: undefined },
    { who: 'Shadow Crawler A', kind: 'hit', amount: 14 },
  ]);
  assert.deepEqual(parseLine('Shadow Blade hits Rook for 30.')[0], { who: BOSS, kind: 'boss_strike', amount: undefined });
  assert.equal(parseLine('Poison hits Lyra for 4.').length, 1);
  assert.equal(parseLine('Kael has Fallen.')[0].kind, 'death');
  assert.equal(parseLine("Kael's Rune Strike shatters Morvath's shadow armour! He can be hurt for 3 rounds.")[1].kind, 'armour_break');
  assert.deepEqual(parseLine('The party walks to the camp (1 torch, 9 left).'), []);
});

test('only new lines are animated, even after the log is trimmed', () => {
  const a = ['x', 'y', 'z'];
  assert.deepEqual(newLogLines(state(a), state([...a, 'w'])), ['w']);
  assert.deepEqual(newLogLines(state(['p', ...a]), state([...a, 'w', 'v'])), ['w', 'v']);
});

test('a round plays in order: attacker first, then the hit', () => {
  const prev = state(['start']);
  const next = state(['start', 'Kael hits Shadow Crawler A for 14.', 'Shadow Crawler A hits Lyra for 6.']);
  const cues = cuesFor(prev, next, 1000, { step: 300 });
  const hero = cues.find((c) => c.id === 'knight');
  const skeletonHit = cues.find((c) => c.id === 'shadow_crawler-0-0' && c.kind === 'hit');
  const mageHit = cues.find((c) => c.id === 'mage');
  assert.equal(hero.kind, 'attack');
  assert.equal(skeletonHit.amount, 14);
  assert.ok(hero.at < skeletonHit.at && skeletonHit.at < mageHit.at);
});

test('the keepers, the hero and the Hell Nemesis act out their lines', () => {
  const solo = [{ id: 'knight', name: 'Kael', controlled: true }];
  const nemesis = [{ id: 'nemesis-1-0', name: 'The Hell Nemesis' }];
  const prev = { log: ['…'], party: solo, combat: { enemies: nemesis } };
  const at = (line) => cuesFor(prev, { ...prev, log: ['…', line] }, 0).map((c) => `${c.id}:${c.kind}`);
  assert.deepEqual(at('The Healer lays a hand on Kael: health and shield are whole again.'), ['keeper_healer:skill', 'knight:heal']);
  assert.deepEqual(at('The Weaponsmith hones and mends the Iron Sword: sharp and whole again.'), ['keeper_smith:attack']);
  assert.deepEqual(at('The Gate Courtyard is cleared! Heart fragment 1, 40 gold, 1 potion(s), 70 XP.'), ['knight:victory']);
  assert.deepEqual(at("Kael's Rune Strike shatters Morvath's shadow armour! He can be hurt for 3 rounds."), ['knight:rune']);
  assert.deepEqual(at('The Hell Nemesis charges down the centre lane!'), ['nemesis-1-0:charge']);
  assert.deepEqual(at('The Hell Nemesis drives its blade into the floor: hellfire bursts across every lane!'), ['nemesis-1-0:slam']);
  assert.deepEqual(at('The Hell Nemesis roars as hellfire splits its armour. It is Enraged!'), ['nemesis-1-0:transform']);
});

test('the Hollow King plunges his blade for the Shadow Tide and roars for his Skeletons', () => {
  const prev = { log: ['…'], party: [{ id: 'knight', name: 'Kael', controlled: true }], combat: { enemies: [{ id: 'hollow_king-1-0', name: 'The Hollow King' }] } };
  const at = (line) => cuesFor(prev, { ...prev, log: ['…', line] }, 0).map((c) => `${c.id}:${c.kind}`);
  assert.deepEqual(at('The Hollow King floods the left and centre lanes with a shadow tide!'), ['hollow_king-1-0:skill']);
  assert.deepEqual(at('The Hollow King roars, and the barracks answer: two Skeletons claw out of the floor!'), ['hollow_king-1-0:transform']);
});
