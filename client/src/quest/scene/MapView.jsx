// The dungeon map: the camp and five rooms as floating platforms joined by corridors.
// Click a room to travel there (it costs torches).
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html, useGLTF } from '@react-three/drei';
import { Box3, Group, Plane, Vector3 } from 'three';
import { Actor } from './Actor.jsx';
import { useRoomLayout } from './Arena.jsx';
import { PALETTE, TOON_RAMP } from './placeholders.jsx';

export const NODE_POS = {
  camp: [0, 0, 4.2],
  r1: [-3.4, 0, 1.2],
  r2: [3.4, 0, 1.2],
  r3: [-3.4, 0, -3],
  r4: [3.4, 0, -3],
  r5: [0, 0, -6],
};

function Corridor({ from, to, lit }) {
  const [a, b] = [NODE_POS[from], NODE_POS[to]];
  const dx = b[0] - a[0];
  const dz = b[2] - a[2];
  const len = Math.hypot(dx, dz);
  return (
    <mesh position={[(a[0] + b[0]) / 2, -0.05, (a[2] + b[2]) / 2]} rotation={[0, -Math.atan2(dz, dx), 0]} receiveShadow>
      <boxGeometry args={[len, 0.12, 0.42]} />
      <meshToonMaterial gradientMap={TOON_RAMP} color={lit ? '#5a4632' : '#2b2a30'} emissive={lit ? PALETTE.bronze : '#000'} emissiveIntensity={lit ? 0.15 : 0} />
    </mesh>
  );
}

function Campfire() {
  const light = useRef();
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (light.current) light.current.intensity = 14 + Math.sin(t * 11) * 2 + Math.sin(t * 27) * 1.2;
  });
  return (
    <group position={[0.9, 0.2, 0.5]}>
      <mesh position={[0, 0.25, 0]}>
        <coneGeometry args={[0.25, 0.6, 8]} />
        <meshBasicMaterial color={PALETTE.ember} />
      </mesh>
      <pointLight ref={light} position={[0, 0.8, 0]} color="#ff9a52" distance={8} decay={2} />
    </group>
  );
}

// A miniature of the artist's room on its map tile: the same meshes and materials, cropped to the
// arena (no sky planes or far terrain), cut away above head height so you look into the room like a
// diorama, without its own lamps, and scaled to fit the hexagon. The cut is a clipping plane on the
// miniature's own copies of the materials, so the full-size room in a fight is never affected.
const CUTAWAY = 2.6; // metres above the floor: walls, domes and ceilings are sliced off here
// `lite`: the room has a low-detail copy for the map (room_N.mini.glb, from tools/models/optimize.mjs).
function RoomMiniature({ modelKey, lite, radius = 1.15 }) {
  const { scene } = useGLTF(`/models/${modelKey}${lite ? '.mini' : ''}.glb`);
  const layout = useRoomLayout(modelKey);
  const gl = useThree((s) => s.gl);
  const plane = useMemo(() => new Plane(new Vector3(0, -1, 0), 0), []);
  const mini = useMemo(() => {
    const copy = scene.clone(true);
    copy.updateMatrixWorld(true);
    // The arena: the walkable area from the layout file, else the middle of the model.
    const shapes = layout?.bounds ?? [];
    let cx = 0;
    let cz = 0;
    let half = 8;
    if (shapes.length) {
      const xs = [];
      const zs = [];
      for (const s of shapes) {
        if (s.kind === 'circle') xs.push(s.x - s.r, s.x + s.r), zs.push(s.z - s.r, s.z + s.r);
        else xs.push(s.minX, s.maxX), zs.push(s.minZ, s.maxZ);
      }
      cx = (Math.min(...xs) + Math.max(...xs)) / 2;
      cz = (Math.min(...zs) + Math.max(...zs)) / 2;
      half = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)) / 2;
    }
    const keep = half + 3; // the arena plus its walls
    const box = new Box3();
    const size = new Vector3();
    const mid = new Vector3();
    const lights = [];
    const owned = new Map();
    const clip = (m) => {
      if (!owned.has(m)) {
        const c = m.clone();
        c.clippingPlanes = [plane];
        owned.set(m, c);
      }
      return owned.get(m);
    };
    copy.traverse((o) => {
      if (o.isLight) lights.push(o);
      if (!o.isMesh) return;
      box.setFromObject(o);
      box.getSize(size);
      box.getCenter(mid);
      const far = Math.abs(mid.x - cx) > keep || Math.abs(mid.z - cz) > keep;
      const huge = Math.max(size.x, size.z) > keep * 3;
      o.visible = !far && !huge;
      o.material = Array.isArray(o.material) ? o.material.map(clip) : clip(o.material);
      o.castShadow = false;
      o.receiveShadow = false;
    });
    for (const l of lights) l.parent?.remove(l);
    const s = radius / keep;
    const holder = new Group();
    copy.position.set(-cx, 0, -cz);
    holder.add(copy);
    holder.scale.setScalar(s);
    holder.userData.cut = CUTAWAY * s;
    holder.userData.materials = [...owned.values()];
    return holder;
  }, [scene, layout, radius, plane]);
  useEffect(() => {
    gl.localClippingEnabled = true;
    // The plane lives in world space: put it at the tile's floor plus the cut height.
    mini.updateWorldMatrix(true, false);
    plane.constant = mini.getWorldPosition(new Vector3()).y + mini.userData.cut;
    return () => mini.userData.materials.forEach((m) => m.dispose());
  }, [gl, mini, plane]);
  return <primitive object={mini} />;
}

function Node({ id, room, status, option, cleared, sealed, here, onTravel, models, lowSpec }) {
  const roomKey = id === 'camp' ? null : `room_${id.slice(1)}`;
  const showMini = roomKey && models?.has(roomKey) && !lowSpec;
  const [hover, setHover] = useState(false);
  const pos = NODE_POS[id];
  const tier = room?.tier ?? 0;
  const color = id === 'camp' ? '#3d3427' : cleared ? '#4a3d22' : sealed ? '#201b26' : '#34303a';
  // Runes: red while a room's magic is broken, gold once it is restored.
  const rim = hover && option ? PALETTE.bone : id === 'camp' ? PALETTE.bronze : cleared ? PALETTE.gold : sealed ? '#4a2a55' : PALETTE.rune;
  return (
    <group position={pos}>
      <mesh
        position={[0, -0.25, 0]}
        receiveShadow
        castShadow
        onClick={(e) => {
          e.stopPropagation();
          if (option) onTravel(option);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHover(true);
          document.body.style.cursor = option ? 'pointer' : 'default';
        }}
        onPointerOut={() => {
          setHover(false);
          document.body.style.cursor = 'default';
        }}
      >
        <cylinderGeometry args={[1.35, 1.1, 0.5, 6]} />
        <meshToonMaterial gradientMap={TOON_RAMP} color={color} />
      </mesh>
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.2, 1.35, 6]} />
        <meshBasicMaterial color={rim} />
      </mesh>
      {/* a little silhouette per room: towers grow with the room's tier */}
      {showMini && (
        <Suspense fallback={null}>
          <group position={[0, 0.02, 0]}>
            <RoomMiniature modelKey={roomKey} lite={models.get?.(roomKey)?.mini === true} />
          </group>
          {/* its own lamp, so dark rooms still read on the map; dimmer while sealed */}
          <pointLight position={[0, 1.6, 0.4]} color={sealed ? '#b89ad0' : '#ffd9a8'} intensity={sealed ? 2.5 : 5} distance={3.2} decay={2} />
        </Suspense>
      )}
      {id !== 'camp' &&
        !showMini &&
        Array.from({ length: Math.min(tier, 5) }, (_, i) => (
          <mesh key={i} position={[Math.cos(i * 1.3) * 0.7, 0.3 + i * 0.12, Math.sin(i * 1.3) * 0.7 - 0.2]} castShadow>
            <boxGeometry args={[0.22, 0.6 + i * 0.25, 0.22]} />
            <meshToonMaterial gradientMap={TOON_RAMP} color={sealed ? '#3a2645' : '#4a4652'} emissive={id === 'r5' ? '#6b3a8a' : '#000'} emissiveIntensity={id === 'r5' ? 0.4 : 0} />
          </mesh>
        ))}
      {id === 'camp' && <Campfire />}
      {id === 'camp' && models && (
        <>
          <group position={[-0.8, 0, -0.5]} scale={0.45}>
            <Actor modelKey="npc_king_ghost" models={models} position={[0, 0, 0]} />
          </group>
          <group position={[0.3, 0, -0.85]} scale={0.45}>
            <Actor modelKey="npc_pip" models={models} position={[0, 0, 0]} />
          </group>
        </>
      )}
      <Html position={[0, 1.9, 0]} center distanceFactor={11} zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
        <div className={`map-tag ${option ? 'is-open' : ''} ${here ? 'is-here' : ''}`}>
          <div className="map-name">{id === 'camp' ? 'The Camp' : room.name}</div>
          {id !== 'camp' && <div className="map-round">{room.roundName}</div>}
          <div className="map-sub">{status}</div>
        </div>
      </Html>
    </group>
  );
}

// How strong Morvath is now, in percent: he grows for every room cleared beyond the three needed.
export function morvathStrength(state, meta) {
  const extra = Math.max(0, state.stats.roomsCleared - (meta.fragmentsForThrone ?? 3));
  return Math.round(100 * (1 + (meta.finalGrowth ?? 0) * extra));
}

export function MapView({ state, meta, models, onTravel, lowSpec }) {
  const options = useMemo(() => new Map(state.options.filter((o) => o.type === 'travel').map((o) => [o.to, o])), [state.options]);
  const cleared = new Set(state.fragments);
  const here = NODE_POS[state.location];
  const waystones = state.fragments.filter((r) => r !== 'r5').map((r) => ['camp', r]);

  return (
    <group>
      <mesh position={[0, -0.6, -0.8]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[11, 48]} />
        <meshToonMaterial gradientMap={TOON_RAMP} color="#121419" />
      </mesh>
      {meta.edges.map(([a, b]) => (
        <Corridor key={`${a}-${b}`} from={a} to={b} lit={cleared.has(a) || cleared.has(b) || a === 'camp'} />
      ))}
      {waystones.map(([a, b]) => (
        <Corridor key={`w-${b}`} from={a} to={b} lit />
      ))}
      {['camp', 'r1', 'r2', 'r3', 'r4', 'r5'].map((id) => {
        const room = meta.rooms[id];
        const opt = options.get(id);
        const sealed = id === 'r5' && !state.throneOpen;
        const status =
          id === state.location
            ? 'You are here'
            : sealed
              ? `Sealed · needs ${meta.fragmentsForThrone} Heart fragments`
              : cleared.has(id)
                ? 'Runes restored'
                : opt
                  ? `${opt.cost} torch${opt.cost === 1 ? '' : 'es'}${id !== 'camp' ? ` · round ${room.round}` : ''}${room?.final ? ` · Morvath ${morvathStrength(state, meta)}%` : ''}`
                  : id === 'camp'
                    ? ''
                    : 'Out of reach';
        return <Node key={id} id={id} room={room} status={status} option={opt} cleared={cleared.has(id)} sealed={sealed} here={id === state.location} onTravel={onTravel} models={models} lowSpec={lowSpec} />;
      })}
      {/* the party token stands where the party is */}
      <group position={[here[0] - 0.4, 0, here[2] + 0.2]} scale={0.38}>
        {state.party.map((m, i) => (
          <Actor key={m.id} modelKey={meta.classes[m.cls].model} models={models} position={[(i % 2) * 1.1, 0, Math.floor(i / 2) * 1.1 - 0.5]} fallen={m.fallen} />
        ))}
      </group>
    </group>
  );
}
