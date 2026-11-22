// The runes of the 3D world: the browser's own checks on how it reads the Blender pipeline's files
// and places Kael in a fight. A clean game passes them all; each one that fails is a broken rune on
// the Rune Ledger, and the Throne's seal holds while any is broken (the server keeps the runes of
// the rules: server/src/quest/locks.js). They run once when the game loads: fix, rebuild, reload.
import { DRACO_PATH, modelFit, parseManifest } from './scene/assets.js';
import { LANE_NAMES, decodeGrid, gridBlocked, intoLane, laneOf } from './scene/world.js';

// `get(url)` answers the file's text, or null when it is missing.
const browserGet = async (url) => {
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
};

const CHECKS = [
  // Every character stands at a believable height.
  async ({ manifest }) =>
    manifest.filter((e) => typeof e === 'object' && /^(char|npc)_/.test(e.key) && e.height).every((e) => e.height >= 1.2 && e.height <= 2.4),
  // The manifest's options reach the models.
  async ({ manifest }) => {
    const models = parseManifest(manifest);
    const king = models.get('boss_hollow_king');
    return models.get('room_1')?.mini === true && king?.toon === false && Math.abs(modelFit(king, 1).turn - Math.PI) < 1e-9;
  },
  // The walking map is read row by row.
  async () => {
    const G = decodeGrid({ cell: 1, x0: 0, z0: 0, w: 4, h: 2, bits: 'CA==' }); // one blocked cell: x 3, z 0
    return gridBlocked(G, 3.5, 0.5) && !gridBlocked(G, 0.5, 1.5);
  },
  // The Draco decoder is where three.js will look for it (the real script, not the page served for
  // an unknown path).
  async ({ get }) => /DracoDecoderModule/.test((await get(`${DRACO_PATH}draco_wasm_wrapper.js`)) ?? ''),
  // The lane reported is the lane stood in, whichever way the room faces.
  async () =>
    [0, Math.PI / 2, -Math.PI / 2, 0.7].every((yaw) => {
      const w = { axis: { x: 1, z: -2, yaw } };
      return LANE_NAMES.every((lane) => laneOf(w, ...intoLane(w, 4, 3, lane)) === lane);
    }),
];

export const WORLD_RUNE_COUNT = CHECKS.length;

export async function worldRunes(get = browserGet) {
  let manifest = [];
  try {
    manifest = JSON.parse((await get('/models/manifest.json')) ?? '[]');
  } catch {
    manifest = [];
  }
  let broken = 0;
  for (const check of CHECKS) {
    try {
      if (!(await check({ manifest, get }))) broken += 1;
    } catch {
      broken += 1;
    }
  }
  return broken;
}
