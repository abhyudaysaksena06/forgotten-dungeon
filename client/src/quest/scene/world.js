// Free movement inside a fight room. The game engine on the server still decides every hit;
// this only decides where people stand, whether the leader is close enough to act, and what the
// camera sees. Plain numbers, no three.js, so it can be tested.
//
// Axes: x right, y up, z towards the camera at the start. A yaw of 0 faces +x (where the enemies
// start); every model faces +x, so `rotation.y = yaw` turns it.

export const MOVE = { speed: 4.6, response: 12, turn: 14, jump: 5.8, gravity: 16 };
export const REACH = { melee: 2.4, magic: 9, ranged: 12 }; // how close the leader must be to act
export const RADIUS = { hero: 0.4, npc: 0.5, minion: 0.5, boss: 0.9, ultimate: 1.3, dragon: 2.3 };
export const CAMERA = { distance: 7.5, min: 4.5, max: 12, height: 4.4, lookHeight: 1.1 };

// The default room: a round floor with a back wall and pillars.
export const DEFAULT_ROOM = {
  bounds: { kind: 'circle', x: 0, z: 0, r: 8.4 },
  colliders: [
    { kind: 'box', minX: -9, maxX: 9, minZ: -7, maxZ: -6.2 }, // back wall
    ...[-5.5, -2.5, 2.5, 5.5].map((x) => ({ kind: 'circle', x, z: -5.6, r: 0.5 })), // pillars
  ],
  spawns: null, // { party: [[x,y,z]…], enemies: [[x,y,z]…], boss: [x,y,z] } from a Blender room
};

export function createWorld() {
  return {
    leaderId: null,
    fightKey: null,
    keys: new Set(),
    jumpQueued: false,
    camYaw: 0,
    camDist: CAMERA.distance,
    actors: new Map(), // id -> { x, y, z, vx, vy, vz, yaw, radius, motion, home, kind, alive }
    room: DEFAULT_ROOM,
    extraColliders: [], // NPCs and props that aren't part of the room model
  };
}

export const yawTo = (dx, dz) => Math.atan2(-dz, dx);
export const forwardOf = (yaw) => [Math.cos(yaw), -Math.sin(yaw)]; // [x, z]
export const rightOf = (yaw) => [Math.sin(yaw), Math.cos(yaw)];
export const distXZ = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export function lerpAngle(a, b, k) {
  let d = ((b - a + Math.PI) % (2 * Math.PI)) - Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return a + d * k;
}

// Which way the keys push, relative to the camera. Returns a unit [x, z] or [0, 0].
export function inputDirection(keys, camYaw) {
  const fwd = (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0);
  const side = (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0);
  if (!fwd && !side) return [0, 0];
  const [fx, fz] = forwardOf(camYaw);
  const [rx, rz] = rightOf(camYaw);
  const x = fwd * fx + side * rx;
  const z = fwd * fz + side * rz;
  const n = Math.hypot(x, z);
  return [x / n, z / n];
}

// The touch stick: x right, y forward, each -1..1; a light push walks slower.
export function stickDirection({ x, y }, camYaw) {
  const n = Math.hypot(x, y);
  if (n < 0.15) return [0, 0];
  const [fx, fz] = forwardOf(camYaw);
  const [rx, rz] = rightOf(camYaw);
  const k = Math.min(1, n) / n;
  return [(y * fx + x * rx) * k, (y * fz + x * rz) * k];
}

export function insideShape(s, x, z, r = 0) {
  if (s.kind === 'circle') return Math.hypot(x - s.x, z - s.z) <= s.r - r + 1e-9;
  return x >= s.minX + r - 1e-9 && x <= s.maxX - r + 1e-9 && z >= s.minZ + r - 1e-9 && z <= s.maxZ - r + 1e-9;
}

const ROW_GAP = 1.3; // metres between rows of minions

// Where the i-th minion starts in a Blender room. The room has a few spawn_enemy_* points; more
// minions than that stand in rows behind them, further from the party. Where a wall, a prop or
// another minion is in the way, the spot moves in front, to the side, or nearer. Undefined when
// the room has no enemy spawns.
export function roomSpot(room, i) {
  const spots = room.spawns?.enemies;
  if (!spots?.length) return undefined;
  const n = spots.length;
  if (i < n) return spots[i];
  const party = room.spawns.party?.[0] ?? [0, 0, 0];
  const cx = spots.reduce((t, p) => t + p[0], 0) / n;
  const cz = spots.reduce((t, p) => t + p[2], 0) / n;
  const len = Math.hypot(cx - party[0], cz - party[2]) || 1;
  const [bx, bz] = [(cx - party[0]) / len, (cz - party[2]) / len]; // away from the party
  const [sx, sz] = [-bz, bx]; // sideways
  const [x, y, z] = spots[i % n];
  const row = Math.floor(i / n) * ROW_GAP;
  const taken = Array.from({ length: i }, (_, j) => roomSpot(room, j));
  const walls = [room.bounds].flat().filter(Boolean);
  const props = room.colliders ?? [];
  const r = RADIUS.minion;
  const fits = (px, pz, spaced) =>
    (!walls.length || walls.some((s) => insideShape(s, px, pz, r))) &&
    !props.some((c) => insideShape(c, px, pz, -r)) &&
    (!spaced || taken.every((p) => Math.hypot(p[0] - px, p[2] - pz) >= 2 * r));
  // Behind and to one side first (straight behind would hide a name tag behind the front one's),
  // then straight behind, to the side, and in front of the spawn last. If no spot is clear of the
  // other minions, the first one clear of walls and props will do: the fight pushes them apart.
  for (const spaced of [true, false]) {
    for (const [a, b] of [[0.7, 0.7], [0.7, -0.7], [1, 0], [0, 1], [0, -1], [-0.7, 0.7], [-0.7, -0.7], [-1, 0]]) {
      for (const k of [1, 1.6, 0.6]) {
        const px = x + (bx * a + sx * b) * row * k;
        const pz = z + (bz * a + sz * b) * row * k;
        if (fits(px, pz, spaced)) return [px, y, pz];
      }
    }
  }
  return spots[i % n]; // nowhere clear at all: on the spawn itself
}

// The cage of a room: two cells side by side (the Healer's on the left as you face it, the
// Weaponsmith's on the right). CAGE is its size in metres.
export const CAGE = { width: 2.8, depth: 1.2, height: 2.3, reach: 1.7 };

// Where a room's cage stands: the nearest spot to its old NPC spot (else beside the party's start)
// where the whole cage is inside the walls, clear of props, off to the side of the fight, and away
// from the skeletons' spots and the party's start. A tight room gets a smaller cage. It faces the
// middle of the fight. Returns { x, z, yaw, scale, cells: [healer, smith] } (each cell's front,
// where Kael stands to use it), or null when no spot fits.
export function cageSpot(room) {
  const sp = room.spawns ?? {};
  const party = sp.party?.[0] ?? [0, 0, 0];
  const foes = sp.enemies?.length ? sp.enemies : [[party[0], 0, party[2] - 4]];
  const foe = [foes.reduce((t, p) => t + p[0], 0) / foes.length, foes.reduce((t, p) => t + p[2], 0) / foes.length];
  const mid = [(party[0] + foe[0]) / 2, (party[2] + foe[1]) / 2];
  const axis = [foe[0] - party[0], foe[1] - party[2]];
  const axisLen = Math.hypot(axis[0], axis[1]) || 1;
  const offAxis = (x, z) => Math.abs((x - party[0]) * axis[1] - (z - party[2]) * axis[0]) / axisLen; // metres beside the fight line
  const minions = Array.from({ length: 6 }, (_, i) => roomSpot(room, i)).filter(Boolean);
  const walls = [room.bounds].flat().filter(Boolean);
  const props = room.colliders ?? [];
  const target = sp.npcs?.[0] ?? [party[0] + 3.2, 0, party[2]];
  for (const scale of [1, 0.85, 0.7]) {
    const W = CAGE.width * scale;
    const D = CAGE.depth * scale;
    const place = (x, z) => {
      const yaw = Math.atan2(mid[0] - x, mid[1] - z); // facing the fight
      const f = [Math.sin(yaw), Math.cos(yaw)];
      const r = [Math.cos(yaw), -Math.sin(yaw)];
      return { x, z, yaw, at: (a, b) => [x + r[0] * a + f[0] * b, z + r[1] * a + f[1] * b] };
    };
    const fits = (c) => {
      if (offAxis(c.x, c.z) < W / 2 + 0.6) return false;
      for (const a of [-W / 2, -W / 4, 0, W / 4, W / 2]) {
        for (const b of [-D / 2, 0, D / 2]) {
          const [px, pz] = c.at(a, b);
          if (walls.length && !walls.some((s) => insideShape(s, px, pz, 0.1))) return false;
          if (props.some((s) => insideShape(s, px, pz, -0.1))) return false;
        }
      }
      for (const a of [-W / 4, W / 4]) {
        // the cells' fronts must be open floor
        const [px, pz] = c.at(a, D / 2 + 0.7);
        if (walls.length && !walls.some((s) => insideShape(s, px, pz, 0.25))) return false;
        if (props.some((s) => insideShape(s, px, pz, -0.25))) return false;
      }
      if (minions.some((m) => Math.hypot(m[0] - c.x, m[2] - c.z) < W / 2 + 0.5)) return false;
      return (sp.party ?? [party]).every((p) => Math.hypot(p[0] - c.x, p[2] - c.z) >= W / 2 + 0.8);
    };
    let best = null;
    for (let dx = -12; dx <= 12; dx += 0.25) {
      for (let dz = -12; dz <= 12; dz += 0.25) {
        const d = Math.hypot(dx, dz);
        if (best && d >= best.d) continue;
        const c = place(target[0] + dx, target[2] + dz);
        if (fits(c)) best = { d, c };
      }
    }
    if (best) {
      const { x, z, yaw, at } = best.c;
      return { x, z, yaw, scale, cells: [at(-W / 4, D / 2 + 0.7), at(W / 4, D / 2 + 0.7)] };
    }
  }
  return null;
}

function clampToShape(s, x, z, r) {
  if (s.kind === 'circle') {
    const dx = x - s.x;
    const dz = z - s.z;
    const d = Math.hypot(dx, dz) || 1;
    const max = Math.max(0, s.r - r);
    return d > max ? [s.x + (dx / d) * max, s.z + (dz / d) * max] : [x, z];
  }
  return [Math.max(s.minX + r, Math.min(x, s.maxX - r)), Math.max(s.minZ + r, Math.min(z, s.maxZ - r))];
}

// ---------- the walking map (built from the room's geometry: tools/models/collision-grid.mjs) ----------
export function decodeGrid(g) {
  if (!g) return null;
  const raw = typeof atob === 'function' ? atob(g.bits) : Buffer.from(g.bits, 'base64').toString('binary');
  const n = g.w * g.h;
  const blocked = new Uint8Array(n);
  for (let i = 0; i < n; i++) blocked[i] = (raw.charCodeAt(i >> 3) >> (i & 7)) & 1;
  let floor = null;
  if (g.floor) {
    const f = typeof atob === 'function' ? atob(g.floor) : Buffer.from(g.floor, 'base64').toString('binary');
    floor = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const v = f.charCodeAt(2 * i) | (f.charCodeAt(2 * i + 1) << 8);
      floor[i] = (v > 32767 ? v - 65536 : v) / 100;
    }
  }
  return { cell: g.cell, x0: g.x0, z0: g.z0, w: g.w, h: g.h, blocked, floor, field: null };
}
const cellAt = (G, x, z) => {
  const cx = Math.floor((x - G.x0) / G.cell);
  const cz = Math.floor((z - G.z0) / G.cell);
  return cx < 0 || cz < 0 || cx >= G.w || cz >= G.h ? -1 : cz * G.w + cx;
};
export const gridBlocked = (G, x, z) => {
  const i = cellAt(G, x, z);
  return i < 0 || G.blocked[i] === 1;
};
export const gridFloor = (G, x, z) => {
  const i = cellAt(G, x, z);
  return i < 0 || !G.floor || G.blocked[i] ? 0 : G.floor[i];
};

// Push a circle out of every blocked cell it overlaps (cells are squares).
function resolveGrid(pos, radius, G) {
  if (gridBlocked(G, pos.x, pos.z)) {
    // Centre inside a wall (spawned or shoved there): to the nearest free cell centre.
    const c = G.cell;
    for (let ring = 1; ring < 12; ring++) {
      let best = null;
      for (let dz = -ring; dz <= ring; dz++) {
        for (let dx = -ring; dx <= ring; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
          const x = pos.x + dx * c;
          const z = pos.z + dz * c;
          if (gridBlocked(G, x, z)) continue;
          const d = dx * dx + dz * dz;
          if (!best || d < best.d) best = { x, z, d };
        }
      }
      if (best) {
        pos.x = G.x0 + (Math.floor((best.x - G.x0) / c) + 0.5) * c;
        pos.z = G.z0 + (Math.floor((best.z - G.z0) / c) + 0.5) * c;
        break;
      }
    }
  }
  const c = G.cell;
  const minX = Math.floor((pos.x - radius - G.x0) / c);
  const maxX = Math.floor((pos.x + radius - G.x0) / c);
  const minZ = Math.floor((pos.z - radius - G.z0) / c);
  const maxZ = Math.floor((pos.z + radius - G.z0) / c);
  let px = 0;
  let pz = 0;
  for (let cz = minZ; cz <= maxZ; cz++) {
    for (let cx = minX; cx <= maxX; cx++) {
      const inside = cx >= 0 && cz >= 0 && cx < G.w && cz < G.h;
      if (inside && !G.blocked[cz * G.w + cx]) continue;
      const bx0 = G.x0 + cx * c;
      const bz0 = G.z0 + cz * c;
      const qx = Math.max(bx0, Math.min(pos.x, bx0 + c));
      const qz = Math.max(bz0, Math.min(pos.z, bz0 + c));
      const dx = pos.x - qx;
      const dz = pos.z - qz;
      const d = Math.hypot(dx, dz);
      if (d < radius && d > 1e-6) {
        // Deepest push per axis, so a flat wall made of many cells pushes once, not once per cell.
        const ox = (dx / d) * (radius - d);
        const oz = (dz / d) * (radius - d);
        if (Math.abs(ox) > Math.abs(px)) px = ox;
        if (Math.abs(oz) > Math.abs(pz)) pz = oz;
      }
    }
  }
  pos.x += px;
  pos.z += pz;
  return px !== 0 || pz !== 0;
}

// Push a circle at (x, z) out of the room's walls and everyone else's space. A few passes, so being
// pushed out of one wall into a corner's other wall is caught too.
export function resolve(pos, radius, world, ignoreId) {
  const G = world.room.grid;
  for (let pass = 0; pass < 3; pass++) {
    resolveOnce(pos, radius, world, ignoreId);
    if (!G || !resolveGrid(pos, radius, G)) break;
  }
  return pos;
}

function resolveOnce(pos, radius, world, ignoreId) {
  const { bounds, colliders } = world.room;
  for (let k = 0, n = colliders.length + world.extraColliders.length; k < n; k++) {
    const c = k < colliders.length ? colliders[k] : world.extraColliders[k - colliders.length];
    if (c.kind === 'circle') {
      const dx = pos.x - c.x;
      const dz = pos.z - c.z;
      const d = Math.hypot(dx, dz);
      const min = radius + c.r;
      if (d < min) {
        const nx = d > 1e-6 ? dx / d : 1;
        const nz = d > 1e-6 ? dz / d : 0;
        pos.x = c.x + nx * min;
        pos.z = c.z + nz * min;
      }
    } else {
      const cx = Math.max(c.minX, Math.min(pos.x, c.maxX));
      const cz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
      const dx = pos.x - cx;
      const dz = pos.z - cz;
      const d = Math.hypot(dx, dz);
      if (d > 1e-6 && d < radius) {
        pos.x = cx + (dx / d) * radius;
        pos.z = cz + (dz / d) * radius;
      } else if (d <= 1e-6) {
        // Centre inside the box: leave by the nearest side.
        const exits = [
          [c.minX - radius - pos.x, 0],
          [c.maxX + radius - pos.x, 0],
          [0, c.minZ - radius - pos.z],
          [0, c.maxZ + radius - pos.z],
        ].sort((a, b) => Math.abs(a[0] + a[1]) - Math.abs(b[0] + b[1]));
        pos.x += exits[0][0];
        pos.z += exits[0][1];
      }
    }
  }
  for (const [id, a] of world.actors) {
    if (id === ignoreId || !a.alive || !a.solid) continue;
    const dx = pos.x - a.x;
    const dz = pos.z - a.z;
    const d = Math.hypot(dx, dz);
    const min = radius + a.radius;
    if (d < min && d > 1e-6) {
      pos.x = a.x + (dx / d) * min;
      pos.z = a.z + (dz / d) * min;
    }
  }
  // The walkable area is one shape or several (a nave and a rotunda): stay inside any of them.
  const shapes = Array.isArray(bounds) ? bounds : [bounds];
  if (!shapes.some((s) => insideShape(s, pos.x, pos.z, radius))) {
    let best = null;
    for (const s of shapes) {
      const p = clampToShape(s, pos.x, pos.z, radius);
      const d = Math.hypot(p[0] - pos.x, p[1] - pos.z);
      if (!best || d < best.d) best = { p, d };
    }
    [pos.x, pos.z] = best.p;
  }
}

const groundAt = (world, x, z, y = 0) => (world.room.floorY ? world.room.floorY(x, z, y) : 0);

// The player's hero: WASD relative to the camera, Space to jump.
export function stepLeader(world, dt) {
  const a = world.actors.get(world.leaderId);
  if (!a) return null;
  if (!a.alive) {
    a.vx = a.vz = 0;
    a.motion = 'down';
    return a;
  }
  const [dx, dz] = world.stick ? stickDirection(world.stick, world.camYaw) : inputDirection(world.keys, world.camYaw);
  const k = 1 - Math.exp(-MOVE.response * dt);
  a.vx += (dx * MOVE.speed - a.vx) * k;
  a.vz += (dz * MOVE.speed - a.vz) * k;
  const ground = groundAt(world, a.x, a.z, a.y);
  const grounded = a.y <= ground + 1e-3;
  if (world.jumpQueued && grounded) a.vy = MOVE.jump;
  world.jumpQueued = false;
  a.vy -= MOVE.gravity * dt;
  a.y += a.vy * dt;
  // In small steps (a fifth of a body), so no wall is ever thin enough to slip through.
  const n = Math.max(1, Math.ceil((Math.hypot(a.vx, a.vz) * dt) / (a.radius * 0.5)));
  const bx = a.x;
  const bz = a.z;
  for (let i = 0; i < n; i++) {
    a.x += (a.vx * dt) / n;
    a.z += (a.vz * dt) / n;
    resolve(a, a.radius, world, world.leaderId);
  }
  // Blocked: the speed into the wall is lost, so letting go of the key doesn't slide back out.
  if (dt > 0) {
    const mx = (a.x - bx) / dt;
    const mz = (a.z - bz) / dt;
    if (Math.hypot(mx, mz) < Math.hypot(a.vx, a.vz) - 0.05) {
      a.vx = mx;
      a.vz = mz;
    }
  }
  const floor = groundAt(world, a.x, a.z, a.y);
  if (a.y <= floor) {
    // Up a stair: a quick rise, not a jump cut.
    a.y = floor - a.y > 0.02 && a.vy <= 0 ? Math.min(floor, a.y + Math.max(0.02, 7 * dt)) : floor;
    if (a.y >= floor) a.vy = 0;
  }
  const speed = Math.hypot(a.vx, a.vz);
  if (dx || dz) a.yaw = lerpAngle(a.yaw, yawTo(dx, dz), 1 - Math.exp(-MOVE.turn * dt));
  a.motion = a.y > floor + 0.08 && a.vy !== 0 ? 'jump' : speed > 0.6 ? 'run' : 'idle';
  return a;
}

// The way to a target around walls: a breadth-first map of steps to the target's cell (rebuilt when
// the target moves to another cell, at most a few times a second), which an actor follows downhill
// whenever a wall stands between it and the target.
function fieldTo(G, tx, tz, now) {
  const goal = cellAt(G, tx, tz);
  const F = G.field;
  if (F && F.goal === goal && now - F.at < 2000) return F;
  if (F && now - F.at < 250) return F;
  const N = G.w * G.h;
  const dist = F?.dist ?? new Int32Array(N);
  dist.fill(-1);
  const queue = F?.queue ?? new Int32Array(N);
  let head = 0;
  let tail = 0;
  if (goal >= 0) {
    dist[goal] = 0;
    queue[tail++] = goal;
  }
  while (head < tail) {
    const i = queue[head++];
    const cx = i % G.w;
    const d = dist[i] + 1;
    if (cx > 0 && dist[i - 1] < 0 && !G.blocked[i - 1]) (dist[i - 1] = d), (queue[tail++] = i - 1);
    if (cx < G.w - 1 && dist[i + 1] < 0 && !G.blocked[i + 1]) (dist[i + 1] = d), (queue[tail++] = i + 1);
    if (i >= G.w && dist[i - G.w] < 0 && !G.blocked[i - G.w]) (dist[i - G.w] = d), (queue[tail++] = i - G.w);
    if (i + G.w < N && dist[i + G.w] < 0 && !G.blocked[i + G.w]) (dist[i + G.w] = d), (queue[tail++] = i + G.w);
  }
  G.field = { goal, dist, queue, at: now };
  return G.field;
}

// Is the straight line from a to b clear of walls (for a body of radius r)?
function clearLine(G, ax, az, bx, bz, r) {
  const d = Math.hypot(bx - ax, bz - az);
  const n = Math.ceil(d / (G.cell * 0.5));
  const [px, pz] = [-(bz - az) / (d || 1), (bx - ax) / (d || 1)];
  for (let i = 1; i < n; i++) {
    const x = ax + ((bx - ax) * i) / n;
    const z = az + ((bz - az) * i) / n;
    if (gridBlocked(G, x, z) || gridBlocked(G, x + px * r * 0.8, z + pz * r * 0.8) || gridBlocked(G, x - px * r * 0.8, z - pz * r * 0.8)) return false;
  }
  return true;
}

// Which way to go from (x, z) towards (tx, tz): straight if the way is clear, else along the map.
function headingTo(world, x, z, tx, tz, r) {
  const G = world.room.grid;
  if (!G || clearLine(G, x, z, tx, tz, r)) return [tx - x, tz - z];
  const F = fieldTo(G, tx, tz, typeof performance !== 'undefined' ? performance.now() : Date.now());
  const here = cellAt(G, x, z);
  if (here < 0 || F.dist[here] < 0) return [tx - x, tz - z];
  // Look a few cells down the slope and head for the furthest one still in plain sight.
  let best = here;
  for (let k = 0; k < 6; k++) {
    let next = best;
    const cx = best % G.w;
    for (const j of [best - 1, best + 1, best - G.w, best + G.w, best - G.w - 1, best - G.w + 1, best + G.w - 1, best + G.w + 1]) {
      if (j < 0 || j >= G.w * G.h) continue;
      const jx = j % G.w;
      if (Math.abs(jx - cx) > 1 || F.dist[j] < 0 || G.blocked[j]) continue;
      if (F.dist[j] < F.dist[next]) next = j;
    }
    if (next === best) break;
    const nx = G.x0 + ((next % G.w) + 0.5) * G.cell;
    const nz = G.z0 + (Math.floor(next / G.w) + 0.5) * G.cell;
    if (k > 0 && !clearLine(G, x, z, nx, nz, r)) break;
    best = next;
  }
  if (best === here) return [tx - x, tz - z];
  return [G.x0 + ((best % G.w) + 0.5) * G.cell - x, G.z0 + (Math.floor(best / G.w) + 0.5) * G.cell - z];
}

// Walk an actor towards (tx, tz) until it is `stop` away. Returns true while moving. It finds its way
// around walls, speeds up and slows down instead of starting and stopping dead, keeps a little space
// from other walkers, and turns smoothly.
export function walkTowards(world, id, tx, tz, dt, speed, stop) {
  const a = world.actors.get(id);
  const dx = tx - a.x;
  const dz = tz - a.z;
  const d = Math.hypot(dx, dz);
  a.vx ??= 0;
  a.vz ??= 0;
  const ease = 1 - Math.exp(-8 * dt);
  if (d <= stop + 0.02) {
    // close enough (a hair of rounding must not leave them running on the spot)
    a.vx += (0 - a.vx) * ease;
    a.vz += (0 - a.vz) * ease;
    if (Math.hypot(a.vx, a.vz) < 0.3) {
      a.vx = a.vz = 0;
      a.motion = 'idle';
      return false;
    }
  } else {
    let [hx, hz] = headingTo(world, a.x, a.z, tx, tz, a.radius);
    const hl = Math.hypot(hx, hz) || 1;
    hx /= hl;
    hz /= hl;
    // Spacing: a gentle push away from other walkers close by, so a pack spreads round its prey.
    let sx = 0;
    let sz = 0;
    for (const [oid, o] of world.actors) {
      if (oid === id || !o.alive || o.kind !== a.kind) continue;
      const ox = a.x - o.x;
      const oz = a.z - o.z;
      const od = Math.hypot(ox, oz);
      const want = a.radius + o.radius + 0.35;
      if (od < want && od > 1e-4) {
        sx += (ox / od) * (1 - od / want);
        sz += (oz / od) * (1 - od / want);
      }
    }
    // Slow down on arrival rather than stop dead.
    const v = Math.min(speed, Math.max(0.6, (d - stop) * 2.5));
    a.vx += ((hx + sx * 1.2) * v - a.vx) * ease;
    a.vz += ((hz + sz * 1.2) * v - a.vz) * ease;
  }
  const bx = a.x;
  const bz = a.z;
  const n = Math.max(1, Math.ceil((Math.hypot(a.vx, a.vz) * dt) / (a.radius * 0.5)));
  for (let i = 0; i < n; i++) {
    a.x += (a.vx * dt) / n;
    a.z += (a.vz * dt) / n;
    resolve(a, a.radius, world, id);
  }
  const moved = Math.hypot(a.x - bx, a.z - bz) / Math.max(dt, 1e-4);
  // Face where it is going while it walks, the target once it arrives.
  const fx = moved > 0.3 ? a.x - bx : dx;
  const fz = moved > 0.3 ? a.z - bz : dz;
  a.yaw = lerpAngle(a.yaw, yawTo(fx, fz), 1 - Math.exp(-MOVE.turn * 0.6 * dt));
  a.motion = moved > 0.4 ? 'run' : 'idle';
  return d > stop + 0.02;
}

export function faceTowards(a, tx, tz, dt) {
  a.yaw = lerpAngle(a.yaw, yawTo(tx - a.x, tz - a.z), 1 - Math.exp(-8 * dt));
}

// Where each companion stands, relative to the leader: [behind, to the right].
// Wide to the sides, so they never stand between the camera and the leader.
const FORMATION = [
  [-0.4, -1.9],
  [-0.4, 1.9],
  [-1.2, -3.6],
];

export function formationSpot(leader, slot) {
  const [b, r] = FORMATION[slot % FORMATION.length];
  const [fx, fz] = forwardOf(leader.yaw);
  const [rx, rz] = rightOf(leader.yaw);
  return [leader.x + fx * b + rx * r, leader.z + fz * b + rz * r];
}

// Edge-to-edge distance from the leader to an actor.
export function gap(world, id) {
  const l = world.actors.get(world.leaderId);
  const a = world.actors.get(id);
  if (!l || !a) return Infinity;
  return Math.max(0, distXZ(l, a) - a.radius);
}

export const inReach = (world, id, reach) => gap(world, id) <= reach;

// The closest living enemy the leader is allowed to hit (melee can't reach flyers).
export function nearestEnemy(world, enemies, canHit = () => true) {
  let best = null;
  let bestD = Infinity;
  for (const e of enemies) {
    if (e.hp <= 0 || !canHit(e)) continue;
    const d = gap(world, e.id);
    if (d < bestD) {
      best = e;
      bestD = d;
    }
  }
  return best;
}

export function radiusFor(enemy) {
  // Morvath's dragon form is far bigger than the knight: heroes stop at its claws, not inside it.
  if (enemy.ultimate) return enemy.model === 'boss_morvath_dragon' ? RADIUS.dragon : RADIUS.ultimate;
  if (enemy.boss) return RADIUS.boss;
  return RADIUS.minion;
}

// ---------- companions with a mind of their own (moderate) ----------

// Companions never stray further than this from the leader, so the party stays together.
export const LEASH = 7;
export const COMPANION_SPEED = 3.8;

const unit = (x, z, fx = 1, fz = 0) => {
  const d = Math.hypot(x, z);
  return d > 1e-6 ? [x / d, z / d] : [fx, fz];
};
const closest = (list, p) => list.reduce((b, e) => (!b || Math.hypot(e.x - p.x, e.z - p.z) < Math.hypot(b.x - p.x, b.z - p.z) ? e : b), null);

// Where a companion wants to stand, by role:
//   knight  guards: steps between the leader and the enemy closest to the leader
//   rogue   flanks the enemy closest to them, from the side
//   ranger  keeps about 6 m from the closest enemy
//   mage    stays back and to the side of whoever is most hurt (or the leader)
// With no enemies left they fall back into formation.
export function companionGoal({ cls, self, leader, foes, hurt, slot }) {
  if (!foes.length) return formationSpot(leader, slot);
  let gx;
  let gz;
  if (cls === 'knight') {
    const e = closest(foes, leader);
    const [ux, uz] = unit(leader.x - e.x, leader.z - e.z);
    const d = e.radius + RADIUS.hero + 0.35;
    // A step to the side of the leader's line to the enemy, so he doesn't block the view.
    [gx, gz] = [e.x + ux * d - uz * 1.2, e.z + uz * d + ux * 1.2];
  } else if (cls === 'rogue') {
    const e = closest(foes, self);
    const [ux, uz] = unit(e.x - leader.x, e.z - leader.z);
    const side = slot % 2 ? 1 : -1;
    const d = e.radius + RADIUS.hero + 0.35;
    [gx, gz] = [e.x - uz * side * d, e.z + ux * side * d];
  } else if (cls === 'ranger') {
    const e = closest(foes, self);
    const [ux, uz] = unit(self.x - e.x, self.z - e.z, leader.x - e.x, leader.z - e.z);
    [gx, gz] = [e.x + ux * 6, e.z + uz * 6];
  } else {
    const ward = hurt ?? leader;
    const e = closest(foes, ward);
    const [ux, uz] = unit(ward.x - e.x, ward.z - e.z);
    const side = slot % 2 ? 1 : -1; // back and to one side, out of the camera's line
    [gx, gz] = [ward.x + ux * 1.4 - uz * side * 1.8, ward.z + uz * 1.4 + ux * side * 1.8];
  }
  const dx = gx - leader.x;
  const dz = gz - leader.z;
  const d = Math.hypot(dx, dz);
  if (d > LEASH) [gx, gz] = [leader.x + (dx / d) * LEASH, leader.z + (dz / d) * LEASH];
  return [gx, gz];
}

// The enemy closest to the camera's line of sight (within about 35 degrees), for crosshair aiming.
export function inSight(world, enemies, cone = 0.6) {
  const l = world.actors.get(world.leaderId);
  if (!l) return null;
  let best = null;
  let bestAngle = cone;
  for (const e of enemies) {
    const a = world.actors.get(e.id);
    if (!a || !a.alive) continue;
    const angle = Math.abs(lerpAngle(0, yawTo(a.x - l.x, a.z - l.z) - world.camYaw, 1));
    if (angle < bestAngle) {
      best = e;
      bestAngle = angle;
    }
  }
  return best;
}

// ---------- lanes ----------
// The engine splits every fight into three lanes across the line from the party to the enemies.
// The fight's axis (world.axis) runs through the middle of the spawns; lanes are LANE_WIDTH wide.
export const LANE_WIDTH = 2.8;
export const LANE_NAMES = ['left', 'centre', 'right'];

export function laneOf(world, x, z) {
  const a = world.axis ?? { x: 0, z: 0, yaw: 0 };
  const [rx, rz] = rightOf(a.yaw);
  const off = (x - a.x) * rx + (z - a.z) * rz;
  return off < -LANE_WIDTH / 2 ? 'left' : off > LANE_WIDTH / 2 ? 'right' : 'centre';
}

// Move a point sideways (keeping its depth along the axis) into the middle of a lane.
export function intoLane(world, x, z, lane) {
  const a = world.axis ?? { x: 0, z: 0, yaw: 0 };
  const [rx, rz] = rightOf(a.yaw);
  const off = (x - a.x) * rx + (z - a.z) * rz;
  const want = (LANE_NAMES.indexOf(lane) - 1) * LANE_WIDTH;
  return [x + (want - off) * rx, z + (want - off) * rz];
}
