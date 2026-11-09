// A room fight you can walk around in. The leader moves with WASD and jumps with Space; the
// companions follow in formation; enemies close in. Who hits whom is still decided by the game
// engine on the server: positions only decide whether the leader is close enough to act.
import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { Box3, Raycaster, Vector3 } from 'three';
import { Actor, VILLAINS_ONLY } from './Actor.jsx';
import { toonify } from './toon.js';
import { IS_FLYER, PALETTE, TOON_RAMP } from './placeholders.jsx';
import { CAGE, COMPANION_SPEED, DEFAULT_ROOM, RADIUS, cageSpot, companionGoal, faceTowards, formationSpot, gap, radiusFor, resolve, roomSpot, stepLeader, walkTowards, yawTo, intoLane, LANE_WIDTH, LANE_NAMES, rightOf } from './world.js';

// Each round's look, from the Story Bible: it gets darker the deeper the party goes.
const THEMES = {
  r1: { floor: '#3a3d44', wall: '#262a33', light: '#ffb36b', fill: '#5b7aa6', props: 'gate' }, // grey stone, muted blue, torchlight
  r2: { floor: '#3a2f28', wall: '#2a2018', light: '#ffcf7a', fill: '#b08a4a', props: 'portraits' }, // brown, antique gold, candles
  r3: { floor: '#1f3338', wall: '#18282c', light: '#7fe0ff', fill: '#c9d6e0', props: 'trials' }, // cyan, silver, magic glow
  r4: { floor: '#1a1420', wall: '#110c16', light: '#b5363f', fill: '#3b2252', props: 'barracks' }, // black, purple, crimson, dim
  r5: { floor: '#1e1012', wall: '#140a0c', light: '#ff8a3a', fill: '#7a1a1a', props: 'throne' }, // black, dark red, fiery gold
};


// Props of the stand-in rooms that block the way (a Blender room brings its own colliders).
const PROP_COLLIDERS = {
  r1: [{ kind: 'circle', x: -5, z: -2.5, r: 1.15 }],
  r3: [-4, 0, 4].map((x) => ({ kind: 'box', minX: x - 1, maxX: x + 1, minZ: -6, maxZ: -5.4 })),
  r5: [{ kind: 'box', minX: 4.1, maxX: 7, minZ: -2, maxZ: 2 }],
};

// Where the party appears: the leader in front, the others behind.
const PARTY_START = [-4.2, 0, 1];

export function enemySpots(enemies) {
  const king = enemies.find((e) => e.ultimate);
  const minions = enemies.filter((e) => !e.boss);
  return enemies.map((e) => {
    if (e.ultimate) return [2.8, 0, 0];
    if (e.boss) return [3.4, 0, 0];
    const i = minions.indexOf(e);
    if (king) return [1.6, 0, i % 2 ? 2.6 : -2.6]; // summoned crawlers flank Morvath
    const n = minions.length;
    const z = n === 1 ? 0 : -2.6 + (5.2 * i) / (n - 1);
    return [2.8 + (i % 2) * 1.2, 0, z];
  });
}

function Candle({ position, color }) {
  const light = useRef();
  const seed = useMemo(() => Math.random() * 100, []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime + seed;
    if (light.current) light.current.intensity = 6 + Math.sin(t * 9) * 0.8 + Math.sin(t * 23) * 0.5;
  });
  return (
    <group position={position}>
      <mesh position={[0, 0.5, 0]} castShadow>
        <cylinderGeometry args={[0.12, 0.16, 1, 8]} />
        <meshToonMaterial gradientMap={TOON_RAMP} color="#4a3b2e" />
      </mesh>
      <mesh position={[0, 1.08, 0]}>
        <coneGeometry args={[0.07, 0.18, 8]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <pointLight position={[0, 1.3, 0]} ref={light} color={color} distance={9} decay={2} castShadow={false} />
    </group>
  );
}

function RoomSet({ roomId }) {
  const theme = THEMES[roomId];
  const pillars = [-5.5, -2.5, 2.5, 5.5];
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[9, 48]} />
        <meshToonMaterial gradientMap={TOON_RAMP} color={theme.floor} />
      </mesh>
      <mesh position={[0, 3, -6.5]} receiveShadow>
        <boxGeometry args={[18, 6, 0.6]} />
        <meshToonMaterial gradientMap={TOON_RAMP} color={theme.wall} />
      </mesh>
      {pillars.map((x) => (
        <mesh key={x} position={[x, 2.2, -5.6]} castShadow>
          <cylinderGeometry args={[0.35, 0.45, 4.4, 10]} />
          <meshToonMaterial gradientMap={TOON_RAMP} color={theme.wall} />
        </mesh>
      ))}
      {theme.props === 'gate' && (
        <>
          {Array.from({ length: 7 }, (_, i) => (
            <mesh key={i} position={[-1.8 + i * 0.6, 2 - (i % 3) * 0.4, -6.1]}>
              <boxGeometry args={[0.08, 3.4 - (i % 3) * 0.8, 0.08]} />
              <meshToonMaterial gradientMap={TOON_RAMP} color="#5c5650" />
            </mesh>
          ))}
          <mesh position={[-5, 0.35, -2.5]} castShadow>
            <cylinderGeometry args={[1, 1.15, 0.7, 16]} />
            <meshToonMaterial gradientMap={TOON_RAMP} color="#4a4e57" />
          </mesh>
        </>
      )}
      {theme.props === 'portraits' &&
        [-4.2, -1.4, 1.4, 4.2].map((x, i) => (
          <group key={x} position={[x, 2.6 + (i % 2) * 0.3, -6.15]}>
            <mesh>
              <boxGeometry args={[1.5, 1.9, 0.08]} />
              <meshToonMaterial gradientMap={TOON_RAMP} color={PALETTE.gold} />
            </mesh>
            <mesh position={[0, 0, 0.05]}>
              <boxGeometry args={[1.25, 1.6, 0.02]} />
              <meshToonMaterial gradientMap={TOON_RAMP} color={['#4a3424', '#3a2a3a', '#2f3a2a', '#3a3224'][i]} />
            </mesh>
          </group>
        ))}
      {theme.props === 'trials' &&
        [-4, 0, 4].map((x) => (
          <group key={x} position={[x, 0, -5.7]}>
            <mesh position={[0, 1.8, 0]}>
              <boxGeometry args={[2, 3.6, 0.6]} />
              <meshToonMaterial gradientMap={TOON_RAMP} color="#10242a" />
            </mesh>
            <pointLight position={[0, 1.6, 0.8]} color={theme.light} intensity={6} distance={6} decay={2} />
          </group>
        ))}
      {theme.props === 'barracks' &&
        [-4.5, -1.5, 1.5, 4.5].map((x) => (
          <mesh key={x} position={[x, 2.4, -6.1]}>
            <boxGeometry args={[0.9, 2.6, 0.05]} />
            <meshToonMaterial gradientMap={TOON_RAMP} color="#4a0f18" />
          </mesh>
        ))}
      {theme.props === 'throne' && (
        <>
          {[0, 1, 2].map((i) => (
            <mesh key={i} position={[4.6 + i * 0.5, 0.12 + i * 0.24, 0]} receiveShadow>
              <boxGeometry args={[1, 0.24 + i * 0.48, 4 - i * 0.8]} />
              <meshToonMaterial gradientMap={TOON_RAMP} color="#2a1416" />
            </mesh>
          ))}
          <mesh position={[5.6, 2.2, 0]} castShadow>
            <boxGeometry args={[0.6, 3, 1.8]} />
            <meshToonMaterial gradientMap={TOON_RAMP} color="#1a0c0e" emissive="#5a1a12" emissiveIntensity={0.4} />
          </mesh>
        </>
      )}
      {/* Runes glow red while the room's magic is broken. */}
      <mesh position={[0.6, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[4.6, 4.75, 64]} />
        <meshBasicMaterial color={PALETTE.rune} transparent opacity={0.55} />
      </mesh>
      <pointLight position={[0, 5, 4]} color={theme.fill} intensity={6} distance={18} decay={2} />
      <Candle position={[-6, 0, 3.5]} color={theme.light} />
      <Candle position={[6, 0, 3.5]} color={theme.light} />
      <Candle position={[-4, 0, -4.4]} color={theme.light} />
      <Candle position={[4, 0, -4.4]} color={theme.light} />
    </group>
  );
}

// Reads a Blender room: spawn empties, collider boxes, floors and the walkable area.
//   spawn_party_1..4 (or spawn_player_*), spawn_enemy_1..N, spawn_boss, spawn_npc_1..N
//   collider*   meshes that block movement (hidden in game)
//   bounds* / walk_area*   meshes whose footprints make up the walkable area (hidden);
//                          a name with "circle" in it is read as a circle
//   nav*        simple hidden floors used for the ground check (tools/blender/prepare_room.py adds them)
//   floor* / ground*   meshes characters stand on (else everything visible counts)
export function readRoom(scene) {
  scene.updateMatrixWorld(true);
  const spawns = { party: [], enemies: [], boss: null, npcs: [] };
  const colliders = [];
  const floors = [];
  const navs = [];
  const walks = [];
  let bounds = null;
  const box = new Box3();
  const at = (o) => {
    const p = o.getWorldPosition(new Vector3());
    return [p.x, p.y, p.z];
  };
  const boxOf = (o) => {
    box.setFromObject(o);
    return { kind: 'box', minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z };
  };
  scene.traverse((o) => {
    const n = o.name.toLowerCase();
    let m;
    if ((m = n.match(/^spawn_(?:party|player)_?(\d+)/))) spawns.party[Number(m[1]) - 1] = at(o);
    else if ((m = n.match(/^spawn_enemy_?(\d+)/))) spawns.enemies[Number(m[1]) - 1] = at(o);
    else if ((m = n.match(/^spawn_npc_?(\d+)/))) spawns.npcs[Number(m[1]) - 1] = at(o);
    else if (n.startsWith('spawn_boss')) spawns.boss = at(o);
    else if (o.isMesh && n.startsWith('collider')) {
      colliders.push(boxOf(o));
      o.visible = false;
    } else if (o.isMesh && /^(bounds|walk_area)/.test(n)) {
      const b = boxOf(o);
      walks.push(n.includes('circle') ? { kind: 'circle', x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2, r: (b.maxX - b.minX) / 2 } : b);
      o.visible = false;
    } else if (o.isMesh && n.startsWith('nav')) {
      navs.push(o);
      o.visible = false;
    } else if (o.isMesh && /^(floor|ground)/.test(n)) floors.push(o);
    if (o.isMesh) o.receiveShadow = true;
  });
  if (walks.length) bounds = walks.length === 1 ? walks[0] : walks;
  else {
    box.setFromObject(scene);
    bounds = { kind: 'box', minX: box.min.x + 0.3, maxX: box.max.x - 0.3, minZ: box.min.z + 0.3, maxZ: box.max.z - 0.3 };
  }
  // Ground checks: the simple nav floors if there are any (fast), else named floors, else everything.
  const targets = navs.length ? navs : floors.length ? floors : [];
  if (!targets.length) scene.traverse((o) => o.isMesh && o.visible && targets.push(o));
  const ray = new Raycaster();
  const origin = new Vector3();
  const down = new Vector3(0, -1, 0);
  const floorY = (x, z, fromY = 0) => {
    origin.set(x, fromY + 1.2, z); // from just above the knees: walk up steps, not onto the ceiling
    ray.set(origin, down);
    const hit = ray.intersectObjects(targets, false)[0];
    return hit ? hit.point.y : 0;
  };
  const clean = (list) => list.filter(Boolean);
  return {
    bounds,
    colliders,
    floorY,
    enclosed: true, // the camera stays inside
    spawns: { party: clean(spawns.party), enemies: clean(spawns.enemies), boss: spawns.boss, npcs: clean(spawns.npcs) },
  };
}

// A room's own lamps, at the strength the artist set. Every light costs every pixel, so on a machine
// that can't keep up (Scene's quality ladder) only the brightest few stay lit; they cast no shadows.
let lampCap = 16;
const roomLamps = new Set(); // each prepared room's lamps, brightest first
function capLamps(lamps) {
  lamps.forEach((l, i) => (l.visible = i < lampCap));
}
export function setLampCap(n) {
  if (n === lampCap) return;
  lampCap = n;
  roomLamps.forEach(capLamps);
}
function tameLights(scene) {
  const lamps = [];
  scene.traverse((o) => {
    if (!o.isLight) return;
    o.castShadow = false;
    if (o.isPointLight || o.isSpotLight) lamps.push(o);
    else o.visible = false;
  });
  lamps.sort((a, b) => b.intensity - a.intensity);
  lamps.forEach((l) => {
    // Blender's exporter turns watts into candela by multiplying by 683 lm/W; the browser renderer
    // has no matching photometric scale, so undo it: the lamp is then exactly as bright as in Blender.
    if (!l.userData.blenderUnits) {
      l.intensity /= 683;
      l.userData.blenderUnits = true;
    }
  });
  roomLamps.add(lamps);
  capLamps(lamps);
}

// The game's layout for a Blender room (spawns, walkable area, blockers, raised floors), written by
// tools/blender/prepare_room.py next to the model. The model itself is left exactly as exported.
export function roomFromLayout(L) {
  const steps = L.steps ?? [];
  const floorY = (x, z, fromY = 0) => {
    let y = 0;
    for (const s of steps) if (x >= s.minX && x <= s.maxX && z >= s.minZ && z <= s.maxZ && s.top <= fromY + 1.2) y = Math.max(y, s.top);
    return y;
  };
  return {
    bounds: L.bounds.length === 1 ? L.bounds[0] : L.bounds,
    colliders: L.colliders ?? [],
    floorY,
    enclosed: true,
    view: L.view ?? null, // where the camera may go (the inner walls), when wider than the floor
    ceiling: L.ceiling ?? Infinity, // the camera stays under it
    spawns: { party: L.spawns?.party ?? [], enemies: L.spawns?.enemies ?? [], boss: L.spawns?.boss ?? null, npcs: L.spawns?.npcs ?? [] },
  };
}

const layoutCache = new Map();
const layoutLoads = new Map();
// Fetches a room's layout file once (null when it has none). The preloader calls it, so a fight
// starts with its real spawns instead of switching to them a moment later.
export function loadRoomLayout(modelKey) {
  if (!layoutLoads.has(modelKey)) {
    layoutLoads.set(
      modelKey,
      fetch(`/models/${modelKey}.layout.json`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)
        .then((l) => {
          layoutCache.set(modelKey, l);
          return l;
        }),
    );
  }
  return layoutLoads.get(modelKey);
}

export function useRoomLayout(modelKey) {
  const [layout, setLayout] = useState(() => layoutCache.get(modelKey));
  useEffect(() => {
    let alive = true;
    loadRoomLayout(modelKey).then((l) => alive && setLayout(l));
    return () => {
      alive = false;
    };
  }, [modelKey]);
  return layout;
}

// Readies an artist's room once: cel shading only if the manifest asks (toon: true), lamps tamed.
// The preloader and the fight both call it, so the shaders compiled ahead are the ones the fight uses.
export function prepareRoom(scene, toon) {
  if (scene.userData.prepared) return;
  if (toon === true) toonify(scene, { ramp: TOON_RAMP, outline: false });
  tameLights(scene);
  scene.userData.prepared = true;
}

function RoomModel({ modelKey, world, toon, onReady }) {
  const { scene } = useGLTF(`/models/${modelKey}.glb`);
  const layoutFile = useRoomLayout(modelKey);
  // The room gets the same cel shading (no outline: walls would look heavy), then its layout is read.
  const layout = useMemo(() => {
    prepareRoom(scene, toon); // the room keeps the artist's own materials
    return layoutFile ? roomFromLayout(layoutFile) : readRoom(scene);
  }, [scene, toon, layoutFile]);
  useLayoutEffect(() => {
    world.room = layout;
    onReady?.(); // place everyone at this room's spawns
    return () => {
      world.room = DEFAULT_ROOM;
    };
  }, [layout, world, onReady]);
  return <primitive object={scene} />;
}

// ---------- the cage ----------

const IRON = '#2c2b30';
const CELL_GLOW = ['#5aa38f', '#e07a2e']; // the Healer's, the Weaponsmith's

// Three circles along the cage keep Kael outside its bars.
function cageColliders(cage) {
  const w = CAGE.width * cage.scale;
  const r = [Math.cos(cage.yaw), -Math.sin(cage.yaw)];
  return [-w / 3, 0, w / 3].map((a) => ({ kind: 'circle', x: cage.x + r[0] * a, z: cage.z + r[1] * a, r: (CAGE.depth * cage.scale) / 2 + 0.15 }));
}

function Bars({ from, to, y, height, step = 0.2 }) {
  const n = Math.max(1, Math.round(Math.hypot(to[0] - from[0], to[1] - from[1]) / step));
  return Array.from({ length: n + 1 }, (_, i) => (
    <mesh key={i} position={[from[0] + ((to[0] - from[0]) * i) / n, y + height / 2, from[1] + ((to[1] - from[1]) * i) / n]}>
      <cylinderGeometry args={[0.025, 0.025, height, 6]} />
      <meshStandardMaterial color={IRON} metalness={0.7} roughness={0.45} />
    </mesh>
  ));
}

// A cell's door: bars on a hinge at the cell's outer edge. It swings out once the room is cleared.
function Door({ hinge, width, height, side, open }) {
  const g = useRef();
  useFrame((_, dt) => {
    if (!g.current) return;
    const want = open ? side * 1.75 : 0; // outward, away from the cell
    g.current.rotation.y += (want - g.current.rotation.y) * Math.min(1, dt * 2.5);
  });
  return (
    <group ref={g} position={[hinge, 0, 0]}>
      <Bars from={[0, 0]} to={[-side * width, 0]} y={0.12} height={height - 0.2} />
      <mesh position={[(-side * width) / 2, height - 0.12, 0]}>
        <boxGeometry args={[width, 0.06, 0.06]} />
        <meshStandardMaterial color={IRON} metalness={0.7} roughness={0.45} />
      </mesh>
    </group>
  );
}

// The room's cage: two cells, the Healer's on the left and the Weaponsmith's on the right. Shut
// while skeletons stand; once the room is cleared the doors swing open and the floor of each cell
// glows. Kael uses a cell by walking up to its door.
function Cage({ cage, open, models, floorY, cues }) {
  const w = CAGE.width;
  const d = CAGE.depth;
  const h = CAGE.height;
  const y = floorY ? floorY(cage.x, cage.z) : 0;
  const keepers = [
    { key: 'npc_healer', id: 'keeper_healer', name: 'Healer', x: -w / 4 },
    { key: 'npc_smith', id: 'keeper_smith', name: 'Weaponsmith', x: w / 4 },
  ];
  return (
    <group position={[cage.x, y, cage.z]} rotation={[0, cage.yaw, 0]} scale={cage.scale}>
      <mesh position={[0, 0.06, 0]} receiveShadow>
        <boxGeometry args={[w + 0.2, 0.12, d + 0.2]} />
        <meshStandardMaterial color="#4a4652" roughness={0.9} />
      </mesh>
      <mesh position={[0, h, 0]}>
        <boxGeometry args={[w + 0.2, 0.1, d + 0.2]} />
        <meshStandardMaterial color={IRON} metalness={0.6} roughness={0.5} />
      </mesh>
      <Bars from={[-w / 2, -d / 2]} to={[w / 2, -d / 2]} y={0.12} height={h - 0.12} />
      <Bars from={[-w / 2, -d / 2]} to={[-w / 2, d / 2]} y={0.12} height={h - 0.12} />
      <Bars from={[w / 2, -d / 2]} to={[w / 2, d / 2]} y={0.12} height={h - 0.12} />
      <Bars from={[0, -d / 2]} to={[0, d / 2]} y={0.12} height={h - 0.12} />
      <group position={[0, 0, d / 2]}>
        <Door hinge={-w / 2} width={w / 2} height={h} side={-1} open={open} />
        <Door hinge={w / 2} width={w / 2} height={h} side={1} open={open} />
      </group>
      {keepers.map((k, i) => (
        <group key={k.key} position={[k.x, 0.12, 0]}>
          {open && (
            <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <circleGeometry args={[0.55, 24]} />
              <meshBasicMaterial color={CELL_GLOW[i]} transparent opacity={0.45} depthWrite={false} />
            </mesh>
          )}
          <group rotation={[0, -Math.PI / 2, 0]}>
            <Actor modelKey={k.key} models={models} position={[0, 0, 0]} facing={1} label={k.name} cues={cues.filter((c) => c.id === k.id)} keeper />
          </group>
        </group>
      ))}
    </group>
  );
}

// The light Kael carries: a slow torch flicker, above and a little in front of him.
function HeroTorch() {
  const light = useRef();
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (light.current) light.current.intensity = 7 + Math.sin(t * 7.3) * 0.6 + Math.sin(t * 17.1) * 0.35;
  });
  return <pointLight ref={light} position={[0.3, 2.4, 0]} color="#ffc489" distance={8} decay={1.6} castShadow={false} />;
}

// Puts a group where the world says an actor stands.
function Mover({ id, world, children }) {
  const g = useRef();
  useFrame(() => {
    const a = world.actors.get(id);
    if (!a || !g.current) return;
    g.current.position.set(a.x, a.y, a.z);
    g.current.rotation.y = a.yaw;
  });
  const a = world.actors.get(id);
  return (
    <group ref={g} position={a ? [a.x, a.y, a.z] : [0, 0, 0]} rotation={[0, a?.yaw ?? 0, 0]}>
      {children}
    </group>
  );
}

// The three lanes on the floor: faint guides, red where a blow lands next round (venom green where the
// Hollow King's poisoning Shadow Tide will flood), purple where the Ink Wraith hides.
function LaneMarks({ world, state }) {
  const g = useRef();
  const mats = useRef([]);
  const c = state.combat;
  const danger = new Set([...(c?.danger && c.danger.round === c.round + 1 ? c.danger.lanes : []), ...(c?.telegraph?.lanes ?? [])]);
  const hidden = c?.enemies.find((e) => e.hp > 0 && e.hiddenIn)?.hiddenIn;
  const red = c?.danger?.poison ? PALETTE.venom : '#ff2a2a';
  useFrame(({ clock }) => {
    const a = world.axis;
    if (!g.current || !a) return;
    g.current.position.set(a.x, 0.035, a.z);
    g.current.rotation.y = a.yaw;
    const pulse = 0.28 + 0.16 * Math.sin(clock.elapsedTime * 6);
    mats.current.forEach((m, i) => {
      if (!m) return;
      const lane = LANE_NAMES[i];
      m.opacity = danger.has(lane) ? pulse : hidden === lane ? 0.22 : 0; // nothing drawn on the room unless it matters
      m.color.set(danger.has(lane) ? red : hidden === lane ? '#a46bff' : '#e9dfc9');
    });
  });
  return (
    <group ref={g}>
      {LANE_NAMES.map((lane, i) => (
        <mesh key={lane} position={[0, 0, (i - 1) * LANE_WIDTH]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={2}>
          <planeGeometry args={[22, LANE_WIDTH - 0.12]} />
          <meshBasicMaterial ref={(m) => (mats.current[i] = m)} transparent opacity={0.05} depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

// A ring under the current target: green when the leader can reach it, red when too far.
function TargetRing({ world, targetId, reach }) {
  const g = useRef();
  const mat = useRef();
  useFrame(({ clock }) => {
    const a = targetId && world.actors.get(targetId);
    if (!g.current) return;
    g.current.visible = Boolean(a && a.alive);
    if (!a) return;
    g.current.position.set(a.x, (a.y ?? 0) + 0.04, a.z);
    g.current.rotation.z = clock.elapsedTime * 0.8;
    const s = a.radius / 0.5;
    g.current.scale.set(s, s, s);
    mat.current?.color.set(gap(world, targetId) <= reach ? '#7fe0a0' : '#ff5a5f');
  });
  return (
    <mesh ref={g} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.62, 0.8, 32, 1, 0, Math.PI * 1.75]} />
      <meshBasicMaterial ref={mat} color="#7fe0a0" transparent opacity={0.9} depthWrite={false} />
    </mesh>
  );
}

// The fight runs from the party's spawns towards the enemies'; lanes lie across it.
function fightAxis(spawns) {
  const foes = [...(spawns?.enemies ?? []), ...(spawns?.boss ? [spawns.boss] : [])];
  if (!spawns?.party?.length || !foes.length) return { x: -0.5, z: 0, yaw: 0 };
  const mid = (list) => [list.reduce((n, p) => n + p[0], 0) / list.length, list.reduce((n, p) => n + p[2], 0) / list.length];
  const [px, pz] = mid(spawns.party);
  const [ex, ez] = mid(foes);
  return { x: (px + ex) / 2, z: (pz + ez) / 2, yaw: yawTo(ex - px, ez - pz) };
}

// The camera starts behind the party, looking at where the enemies stand.
function facingFromSpawns(spawns) {
  const foes = [...(spawns?.enemies ?? []), ...(spawns?.boss ? [spawns.boss] : [])];
  if (!spawns?.party?.length || !foes.length) return null;
  const mid = (list) => [list.reduce((n, p) => n + p[0], 0) / list.length, list.reduce((n, p) => n + p[2], 0) / list.length];
  const [px, pz] = mid(spawns.party);
  const [ex, ez] = mid(foes);
  return yawTo(ex - px, ez - pz);
}

// Keeps the world's list of actors in step with the fight, and moves everyone each frame.
function useFighters(world, state, roomId) {
  const enemies = state.combat?.enemies ?? [];
  const leader = state.party.find((m) => m.controlled) ?? state.party[0];

  // A new fight puts everyone back at their spawn. The fight's identity stays the same for the
  // whole fight (both counters go up together each round) and differs for the next one.
  // A Blender room that finishes loading also resets the places.
  const fightKey = state.combat ? `${roomId}:${state.stats.rounds - state.combat.round}` : null;
  const spawns = world.room.spawns;
  if (world.fightKey !== fightKey || world.placedIn !== world.room) {
    world.fightKey = fightKey;
    world.placedIn = world.room;
    world.actors.clear();
    world.camYaw = facingFromSpawns(spawns) ?? 0;
    world.axis = fightAxis(spawns);
  }

  // Add anyone not yet in the world; mark the fallen.
  const homes = enemySpots(enemies);
  world.leaderId = leader.id;
  const followers = state.party.filter((m) => m.id !== leader.id);
  for (const m of state.party) {
    let a = world.actors.get(m.id);
    if (!a) {
      const slot = followers.indexOf(m);
      const start = spawns?.party?.[m.id === leader.id ? 0 : slot + 1];
      const base = { x: PARTY_START[0], y: 0, z: PARTY_START[2], yaw: 0 };
      const p = start ? { x: start[0], y: start[1], z: start[2] } : m.id === leader.id ? base : (() => {
        const [x, z] = formationSpot({ ...base }, slot);
        return { x, y: 0, z };
      })();
      a = { ...p, vx: 0, vy: 0, vz: 0, yaw: world.camYaw, radius: RADIUS.hero, motion: 'idle', kind: 'hero', solid: false };
      world.actors.set(m.id, a);
    }
    a.alive = !m.fallen;
  }
  enemies.forEach((e, i) => {
    let a = world.actors.get(e.id);
    if (!a) {
      const minionIndex = enemies.filter((x) => !x.boss).indexOf(e);
      const fromRoom = e.boss ? spawns?.boss : roomSpot(world.room, minionIndex);
      const home = fromRoom ?? homes[i];
      a = { x: home[0], y: home[1] ?? 0, z: home[2], vx: 0, vy: 0, vz: 0, yaw: Math.PI, radius: radiusFor(e), motion: 'idle', kind: 'enemy', home, solid: true, flyer: e.flying, ultimate: e.ultimate, boss: e.boss };
      world.actors.set(e.id, a);
    }
    a.alive = e.hp > 0;
    a.radius = radiusFor(e); // Morvath grows when he becomes the dragon
  });
}

function WorldDriver({ world, state }) {
  const frame = useRef(0);
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    frame.current += 1;
    if (world.keys.has('arrowleft')) world.camYaw += 1.9 * dt;
    if (world.keys.has('arrowright')) world.camYaw -= 1.9 * dt;
    const leader = stepLeader(world, dt);
    if (!leader) return;
    if (world.firstPerson) leader.yaw = world.camYaw;
    const floor = (a) => (world.room.floorY ? world.room.floorY(a.x, a.z, a.y) : 0);
    const enemies = [...world.actors.entries()].filter(([, a]) => a.kind === 'enemy' && a.alive);
    const foes = enemies.map(([, e]) => e);
    const nearest = (list, a) => list.reduce((best, e) => (!best || Math.hypot(e.x - a.x, e.z - a.z) < Math.hypot(best.x - a.x, best.z - a.z) ? e : best), null);
    // The most hurt hero still standing (Lyra stays near them).
    const hurtMember = state.party.filter((m) => !m.fallen && m.hp / m.maxHp < 0.7).sort((x, y) => x.hp / x.maxHp - y.hp / y.maxHp)[0];
    const hurt = hurtMember ? world.actors.get(hurtMember.id) : null;

    // Companions act on their own, by role, but never stray far from the leader.
    let slot = 0;
    for (const m of state.party) {
      if (m.id === world.leaderId) continue;
      const a = world.actors.get(m.id);
      const s = slot++;
      if (!a || !a.alive) {
        if (a) a.motion = 'down';
        continue;
      }
      const goal = { x: 0, z: 0 };
      [goal.x, goal.z] = companionGoal({ cls: m.cls, self: a, leader, foes, hurt: hurt === a ? null : hurt, slot: s });
      // In a fight they stand in the lane the engine put them in (they step out of marked lanes).
      if (foes.length && m.lane) [goal.x, goal.z] = intoLane(world, goal.x, goal.z, m.lane);
      resolve(goal, a.radius, world, m.id); // a spot they can actually stand on
      const moving = walkTowards(world, m.id, goal.x, goal.z, dt, foes.length ? COMPANION_SPEED : 4.4, 0.35);
      if (!moving) {
        const foe = nearest(foes, a);
        if (foe && Math.hypot(foe.x - a.x, foe.z - a.z) < 12) faceTowards(a, foe.x, foe.z, dt);
        else a.yaw = leader.yaw;
      }
      if (frame.current % 4 === 0) a.y = floor(a);
    }

    // Heroes don't stand inside each other: companions step aside from the leader and each other.
    const standing = state.party.map((m) => [m.id, world.actors.get(m.id)]).filter(([, h]) => h && h.alive);
    for (const [id, h] of standing) {
      if (id === world.leaderId) continue;
      for (const [otherId, o] of standing) {
        if (otherId === id) continue;
        const dx = h.x - o.x;
        const dz = h.z - o.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.85 && d > 1e-4) {
          const push = Math.min(0.85 - d, 3 * dt);
          h.x += (dx / d) * push;
          h.z += (dz / d) * push;
          resolve(h, h.radius, world, id);
        }
      }
    }

    // Enemies close in on the nearest hero, else drift home. Bosses hunt Kael anywhere in the room
    // (Morvath stalks, slower); skeletons come once he is within 11 m.
    const heroes = state.party.map((m) => world.actors.get(m.id)).filter((h) => h && h.alive);
    for (const [id, a] of enemies) {
      const prey = nearest(heroes, a);
      const d = prey ? Math.hypot(prey.x - a.x, prey.z - a.z) : Infinity;
      if (prey && (a.boss || d < 11)) {
        const stop = a.radius + RADIUS.hero + 0.6;
        const moved = walkTowards(world, id, prey.x, prey.z, dt, a.ultimate ? 1.2 : a.boss ? 2.6 : a.flyer ? 2.2 : 1.8, stop);
        if (!moved) faceTowards(a, prey.x, prey.z, dt);
      } else if (a.home) walkTowards(world, id, a.home[0], a.home[2], dt, 1.4, 0.2);
      if (frame.current % 4 === 0 && !a.flyer) a.y = floor(a);
    }
  });
  return null;
}

export function Arena({ state, meta, models, cues, targetId, onTarget, world, reach, firstPerson }) {
  const roomId = state.combat?.roomId ?? state.location;
  const roomKey = `room_${roomId.slice(1)}`;
  const enemies = state.combat?.enemies ?? [];
  // Beaten enemies leave the scene three seconds after they fall (their death, then they sink away).
  const fellAt = useRef(new Map());
  const [gone, setGone] = useState(() => new Set());
  const goneTimers = useRef([]);
  useEffect(() => () => goneTimers.current.forEach(clearTimeout), []);
  useEffect(() => {
    for (const e of enemies) {
      if (e.hp > 0) {
        fellAt.current.delete(e.id);
        continue;
      }
      if (fellAt.current.has(e.id)) continue;
      fellAt.current.set(e.id, performance.now());
      goneTimers.current.push(setTimeout(() => setGone((g) => new Set(g).add(e.id)), 3000));
    }
    // A revived or new enemy with a reused id is drawn again.
    setGone((g) => {
      const next = new Set([...g].filter((id) => enemies.some((e) => e.id === id && e.hp <= 0)));
      return next.size === g.size ? g : next;
    });
  }, [enemies]);
  const tele = state.combat?.telegraph;
  const byId = (id) => cues.filter((c) => c.id === id);
  const useRoomModel = models.has(roomKey);
  const [, setLoaded] = useState(0);
  const onRoomReady = useCallback(() => setLoaded((n) => n + 1), []);
  // The rooms have no NPCs: Kael goes alone. Each room but the Throne keeps a cage at its side.
  const room = world.room;
  const cage = useMemo(() => (meta.rooms[roomId]?.final ? null : cageSpot(room)), [room, roomId, meta]);
  // Cleared, and no broken runes left in the room's round (cageRunes: counted by the server's locks).
  const open = state.fragments.includes(roomId) && state.phase !== 'combat' && !state.cageRunes;
  // What the HUD needs to know: the cells' doors, while the cage is open.
  world.cage = cage && open ? { cells: cage.cells } : null;

  // The stand-in room's props and the cage block the way.
  world.extraColliders = [
    ...(useRoomModel ? [] : PROP_COLLIDERS[roomId] ?? []),
    ...(cage ? cageColliders(cage) : []),
  ];
  useFighters(world, state, roomId);
  const motionOf = (id) => () => world.actors.get(id)?.motion ?? 'idle';

  return (
    <group>
      {useRoomModel ? (
        <Suspense fallback={<RoomSet roomId={roomId} />}>
          <RoomModel modelKey={roomKey} world={world} toon={models.get?.(roomKey)?.toon} onReady={onRoomReady} />
        </Suspense>
      ) : (
        <RoomSet roomId={roomId} />
      )}
      <WorldDriver world={world} state={state} />
      <TargetRing world={world} targetId={targetId} reach={reach} />
      <LaneMarks world={world} state={state} />

      {cage && <Cage cage={cage} open={open} models={models} floorY={room.floorY} cues={cues} />}

      {/* Kael's torch: a warm light that goes where he goes, so whoever he fights stays readable in
          the darkest corner of an artist's room without changing the room's own lighting. */}
      {state.party
        .filter((m) => m.controlled)
        .map((m) => (
          <Mover key={`torch-${m.id}`} id={m.id} world={world}>
            <HeroTorch />
          </Mover>
        ))}
      {state.party.filter((m) => !(firstPerson && m.controlled)).map((m) => (
        <Mover key={m.id} id={m.id} world={world}>
          <Actor
            modelKey={meta.classes[m.cls].model}
            models={models}
            position={[0, 0, 0]}
            facing={1}
            cues={byId(m.id)}
            fallen={m.fallen}
            telegraphed={tele?.targetId === m.id}
            label={m.name}
            badge={m.controlled ? 'you' : null}
            hp={m.hp}
            maxHp={m.maxHp}
            motion={motionOf(m.id)}
          />
        </Mover>
      ))}

      {enemies.filter((e) => !gone.has(e.id)).map((e) => (
        <Mover key={e.id} id={e.id} world={world}>
          <Actor
            modelKey={e.model}
            models={models}
            position={[0, 0, 0]}
            facing={1}
            scale={e.boss && !e.ultimate ? 1.15 : 1}
            cues={byId(e.id)}
            fallen={e.hp <= 0}
            dim={e.hp <= 0}
            armoured={e.armoured}
            label={e.name}
            badge={e.ultimate ? (e.armoured ? 'armoured' : 'armour broken') : IS_FLYER.has(e.model) ? 'flying' : null}
            hp={e.hp}
            maxHp={e.maxHp}
            motion={motionOf(e.id)}
            onClick={e.hp > 0 ? () => onTarget(e.id) : undefined}
            enraged={e.enraged && e.hp > 0}
            villain
          />
        </Mover>
      ))}
    </group>
  );
}
