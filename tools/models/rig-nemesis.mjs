// Rigs the Hell Nemesis sculpt (a single 372k-triangle mesh with no skeleton) and gives it a move set,
// without Blender: an 18-bone humanoid skeleton fitted to the sculpt's own joints, skin weights from
// the distance to each bone (the sword rigid in the right hand, the cape riding the torso, the legs
// moving only what is below the hips), and hand-keyed clips. Then Morvath's knight is made from it
// with variant.mjs, so he moves the same way.
//
//   node rig-nemesis.mjs            # reads and rewrites client/public/models/boss_nemesis.glb
//
// The sculpt faces +Z; its right side (sword hand) is -X. Joint positions were measured from the
// mesh (vertex clusters at the feet, knees, hands, elbows; the sword's axis by PCA).
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { closest, rig, segDist, smooth, swordClips } from './rig-lib.mjs';

const MODELS = resolve(dirname(fileURLToPath(import.meta.url)), '../../client/public/models');
const SRC = process.argv[2] ?? join(MODELS, 'boss_nemesis.glb');
const OUT = process.argv[3] ?? SRC;

// ---------- the skeleton: [name, parent, head, tail] in the sculpt's own space (metres) ----------
const BONES = [
  ['root', null, [0.07, 0, -0.13], [0.07, 0.3, -0.13]],
  ['hips', 'root', [0.07, 0.98, -0.13], [0.07, 1.12, -0.14]],
  ['spine', 'hips', [0.07, 1.12, -0.14], [0.07, 1.3, -0.16]],
  ['chest', 'spine', [0.07, 1.3, -0.16], [0.08, 1.52, -0.14]],
  ['neck', 'chest', [0.08, 1.52, -0.14], [0.09, 1.62, -0.12]],
  ['head', 'neck', [0.09, 1.62, -0.12], [0.09, 1.92, -0.12]],
  ['upperarm_R', 'chest', [-0.17, 1.43, -0.15], [-0.22, 1.18, 0.0]],
  ['forearm_R', 'upperarm_R', [-0.22, 1.18, 0.0], [-0.17, 0.86, 0.21]],
  ['hand_R', 'forearm_R', [-0.17, 0.86, 0.21], [-0.18, 0.76, 0.25]],
  ['upperarm_L', 'chest', [0.27, 1.43, -0.2], [0.36, 1.17, -0.28]],
  ['forearm_L', 'upperarm_L', [0.36, 1.17, -0.28], [0.39, 0.92, -0.2]],
  ['hand_L', 'forearm_L', [0.39, 0.92, -0.2], [0.4, 0.82, -0.18]],
  ['thigh_R', 'hips', [-0.04, 0.93, -0.1], [-0.11, 0.5, -0.05]],
  ['shin_R', 'thigh_R', [-0.11, 0.5, -0.05], [-0.18, 0.12, -0.02]],
  ['foot_R', 'shin_R', [-0.18, 0.12, -0.02], [-0.18, 0.03, 0.14]],
  ['thigh_L', 'hips', [0.18, 0.93, -0.15], [0.28, 0.5, -0.18]],
  ['shin_L', 'thigh_L', [0.28, 0.5, -0.18], [0.34, 0.12, -0.21]],
  ['foot_L', 'shin_L', [0.34, 0.12, -0.21], [0.36, 0.03, -0.05]],
];
const IDX = Object.fromEntries(BONES.map((b, i) => [b[0], i]));
// The sword's blade axis (measured): from its tip on the ground up to the hand.
const SWORD = { a: [0.01, 0.0, 0.62], b: [-0.17, 0.86, 0.21], r: 0.09 };

// ---------- which bones may move a vertex ----------
function allowed(p) {
  const [x, y, z] = p;
  const torso = ['hips', 'spine', 'chest'];
  // The cape behind the body, and its wide skirts at the sides, ride the torso: never the legs.
  if (z < -0.32 && y < 1.45) return y > 1.25 ? ['spine', 'chest'] : torso;
  if (y < 0.88 && (x > 0.5 || x < -0.36) && z < 0.1) return ['hips'];
  if (y > 1.5) return ['chest', 'neck', 'head', 'upperarm_R', 'upperarm_L'];
  const out = [...torso];
  if (y < 1.05) out.push('thigh_R', 'shin_R', 'foot_R', 'thigh_L', 'shin_L', 'foot_L');
  if (y > 0.72) {
    if (x < -0.06) out.push('upperarm_R', 'forearm_R', 'hand_R');
    if (x > 0.2) out.push('upperarm_L', 'forearm_L', 'hand_L');
  }
  return out;
}

function weigh(p) {
  // The sword: rigid in the right hand.
  // (Thin: the cape's front edge hangs a few centimetres beside the blade and must not follow it.)
  // Near the grip the cape's front panel hangs against the blade: there only the blade's own width counts,
  // and nothing behind it.
  const onAxis = closest(p, SWORD.a, SWORD.b);
  const dSword = Math.hypot(p[0] - onAxis[0], p[1] - onAxis[1], p[2] - onAxis[2]);
  // (Measured: the blade is up to 7 cm from its axis below 0.75 m; above, the hand and cape crowd in.)
  const reach = p[1] < 0.75 ? 0.08 : 0.05;
  if (dSword < reach && p[2] > 0.05 && (p[1] < 0.75 || p[2] > onAxis[2] - 0.03)) return [[IDX.hand_R, 1]];
  // The tabard hanging between the legs rides the hips, so a stride doesn't stretch it.
  if (Math.abs(p[0] - 0.07) < 0.09 && p[2] > -0.2 && p[1] > 0.4 && p[1] < 1.0) return [[IDX.hips, 1]];
  const ARM = /arm|hand/;
  const pool = allowed(p)
    .map((name) => {
      const b = BONES[IDX[name]];
      const d = segDist(p, b[2], b[3]);
      let w = 1 / (Math.pow(d + 0.01, 4) + 1e-9);
      if (ARM.test(name)) {
        // An arm takes its armour (up to ~11 cm from its axis) fully, fades out by 19 cm, and never
        // takes what hangs well behind it (the cape): soft, so nothing tears where it lets go.
        const q = closest(p, b[2], b[3]);
        w *= 1 - smooth(0.11, 0.19, d);
        w *= 1 - smooth(0.06, 0.14, q[2] - p[2]);
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

// ---------- the clips (the Nemesis is 1.9 m: translations as keyed) ----------
const CLIPS = swordClips(1);
if (process.env.RIG_REPORT) {
  // Arm poses one per second, to see which stay clean.
  const poses = [[-40, 0, 0], [-85, 0, 0], [-120, 0, 0], [-150, 0, 0], [0, 0, -30], [0, 0, -55], [-60, 0, -30]];
  CLIPS.armtest = { len: poses.length, upperarm_R: poses.flatMap((p, i) => [[i, p], [i + 0.99, p]]) };
}

function report({ P, J, W, n, prim }) {
  if (!process.env.RIG_REPORT) return;
  {
    // Triangles torn between the hand (sword) and a body bone: where a sheet would stretch.
    const idx = prim.getIndices();
    const dom = (i) => J[i * 4];
    const hand = IDX.hand_R;
    const armR = new Set([IDX.upperarm_R, IDX.forearm_R, IDX.hand_R]);
    const cells = new Map();
    let torn = 0;
    for (let f = 0; f < idx.getCount(); f += 3) {
      const tri = [idx.getScalar(f), idx.getScalar(f + 1), idx.getScalar(f + 2)];
      const armW = (i) => [0, 1, 2, 3].reduce((a, k) => a + (armR.has(J[i * 4 + k]) ? W[i * 4 + k] : 0), 0);
      const onHand = tri.filter((i) => armW(i) > 0.7).length;
      const offArm = tri.filter((i) => armW(i) < 0.3).length;
      if (onHand && offArm) {
        torn++;
        const c = [0, 1, 2].map((k) => tri.reduce((a, i) => a + P[i][k], 0) / 3);
        const key = c.map((x) => Math.round(x / 0.1) / 10).join(',');
        cells.set(key, (cells.get(key) ?? 0) + 1);
      }
    }
    console.log('torn hand/body triangles', torn, 'cells:', [...cells].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, c]) => `${k}:${c}`).join('  '));
  }
  {
    // Vertices split between a right-arm bone and the body: the ones that would stretch into sheets.
    const armR = new Set([IDX.upperarm_R, IDX.forearm_R, IDX.hand_R]);
    const mixed = [];
    for (let i = 0; i < n; i++) {
      let a = 0;
      for (let k = 0; k < 4; k++) if (armR.has(J[i * 4 + k])) a += W[i * 4 + k];
      if (a > 0.1 && a < 0.9) mixed.push(P[i]);
    }
    const bins = new Map();
    for (const p of mixed) {
      const k = [p[0], p[1], p[2]].map((x) => Math.round(x / 0.1) / 10).join(',');
      bins.set(k, (bins.get(k) ?? 0) + 1);
    }
    console.log('mixed right-arm vertices', mixed.length, 'top cells (x,y,z):', [...bins].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, c]) => `${k}:${c}`).join('  '));
  }
}

await rig({ src: SRC, out: OUT, name: 'Nemesis', bones: BONES, weigh, clips: CLIPS, onWeights: report });
