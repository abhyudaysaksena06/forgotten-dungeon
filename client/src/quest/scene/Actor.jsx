// One character on screen. Uses the Blender .glb when its key is in models/manifest.json,
// otherwise a placeholder. Animates from timed cues (see ../events.js).
import { Suspense, useContext, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html, useAnimations, useGLTF } from '@react-three/drei';
import { Box3, LoopOnce } from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { IS_FLYER, InkContext, PALETTE, Placeholder, TOON_RAMP } from './placeholders.jsx';
import { toonify } from './toon.js';

const DURATION = { attack: 520, skill: 700, hit: 420, dodge: 380, defend: 600, heal: 700, death: 700, boss_strike: 700, boss_sweep: 900, transform: 900, armour_break: 800, block: 400 };
const GLB_CLIP = { attack: 'attack', skill: 'skill', hit: 'hit', dodge: 'hit', defend: 'defend', heal: 'idle', death: 'death', boss_strike: 'boss_strike', boss_sweep: 'boss_sweep', transform: 'transform', armour_break: 'armour_break', block: 'hit' };

function activeCue(cues, now) {
  let best = null;
  for (const c of cues) if (c.at <= now && now - c.at < DURATION[c.kind] && (!best || c.at > best.at)) best = c;
  return best;
}

// Clip names from Blender come as 'Run', 'Armature|Run' or 'mixamo.com|Run': match on the last part.
export const clipKey = (name) =>
  name
    .split('|')
    .pop()
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

function GlbModel({ modelKey, cues, fallen, motion, opts = {} }) {
  const { scene, animations } = useGLTF(`/models/${modelKey}.glb`);
  const inked = useContext(InkContext);
  // Each actor gets its own copy, toon-shaded with an ink outline unless the manifest says toon: false.
  const model = useMemo(() => {
    const copy = cloneSkinned(scene);
    return opts.toon === false ? copy : toonify(copy, { ramp: TOON_RAMP, outline: inked });
  }, [scene, inked, opts.toon]);
  const { actions: raw } = useAnimations(animations, model);
  const actions = useMemo(() => Object.fromEntries(Object.entries(raw).map(([k, v]) => [clipKey(k), v])), [raw]);
  // Blender characters face -Y (the front view), which arrives as +Z: turn them to face +X like
  // the stand-ins. `height` (metres) rescales a model exported at the wrong size.
  const fit = useMemo(() => {
    const b = new Box3().setFromObject(model);
    const h = b.max.y - b.min.y;
    return { scale: opts.height && h > 0 ? opts.height / h : 1, turn: ((opts.turn ?? 90) * Math.PI) / 180 };
  }, [model, opts.height, opts.turn]);
  const loco = useRef(null);
  useEffect(() => {
    loco.current = actions.idle ?? null;
    actions.idle?.reset().fadeIn(0.2).play();
  }, [actions]);
  // Walk, run and jump clips follow the movement.
  useFrame(() => {
    const m = motion?.() ?? 'idle';
    const want = m === 'run' ? actions.run ?? actions.walk ?? actions.idle : m === 'jump' ? actions.jump ?? actions.run ?? actions.idle : actions.idle;
    if (!want || want === loco.current) return;
    want.reset().fadeIn(0.18).play();
    loco.current?.fadeOut(0.18);
    loco.current = want;
  });
  useEffect(() => {
    const timers = cues.map((c) =>
      setTimeout(() => {
        const clip = actions[GLB_CLIP[c.kind]];
        if (!clip) return;
        clip.reset().setLoop(LoopOnce, 1);
        clip.clampWhenFinished = c.kind === 'death';
        clip.fadeIn(0.08).play();
      }, Math.max(0, c.at - performance.now())),
    );
    return () => timers.forEach(clearTimeout);
  }, [cues, actions]);
  useEffect(() => {
    if (!fallen) actions.death?.stop();
  }, [fallen, actions]);
  model.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  return <primitive object={model} scale={fit.scale} rotation={[0, fit.turn, 0]} />;
}

export function Actor({
  modelKey,
  models,
  position,
  facing = 1,
  cues = [],
  fallen = false,
  selected = false,
  telegraphed = false,
  dim = false,
  armoured,
  scale = 1,
  label,
  hp,
  maxHp,
  badge,
  onClick,
  motion, // () => 'idle' | 'run' | 'jump' | 'down', for characters that move
}) {
  const inner = useRef();
  const flash = useRef();
  const glow = useRef();
  const ring = useRef();
  const flyer = IS_FLYER.has(modelKey);
  const useGlb = models?.has(modelKey);
  const seed = useMemo(() => Math.random() * 10, []);
  const death = cues.find((c) => c.kind === 'death');

  useFrame(({ clock }) => {
    const g = inner.current;
    if (!g) return;
    const now = performance.now();
    const t = clock.elapsedTime;
    const cue = activeCue(cues, now);
    const p = cue ? (now - cue.at) / DURATION[cue.kind] : 0;
    let x = 0;
    const running = (motion?.() ?? 'idle') === 'run' && !fallen;
    let y = flyer ? Math.sin(t * 2.4 + seed) * 0.12 : Math.sin(t * 1.6 + seed) * 0.015;
    // Stand-ins bob as they run (a Blender rig plays its own run clip instead).
    if (running && !useGlb && !flyer) y += Math.abs(Math.sin(t * 11 + seed)) * 0.09;
    let z = 0;
    let s = 1;
    if (cue) {
      const arc = Math.sin(Math.PI * p);
      if (cue.kind === 'attack' || cue.kind === 'boss_strike') x = arc * 0.8;
      if (cue.kind === 'skill' || cue.kind === 'transform') {
        x = arc * 0.4;
        y += arc * 0.35;
      }
      if (cue.kind === 'boss_sweep') s = 1 + arc * 0.15;
      if (cue.kind === 'hit' || cue.kind === 'block') z = Math.sin(p * 40) * 0.08 * (1 - p);
      if (cue.kind === 'dodge') z = arc * 0.35;
      if (cue.kind === 'defend') s = 1 + arc * 0.05;
    }
    // Fallen: topple once the death cue has played (or straight away if there was none).
    const down = fallen && (!death || now >= death.at);
    const targetRot = down ? -Math.PI / 2 : running && !useGlb ? -0.14 : 0; // lean into the run
    g.rotation.z += (targetRot - g.rotation.z) * 0.12;
    g.position.set(x, down ? (flyer ? -0.9 : -0.05) : y, z);
    g.scale.setScalar(s);

    if (flash.current) {
      const hit = cue && (cue.kind === 'hit' || cue.kind === 'block');
      flash.current.opacity = hit ? 0.55 * (1 - p) : 0;
      flash.current.color.set(cue?.kind === 'block' ? '#e6b44c' : cue?.poison ? PALETTE.venom : '#ff3b3b');
    }
    if (glow.current) {
      const healing = cue && (cue.kind === 'heal' || cue.kind === 'armour_break');
      glow.current.opacity = healing ? 0.6 * Math.sin(Math.PI * p) : 0;
    }
    if (ring.current) ring.current.rotation.z = t * (telegraphed ? 2 : 0.6);
  });

  const height = 2 * scale * (modelKey.startsWith('boss_morvath') ? 1.7 : modelKey.startsWith('boss_') ? 1.3 : 1);
  const recentNumbers = cues.filter((c) => (c.kind === 'hit' || c.kind === 'heal') && c.amount);

  return (
    <group position={position} scale={scale}>
      <group rotation={[0, facing > 0 ? 0 : Math.PI, 0]}>
        <group
          ref={inner}
          onClick={(e) => {
            e.stopPropagation();
            if (e.delta > 6 || document.pointerLockElement) return; // a camera drag, or mouse look (aim with the crosshair)
            onClick?.();
          }}
          onPointerOver={() => onClick && (document.body.style.cursor = 'pointer')}
          onPointerOut={() => (document.body.style.cursor = 'default')}
        >
          {useGlb ? (
            <Suspense fallback={<Placeholder modelKey={modelKey} armoured={armoured} />}>
              <GlbModel modelKey={modelKey} cues={cues} fallen={fallen} motion={motion} opts={models.get?.(modelKey) ?? {}} />
            </Suspense>
          ) : (
            <Placeholder modelKey={modelKey} armoured={armoured} />
          )}
          <mesh position={[0, flyer ? 1.3 : 0.9, 0]}>
            <sphereGeometry args={[0.75, 16, 12]} />
            <meshBasicMaterial ref={flash} color="#ff3b3b" transparent opacity={0} depthWrite={false} />
          </mesh>
          <mesh position={[0, flyer ? 1.3 : 0.9, 0]}>
            <sphereGeometry args={[0.85, 16, 12]} />
            <meshBasicMaterial ref={glow} color={PALETTE.verdigris} transparent opacity={0} depthWrite={false} />
          </mesh>
        </group>
      </group>

      {(selected || telegraphed) && (
        <mesh ref={ring} position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.62, 0.78, 32, 1, 0, Math.PI * 1.75]} />
          <meshBasicMaterial color={telegraphed ? PALETTE.blood : PALETTE.bronze} transparent opacity={0.9} />
        </mesh>
      )}

      {label && (
        <Html position={[0, height + 0.25, 0]} center zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
          <div className={`actor-tag ${dim ? 'is-dim' : ''}`}>
            <div className="actor-name">
              {label}
              {badge && <span className="actor-badge">{badge}</span>}
            </div>
            {maxHp > 0 && (
              <div className="actor-bar">
                <div style={{ width: `${Math.max(0, Math.min(100, (hp / maxHp) * 100))}%` }} />
              </div>
            )}
          </div>
        </Html>
      )}

      {recentNumbers.length > 0 && (
        <Html position={[0, height - 0.2, 0]} center zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
          <div className="dmg-stack">
            {recentNumbers.map((c) => (
              <span
                key={`${c.at}-${c.kind}`}
                className={`dmg ${c.kind === 'heal' ? 'is-heal' : ''}`}
                style={{ animationDelay: `${Math.max(0, c.at - performance.now())}ms` }}
              >
                {c.kind === 'heal' ? '+' : '−'}
                {c.amount}
              </span>
            ))}
          </div>
        </Html>
      )}
    </group>
  );
}
