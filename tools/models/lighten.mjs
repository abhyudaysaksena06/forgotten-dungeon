// A light-touch shrink for finished models (rigged bosses especially): weld + error-capped
// simplify + Meshopt re-encode. Unlike `optimize.mjs full` it never flattens, joins or re-palettes,
// so skins, clips, lamps and materials are untouched — safe on a model that has already been rigged.
// The error cap (a share of the model's size, e.g. 0.0005 = 0.05%) decides what may change; the
// ratio only sets a floor so a model never loses more than 60% of its triangles in one pass.
//
//   node lighten.mjs boss_nemesis 0.0005            # rewrites client/public/models/boss_nemesis.glb
//   node lighten.mjs boss_morvath_dragon 0.0005
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { meshopt, prune, simplify, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';

const MODELS = resolve(dirname(fileURLToPath(import.meta.url)), '../../client/public/models');
const [key, error = '0.0005'] = process.argv.slice(2);
if (!key) {
  console.error('usage: node lighten.mjs <model key> [error, default 0.0005]');
  process.exit(1);
}
await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready, MeshoptSimplifier.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const file = join(MODELS, `${key}.glb`);
const doc = await io.read(file);
const tris = () => {
  let n = 0;
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) n += (p.getIndices()?.getCount() ?? 0) / 3;
  return Math.round(n / 1000);
};
const before = { tris: tris(), mb: (readFileSync(file).length / 1e6).toFixed(2) };
await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: 0.4, error: Number(error) }), prune(), meshopt({ encoder: MeshoptEncoder, level: 'high' }));
await io.write(file, doc);
console.log(`${key}: ${before.tris}k -> ${tris()}k triangles, ${before.mb} -> ${(readFileSync(file).length / 1e6).toFixed(2)} MB (error ${error})`);
