// Rigs a single-mesh sculpt with no skeleton, without Blender: a humanoid skeleton fitted to the
// sculpt's own joints (bones as nodes, rest rotation identity), skin weights from a per-model rule
// (`weigh`), and hand-keyed clips. Used by rig-nemesis.mjs and rig-king.mjs, which hold each boss's
// profile: its bones, its blade and its body rules.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dequantize, meshopt, prune } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

// ---------- vector helpers ----------
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export function closest(p, a, b) {
  const ab = sub(b, a);
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / dot(ab, ab)));
  return [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t];
}
export function segDist(p, a, b) {
  const q = closest(p, a, b);
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}
export const rad = (d) => (d * Math.PI) / 180;
export function quatXYZ([x, y, z]) {
  // intrinsic X, then Y, then Z (degrees) as one quaternion [x, y, z, w]
  const [cx, sx] = [Math.cos(rad(x) / 2), Math.sin(rad(x) / 2)];
  const [cy, sy] = [Math.cos(rad(y) / 2), Math.sin(rad(y) / 2)];
  const [cz, sz] = [Math.cos(rad(z) / 2), Math.sin(rad(z) / 2)];
  return [sx * cy * cz + cx * sy * sz, cx * sy * cz - sx * cy * sz, cx * cy * sz + sx * sy * cz, cx * cy * cz - sx * sy * sz];
}

export function smooth(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// ---------- the sword-bearer's move set: per bone, keys of [time s, [x°, y°, z°]]; 'hips_t' moves the
// hips (metres for a 1.9 m figure, times `scale`) ----------
export function swordClips(scale = 1) {
  const T = (k) => k.map(([t, v]) => [t, v.map((x) => x * scale)]);
  const CLIPS = {
    idle: {
      len: 2.4,
      chest: [
        [0, [0, 0, 0]],
        [1.2, [3, 0, 0]],
        [2.4, [0, 0, 0]],
      ],
      head: [
        [0, [0, 0, 0]],
        [0.6, [0, 7, 0]],
        [1.8, [0, -7, 0]],
        [2.4, [0, 0, 0]],
      ],
      upperarm_R: [
        [0, [0, 0, 0]],
        [1.2, [-4, 0, -2]],
        [2.4, [0, 0, 0]],
      ],
      upperarm_L: [
        [0, [0, 0, 0]],
        [1.2, [3, 0, 3]],
        [2.4, [0, 0, 0]],
      ],
      hips_t: T([
        [0, [0, 0, 0]],
        [1.2, [0, -0.012, 0]],
        [2.4, [0, 0, 0]],
      ]),
    },
    run: {
      len: 0.8,
      thigh_R: [
        [0, [-38, 0, 0]],
        [0.4, [28, 0, 0]],
        [0.8, [-38, 0, 0]],
      ],
      thigh_L: [
        [0, [28, 0, 0]],
        [0.4, [-38, 0, 0]],
        [0.8, [28, 0, 0]],
      ],
      shin_R: [
        [0, [8, 0, 0]],
        [0.2, [10, 0, 0]],
        [0.5, [62, 0, 0]],
        [0.8, [8, 0, 0]],
      ],
      shin_L: [
        [0, [62, 0, 0]],
        [0.1, [40, 0, 0]],
        [0.4, [8, 0, 0]],
        [0.6, [10, 0, 0]],
        [0.8, [62, 0, 0]],
      ],
      chest: [
        [0, [12, -7, 0]],
        [0.4, [12, 7, 0]],
        [0.8, [12, -7, 0]],
      ],
      upperarm_L: [
        [0, [-28, 0, 4]],
        [0.4, [24, 0, 4]],
        [0.8, [-28, 0, 4]],
      ],
      upperarm_R: [
        [0, [-22, 0, -4]],
        [0.4, [-14, 0, -4]],
        [0.8, [-22, 0, -4]],
      ],
      hips_t: T([
        [0, [0, 0, 0]],
        [0.2, [0, -0.05, 0]],
        [0.4, [0, 0, 0]],
        [0.6, [0, -0.05, 0]],
        [0.8, [0, 0, 0]],
      ]),
    },
    // A one-handed diagonal slash: the blade goes up over the right shoulder, then down across.
    attack: {
      len: 0.95,
      upperarm_R: [
        [0, [0, 0, 0]],
        [0.32, [-150, 0, -25]],
        [0.5, [-25, 0, 18]],
        [0.95, [0, 0, 0]],
      ],
      forearm_R: [
        [0, [0, 0, 0]],
        [0.32, [-35, 0, 0]],
        [0.5, [-8, 0, 0]],
        [0.95, [0, 0, 0]],
      ],
      chest: [
        [0, [0, 0, 0]],
        [0.32, [-8, 28, 0]],
        [0.5, [16, -24, 0]],
        [0.95, [0, 0, 0]],
      ],
      thigh_R: [
        [0, [0, 0, 0]],
        [0.5, [-18, 0, 0]],
        [0.95, [0, 0, 0]],
      ],
      shin_R: [
        [0, [0, 0, 0]],
        [0.5, [22, 0, 0]],
        [0.95, [0, 0, 0]],
      ],
      hips_t: T([
        [0, [0, 0, 0]],
        [0.5, [0, -0.05, 0.06]],
        [0.95, [0, 0, 0]],
      ]),
    },
    // Heavy overhead strike with both hands (Morvath's Shadow Blade).
    boss_strike: {
      len: 1.15,
      upperarm_R: [
        [0, [0, 0, 0]],
        [0.45, [-168, 0, -8]],
        [0.62, [-38, 0, 12]],
        [0.9, [-38, 0, 12]],
        [1.15, [0, 0, 0]],
      ],
      upperarm_L: [
        [0, [0, 0, 0]],
        [0.45, [-160, 0, -40]],
        [0.62, [-45, 0, -30]],
        [0.9, [-45, 0, -30]],
        [1.15, [0, 0, 0]],
      ],
      forearm_L: [
        [0, [0, 0, 0]],
        [0.45, [-30, 0, 0]],
        [0.62, [-20, 0, 0]],
        [1.15, [0, 0, 0]],
      ],
      hips: [
        [0, [0, 0, 0]],
        [0.62, [18, 0, 0]],
        [0.9, [16, 0, 0]],
        [1.15, [0, 0, 0]],
      ],
      chest: [
        [0, [0, 0, 0]],
        [0.45, [-14, 0, 0]],
        [0.62, [12, 0, 0]],
        [0.9, [10, 0, 0]],
        [1.15, [0, 0, 0]],
      ],
      head: [
        [0, [0, 0, 0]],
        [0.45, [-10, 0, 0]],
        [0.62, [8, 0, 0]],
        [1.15, [0, 0, 0]],
      ],
      thigh_R: [
        [0, [0, 0, 0]],
        [0.62, [-40, 0, 0]],
        [0.9, [-38, 0, 0]],
        [1.15, [0, 0, 0]],
      ],
      shin_R: [
        [0, [0, 0, 0]],
        [0.62, [36, 0, 0]],
        [0.9, [36, 0, 0]],
        [1.15, [0, 0, 0]],
      ],
      thigh_L: [
        [0, [0, 0, 0]],
        [0.62, [-36, 0, 0]],
        [0.9, [-34, 0, 0]],
        [1.15, [0, 0, 0]],
      ],
      shin_L: [
        [0, [0, 0, 0]],
        [0.62, [30, 0, 0]],
        [0.9, [30, 0, 0]],
        [1.15, [0, 0, 0]],
      ],
      hips_t: T([
        [0, [0, 0, 0]],
        [0.45, [0, 0.04, 0]],
        [0.62, [0, -0.12, 0.1]],
        [0.9, [0, -0.12, 0.1]],
        [1.15, [0, 0, 0]],
      ]),
    },
    // A wide horizontal sweep (Morvath's Black Sweep): wind to the right, cut across to the left.
    boss_sweep: {
      len: 1.2,
      upperarm_R: [
        [0, [0, 0, 0]],
        [0.4, [-70, 0, -55]],
        [0.75, [-85, 0, 30]],
        [1.2, [0, 0, 0]],
      ],
      forearm_R: [
        [0, [0, 0, 0]],
        [0.4, [-20, 0, 0]],
        [0.75, [-5, 0, 0]],
        [1.2, [0, 0, 0]],
      ],
      hips: [
        [0, [0, 0, 0]],
        [0.4, [0, 14, 0]],
        [0.75, [0, -18, 0]],
        [1.2, [0, 0, 0]],
      ],
      chest: [
        [0, [0, 0, 0]],
        [0.4, [4, 26, 0]],
        [0.75, [8, -32, 0]],
        [1.2, [0, 0, 0]],
      ],
      upperarm_L: [
        [0, [0, 0, 0]],
        [0.4, [0, 0, 12]],
        [0.75, [-25, 0, 18]],
        [1.2, [0, 0, 0]],
      ],
      hips_t: T([
        [0, [0, 0, 0]],
        [0.75, [0, -0.07, 0]],
        [1.2, [0, 0, 0]],
      ]),
      thigh_L: [
        [0, [0, 0, 0]],
        [0.75, [-20, 0, 0]],
        [1.2, [0, 0, 0]],
      ],
      shin_L: [
        [0, [0, 0, 0]],
        [0.75, [28, 0, 0]],
        [1.2, [0, 0, 0]],
      ],
    },
    // Hellfire Charge: low, leaning, the blade levelled like a lance.
    charge: {
      len: 0.9,
      hips: [
        [0, [0, 0, 0]],
        [0.18, [14, 0, 0]],
        [0.65, [14, 0, 0]],
        [0.9, [0, 0, 0]],
      ],
      chest: [
        [0, [0, 0, 0]],
        [0.18, [16, 0, 0]],
        [0.65, [16, 0, 0]],
        [0.9, [0, 0, 0]],
      ],
      head: [
        [0, [0, 0, 0]],
        [0.18, [-22, 0, 0]],
        [0.65, [-22, 0, 0]],
        [0.9, [0, 0, 0]],
      ],
      upperarm_R: [
        [0, [0, 0, 0]],
        [0.18, [-85, 0, 12]],
        [0.65, [-85, 0, 12]],
        [0.9, [0, 0, 0]],
      ],
      forearm_R: [
        [0, [0, 0, 0]],
        [0.18, [-12, 0, 0]],
        [0.9, [0, 0, 0]],
      ],
      upperarm_L: [
        [0, [0, 0, 0]],
        [0.18, [25, 0, 8]],
        [0.65, [25, 0, 8]],
        [0.9, [0, 0, 0]],
      ],
      thigh_R: [
        [0, [0, 0, 0]],
        [0.18, [-50, 0, 0]],
        [0.4, [6, 0, 0]],
        [0.65, [-50, 0, 0]],
        [0.9, [0, 0, 0]],
      ],
      shin_R: [
        [0, [0, 0, 0]],
        [0.18, [20, 0, 0]],
        [0.4, [60, 0, 0]],
        [0.65, [20, 0, 0]],
        [0.9, [0, 0, 0]],
      ],
      thigh_L: [
        [0, [0, 0, 0]],
        [0.18, [6, 0, 0]],
        [0.4, [-50, 0, 0]],
        [0.65, [6, 0, 0]],
        [0.9, [0, 0, 0]],
      ],
      shin_L: [
        [0, [0, 0, 0]],
        [0.18, [55, 0, 0]],
        [0.4, [20, 0, 0]],
        [0.65, [55, 0, 0]],
        [0.9, [0, 0, 0]],
      ],
      hips_t: T([
        [0, [0, 0, 0]],
        [0.18, [0, -0.1, 0.08]],
        [0.65, [0, -0.1, 0.08]],
        [0.9, [0, 0, 0]],
      ]),
    },
    // Infernal Slam: both hands raise the blade overhead, it leaps, and drives the blade into the floor.
    slam: {
      len: 1.25,
      upperarm_R: [
        [0, [0, 0, 0]],
        [0.42, [-172, 0, -6]],
        [0.58, [-28, 0, 10]],
        [0.9, [-28, 0, 10]],
        [1.25, [0, 0, 0]],
      ],
      upperarm_L: [
        [0, [0, 0, 0]],
        [0.42, [-165, 0, -42]],
        [0.58, [-35, 0, -32]],
        [0.9, [-35, 0, -32]],
        [1.25, [0, 0, 0]],
      ],
      forearm_R: [
        [0, [0, 0, 0]],
        [0.42, [-20, 0, 0]],
        [0.58, [0, 0, 0]],
        [1.25, [0, 0, 0]],
      ],
      hips: [
        [0, [0, 0, 0]],
        [0.42, [-8, 0, 0]],
        [0.58, [26, 0, 0]],
        [0.9, [24, 0, 0]],
        [1.25, [0, 0, 0]],
      ],
      chest: [
        [0, [0, 0, 0]],
        [0.42, [-10, 0, 0]],
        [0.58, [16, 0, 0]],
        [0.9, [14, 0, 0]],
        [1.25, [0, 0, 0]],
      ],
      head: [
        [0, [0, 0, 0]],
        [0.42, [-20, 0, 0]],
        [0.58, [-10, 0, 0]],
        [1.25, [0, 0, 0]],
      ],
      thigh_R: [
        [0, [0, 0, 0]],
        [0.3, [-25, 0, 0]],
        [0.42, [8, 0, 0]],
        [0.58, [-58, 0, 0]],
        [0.9, [-56, 0, 0]],
        [1.25, [0, 0, 0]],
      ],
      shin_R: [
        [0, [0, 0, 0]],
        [0.3, [40, 0, 0]],
        [0.42, [5, 0, 0]],
        [0.58, [62, 0, 0]],
        [0.9, [62, 0, 0]],
        [1.25, [0, 0, 0]],
      ],
      thigh_L: [
        [0, [0, 0, 0]],
        [0.3, [-25, 0, 0]],
        [0.42, [8, 0, 0]],
        [0.58, [-44, 0, 0]],
        [0.9, [-42, 0, 0]],
        [1.25, [0, 0, 0]],
      ],
      shin_L: [
        [0, [0, 0, 0]],
        [0.3, [40, 0, 0]],
        [0.42, [5, 0, 0]],
        [0.58, [44, 0, 0]],
        [0.9, [44, 0, 0]],
        [1.25, [0, 0, 0]],
      ],
      hips_t: T([
        [0, [0, 0, 0]],
        [0.3, [0, -0.08, 0]],
        [0.42, [0, 0.06, 0]],
        [0.58, [0, -0.18, 0.08]],
        [0.9, [0, -0.18, 0.08]],
        [1.25, [0, 0, 0]],
      ]),
    },
    // Enraged: arms flung wide, head back, a roar.
    transform: {
      len: 1.35,
      upperarm_R: [
        [0, [0, 0, 0]],
        [0.3, [-30, 0, -55]],
        [0.95, [-34, 0, -58]],
        [1.35, [0, 0, 0]],
      ],
      upperarm_L: [
        [0, [0, 0, 0]],
        [0.3, [-35, 0, 22]],
        [0.95, [-38, 0, 24]],
        [1.35, [0, 0, 0]],
      ],
      forearm_L: [
        [0, [0, 0, 0]],
        [0.3, [-30, 0, 0]],
        [1.35, [0, 0, 0]],
      ],
      chest: [
        [0, [0, 0, 0]],
        [0.3, [-22, 0, 0]],
        [0.95, [-25, 0, 0]],
        [1.35, [0, 0, 0]],
      ],
      head: [
        [0, [0, 0, 0]],
        [0.3, [-30, 0, 0]],
        [0.95, [-32, 0, 0]],
        [1.35, [0, 0, 0]],
      ],
      hips_t: T([
        [0, [0, 0, 0]],
        [0.3, [0, 0.03, -0.04]],
        [1.35, [0, 0, 0]],
      ]),
    },
    hit: {
      len: 0.45,
      chest: [
        [0, [0, 0, 0]],
        [0.12, [-14, -8, 0]],
        [0.45, [0, 0, 0]],
      ],
      head: [
        [0, [0, 0, 0]],
        [0.12, [-12, 0, 0]],
        [0.45, [0, 0, 0]],
      ],
      hips_t: T([
        [0, [0, 0, 0]],
        [0.12, [0, 0, -0.06]],
        [0.45, [0, 0, 0]],
      ]),
    },
    armour_break: {
      len: 0.85,
      chest: [
        [0, [0, 0, 0]],
        [0.18, [-20, 10, 0]],
        [0.85, [0, 0, 0]],
      ],
      head: [
        [0, [0, 0, 0]],
        [0.18, [-18, 0, 0]],
        [0.85, [0, 0, 0]],
      ],
      upperarm_R: [
        [0, [0, 0, 0]],
        [0.18, [-15, 0, -30]],
        [0.85, [0, 0, 0]],
      ],
      upperarm_L: [
        [0, [0, 0, 0]],
        [0.18, [-15, 0, 30]],
        [0.85, [0, 0, 0]],
      ],
      hips_t: T([
        [0, [0, 0, 0]],
        [0.18, [0, -0.04, -0.12]],
        [0.85, [0, 0, 0]],
      ]),
    },
    // Guard: the blade brought across the body.
    defend: {
      len: 0.7,
      upperarm_R: [
        [0, [0, 0, 0]],
        [0.2, [-65, 0, 25]],
        [0.5, [-65, 0, 25]],
        [0.7, [0, 0, 0]],
      ],
      forearm_R: [
        [0, [0, 0, 0]],
        [0.2, [-55, 0, 0]],
        [0.5, [-55, 0, 0]],
        [0.7, [0, 0, 0]],
      ],
      upperarm_L: [
        [0, [0, 0, 0]],
        [0.2, [-50, 0, -30]],
        [0.5, [-50, 0, -30]],
        [0.7, [0, 0, 0]],
      ],
      chest: [
        [0, [0, 0, 0]],
        [0.2, [6, 0, 0]],
        [0.7, [0, 0, 0]],
      ],
    },
    victory: {
      len: 1.4,
      upperarm_R: [
        [0, [0, 0, 0]],
        [0.35, [-172, 0, -10]],
        [1.0, [-172, 0, -10]],
        [1.4, [0, 0, 0]],
      ],
      head: [
        [0, [0, 0, 0]],
        [0.35, [-18, 0, 0]],
        [1.0, [-18, 0, 0]],
        [1.4, [0, 0, 0]],
      ],
      chest: [
        [0, [0, 0, 0]],
        [0.35, [-8, 0, 0]],
        [1.4, [0, 0, 0]],
      ],
    },
    // Death: the knees go, then it folds forward onto its blade (the game holds the last frame).
    death: {
      len: 1.6,
      hips: [
        [0, [0, 0, 0]],
        [0.5, [12, 0, 0]],
        [1.6, [40, 0, 0]],
      ],
      thigh_R: [
        [0, [0, 0, 0]],
        [0.5, [-67, 0, 0]],
        [1.6, [-120, 0, 0]],
      ],
      shin_R: [
        [0, [0, 0, 0]],
        [0.5, [95, 0, 0]],
        [1.6, [120, 0, 0]],
      ],
      thigh_L: [
        [0, [0, 0, 0]],
        [0.5, [-62, 0, 0]],
        [1.6, [-115, 0, 0]],
      ],
      shin_L: [
        [0, [0, 0, 0]],
        [0.5, [90, 0, 0]],
        [1.6, [115, 0, 0]],
      ],
      chest: [
        [0, [0, 0, 0]],
        [0.5, [8, 0, 0]],
        [1.6, [22, 0, 0]],
      ],
      head: [
        [0, [0, 0, 0]],
        [0.5, [15, 0, 0]],
        [1.6, [30, 0, 0]],
      ],
      upperarm_R: [
        [0, [0, 0, 0]],
        [0.5, [-30, 0, 0]],
        [1.6, [-10, 0, -20]],
      ],
      upperarm_L: [
        [0, [0, 0, 0]],
        [0.5, [10, 0, 20]],
        [1.6, [25, 0, 35]],
      ],
      hips_t: T([
        [0, [0, 0, 0]],
        [0.5, [0, -0.38, 0.05]],
        [1.6, [0, -0.62, 0.18]],
      ]),
    },
  };
  CLIPS.walk = Object.fromEntries(Object.entries(CLIPS.run).map(([k, v]) => [k, k === 'len' ? 1.15 : v.map(([t, val]) => [t * (1.15 / 0.8), k === 'hips_t' ? val : val.map((x) => x * 0.6)])]));
  return CLIPS;
}

// ---------- build ----------
// bones: [name, parent, head, tail][]; weigh(p, i) -> [[boneIndex, weight]...]; clips as above.
// setup({ P, indices, prim }), if given (and may be async), runs once before the weights (e.g. to find the blade's own charts).
export async function rig({ src, out, name, bones: BONES, weigh, setup, clips: CLIPS, onWeights }) {
  const IDX = Object.fromEntries(BONES.map((b, i) => [b[0], i]));
  await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'meshopt.decoder': MeshoptDecoder,
    'meshopt.encoder': MeshoptEncoder,
  });
  const doc = await io.read(src);
  const root = doc.getRoot();
  if (root.listSkins().length) throw new Error('already rigged: run on the unrigged sculpt');
  await doc.transform(dequantize());
  const meshNode = root.listNodes().find((n) => n.getMesh());
  const prim = meshNode.getMesh().listPrimitives()[0];
  // Bake the node's transform into the vertices: a skinned mesh's own transform must be identity.
  const t = meshNode.getTranslation();
  const s = meshNode.getScale();
  const pos = prim.getAttribute('POSITION');
  const n = pos.getCount();
  const v = [0, 0, 0];
  const P = new Array(n);
  for (let i = 0; i < n; i++) {
    pos.getElement(i, v);
    P[i] = [v[0] * s[0] + t[0], v[1] * s[1] + t[1], v[2] * s[2] + t[2]];
    pos.setElement(i, P[i]);
  }
  meshNode.setTranslation([0, 0, 0]).setScale([1, 1, 1]).setRotation([0, 0, 0, 1]);

  // Bones as nodes (rest rotation identity, so clips rotate about the sculpt's own axes).
  const buffer = root.listBuffers()[0];
  const joints = BONES.map(([name]) => doc.createNode(name));
  BONES.forEach(([, parent, head], i) => {
    const ph = parent ? BONES[IDX[parent]][2] : [0, 0, 0];
    joints[i].setTranslation(parent ? sub(head, ph) : head);
    if (parent) joints[IDX[parent]].addChild(joints[i]);
  });
  const armature = doc.createNode('Armature').addChild(joints[0]);
  root.listScenes()[0].addChild(armature);
  const ibm = new Float32Array(BONES.length * 16);
  BONES.forEach(([, , head], i) => ibm.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -head[0], -head[1], -head[2], 1], i * 16));
  const skin = doc.createSkin(name).setSkeleton(joints[0]).setInverseBindMatrices(doc.createAccessor().setType('MAT4').setArray(ibm).setBuffer(buffer));
  joints.forEach((j) => skin.addJoint(j));
  meshNode.setSkin(skin);

  // Weights.
  await setup?.({ P, indices: prim.getIndices().getArray(), prim });
  const J = new Uint8Array(n * 4);
  const W = new Float32Array(n * 4);
  const usage = new Array(BONES.length).fill(0);
  for (let i = 0; i < n; i++) {
    weigh(P[i], i).forEach(([j, w], k) => {
      J[i * 4 + k] = j;
      W[i * 4 + k] = w;
      usage[j] += w;
    });
  }
  prim.setAttribute('JOINTS_0', doc.createAccessor().setType('VEC4').setArray(J).setBuffer(buffer));
  prim.setAttribute('WEIGHTS_0', doc.createAccessor().setType('VEC4').setArray(W).setBuffer(buffer));

  onWeights?.({ P, J, W, n, prim, IDX });

  // Clips.
  for (const [name, clip] of Object.entries(CLIPS)) {
    const anim = doc.createAnimation(name);
    for (const [bone, keys] of Object.entries(clip)) {
      if (bone === 'len') continue;
      const isT = bone === 'hips_t';
      const node = joints[IDX[isT ? 'hips' : bone]];
      const rest = node.getTranslation();
      const times = new Float32Array(keys.map(([time]) => time));
      const values = new Float32Array(keys.flatMap(([, val]) => (isT ? [rest[0] + val[0], rest[1] + val[1], rest[2] + val[2]] : quatXYZ(val))));
      const sampler = doc
        .createAnimationSampler()
        .setInput(doc.createAccessor().setType('SCALAR').setArray(times).setBuffer(buffer))
        .setOutput(
          doc
            .createAccessor()
            .setType(isT ? 'VEC3' : 'VEC4')
            .setArray(values)
            .setBuffer(buffer),
        )
        .setInterpolation('LINEAR');
      anim.addSampler(sampler).addChannel(
        doc
          .createAnimationChannel()
          .setTargetNode(node)
          .setTargetPath(isT ? 'translation' : 'rotation')
          .setSampler(sampler),
      );
    }
  }
  await doc.transform(prune(), meshopt({ encoder: MeshoptEncoder, level: 'high' }));
  await io.write(out, doc);
  console.log(`rigged: ${BONES.length} bones, ${n} vertices, clips: ${Object.keys(CLIPS).join(', ')}`);
  console.log('weight per bone:', BONES.map(([b], i) => `${b} ${Math.round(usage[i])}`).join(', '));
}
