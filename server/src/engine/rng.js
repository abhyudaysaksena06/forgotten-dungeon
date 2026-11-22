// Seeded RNG. Every team gets the same DUNGEON_SEED, so every team gets the same dungeon.
// The generator state is a plain uint32 stored on the game state, so it survives
// snapshots, checkpoints and persistence without special handling.

export function hashSeed(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

// mulberry32, reading and writing holder.rngState on every draw.
export function createRng(holder) {
  function next() {
    holder.rngState = (holder.rngState + 0x6d2b79f5) >>> 0;
    let t = holder.rngState;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  return {
    next,
    die(sides) {
      return 1 + Math.floor(next() * sides);
    },
    pick(list) {
      return list[Math.floor(next() * list.length)];
    },
  };
}

// Test helper: dice come out in the given order. pick() also consumes a value (1-based index).
export function scriptedRng(values) {
  const queue = [...values];
  const take = (fallback) => (queue.length ? queue.shift() : fallback);
  return {
    next: () => 0.5,
    die(sides) {
      return Math.min(sides, Math.max(1, take(Math.ceil(sides / 2))));
    },
    pick(list) {
      const i = take(1) - 1;
      return list[Math.min(list.length - 1, Math.max(0, i))];
    },
    remaining: () => queue.length,
  };
}
