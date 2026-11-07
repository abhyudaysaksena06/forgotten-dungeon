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
