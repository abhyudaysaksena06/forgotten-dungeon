// Rigs the Hollow King (room 4's boss, reforged by reforge-king.mjs) with the same skeleton and move
// set as the Hell Nemesis (rig-lib.mjs), fitted to his own joints, plus his own Shadow Tide: the
// blade raised in both hands and plunged into the floor to call the tide.
//
//   node reforge-king.mjs <dung_king.glb>   # writes the unrigged boss_hollow_king.glb
//   node rig-king.mjs                       # rigs it in place
//
// The sculpt is 1.0 unit tall (the manifest scales him up in the game), faces +Z, and holds his sword
// in his right hand (-X), point down on the floor in front of him. Joints were measured from the mesh
// (vertex clusters at the feet, knees, hands, elbows; the blade's axis from its tip to the grip).
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { closest, rig, segDist, smooth, swordClips } from './rig-lib.mjs';

const MODELS = resolve(dirname(fileURLToPath(import.meta.url)), '../../client/public/models');
const SRC = process.argv[2] ?? join(MODELS, 'boss_hollow_king.glb');
const OUT = process.argv[3] ?? SRC;
const S = 1.0 / 1.9; // his height against the Nemesis', for the move set's translations

// ---------- the skeleton: [name, parent, head, tail] in the sculpt's own space ----------
const BONES = [
  ['root', null, [0.01, 0, 0.01], [0.01, 0.15, 0.01]],
  ['hips', 'root', [0.01, 0.4, 0.01], [0.01, 0.5, 0.01]],
  ['spine', 'hips', [0.01, 0.5, 0.01], [0.01, 0.62, 0.01]],
  ['chest', 'spine', [0.01, 0.62, 0.01], [0.01, 0.78, 0.01]],
  ['neck', 'chest', [0.01, 0.78, 0.01], [0.013, 0.83, 0.02]],
  ['head', 'neck', [0.013, 0.83, 0.02], [0.013, 1.0, 0.02]],
  ['upperarm_R', 'chest', [-0.16, 0.75, -0.01], [-0.25, 0.63, 0.02]],
  ['forearm_R', 'upperarm_R', [-0.25, 0.63, 0.02], [-0.24, 0.56, 0.18]],
  ['hand_R', 'forearm_R', [-0.24, 0.56, 0.18], [-0.24, 0.5, 0.19]],
  ['upperarm_L', 'chest', [0.16, 0.75, -0.01], [0.23, 0.58, 0.03]],
  ['forearm_L', 'upperarm_L', [0.23, 0.58, 0.03], [0.2, 0.445, 0.07]],
  ['hand_L', 'forearm_L', [0.2, 0.445, 0.07], [0.2, 0.4, 0.08]],
  ['thigh_R', 'hips', [-0.06, 0.38, 0.02], [-0.083, 0.2, 0.033]],
  ['shin_R', 'thigh_R', [-0.083, 0.2, 0.033], [-0.15, 0.04, 0.05]],
  ['foot_R', 'shin_R', [-0.15, 0.04, 0.05], [-0.15, 0.01, 0.13]],
  ['thigh_L', 'hips', [0.07, 0.38, 0.02], [0.111, 0.2, 0.027]],
  ['shin_L', 'thigh_L', [0.111, 0.2, 0.027], [0.17, 0.04, 0.04]],
  ['foot_L', 'shin_L', [0.17, 0.04, 0.04], [0.19, 0.01, 0.12]],
];
const IDX = Object.fromEntries(BONES.map((b, i) => [b[0], i]));
// The blade: from its point on the floor up to the grip. It is a broad flat plate (about 16 cm wide,
// facing the front), so it is found by its own texture charts: every chart that lies (almost) wholly
// in the plate's slab is steel, and rides the hand rigidly.
const SWORD = { a: [-0.218, 0.0, 0.133], b: [-0.24, 0.55, 0.19] };
const inBlade = (p) => {
  const q = closest(p, SWORD.a, SWORD.b);
  return p[1] < 0.53 && Math.abs(p[0] - q[0]) < 0.1 && p[2] > 0.12 && p[2] < 0.25;
};
let steel = new Uint8Array(0);
function setup({ P, indices }) {
  const parent = Int32Array.from({ length: P.length }, (_, i) => i);
  const find = (i) => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]];
    return i;
  };
  for (let f = 0; f < indices.length; f += 3) for (const k of [1, 2]) parent[find(indices[f + k])] = find(indices[f]);
  const charts = new Map();
  P.forEach((p, i) => {
    const c = charts.get(find(i)) ?? { n: 0, in: 0 };
    c.n++;
    if (inBlade(p)) c.in++;
    charts.set(find(i), c);
  });
  steel = new Uint8Array(P.length);
  P.forEach((p, i) => {
    const c = charts.get(find(i));
    if (c.in >= 0.85 * c.n) steel[i] = 1;
  });
  console.log('blade vertices:', steel.reduce((a, b) => a + b, 0));
}

// ---------- which bones may move a vertex ----------
function allowed([x, y, z]) {
  const torso = ['hips', 'spine', 'chest'];
  // The cape behind him rides the torso; its wide skirts and the loose front panel ride the hips.
  if (z < -0.12 && y < 0.76) return y > 0.66 ? ['spine', 'chest'] : torso;
  if (y < 0.5 && Math.abs(x - 0.01) > 0.27) return ['hips'];
  if (x > 0.32 && z > 0.2 && y < 0.35) return ['hips'];
  if (y > 0.79) return ['chest', 'neck', 'head', 'upperarm_R', 'upperarm_L'];
  const out = [...torso];
  if (y < 0.42) out.push('thigh_R', 'shin_R', 'foot_R', 'thigh_L', 'shin_L', 'foot_L');
  if (y > 0.38) {
    if (x < -0.06) out.push('upperarm_R', 'forearm_R', 'hand_R');
    if (x > 0.08) out.push('upperarm_L', 'forearm_L', 'hand_L');
  }
  return out;
}

function weigh(p, i) {
  if (steel[i]) return [[IDX.hand_R, 1]];
  const ARM = /arm|hand/;
  const pool = allowed(p)
    .map((name) => {
      const b = BONES[IDX[name]];
      const d = segDist(p, b[2], b[3]);
      let w = 1 / (Math.pow(d + 0.01 * S, 4) + 1e-12);
      if (ARM.test(name)) {
        // An arm takes its armour fully, fades out a little further, and never takes what hangs behind it.
        const q = closest(p, b[2], b[3]);
        w *= 1 - smooth(0.11 * S, 0.19 * S, d);
        w *= 1 - smooth(0.06 * S, 0.14 * S, q[2] - p[2]);
        // ...nor the torso on its inner side (the left hand rests against the hip).
        w *= 1 - smooth(0.03, 0.06, (q[0] - p[0]) * Math.sign(q[0]));
        // ...nor the cape hanging outside it, below the pauldrons.
        if (p[1] < 0.7) w *= 1 - smooth(0.06, 0.1, (p[0] - q[0]) * Math.sign(q[0]));
        if (w <= 0) return null;
      }
      return [IDX[name], w];
    })
    .filter(Boolean);
  pool.sort((a, b) => b[1] - a[1]);
  const top = pool.slice(0, 4);
  const sum = top.reduce((s, [, w]) => s + w, 0);
  return top.map(([i, w]) => [i, w / sum]).filter(([, w]) => w > 0.02);
}

// ---------- the clips ----------
const CLIPS = swordClips(S);
const K = (keys) => keys; // [time, [x°, y°, z°]]
// Shadow Tide ('skill'): the blade raised in both hands, then plunged point-first into the floor; he
// sinks onto one knee over it while the tide spreads, then rises.
CLIPS.skill = {
  len: 1.6,
  upperarm_R: K([[0, [0, 0, 0]], [0.45, [-165, 0, -8]], [0.7, [-55, 0, 14]], [1.2, [-55, 0, 14]], [1.6, [0, 0, 0]]]),
  forearm_R: K([[0, [0, 0, 0]], [0.45, [-25, 0, 0]], [0.7, [-30, 0, 0]], [1.2, [-30, 0, 0]], [1.6, [0, 0, 0]]]),
  upperarm_L: K([[0, [0, 0, 0]], [0.45, [-160, 0, -40]], [0.7, [-60, 0, -30]], [1.2, [-60, 0, -30]], [1.6, [0, 0, 0]]]),
  forearm_L: K([[0, [0, 0, 0]], [0.45, [-30, 0, 0]], [0.7, [-30, 0, 0]], [1.6, [0, 0, 0]]]),
  hips: K([[0, [0, 0, 0]], [0.45, [-6, 0, 0]], [0.7, [20, 0, 0]], [1.2, [20, 0, 0]], [1.6, [0, 0, 0]]]),
  chest: K([[0, [0, 0, 0]], [0.45, [-12, 0, 0]], [0.7, [14, 0, 0]], [1.2, [12, 0, 0]], [1.6, [0, 0, 0]]]),
  head: K([[0, [0, 0, 0]], [0.45, [-18, 0, 0]], [0.7, [-12, 0, 0]], [1.2, [-14, 0, 0]], [1.6, [0, 0, 0]]]),
  thigh_R: K([[0, [0, 0, 0]], [0.7, [-62, 0, 0]], [1.2, [-62, 0, 0]], [1.6, [0, 0, 0]]]),
  shin_R: K([[0, [0, 0, 0]], [0.7, [64, 0, 0]], [1.2, [64, 0, 0]], [1.6, [0, 0, 0]]]),
  thigh_L: K([[0, [0, 0, 0]], [0.7, [-20, 0, 0]], [1.2, [-20, 0, 0]], [1.6, [0, 0, 0]]]),
  shin_L: K([[0, [0, 0, 0]], [0.7, [95, 0, 0]], [1.2, [95, 0, 0]], [1.6, [0, 0, 0]]]),
  hips_t: K([[0, [0, 0, 0]], [0.45, [0, 0.02, 0]], [0.7, [0, -0.11, 0.03]], [1.2, [0, -0.11, 0.03]], [1.6, [0, 0, 0]]]),
};

function report({ J, W, n }) {
  if (!process.env.RIG_REPORT) return;
  const armR = new Set([IDX.upperarm_R, IDX.forearm_R, IDX.hand_R]);
  let mixed = 0;
  for (let i = 0; i < n; i++) {
    let a = 0;
    for (let k = 0; k < 4; k++) if (armR.has(J[i * 4 + k])) a += W[i * 4 + k];
    if (a > 0.1 && a < 0.9) mixed++;
  }
  console.log('vertices split between the right arm and the body:', mixed);
}

await rig({ src: SRC, out: OUT, name: 'HollowKing', bones: BONES, weigh, setup, clips: CLIPS, onWeights: report });
