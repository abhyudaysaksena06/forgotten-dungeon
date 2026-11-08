// Shrinks the game's models in client/public/models without changing how they look.
//
//   cd tools/models && npm install
//   node optimize.mjs full room_1 room_2      # lossless: Meshopt geometry, WebP textures, merged materials,
//                                             # meshes joined by material, repeated props instanced
//   node optimize.mjs mini room_1 room_5      # the map's miniature: room_N.mini.glb (simplified, 256 px
//                                             # textures, flat-shaded) and `mini: true` in manifest.json
//   node optimize.mjs full enemy_skeleton --simplify 0.35   # also keep 35% of the triangles
//   node optimize.mjs full boss_nemesis --simplify 0.2 --ground   # feet on the floor, centred
//   node optimize.mjs full boss_morvath_dragon --simplify 0.5 --max 4096   # keep 4K textures
//
// --max caps texture size (default 2048). Transmission (glass-like materials) becomes plain alpha
// blending: three.js renders the whole scene again every frame for transmission, which would halve
// the frame rate in the fight that shows it, for a few drops of saliva.
//
// Run `full` after exporting from Blender, then `mini` for a room. Re-exporting a room from Blender
// drops its `mini` flag, so the map shows the full room until `mini` is run again.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join as joinPath, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO, getBounds } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, flatten, instance, join, meshopt, palette, prune, simplify, textureCompress, weld } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const MODELS = resolve(dirname(fileURLToPath(import.meta.url)), '../../client/public/models');
const [mode, ...rest] = process.argv.slice(2);
const valued = new Set(['--simplify', '--max']);
const keys = rest.filter((a, i) => !a.startsWith('--') && !valued.has(rest[i - 1]));
const flag = (name) => { const i = rest.indexOf(`--${name}`); return i >= 0 ? rest[i + 1] : undefined; };
if (!['full', 'mini'].includes(mode) || !keys.length) {
  console.error('usage: node optimize.mjs full|mini <key>... [--simplify <ratio>]');
  process.exit(1);
}

await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready, MeshoptSimplifier.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder': MeshoptDecoder,
  'meshopt.encoder': MeshoptEncoder,
  'draco3d.decoder': await draco3d.createDecoderModule(),
  'draco3d.encoder': await draco3d.createEncoderModule(),
});
const dropDraco = (doc) => doc.getRoot().listExtensionsUsed().filter((e) => e.extensionName === 'KHR_draco_mesh_compression').forEach((e) => e.dispose());
const mb = (path) => (readFileSync(path).length / 1e6).toFixed(1);

for (const key of keys) {
  const src = joinPath(MODELS, `${key}.glb`);
  const doc = await io.read(src);
  const before = mb(src);
  if (mode === 'full') {
    const ratio = flag('simplify');
    const max = Number(flag('max') ?? 2048);
    for (const mat of doc.getRoot().listMaterials()) {
      const tr = mat.getExtension('KHR_materials_transmission');
      if (!tr) continue;
      const amount = tr.getTransmissionFactor();
      mat.setExtension('KHR_materials_transmission', null);
      mat.setAlphaMode('BLEND').setBaseColorFactor([...mat.getBaseColorFactor().slice(0, 3), Math.max(0.25, 1 - amount * 0.75)]);
    }
    await doc.transform(
      dedup(),
      instance({ min: 5 }),
      palette({ min: 5 }),
      flatten(),
      join(),
      weld(),
      ...(ratio ? [simplify({ simplifier: MeshoptSimplifier, ratio: Number(ratio), error: 0.002 })] : []),
      prune({ keepLeaves: true }), // spawn_* empties stay
      textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [max, max] }),
      meshopt({ encoder: MeshoptEncoder, level: 'high' }),
    );
    if (rest.includes('--ground')) {
      // Feet on the floor and centred: the game stands characters on their origin.
      const scene = doc.getRoot().listScenes()[0];
      const b = getBounds(scene);
      const shift = [-(b.min[0] + b.max[0]) / 2, -b.min[1], -(b.min[2] + b.max[2]) / 2];
      for (const n of scene.listChildren()) {
        const t = n.getTranslation();
        n.setTranslation([t[0] + shift[0], t[1] + shift[1], t[2] + shift[2]]);
      }
    }
    dropDraco(doc);
    await io.write(src, doc);
    console.log(`${key}: ${before} MB -> ${mb(src)} MB`);
  } else {
    // Seen from far above at a few centimetres across: flat shading needs no normals, and without them
    // the flat-shaded rooms weld and simplify.
    for (const mesh of doc.getRoot().listMeshes()) for (const p of mesh.listPrimitives()) p.setAttribute('NORMAL', null);
    await doc.transform(
      dedup(),
      flatten(),
      join(),
      weld(),
      simplify({ simplifier: MeshoptSimplifier, ratio: 0.1, error: 0.02 }),
      instance({ min: 5 }),
      prune(),
      textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [256, 256] }),
      meshopt({ encoder: MeshoptEncoder, level: 'high' }),
    );
    dropDraco(doc);
    const out = joinPath(MODELS, `${key}.mini.glb`);
    await io.write(out, doc);
    const manifestPath = joinPath(MODELS, 'manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')).map((e) => {
      const entry = typeof e === 'string' ? { key: e } : e;
      return entry.key === key ? { ...entry, mini: true } : e;
    });
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
    console.log(`${key}: map miniature ${mb(out)} MB (full room ${before} MB)`);
  }
}
