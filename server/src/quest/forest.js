// Evaluates the exported random forest (trained in ml/train_forest.py) in Node.
// Each tree is flat arrays; a leaf has left === -1 and holds P(good choice).
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const DEFAULT_MODEL = fileURLToPath(new URL('./model/route-forest.json', import.meta.url));

export function loadForest(path = DEFAULT_MODEL) {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8'));
}

function treeProb(tree, x) {
  let node = 0;
  while (tree.left[node] !== -1) {
    // scikit-learn compares features as 32-bit floats; do the same so the two agree exactly.
    node = Math.fround(x[tree.feature[node]]) <= tree.threshold[node] ? tree.left[node] : tree.right[node];
  }
  return tree.p[node];
}

export function predictGood(forest, x) {
  let sum = 0;
  for (const tree of forest.trees) sum += treeProb(tree, x);
  return sum / forest.trees.length;
}
