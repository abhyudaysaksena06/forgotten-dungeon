// Scales a room up or down in place: the model (every root node, its lamps' reach and strength) and
// its layout file (walkable area, blockers, raised floors, spawns, camera area and ceiling).
//   node scale-room.mjs room_2 1.5
// Lamps fall off with the square of the distance, so their intensity grows by factor² and each
// lights its part of the bigger room as it did the smaller one. Characters keep their size.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const MODELS = resolve(dirname(fileURLToPath(import.meta.url)), '../../client/public/models');
const [key, f] = [process.argv[2], Number(process.argv[3])];
if (!key || !(f > 0)) {
  console.error('usage: node scale-room.mjs <room key> <factor>');
  process.exit(1);
}
await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder': MeshoptDecoder,
  'meshopt.encoder': MeshoptEncoder,
  'draco3d.decoder': await draco3d.createDecoderModule(),
  'draco3d.encoder': await draco3d.createEncoderModule(),
});
const path = join(MODELS, `${key}.glb`);
const doc = await io.read(path);
for (const scene of doc.getRoot().listScenes()) {
  for (const n of scene.listChildren()) {
    n.setTranslation(n.getTranslation().map((v) => v * f));
    n.setScale(n.getScale().map((v) => v * f));
  }
}
const lights = new Set(doc.getRoot().listNodes().map((n) => n.getExtension('KHR_lights_punctual')).filter(Boolean));
for (const light of lights) {
  light.setIntensity(light.getIntensity() * f * f);
  if (light.getRange()) light.setRange(light.getRange() * f);
}
console.log('lamps scaled:', lights.size);
await io.write(path, doc);

const lp = join(MODELS, `${key}.layout.json`);
const L = JSON.parse(readFileSync(lp, 'utf8'));
const s = (v) => Math.round(v * f * 1000) / 1000;
const shape = (b) => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, typeof v === 'number' ? s(v) : v]));
const out = {
  ...L,
  bounds: L.bounds.map(shape),
  colliders: (L.colliders ?? []).map(shape),
  steps: (L.steps ?? []).map(shape),
  spawns: Object.fromEntries(Object.entries(L.spawns ?? {}).map(([k, v]) => [k, v === null ? null : Array.isArray(v[0]) ? v.map((p) => p.map(s)) : v.map(s)])),
  ...(L.view ? { view: L.view.map(shape) } : {}),
  ...(L.ceiling ? { ceiling: s(L.ceiling) } : {}),
};
writeFileSync(lp, JSON.stringify(out, null, 1));
console.log(`${key}: scaled ×${f} (model, lamps, layout)`);
