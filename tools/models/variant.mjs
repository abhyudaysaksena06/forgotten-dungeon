// Makes a recoloured copy of a model: its base colour textures turned round the colour wheel, so a
// red glow painted into the texture becomes another colour while dark metal stays dark.
//
//   node variant.mjs <source key> <new key> --hue 270 [--saturation 1.1] [--brightness 0.9] [--height 3.6]
//
// Morvath's Shadow Knight is the Hell Nemesis sculpt in his violet shadow-fire:
//   node variant.mjs boss_nemesis boss_morvath_knight --hue 265 --saturation 1.15 --brightness 0.95 --height 3.6
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

const MODELS = resolve(dirname(fileURLToPath(import.meta.url)), '../../client/public/models');
const [from, to, ...rest] = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? Number(rest[i + 1]) : fallback;
};
if (!from || !to) {
  console.error('usage: node variant.mjs <source key> <new key> --hue <degrees> [--saturation n] [--brightness n] [--height m]');
  process.exit(1);
}

await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(join(MODELS, `${from}.glb`));
const done = new Set();
for (const mat of doc.getRoot().listMaterials()) {
  const tex = mat.getBaseColorTexture();
  if (!tex || done.has(tex)) continue;
  done.add(tex);
  const img = await sharp(Buffer.from(tex.getImage()))
    .modulate({ hue: flag('hue', 0), saturation: flag('saturation', 1), brightness: flag('brightness', 1) })
    .webp({ quality: 90 })
    .toBuffer();
  tex.setImage(new Uint8Array(img)).setMimeType('image/webp');
}
const out = join(MODELS, `${to}.glb`);
await io.write(out, doc);
console.log(`${to}: ${(readFileSync(out).length / 1e6).toFixed(2)} MB, ${done.size} texture(s) recoloured`);

const manifestPath = join(MODELS, 'manifest.json');
const source = JSON.parse(readFileSync(manifestPath, 'utf8')).find((e) => (typeof e === 'string' ? e : e.key) === from) ?? {};
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')).filter((e) => (typeof e === 'string' ? e : e.key) !== to);
manifest.push({ ...(typeof source === 'string' ? {} : source), key: to, height: flag('height', source.height ?? 1.8) });
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
