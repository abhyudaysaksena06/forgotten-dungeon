// Free movement inside a fight room. The game engine on the server still decides every hit;
// this only decides where people stand, whether the leader is close enough to act, and what the
// camera sees. Plain numbers, no three.js, so it can be tested.
//
// Axes: x right, y up, z towards the camera at the start. A yaw of 0 faces +x (where the enemies
// start); every model faces +x, so `rotation.y = yaw` turns it.

export const MOVE = { speed: 4.6, response: 12, turn: 14, jump: 5.8, gravity: 16 };
export const REACH = { melee: 2.4, magic: 9, ranged: 12 }; // how close the leader must be to act
export const RADIUS = { hero: 0.4, npc: 0.5, minion: 0.5, boss: 0.9, ultimate: 1.3 };
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

export function insideShape(s, x, z, r = 0) {
  if (s.kind === 'circle') return Math.hypot(x - s.x, z - s.z) <= s.r - r + 1e-9;
  return x >= s.minX + r - 1e-9 && x <= s.maxX - r + 1e-9 && z >= s.minZ + r - 1e-9 && z <= s.maxZ - r + 1e-9;
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

// Push a circle at (x, z) out of the room's walls and everyone else's space.
export function resolve(pos, radius, world, ignoreId) {
  const { bounds, colliders } = world.room;
  for (const c of [...colliders, ...world.extraColliders]) {
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
  return pos;
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
  const [dx, dz] = inputDirection(world.keys, world.camYaw);
  const k = 1 - Math.exp(-MOVE.response * dt);
  a.vx += (dx * MOVE.speed - a.vx) * k;
  a.vz += (dz * MOVE.speed - a.vz) * k;
  const ground = groundAt(world, a.x, a.z, a.y);
  const grounded = a.y <= ground + 1e-3;
  if (world.jumpQueued && grounded) a.vy = MOVE.jump;
  world.jumpQueued = false;
  a.vy -= MOVE.gravity * dt;
  a.y += a.vy * dt;
  a.x += a.vx * dt;
  a.z += a.vz * dt;
  resolve(a, a.radius, world, world.leaderId);
  const floor = groundAt(world, a.x, a.z, a.y);
  if (a.y <= floor) {
    a.y = floor;
    a.vy = 0;
  }
  const speed = Math.hypot(a.vx, a.vz);
  if (dx || dz) a.yaw = lerpAngle(a.yaw, yawTo(dx, dz), 1 - Math.exp(-MOVE.turn * dt));
  a.motion = a.y > floor + 0.05 ? 'jump' : speed > 0.6 ? 'run' : 'idle';
  return a;
}

// Walk an actor towards (tx, tz) until it is `stop` away. Returns true while moving.
export function walkTowards(world, id, tx, tz, dt, speed, stop) {
  const a = world.actors.get(id);
  const dx = tx - a.x;
  const dz = tz - a.z;
  const d = Math.hypot(dx, dz);
  if (d <= stop + 0.02) {
    // close enough (a hair of rounding must not leave them running on the spot)
    a.motion = 'idle';
    return false;
  }
  const step = Math.min(d - stop, speed * dt);
  a.x += (dx / d) * step;
  a.z += (dz / d) * step;
  resolve(a, a.radius, world, id);
  a.yaw = lerpAngle(a.yaw, yawTo(dx, dz), 1 - Math.exp(-MOVE.turn * dt));
  a.motion = 'run';
  return true;
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
  if (enemy.ultimate) return RADIUS.ultimate;
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
