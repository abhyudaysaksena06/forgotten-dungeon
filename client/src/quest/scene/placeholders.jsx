// Stand-in shapes for every model key until the Blender .glb files arrive. Each is built so its
// feet sit at y = 0 and it faces +x, matching the asset contract. Looks follow the Story Bible.
import { createContext, useContext, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Outlines } from '@react-three/drei';
import { DataTexture, NearestFilter, RedFormat } from 'three';

export const PALETTE = {
  crypt: '#161922',
  bone: '#e9dfc9',
  bronze: '#c08a4a',
  verdigris: '#5aa38f',
  blood: '#b5363f',
  venom: '#8fb84a',
  frost: '#8fb3d9',
  ash: '#6b6760',
  ember: '#e07a2e',
  rune: '#d94a3a',
  gold: '#e6b44c',
  shadow: '#2a1f3a',
};

// Cel shading: three flat bands of light and an ink outline, like an anime render.
export const TOON_RAMP = (() => {
  const tex = new DataTexture(new Uint8Array([55, 150, 255]), 3, 1, RedFormat);
  tex.minFilter = NearestFilter;
  tex.magFilter = NearestFilter;
  tex.needsUpdate = true;
  return tex;
})();
export const INK = '#0b0a10';
// false turns the ink outlines off (the Low spec toggle).
export const InkContext = createContext(true);

// Material for every stand-in part. Rendered inside a <mesh>, so the outline wraps that mesh.
// Toon shading has no roughness or metalness, so those props from the parts are ignored.
const M = ({ color, emissive, intensity = 0.6, opacity }) => {
  const ink = useContext(InkContext);
  return (
    <>
      <meshToonMaterial
        color={color}
        gradientMap={TOON_RAMP}
        emissive={emissive ?? '#000000'}
        emissiveIntensity={emissive ? intensity : 0}
        transparent={opacity !== undefined}
        opacity={opacity ?? 1}
        depthWrite={opacity === undefined}
      />
      {ink && opacity === undefined && <Outlines thickness={0.045} color={INK} />}
    </>
  );
};

function Body({ color, height = 1.1, radius = 0.28, ...mat }) {
  return (
    <mesh position={[0, height / 2 + radius, 0]} castShadow>
      <capsuleGeometry args={[radius, height - radius, 6, 12]} />
      <M color={color} {...mat} />
    </mesh>
  );
}

function Head({ y = 1.55, color = '#e2c9a6', r = 0.2, ...mat }) {
  return (
    <mesh position={[0, y, 0]} castShadow>
      <sphereGeometry args={[r, 16, 12]} />
      <M color={color} {...mat} />
    </mesh>
  );
}

// ---------- the four Runewrights ----------

function Kael() {
  return (
    <group>
      <Body color="#7c8794" height={1.15} radius={0.36} metal={0.5} rough={0.45} />
      <Head y={1.65} />
      <mesh position={[0.42, 0.95, 0]} castShadow>
        <boxGeometry args={[0.1, 1.1, 0.8]} />
        <M color={PALETTE.bronze} metal={0.6} rough={0.4} />
      </mesh>
      <mesh position={[0.3, 1.2, -0.5]} rotation={[0, 0, -0.4]} castShadow>
        <boxGeometry args={[0.07, 1.0, 0.07]} />
        <M color="#d9d4c7" metal={0.8} rough={0.3} />
      </mesh>
    </group>
  );
}

function Lyra() {
  return (
    <group>
      <mesh position={[0, 0.65, 0]} castShadow>
        <coneGeometry args={[0.42, 1.3, 16]} />
        <M color="#3d4f7a" />
      </mesh>
      <Head y={1.45} />
      <mesh position={[0, 1.72, 0]} castShadow>
        <coneGeometry args={[0.22, 0.45, 12]} />
        <M color="#3d4f7a" />
      </mesh>
      <mesh position={[0.4, 0.9, 0.1]} castShadow>
        <cylinderGeometry args={[0.03, 0.03, 1.7, 6]} />
        <M color="#6b4a2c" />
      </mesh>
      <mesh position={[0.4, 1.8, 0.1]}>
        <sphereGeometry args={[0.1, 12, 10]} />
        <M color={PALETTE.frost} emissive={PALETTE.frost} intensity={1.8} />
      </mesh>
    </group>
  );
}

function Rook() {
  return (
    <group>
      <Body color="#2e2a33" height={1.05} radius={0.25} />
      <Head y={1.45} r={0.19} />
      <mesh position={[0, 1.52, -0.02]}>
        <sphereGeometry args={[0.21, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <M color="#1d1a21" />
      </mesh>
      {[0.18, -0.18].map((z) => (
        <mesh key={z} position={[0.32, 0.85, z]} rotation={[0, 0, -0.9]} castShadow>
          <boxGeometry args={[0.05, 0.5, 0.05]} />
          <M color="#cfcac0" metal={0.8} rough={0.3} />
        </mesh>
      ))}
    </group>
  );
}

function Mira() {
  return (
    <group>
      <Body color="#3f5b3a" height={1.05} radius={0.24} />
      <Head y={1.45} r={0.18} />
      <mesh position={[0.3, 1.0, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <torusGeometry args={[0.45, 0.025, 6, 16, Math.PI]} />
        <M color="#6b4a2c" />
      </mesh>
    </group>
  );
}

// ---------- enemies ----------

function Crawler({ scale = 1 }) {
  return (
    <group scale={scale}>
      <mesh position={[0, 0.35, 0]} castShadow>
        <sphereGeometry args={[0.38, 12, 10]} />
        <M color="#1d1726" emissive={PALETTE.shadow} intensity={0.6} />
      </mesh>
      {[-0.25, 0, 0.25].flatMap((x) =>
        [0.3, -0.3].map((z) => (
          <mesh key={`${x}${z}`} position={[x, 0.15, z]} rotation={[z > 0 ? 0.7 : -0.7, 0, 0]}>
            <cylinderGeometry args={[0.03, 0.03, 0.45, 5]} />
            <M color="#120e18" />
          </mesh>
        )),
      )}
      <mesh position={[0.32, 0.45, 0.1]}>
        <sphereGeometry args={[0.05, 6, 6]} />
        <M color={PALETTE.rune} emissive={PALETTE.rune} intensity={2} />
      </mesh>
    </group>
  );
}

function Sentinel() {
  return (
    <group scale={1.3}>
      {[
        [0, 0.45, 0, 0.9, 0.9, 0.7],
        [0, 1.25, 0, 1.1, 0.8, 0.85],
        [0, 1.85, 0, 0.5, 0.45, 0.45],
        [0, 1.1, 0.68, 0.3, 1.0, 0.3],
        [0, 1.1, -0.68, 0.3, 1.0, 0.3],
      ].map(([x, y, z, w, h, d], i) => (
        <mesh key={i} position={[x, y, z]} castShadow>
          <boxGeometry args={[w, h, d]} />
          <M color="#6f7378" rough={0.95} />
        </mesh>
      ))}
      <mesh position={[0.26, 1.88, 0]}>
        <boxGeometry args={[0.02, 0.06, 0.3]} />
        <M color={PALETTE.rune} emissive={PALETTE.rune} intensity={2} />
      </mesh>
    </group>
  );
}

function Flyer({ color, scale = 1, glow }) {
  const wings = useRef();
  useFrame(({ clock }) => {
    if (wings.current) wings.current.rotation.x = Math.sin(clock.elapsedTime * 12) * 0.6;
  });
  return (
    <group scale={scale} position={[0, 1.3, 0]}>
      <mesh castShadow>
        <sphereGeometry args={[0.28, 14, 10]} />
        <M color={color} emissive={glow} intensity={0.8} />
      </mesh>
      <group ref={wings}>
        {[0.45, -0.45].map((z) => (
          <mesh key={z} position={[0, 0.05, z]} rotation={[z > 0 ? 0.3 : -0.3, 0, 0]}>
            <boxGeometry args={[0.5, 0.03, 0.5]} />
            <M color={color} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function Robed({ color, scale = 1, glow, opacity }) {
  return (
    <group scale={scale}>
      <mesh position={[0, 0.7, 0]} castShadow>
        <coneGeometry args={[0.42, 1.4, 14]} />
        <M color={color} opacity={opacity} />
      </mesh>
      <mesh position={[0, 1.5, 0]} castShadow>
        <sphereGeometry args={[0.22, 14, 10]} />
        <M color="#1d1a1f" emissive={glow} intensity={glow ? 0.8 : 0} opacity={opacity} />
      </mesh>
    </group>
  );
}

function Armour({ color = '#2b2533', scale = 1, glow = PALETTE.shadow, axe = false, cape }) {
  return (
    <group scale={scale}>
      <Body color={color} height={1.15} radius={0.34} metal={0.6} rough={0.4} />
      <mesh position={[0, 1.62, 0]} castShadow>
        <boxGeometry args={[0.36, 0.38, 0.36]} />
        <M color={color} metal={0.6} rough={0.4} />
      </mesh>
      <mesh position={[0.19, 1.64, 0]}>
        <boxGeometry args={[0.02, 0.05, 0.24]} />
        <M color={glow} emissive={glow} intensity={2} />
      </mesh>
      {axe && (
        <mesh position={[0.45, 1.1, 0]} rotation={[0, 0, -0.3]} castShadow>
          <boxGeometry args={[0.12, 1.3, 0.55]} />
          <M color="#5c5650" metal={0.7} rough={0.4} />
        </mesh>
      )}
      {cape && (
        <mesh position={[-0.3, 1.0, 0]} castShadow>
          <boxGeometry args={[0.06, 1.2, 0.7]} />
          <M color={cape} />
        </mesh>
      )}
    </group>
  );
}

// Morvath: a tall knight in black armour, half scaled; later a dragon with a broken shadow crown.
function MorvathKnight({ armoured }) {
  return (
    <group scale={1.5}>
      <Armour color="#141018" glow={PALETTE.rune} cape="#3a0e14" />
      <ArmourShell show={armoured} />
    </group>
  );
}

function MorvathDragon({ armoured }) {
  const wings = useRef();
  useFrame(({ clock }) => {
    if (wings.current) wings.current.rotation.x = Math.sin(clock.elapsedTime * 1.6) * 0.18;
  });
  return (
    <group scale={1.25}>
      <mesh position={[0, 1.1, 0]} castShadow>
        <capsuleGeometry args={[0.6, 1.2, 8, 14]} />
        <M color="#120d16" emissive="#3a0e14" intensity={0.5} rough={0.5} />
      </mesh>
      <mesh position={[0.9, 2.0, 0]} rotation={[0, 0, -0.7]} castShadow>
        <capsuleGeometry args={[0.22, 0.9, 6, 10]} />
        <M color="#120d16" />
      </mesh>
      <mesh position={[1.35, 2.45, 0]} castShadow>
        <boxGeometry args={[0.55, 0.32, 0.36]} />
        <M color="#1a1320" />
      </mesh>
      <mesh position={[1.62, 2.48, 0]}>
        <boxGeometry args={[0.03, 0.08, 0.28]} />
        <M color={PALETTE.ember} emissive={PALETTE.ember} intensity={2.5} />
      </mesh>
      <mesh position={[1.3, 2.72, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.18, 0.04, 6, 14, Math.PI * 1.6]} />
        <M color="#2a1f3a" emissive={PALETTE.shadow} intensity={1.2} />
      </mesh>
      <group ref={wings} position={[-0.1, 1.9, 0]}>
        {[1, -1].map((side) => (
          <mesh key={side} position={[0, 0.2, side * 1.1]} rotation={[side * 0.5, 0, 0]} castShadow>
            <boxGeometry args={[1.4, 0.05, 1.6]} />
            <M color="#1d1626" opacity={0.92} />
          </mesh>
        ))}
      </group>
      <ArmourShell show={armoured} y={1.2} r={1.35} />
    </group>
  );
}

// A faint shadow shell around Morvath while his armour holds.
function ArmourShell({ show, y = 1.0, r = 0.85 }) {
  if (!show) return null;
  return (
    <mesh position={[0, y, 0]}>
      <sphereGeometry args={[r, 20, 14]} />
      <meshStandardMaterial color="#4b2a6b" emissive="#4b2a6b" emissiveIntensity={0.6} transparent opacity={0.22} depthWrite={false} />
    </mesh>
  );
}

// ---------- NPCs ----------

function Ghost({ crown }) {
  return (
    <group>
      <Robed color="#8fb3d9" glow="#8fb3d9" opacity={0.45} />
      {crown && (
        <mesh position={[0, 1.78, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.17, 0.035, 6, 16]} />
          <meshStandardMaterial color="#cfe3ff" emissive="#8fb3d9" emissiveIntensity={1.4} transparent opacity={0.7} />
        </mesh>
      )}
      <pointLight position={[0, 1.4, 0]} color="#8fb3d9" intensity={3} distance={4} decay={2} />
    </group>
  );
}

function Grum() {
  return (
    <group scale={1.2}>
      <mesh position={[0, 0.6, 0]} castShadow>
        <boxGeometry args={[0.8, 1.2, 0.7]} />
        <M color="#5d6b55" rough={1} />
      </mesh>
      <mesh position={[0, 1.4, 0]} castShadow>
        <boxGeometry args={[0.6, 0.5, 0.55]} />
        <M color="#6e786a" rough={1} />
      </mesh>
      {[0.12, -0.12].map((z) => (
        <mesh key={z} position={[0.3, 1.45, z]}>
          <sphereGeometry args={[0.05, 8, 6]} />
          <M color={PALETTE.gold} emissive={PALETTE.gold} intensity={2} />
        </mesh>
      ))}
    </group>
  );
}

function Venn() {
  const books = useRef();
  useFrame(({ clock }) => {
    if (books.current) books.current.rotation.y = clock.elapsedTime * 0.8;
  });
  return (
    <group>
      <Robed color="#4a4a5e" />
      <group ref={books} position={[0, 1.2, 0]}>
        {[0, 1, 2].map((i) => (
          <mesh key={i} position={[Math.cos((i * Math.PI * 2) / 3) * 0.6, i * 0.15, Math.sin((i * Math.PI * 2) / 3) * 0.6]}>
            <boxGeometry args={[0.22, 0.06, 0.3]} />
            <M color="#7a4a2c" />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function Seraphine() {
  return (
    <group>
      <Robed color="#c9cfd8" glow="#e0e8f4" />
      <mesh position={[0.15, 1.52, 0]}>
        <boxGeometry args={[0.1, 0.06, 0.36]} />
        <M color="#e9e4da" />
      </mesh>
    </group>
  );
}

// The cage's keepers.
function Healer() {
  return (
    <group>
      <Robed color="#e6e2d6" glow={PALETTE.verdigris} />
      <mesh position={[0.32, 1.0, 0]}>
        <sphereGeometry args={[0.1, 12, 10]} />
        <M color={PALETTE.verdigris} emissive={PALETTE.verdigris} intensity={1.6} />
      </mesh>
    </group>
  );
}

function Weaponsmith() {
  return (
    <group>
      <Body color="#5a4632" height={1.0} radius={0.32} />
      <Head y={1.45} r={0.19} />
      <mesh position={[0.36, 0.9, 0]} rotation={[0, 0, -0.5]} castShadow>
        <cylinderGeometry args={[0.03, 0.03, 0.7, 6]} />
        <M color="#6b4a2c" />
      </mesh>
      <mesh position={[0.5, 1.2, 0]} rotation={[0, 0, -0.5]} castShadow>
        <boxGeometry args={[0.24, 0.12, 0.12]} />
        <M color="#8a8f96" metal={0.8} rough={0.3} />
      </mesh>
      <mesh position={[0.22, 0.6, 0]}>
        <boxGeometry args={[0.06, 0.5, 0.5]} />
        <M color={PALETTE.ember} emissive={PALETTE.ember} intensity={0.5} />
      </mesh>
    </group>
  );
}

function Corin() {
  return (
    <group>
      <Armour color="#8a8f96" glow={PALETTE.gold} />
      <mesh position={[0, 1.0, 0.38]}>
        <cylinderGeometry args={[0.1, 0.1, 0.3, 8]} />
        <M color="#e9e4da" />
      </mesh>
    </group>
  );
}

function Pip() {
  return (
    <group scale={0.75}>
      <Body color="#5e8a3a" height={0.8} radius={0.26} />
      <Head y={1.2} color="#6f9a46" r={0.24} />
      <mesh position={[-0.35, 0.95, 0]} castShadow>
        <cylinderGeometry args={[0.38, 0.32, 0.6, 14]} />
        <M color="#3a3532" metal={0.6} rough={0.5} />
      </mesh>
    </group>
  );
}

// model key -> stand-in. Unknown keys get a magenta pillar so a typo is visible, not invisible.
export function Placeholder({ modelKey, armoured }) {
  switch (modelKey) {
    case 'char_kael':
      return <Kael />;
    case 'char_lyra':
      return <Lyra />;
    case 'char_rook':
      return <Rook />;
    case 'char_mira':
      return <Mira />;
    case 'enemy_shadow_crawler':
      return <Crawler />;
    case 'boss_stone_sentinel':
      return <Sentinel />;
    case 'enemy_ink_bat':
      return <Flyer color="#151218" glow="#3b2b52" />;
    case 'enemy_hollow_scribe':
      return <Robed color="#3a2d22" glow={PALETTE.rune} />;
    case 'boss_ink_wraith':
      return <Flyer color="#1a1621" glow="#5b3f86" scale={2.1} />;
    case 'enemy_trial_spirit':
      return <Robed color="#5fd4e0" glow="#5fd4e0" opacity={0.5} />;
    case 'boss_brakka':
      return <Armour color="#8c5a2b" glow={PALETTE.gold} scale={1.45} axe />;
    case 'enemy_hollow_knight':
      return <Armour />;
    case 'enemy_skeleton':
      return <Robed color={PALETTE.bone} glow={PALETTE.rune} />;
    case 'boss_hollow_captain':
      return <Armour scale={1.35} glow={PALETTE.rune} cape="#2b0d12" axe />;
    case 'boss_morvath_knight':
      return <MorvathKnight armoured={armoured} />;
    case 'boss_morvath_dragon':
      return <MorvathDragon armoured={armoured} />;
    case 'npc_king_ghost':
      return <Ghost crown />;
    case 'npc_ilsa':
      return <Ghost />;
    case 'npc_grum':
      return <Grum />;
    case 'npc_venn':
      return <Venn />;
    case 'npc_seraphine':
      return <Seraphine />;
    case 'npc_corin':
      return <Corin />;
    case 'npc_pip':
      return <Pip />;
    case 'npc_healer':
      return <Healer />;
    case 'npc_smith':
      return <Weaponsmith />;
    default:
      return (
        <mesh position={[0, 0.8, 0]}>
          <cylinderGeometry args={[0.3, 0.3, 1.6, 8]} />
          <M color="#ff00ff" />
        </mesh>
      );
  }
}

export const IS_FLYER = new Set(['enemy_ink_bat', 'boss_ink_wraith']);
