// Builds each room's walking map from its real geometry, so nothing solid can be walked through and
// feet stay on the floor:
//
//   1. The floor: in every 0.25 m cell, the highest upward-facing surface a foot could stand on (the
//      ground, a dais tier, a stair; a room's ground often runs on under a dais, so the lowest would
//      be the hidden one) gives the floor height there. "Could stand on" is capped by the room's own
//      design: its highest raised floor, else 1 m, so beams and rafters never count as floor; a
//      table top does, and its edge is then a cliff (step 3), so the table blocks.
//   2. Walls and props: every triangle is sampled densely; a sample at body height above its own
//      cell's floor (0.65–1.7 m: higher than a stair, lower than a doorway's lintel) blocks the cell.
//   3. Steps and cliffs: neighbouring cells join only if their floors differ by at most a stair
//      (0.65 m); the higher side of a bigger drop is a wall.
//   4. Anything that can't be reached on foot from the party's start (inside a prop, behind a wall, a
//      table top) is filled in, so nobody is ever pushed into it.
//
// Light, not matter, never blocks (flames, glows, cobwebs, anything see-through), and neither do
// small loose things (a candle, a skull, a chip of stone): you walk past those.
// The map goes into the room's layout file as `grid` (one bit per cell: blocked) and `grid.floor`
// (the floor height of every cell, in centimetres), which the game reads for collisions and footing.
//
//   node collision-grid.mjs room_1 room_2 room_3 room_4 room_5
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dequantize } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import { MeshoptDecoder } from 'meshoptimizer';

const MODELS = resolve(dirname(fileURLToPath(import.meta.url)), '../../client/public/models');
export const CELL = 0.25;
const STEP = 0.65; // the highest stair a body climbs without jumping
const HEAD = 1.7; // above this (over the floor) nothing is in the way: arches, beams, banners
const MARGIN = 2; // cells of slack around the walkable area
const EFFECT = /fire|flame|glow|smoke|fog|beam|spark|ember|aura|portal|mist|shaft|halo|flare|cobweb/i;
const isEffect = (mat) => Boolean(mat) && (mat.getAlphaMode() === 'BLEND' || EFFECT.test(mat.getName()));
const SMALL_WIDTH = 0.4;
const SMALL_HEIGHT = 1.4;

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder': MeshoptDecoder,
  'draco3d.decoder': await draco3d.createDecoderModule(),
});

// Splits triangles into separate pieces (triangles sharing a corner position); each triangle gets
// its piece's bounding box [minX, maxX, minY, maxY, minZ, maxZ].
function islands(tris) {
  const parent = Int32Array.from({ length: tris.length }, (_, i) => i);
  const find = (i) => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]];
    return i;
  };
  const owner = new Map();
  tris.forEach((tri, t) => {
    for (const p of tri) {
      const k = `${Math.round(p[0] * 1000)},${Math.round(p[1] * 1000)},${Math.round(p[2] * 1000)}`;
      const o = owner.get(k);
      if (o === undefined) owner.set(k, t);
      else parent[find(t)] = find(o);
    }
  });
  const box = new Map();
  tris.forEach((tri, t) => {
    const r = find(t);
    const b = box.get(r) ?? [Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity];
    for (const p of tri) {
      b[0] = Math.min(b[0], p[0]);
      b[1] = Math.max(b[1], p[0]);
      b[2] = Math.min(b[2], p[1]);
      b[3] = Math.max(b[3], p[1]);
      b[4] = Math.min(b[4], p[2]);
      b[5] = Math.max(b[5], p[2]);
    }
    box.set(r, b);
  });
  return tris.map((_, t) => box.get(find(t)));
}

function boundsBox(bounds) {
  const list = Array.isArray(bounds) ? bounds : [bounds];
  const box = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (const s of list) {
    const [a, b, c, d] = s.kind === 'circle' ? [s.x - s.r, s.x + s.r, s.z - s.r, s.z + s.r] : [s.minX, s.maxX, s.minZ, s.maxZ];
    box.minX = Math.min(box.minX, a);
    box.maxX = Math.max(box.maxX, b);
    box.minZ = Math.min(box.minZ, c);
    box.maxZ = Math.max(box.maxZ, d);
  }
  return box;
}

// The room's solid triangles in world space (effects and small loose props left out).
async function solidTriangles(key) {
  const doc = await io.read(join(MODELS, `${key}.glb`));
  await doc.transform(dequantize());
  const out = [];
  let loose = 0;
  const v = [0, 0, 0];
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const m = node.getWorldMatrix();
    for (const prim of mesh.listPrimitives()) {
      if (prim.getMode() !== 4 || isEffect(prim.getMaterial())) continue;
      const pos = prim.getAttribute('POSITION');
      if (!pos) continue;
      const P = [];
      for (let i = 0; i < pos.getCount(); i++) {
        pos.getElement(i, v);
        P.push([m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12], m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13], m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14]]);
      }
      const idx = prim.getIndices();
      const n = idx ? idx.getCount() : pos.getCount();
      const list = [];
      for (let f = 0; f + 2 < n; f += 3) list.push(idx ? [P[idx.getScalar(f)], P[idx.getScalar(f + 1)], P[idx.getScalar(f + 2)]] : [P[f], P[f + 1], P[f + 2]]);
      const piece = islands(list);
      list.forEach((tri, t) => {
        const b = piece[t];
        if (Math.max(b[1] - b[0], b[5] - b[4]) < SMALL_WIDTH && b[3] - b[2] < SMALL_HEIGHT) loose++;
        else out.push(tri);
      });
    }
  }
  return { tris: out, loose };
}

export async function buildGrid(key) {
  const layoutPath = join(MODELS, `${key}.layout.json`);
  const layout = JSON.parse(readFileSync(layoutPath, 'utf8'));
  const box = boundsBox(layout.bounds);
  const x0 = box.minX - MARGIN * CELL;
  const z0 = box.minZ - MARGIN * CELL;
  const w = Math.ceil((box.maxX - box.minX) / CELL) + 2 * MARGIN;
  const h = Math.ceil((box.maxZ - box.minZ) / CELL) + 2 * MARGIN;
  const N = w * h;
  const cellOf = (x, z) => {
    const cx = Math.floor((x - x0) / CELL);
    const cz = Math.floor((z - z0) / CELL);
    return cx < 0 || cz < 0 || cx >= w || cz >= h ? -1 : cz * w + cx;
  };
  const { tris, loose } = await solidTriangles(key);
  const GROUND_MAX = Math.max(1, ...(layout.steps ?? []).map((s) => s.top + 0.3));

  // 1. The floor: the highest upward-facing surface (up to GROUND_MAX) over each cell's centre.
  const floor = new Float32Array(N).fill(NaN);
  for (const [a, b, c] of tris) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const ny = uz * vx - ux * vz;
    const len = Math.hypot(uy * vz - uz * vy, ny, ux * vy - uy * vx);
    if (!len || Math.abs(ny) / len < 0.6) continue; // steep: a wall, not a floor
    if (Math.min(a[1], b[1], c[1]) > GROUND_MAX || Math.max(a[1], b[1], c[1]) < -0.5) continue;
    const minX = Math.min(a[0], b[0], c[0]), maxX = Math.max(a[0], b[0], c[0]);
    const minZ = Math.min(a[2], b[2], c[2]), maxZ = Math.max(a[2], b[2], c[2]);
    const det = ux * vz - uz * vx;
    if (Math.abs(det) < 1e-9) continue;
    for (let cz = Math.max(0, Math.floor((minZ - z0) / CELL)); cz <= Math.min(h - 1, Math.floor((maxZ - z0) / CELL)); cz++) {
      const pz = z0 + (cz + 0.5) * CELL;
      for (let cx = Math.max(0, Math.floor((minX - x0) / CELL)); cx <= Math.min(w - 1, Math.floor((maxX - x0) / CELL)); cx++) {
        const px = x0 + (cx + 0.5) * CELL;
        const s = ((px - a[0]) * vz - (pz - a[2]) * vx) / det;
        const t = ((pz - a[2]) * ux - (px - a[0]) * uz) / det;
        if (s < -1e-6 || t < -1e-6 || s + t > 1 + 1e-6) continue;
        const y = a[1] + s * uy + t * vy;
        if (y > GROUND_MAX) continue;
        const i = cz * w + cx;
        if (Number.isNaN(floor[i]) || y > floor[i]) floor[i] = y;
      }
    }
  }

  // 2. Walls and props: any part of a triangle at body height over the floor of its cell.
  const blocked = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (Number.isNaN(floor[i])) blocked[i] = 1; // no floor at all: off the map
  const spacing = CELL / 2;
  for (const [a, b, c] of tris) {
    if (Math.max(a[1], b[1], c[1]) < STEP - 0.5 || Math.min(a[1], b[1], c[1]) > GROUND_MAX + HEAD) continue;
    const edge = Math.max(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), Math.hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2]), Math.hypot(c[0] - b[0], c[1] - b[1], c[2] - b[2]));
    const n = Math.max(1, Math.ceil(edge / spacing));
    for (let i = 0; i <= n; i++) {
      for (let j = 0; j <= n - i; j++) {
        const s = i / n;
        const t = j / n;
        const x = a[0] + (b[0] - a[0]) * s + (c[0] - a[0]) * t;
        const y = a[1] + (b[1] - a[1]) * s + (c[1] - a[1]) * t;
        const z = a[2] + (b[2] - a[2]) * s + (c[2] - a[2]) * t;
        const k = cellOf(x, z);
        if (k < 0 || blocked[k]) continue;
        const above = y - floor[k];
        if (above > STEP && above < HEAD) blocked[k] = 1;
      }
    }
  }

  // 3. Cliffs: where neighbouring floors differ by more than a stair, the higher side is a wall.
  for (let cz = 0; cz < h; cz++) {
    for (let cx = 0; cx < w; cx++) {
      const i = cz * w + cx;
      if (blocked[i]) continue;
      for (const [dx, dz] of [[1, 0], [0, 1]]) {
        if (cx + dx >= w || cz + dz >= h) continue;
        const j = (cz + dz) * w + cx + dx;
        if (blocked[j]) continue;
        if (Math.abs(floor[i] - floor[j]) > STEP) blocked[floor[i] > floor[j] ? i : j] = 1;
      }
    }
  }

  // Spawns stand free (a rug's edge or a low lip can catch one).
  const sp = layout.spawns ?? {};
  const spots = [...(sp.party ?? []), ...(sp.enemies ?? []), ...(sp.boss ? [sp.boss] : []), ...(sp.npcs ?? [])];
  let cleared = 0;
  const r = Math.ceil(0.6 / CELL);
  for (const [x, y, z] of spots) {
    const cx = Math.floor((x - x0) / CELL);
    const cz = Math.floor((z - z0) / CELL);
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const nx = cx + dx;
        const nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= w || nz >= h || dx * dx + dz * dz > r * r) continue;
        const i = nz * w + nx;
        if (Number.isNaN(floor[i])) floor[i] = y ?? 0;
        if (blocked[i]) {
          blocked[i] = 0;
          cleared++;
        }
      }
    }
  }

  // 4. Only what can be reached on foot from the party's start is walkable.
  const start = sp.party?.[0] ?? [0, 0, 0];
  const seen = new Uint8Array(N);
  const first = cellOf(start[0], start[2]);
  const queue = [first];
  seen[first] = 1;
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q];
    const cx = i % w;
    const cz = (i - cx) / w;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx;
      const nz = cz + dz;
      if (nx < 0 || nz < 0 || nx >= w || nz >= h) continue;
      const j = nz * w + nx;
      if (seen[j] || blocked[j] || Math.abs(floor[j] - floor[i]) > STEP) continue;
      seen[j] = 1;
      queue.push(j);
    }
  }
  let pockets = 0;
  for (let i = 0; i < N; i++) {
    if (!blocked[i] && !seen[i]) {
      blocked[i] = 1;
      pockets++;
    }
  }
  const unreachable = spots.filter(([x, , z]) => !seen[cellOf(x, z)]).length;

  // Pack: one bit per cell (blocked), and each walkable cell's floor in centimetres.
  const bits = new Uint8Array(Math.ceil(N / 8));
  const heights = new Int16Array(N);
  for (let i = 0; i < N; i++) {
    if (blocked[i]) bits[i >> 3] |= 1 << (i & 7);
    heights[i] = blocked[i] || Number.isNaN(floor[i]) ? 0 : Math.round(floor[i] * 100);
  }
  const raised = heights.some((v, i) => !blocked[i] && Math.abs(v) > 3);
  layout.grid = {
    cell: CELL,
    x0: +x0.toFixed(3),
    z0: +z0.toFixed(3),
    w,
    h,
    bits: Buffer.from(bits).toString('base64'),
    ...(raised ? { floor: Buffer.from(heights.buffer).toString('base64') } : {}),
  };
  writeFileSync(layoutPath, JSON.stringify(layout, null, 1) + '\n');
  const solid = blocked.reduce((s, b) => s + b, 0);
  console.log(
    `${key}: ${tris.length} solid triangles (+${loose} in small loose props) -> ${w}x${h} cells, ${Math.round((100 * solid) / N)}% solid${raised ? ', raised floors' : ''}; ` +
      `spawn cells cleared ${cleared}, pockets filled ${pockets}, unreachable spawns ${unreachable}`,
  );
  return { unreachable };
}

const keys = process.argv.slice(2);
let bad = 0;
for (const key of keys) bad += (await buildGrid(key)).unreachable;
if (bad) process.exitCode = 1;
