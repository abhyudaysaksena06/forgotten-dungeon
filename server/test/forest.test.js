// Organiser-side: the Node forest must give the same answers as scikit-learn did.
// Lives outside test/quest/ because the judge model never ships to participants.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FEATURE_NAMES } from '../src/quest/features.js';
import { loadForest, predictGood } from '../src/quest/forest.js';

const forest = loadForest();

test('the exported random forest matches scikit-learn on its check vectors', { skip: !forest && 'no model trained yet' }, () => {
  assert.deepEqual(forest.features, FEATURE_NAMES, 'feature order must match features.js');
  for (const { x, p } of forest.checks) assert.ok(Math.abs(predictGood(forest, x) - p) < 1e-4, `expected ${p}, got ${predictGood(forest, x)}`);
});

test('the forest beats always guessing the majority answer on unseen teams', { skip: !forest && 'no model trained yet' }, () => {
  assert.ok(forest.metrics.test_accuracy > forest.metrics.majority_baseline + 0.1);
});
