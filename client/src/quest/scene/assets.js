// How the game reads what the Blender pipeline hands it (tools/blender → tools/models →
// client/public/models): the model manifest, each model's size and facing, and where the Draco
// decoder lives. Plain numbers and strings, no three.js, so it can be tested.

// Draco-compressed models (room 3) decode with three.js's own decoder, served from public/draco/,
// so no model depends on a CDN being reachable during the event. three.js puts the file name
// straight after this path (draco_wasm_wrapper.js, draco_decoder.wasm).
export const DRACO_PATH = '/draco';

// models/manifest.json: each entry is a model key, or { key, height, turn, toon, mini } for a model
// that needs sizing, turning, its own materials or a map miniature. Returns Map(key -> options).
export function parseManifest(list) {
  return new Map((Array.isArray(list) ? list : []).map((e) => (typeof e === 'string' ? [e, {}] : [e.key, { ...e.options }])));
}

// Blender characters face -Y (the front view), which arrives as +Z: turn them to face +X like the
// stand-ins (`turn` degrees, 90 by default). `height` (metres) rescales a model exported at the
// wrong size; `measured` is the model's own height as loaded.
export function modelFit(opts = {}, measured = 0) {
  return { scale: opts.height && measured > 0 ? opts.height / measured : 1, turn: ((opts.turn ?? 90) * Math.PI) / 180 };
}
