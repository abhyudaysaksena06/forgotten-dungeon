// Reforges the "dung king" (an AI-generated single-mesh sculpt: no normals, a 1024 px auto-unwrapped
// texture, a broken all-metal material) into the Hollow King, round 4's boss:
//   - smooth normals, averaged across the atlas seams (the file has none: it rendered flat)
//   - a grimmer texture at 2048 px: armour darkened and drained of colour, cloth pushed to dried
//     blood, gold kept, and everything sharpened
//   - a glow map from the texture's own hot reds (the sword's fuller, the gems, the eyes), so they burn
//   - real armour material values, feet on the floor, centred
//
//   node reforge-king.mjs <dung_king.glb> [out key=boss_hollow_king]
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO, getBounds } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRMaterialsEmissiveStrength } from '@gltf-transform/extensions';
import { meshopt, prune } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

const MODELS = resolve(dirname(fileURLToPath(import.meta.url)), '../../client/public/models');
const [src, key = 'boss_hollow_king'] = process.argv.slice(2);
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(src);
const root = doc.getRoot();
const prim = root.listMeshes()[0].listPrimitives()[0];
const pos = prim.getAttribute('POSITION');
const idx = prim.getIndices();
const n = pos.getCount();

// ---- feet on the floor, centred ----
const b = getBounds(root.listScenes()[0]);
const shift = [-(b.min[0] + b.max[0]) / 2, -b.min[1], -(b.min[2] + b.max[2]) / 2];
const v = [0, 0, 0];
const P = new Float32Array(n * 3);
for (let i = 0; i < n; i++) {
  pos.getElement(i, v);
  P.set([v[0] + shift[0], v[1] + shift[1], v[2] + shift[2]], i * 3);
  pos.setElement(i, [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]]);
}

// ---- smooth normals, shared by every vertex at the same spot (the atlas splits them at seams) ----
const keyOf = (i) => `${Math.round(P[i * 3] * 1e4)},${Math.round(P[i * 3 + 1] * 1e4)},${Math.round(P[i * 3 + 2] * 1e4)}`;
const group = new Map();
const gid = new Int32Array(n);
for (let i = 0; i < n; i++) {
  const k = keyOf(i);
  if (!group.has(k)) group.set(k, group.size);
  gid[i] = group.get(k);
}
const acc = new Float32Array(group.size * 3);
const I = idx.getArray();
for (let f = 0; f < I.length; f += 3) {
  const [a, c, d] = [I[f], I[f + 1], I[f + 2]];
  const ux = P[c * 3] - P[a * 3], uy = P[c * 3 + 1] - P[a * 3 + 1], uz = P[c * 3 + 2] - P[a * 3 + 2];
  const wx = P[d * 3] - P[a * 3], wy = P[d * 3 + 1] - P[a * 3 + 1], wz = P[d * 3 + 2] - P[a * 3 + 2];
  const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx; // area-weighted
  for (const k of [a, c, d]) {
    acc[gid[k] * 3] += nx;
    acc[gid[k] * 3 + 1] += ny;
    acc[gid[k] * 3 + 2] += nz;
  }
}
const N = new Float32Array(n * 3);
for (let i = 0; i < n; i++) {
  const g = gid[i] * 3;
  const l = Math.hypot(acc[g], acc[g + 1], acc[g + 2]) || 1;
  N.set([acc[g] / l, acc[g + 1] / l, acc[g + 2] / l], i * 3);
}
prim.setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(N).setBuffer(root.listBuffers()[0]));

// ---- the texture: grimmer, sharper, and a glow map from its own hot reds ----
const mat = prim.getMaterial();
const tex = mat.getBaseColorTexture();
const SIZE = 2048;
const { data, info } = await sharp(Buffer.from(tex.getImage())).resize(SIZE, SIZE, { kernel: 'lanczos3' }).sharpen({ sigma: 0.8, m1: 0.3, m2: 0.9 }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const out = Buffer.alloc(data.length);
const glow = Buffer.alloc(data.length);
for (let p = 0; p < data.length; p += 3) {
  const r = data[p] / 255, g = data[p + 1] / 255, bl = data[p + 2] / 255;
  const mx = Math.max(r, g, bl), mn = Math.min(r, g, bl);
  const sat = mx ? (mx - mn) / mx : 0;
  const lum = 0.299 * r + 0.587 * g + 0.114 * bl;
  const red = r > g * 1.6 && r > bl * 1.6; // cloth, gems, the sword's fuller
  const gold = r > bl * 1.5 && g > bl * 1.25 && !red; // trims and filigree
  let o;
  if (red) {
    // dried blood: deeper and darker, but still red
    o = [Math.min(1, r * 0.82), g * 0.42, bl * 0.42];
  } else if (gold) {
    o = [r * 0.92, g * 0.82, bl * 0.6]; // old, tarnished gold
  } else {
    // armour and shadows: darker, colder, drained of colour
    const k = 0.62;
    o = [(lum + (r - lum) * 0.35) * k, (lum + (g - lum) * 0.35) * k, (lum + (bl - lum) * 0.35) * k * 1.06];
  }
  out[p] = Math.round(Math.min(1, o[0]) * 255);
  out[p + 1] = Math.round(Math.min(1, o[1]) * 255);
  out[p + 2] = Math.round(Math.min(1, o[2]) * 255);
  // Glow: the hot, bright, saturated reds (not the dull cloth) burn like embers.
  const hot = red && r > 0.55 && sat > 0.7 ? Math.min(1, (r - 0.55) / 0.3) : 0;
  glow[p] = Math.round(hot * 255);
  glow[p + 1] = Math.round(hot * 0.28 * 255);
  glow[p + 2] = Math.round(hot * 0.08 * 255);
}
const raw = { raw: { width: info.width, height: info.height, channels: 3 } };
tex.setImage(new Uint8Array(await sharp(out, raw).webp({ quality: 90 }).toBuffer())).setMimeType('image/webp');
const glowTex = doc
  .createTexture('hollow_king_glow')
  .setImage(new Uint8Array(await sharp(glow, raw).blur(1.2).webp({ quality: 88 }).toBuffer()))
  .setMimeType('image/webp');
mat
  .setName('HollowKing')
  .setMetallicFactor(0.55)
  .setRoughnessFactor(0.48)
  .setEmissiveTexture(glowTex)
  .setEmissiveFactor([1, 1, 1])
  .setExtension('KHR_materials_emissive_strength', doc.createExtension(KHRMaterialsEmissiveStrength).createEmissiveStrength().setEmissiveStrength(4));
root.listNodes().forEach((node) => node.setName(node.getMesh() ? 'hollow_king' : node.getName()));

await doc.transform(prune(), meshopt({ encoder: MeshoptEncoder, level: 'high' }));
const file = join(MODELS, `${key}.glb`);
await io.write(file, doc);
console.log(`${key}: ${(readFileSync(src).length / 1e6).toFixed(2)} MB -> ${(readFileSync(file).length / 1e6).toFixed(2)} MB, ${group.size} welded positions, glowing reds mapped`);
