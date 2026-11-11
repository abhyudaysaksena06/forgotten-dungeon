// The walking maps built from the rooms' real geometry: nobody walks through walls, and every
// enemy finds its way to the party around them.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { RADIUS, createWorld, decodeGrid, gridBlocked, stepLeader, walkTowards } from '../src/quest/scene/world.js';

const ROOMS = ['room_1', 'room_2', 'room_3', 'room_4', 'room_5'];
const layout = (key) => JSON.parse(readFileSync(new URL(`../public/models/${key}.layout.json`, import.meta.url)));

function worldFor(key) {
  const L = layout(key);
  const w = createWorld();
  const grid = decodeGrid(L.grid);
  w.room = { bounds: L.bounds.length === 1 ? L.bounds[0] : L.bounds, colliders: L.colliders ?? [], grid, spawns: L.spawns };
  const [x, y, z] = L.spawns.party[0];
  w.leaderId = 'knight';
  w.actors.set('knight', { x, y, z, vx: 0, vy: 0, vz: 0, yaw: 0, radius: RADIUS.hero, motion: 'idle', kind: 'hero', alive: true, solid: false });
  return { w, L, grid };
}

// No part of the body's centre ring overlaps a blocked cell (a hair of slack for rounding).
const clear = (grid, a) => [0, 1, 2, 3, 4, 5, 6, 7].every((k) => !gridBlocked(grid, a.x + Math.cos((k * Math.PI) / 4) * (a.radius - 0.03), a.z + Math.sin((k * Math.PI) / 4) * (a.radius - 0.03)));

for (const key of ROOMS) {
  test(`${key}: running hard in every direction never ends up inside a wall`, () => {
    const { w, grid } = worldFor(key);
    w.keys.add('w');
    for (let dir = 0; dir < 16; dir++) {
      w.camYaw = (dir / 16) * 2 * Math.PI;
      for (let t = 0; t < 4; t += 1 / 30) {
        const a = stepLeader(w, 1 / 30);
        assert.ok(clear(grid, a), `${key}: inside a wall at ${a.x.toFixed(2)},${a.z.toFixed(2)} heading ${dir}`);
      }
    }
  });

  test(`${key}: every enemy walks from its spawn to the party around the walls`, () => {
    const { w, L, grid } = worldFor(key);
    const party = L.spawns.party[0];
    const starts = [...L.spawns.enemies, ...(L.spawns.boss ? [L.spawns.boss] : [])];
    starts.forEach(([x, , z], i) => {
      const id = `e${i}`;
      w.actors.set(id, { x, y: 0, z, vx: 0, vz: 0, yaw: 0, radius: RADIUS.minion, motion: 'idle', kind: 'enemy', alive: true, solid: true });
      let arrived = false;
      for (let t = 0; t < 40 && !arrived; t += 1 / 30) arrived = !walkTowards(w, id, party[0], party[2], 1 / 30, 2.2, 1.6);
      const a = w.actors.get(id);
      assert.ok(arrived, `${key}: enemy ${i} stuck at ${a.x.toFixed(1)},${a.z.toFixed(1)}`);
      assert.ok(clear(grid, a), `${key}: enemy ${i} ended inside a wall`);
      w.actors.delete(id);
    });
  });
}
