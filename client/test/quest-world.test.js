// Free movement in a fight room: walking, jumping, walls, reach, and companions acting on their own.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LEASH, MOVE, RADIUS, companionGoal, createWorld, gap, inReach, inputDirection, nearestEnemy, resolve, stepLeader, walkTowards } from '../src/quest/scene/world.js';

const world = () => {
  const w = createWorld();
  w.leaderId = 'rogue';
  w.actors.set('rogue', { x: -4, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, radius: RADIUS.hero, motion: 'idle', kind: 'hero', alive: true, solid: false });
  return w;
};
const run = (w, seconds) => {
  for (let t = 0; t < seconds; t += 1 / 60) stepLeader(w, 1 / 60);
  return w.actors.get(w.leaderId);
};

test('W walks the way the camera looks; D walks to its right', () => {
  assert.deepEqual(inputDirection(new Set(['w']), 0).map((v) => Math.round(v)), [1, 0]);
  assert.deepEqual(inputDirection(new Set(['d']), 0).map((v) => Math.round(v)), [0, 1]);
  assert.deepEqual(inputDirection(new Set(), 0), [0, 0]);
  const w = world();
  w.keys.add('w');
  const a = run(w, 1);
  assert.ok(a.x > -4 + MOVE.speed * 0.7, `moved to ${a.x}`);
  assert.equal(a.motion, 'run');
});

test('Space jumps and the leader lands again', () => {
  const w = world();
  w.jumpQueued = true;
  let peak = 0;
  for (let i = 0; i < 90; i++) peak = Math.max(peak, stepLeader(w, 1 / 60).y);
  assert.ok(peak > 0.8, `peak ${peak}`);
  assert.equal(w.actors.get('rogue').y, 0);
});

test('the leader cannot leave the room or walk through a wall', () => {
  const w = world();
  w.keys.add('w');
  const a = run(w, 6);
  assert.ok(Math.hypot(a.x, a.z) <= w.room.bounds.r - a.radius + 1e-6, 'stays inside the round floor');
  const p = resolve({ x: 0, z: -6.5 }, 0.4, w); // standing in the back wall
  assert.ok(p.z >= -6.2 + 0.4 - 1e-6 || p.z <= -7 - 0.4 + 1e-6, `pushed out to z=${p.z}`);
});

test('reach: melee must close in, ranged can act from afar', () => {
  const w = world();
  w.actors.set('crawler', { x: 3, y: 0, z: 0, radius: RADIUS.minion, alive: true, solid: true, kind: 'enemy' });
  assert.equal(Math.round(gap(w, 'crawler') * 10) / 10, 6.5);
  assert.equal(inReach(w, 'crawler', 2.4), false);
  assert.equal(inReach(w, 'crawler', 12), true);
  w.keys.add('w');
  run(w, 3); // walks up to it; it blocks the way
  assert.equal(inReach(w, 'crawler', 2.4), true);
});

test('the nearest enemy you can hit is chosen; flyers are skipped for melee', () => {
  const w = world();
  w.actors.set('bat', { x: -2, y: 0, z: 0, radius: 0.5, alive: true, kind: 'enemy' });
  w.actors.set('crawler', { x: 1, y: 0, z: 0, radius: 0.5, alive: true, kind: 'enemy' });
  const enemies = [
    { id: 'bat', hp: 10, flying: true },
    { id: 'crawler', hp: 10 },
  ];
  assert.equal(nearestEnemy(w, enemies).id, 'bat');
  assert.equal(nearestEnemy(w, enemies, (e) => !e.flying).id, 'crawler');
});

test('companions take their own places by role, on a leash', () => {
  const leader = { x: 0, z: 0, yaw: 0 };
  const foes = [{ x: 5, z: 0, radius: 0.5 }];
  const self = { x: -1, z: 1 };
  const [kx] = companionGoal({ cls: 'knight', self, leader, foes, slot: 0 });
  assert.ok(kx > 3 && kx < 5, 'Kael steps between the leader and the enemy');
  const [rx, rz] = companionGoal({ cls: 'ranger', self, leader, foes, slot: 1 });
  assert.ok(Math.abs(Math.hypot(rx - 5, rz) - 6) < 0.01, 'Mira keeps 6 m away');
  const [mx] = companionGoal({ cls: 'mage', self, leader, foes, slot: 2 });
  assert.ok(mx < 0, 'Lyra stays behind the party');
  const far = companionGoal({ cls: 'rogue', self, leader, foes: [{ x: 30, z: 0, radius: 0.5 }], slot: 0 });
  assert.ok(Math.hypot(far[0], far[1]) <= LEASH + 1e-6, 'never strays past the leash');
  assert.deepEqual(companionGoal({ cls: 'knight', self, leader, foes: [], slot: 0 }).map((v) => Math.round(v * 10) / 10), [-0.4, -1.9]);
});

test('walking stops at the requested distance', () => {
  const w = world();
  w.actors.set('kael', { x: 0, y: 0, z: 0, radius: 0.4, alive: true, kind: 'hero', yaw: 0 });
  for (let i = 0; i < 200; i++) walkTowards(w, 'kael', 4, 0, 1 / 60, 3.8, 0.35);
  const k = w.actors.get('kael');
  assert.ok(Math.abs(4 - k.x - 0.35) < 0.05, `stopped at ${k.x}`);
  assert.equal(k.motion, 'idle');
});

test('a walkable area made of two shapes: walk the nave into the rotunda, not outside both', () => {
  const w = createWorld();
  w.room = { ...w.room, colliders: [], bounds: [{ kind: 'box', minX: -2, maxX: 2, minZ: 0, maxZ: 6 }, { kind: 'circle', x: 0, z: -6, r: 6 }] };
  assert.deepEqual(resolve({ x: 0, z: 3 }, 0.4, w), { x: 0, z: 3 }, 'inside the nave stays put');
  assert.deepEqual(resolve({ x: 3, z: -6 }, 0.4, w), { x: 3, z: -6 }, 'inside the rotunda stays put');
  const p = resolve({ x: 4, z: 3 }, 0.4, w); // beside the nave, outside both
  assert.ok(Math.abs(p.x - 1.6) < 1e-6 && p.z === 3, `back into the nave: ${p.x},${p.z}`);
});

test('crosshair aiming picks the enemy the camera looks at', async () => {
  const { inSight } = await import('../src/quest/scene/world.js');
  const w = world();
  w.actors.set('left', { x: -4, y: 0, z: -3, radius: 0.5, alive: true, kind: 'enemy' });
  w.actors.set('ahead', { x: 2, y: 0, z: 0.3, radius: 0.5, alive: true, kind: 'enemy' });
  const enemies = [{ id: 'left' }, { id: 'ahead' }];
  w.camYaw = 0; // looking along +x from the leader at x = -4
  assert.equal(inSight(w, enemies).id, 'ahead');
  w.camYaw = Math.PI / 2; // looking along -z
  assert.equal(inSight(w, enemies).id, 'left');
  w.camYaw = Math.PI; // looking away from both
  assert.equal(inSight(w, enemies), null);
});

test('lanes run across the fight: left, centre, right as the camera sees them', async () => {
  const { laneOf, intoLane } = await import('../src/quest/scene/world.js');
  const w = world();
  w.axis = { x: 0, z: 0, yaw: 0 }; // facing +x: the camera's right is +z
  assert.equal(laneOf(w, 3, 0), 'centre');
  assert.equal(laneOf(w, 3, 2), 'right');
  assert.equal(laneOf(w, -2, -2), 'left');
  const [x, z] = intoLane(w, 5, 0.3, 'left');
  assert.equal(x, 5);
  assert.equal(laneOf(w, x, z), 'left');
});
