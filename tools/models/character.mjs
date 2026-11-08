// Turns a rigged character (KayKit Adventurers, CC0: https://github.com/KayKit-Game-Assets) into a
// game model: drops the accessories it shouldn't carry, keeps only the animation clips the game
// plays and renames them to the game's clip names, then compresses it (Meshopt, WebP).
//
//   node character.mjs <source.glb> <key> --drop A,B,C --clips idle=Idle,run=Running_A,... [--tint #rrggbb --ghost]
//
// Clip names the game knows (client/src/quest/scene/Actor.jsx): idle, run, walk, jump, attack, skill,
// hit, dodge, defend, block, heal, interact, death, victory. --ghost makes every material a pale,
// see-through, glowing version of itself (King Aldric's ghost).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, resample, textureCompress } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

const MODELS = resolve(dirname(fileURLToPath(import.meta.url)), '../../client/public/models');
const [src, key, ...rest] = process.argv.slice(2);
const flag = (name) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : undefined;
};
if (!src || !key || !flag('clips')) {
  console.error('usage: node character.mjs <source.glb> <key> --drop A,B --clips game=Source,... [--tint #rrggbb] [--ghost]');
  process.exit(1);
}

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(src);
const root = doc.getRoot();

// Accessories it shouldn't carry.
const drop = new Set((flag('drop') ?? '').split(',').filter(Boolean));
for (const node of root.listNodes()) if (drop.has(node.getName())) node.dispose();

// Clips: keep the mapped ones under the game's names, drop the rest.
const clips = Object.fromEntries(flag('clips').split(',').map((p) => p.split('=').reverse()));
const kept = [];
for (const anim of root.listAnimations()) {
  const game = clips[anim.getName()];
  if (game === undefined) {
    // Samplers keep their accessors alive (prune doesn't remove them), so dispose them too.
    for (const c of anim.listChannels()) c.dispose();
    for (const sm of anim.listSamplers()) sm.dispose();
    anim.dispose();
    continue;
  }
  anim.setName(game);
  kept.push(game);
}
const missing = Object.keys(clips).filter((s) => !root.listAnimations().some((a) => a.getName() === clips[s]));
if (missing.length) console.warn('clips not found in the source:', missing.join(', '));

// A tint multiplies every base colour; --ghost turns the character into a glowing, see-through shade.
const tint = flag('tint');
if (tint || rest.includes('--ghost')) {
  const t = tint ? [1, 3, 5].map((i) => parseInt(tint.slice(i, i + 2), 16) / 255) : [1, 1, 1];
  for (const m of root.listMaterials()) {
    const c = m.getBaseColorFactor();
    m.setBaseColorFactor([c[0] * t[0], c[1] * t[1], c[2] * t[2], c[3]]);
    if (rest.includes('--ghost')) {
      m.setAlphaMode('BLEND').setBaseColorFactor([c[0] * t[0], c[1] * t[1], c[2] * t[2], 0.55]).setEmissiveFactor(t.map((v) => v * 0.45));
      m.setDoubleSided(false);
    }
  }
}

await doc.transform(
  resample(), // drops keyframes that change nothing (KayKit bakes every bone on every frame)
  prune({ keepLeaves: false }),
  dedup(),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024] }),
  meshopt({ encoder: MeshoptEncoder, level: 'high' }),
);
const out = join(MODELS, `${key}.glb`);
await io.write(out, doc);
console.log(`${key}: ${(readFileSync(src).length / 1e6).toFixed(1)} MB -> ${(readFileSync(out).length / 1e6).toFixed(2)} MB · clips: ${kept.join(', ')}`);

// List it in the manifest (height in metres; cel shading like the skeletons).
const height = Number(flag('height') ?? 1.8);
const manifestPath = join(MODELS, 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')).filter((e) => (typeof e === 'string' ? e : e.key) !== key);
manifest.push({ key, height, ...(rest.includes('--ghost') ? { toon: false } : {}) });
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
