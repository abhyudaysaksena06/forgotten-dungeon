// One character on screen. Uses the Blender .glb when its key is in models/manifest.json,
// otherwise a placeholder. Animates from timed cues (see ../events.js).
import { Suspense, useContext, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html, useAnimations, useGLTF } from '@react-three/drei';
import { AdditiveBlending, BackSide, Box3, LoopOnce } from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { IS_FLYER, InkContext, PALETTE, Placeholder, TOON_RAMP } from './placeholders.jsx';
import { toonify } from './toon.js';

// The hosted build (Vercel, VITE_VILLAINS_ONLY=1) leaves out the stand-in figures: a character
// without a real model isn't drawn. Villains and the cage's keepers always are, and so is any
// character whose model is in the manifest (Kael, the keepers and the camp's NPCs now have one).
export const VILLAINS_ONLY = import.meta.env.VITE_VILLAINS_ONLY === '1';

const DURATION = { attack: 520, rune: 700, skill: 700, hit: 420, dodge: 380, defend: 600, heal: 700, death: 700, boss_strike: 700, boss_sweep: 900, transform: 900, armour_break: 800, block: 400, interact: 900, victory: 1400, charge: 820, slam: 1000 };
// Which clip plays for a cue: the first one the model has.
const GLB_CLIP = {
  attack: ['attack'],
  rune: ['rune', 'skill', 'attack'],
  skill: ['skill', 'attack'],
  hit: ['hit'],
  dodge: ['dodge', 'hit'],
  defend: ['defend', 'skill'],
  heal: ['heal'],
  death: ['death'],
  boss_strike: ['boss_strike', 'attack'],
  boss_sweep: ['boss_sweep', 'skill', 'attack'],
  transform: ['transform', 'skill'],
  armour_break: ['armour_break', 'hit'],
  block: ['block', 'hit'],
  interact: ['interact', 'skill'],
  victory: ['victory'],
  charge: ['charge', 'boss_strike', 'attack'],
  slam: ['slam', 'boss_sweep', 'skill', 'attack'],
};
// Bosses whose 'skill' is the Shadow Tide: a poisoned ring rolls out across the floor.
const TIDE_CASTERS = new Set(['boss_hollow_king']);
const clipFor = (actions, kind) => (GLB_CLIP[kind] ?? []).map((k) => actions[k]).find(Boolean);

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

function GlbModel({ modelKey, cues, fallen, motion, opts = {}, clipsRef }) {
  const { scene, animations } = useGLTF(`/models/${modelKey}.glb`);
  const inked = useContext(InkContext);
  // Each actor gets its own copy, toon-shaded with an ink outline unless the manifest says toon: false.
  // Its height is measured before the outline is added, which would count in the box.
  const { model, h } = useMemo(() => {
    const copy = cloneSkinned(scene);
    copy.updateMatrixWorld(true);
    const b = new Box3().setFromObject(copy);
    return { model: opts.toon === false ? copy : toonify(copy, { ramp: TOON_RAMP, outline: inked }), h: b.max.y - b.min.y };
  }, [scene, inked, opts.toon]);
  const { actions: raw } = useAnimations(animations, model);
  const actions = useMemo(() => Object.fromEntries(Object.entries(raw).map(([k, v]) => [clipKey(k), v])), [raw]);
  // Blender characters face -Y (the front view), which arrives as +Z: turn them to face +X like
  // the stand-ins. `height` (metres) rescales a model exported at the wrong size.
  const fit = useMemo(
    () => ({ scale: opts.height && h > 0 ? opts.height / h : 1, turn: ((opts.turn ?? 90) * Math.PI) / 180 }),
    [h, opts.height, opts.turn],
  );
  const loco = useRef(null);
  const wasDown = useRef(false);
  useEffect(() => {
    if (clipsRef) clipsRef.current = actions; // the actor moves a model with no clips itself
  }, [actions, clipsRef]);
  useEffect(() => {
    loco.current = actions.idle ?? null;
    actions.idle?.reset().fadeIn(0.2).play();
  }, [actions]);
  // Walk, run and jump clips follow the movement.
  useFrame(() => {
    // Down: the walk and idle loops stop (a model with no death clip is toppled by the actor; its legs
    // must not keep walking on the floor).
    if (fallen) {
      if (loco.current) {
        loco.current.fadeOut(0.2);
        loco.current = null;
      }
      return;
    }
    const m = motion?.() ?? 'idle';
    const want = m === 'run' ? actions.run ?? actions.walk ?? actions.idle : m === 'jump' ? actions.jump ?? actions.run ?? actions.idle : actions.idle;
    if (!want || want === loco.current) return;
    want.reset().fadeIn(0.18).play();
    loco.current?.fadeOut(0.18);
    loco.current = want;
  });
  // Each cue plays once: the scene hands over a fresh cue list on every render, and replaying the
  // ones already past would restart a swing halfway through it.
  const played = useRef(new Set());
  const timers = useRef([]);
  useEffect(() => {
    for (const c of cues) {
      const key = `${c.at}|${c.kind}`;
      if (played.current.has(key)) continue;
      played.current.add(key);
      if (performance.now() - c.at > 1500) continue; // long over (e.g. from before this model loaded)
      if (played.current.size > 96) played.current = new Set([...played.current].slice(-48));
      timers.current.push(
        setTimeout(() => {
          const clip = clipFor(actions, c.kind);
          if (!clip || clip === loco.current) return;
          clip.reset().setLoop(LoopOnce, 1);
          clip.clampWhenFinished = c.kind === 'death';
          clip.fadeIn(0.08).play();
          // Let the one-shot play at full strength: the looping clip steps aside, then returns.
          const back = loco.current;
          if (!back) return;
          back.fadeOut(0.08);
          if (c.kind === 'death') return;
          const ms = Math.max(0, clip.getClip().duration * 1000 - 200);
          timers.current.push(
            setTimeout(() => {
              if (loco.current === back) back.reset().fadeIn(0.2).play();
              clip.fadeOut(0.2);
            }, ms),
          );
        }, Math.max(0, c.at - performance.now())),
      );
    }
  }, [cues, actions]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  useEffect(() => {
    if (fallen) {
      wasDown.current = true;
      return;
    }
    actions.death?.stop();
    if (!wasDown.current) return;
    wasDown.current = false; // revived: back on its feet
    loco.current = actions.idle ?? null;
    loco.current?.reset().fadeIn(0.2).play();
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
  villain = false, // an enemy: still drawn when only villains are
  keeper = false, // the Healer or the Weaponsmith in a room's cage: always drawn too
  enraged = false, // a room boss below half health: hellfire glow
}) {
  const inner = useRef();
  const flash = useRef();
  const glow = useRef();
  const ring = useRef();
  const shock = useRef();
  const shockMat = useRef();
  const aura = useRef();
  const rage = useRef();
  const clipsRef = useRef(null);
  const downSince = useRef(null);
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
    // A model with its own run clip moves its legs; a stand-in, or a sculpt with no rig (the Hell
    // Nemesis), is moved here instead: a stride bob and a lean into the run, a slow breath at rest.
    const clips = clipsRef.current;
    const strides = Boolean(useGlb && clips && (clips.run || clips.walk));
    let y = flyer ? Math.sin(t * 2.4 + seed) * 0.12 : Math.sin(t * 1.6 + seed) * 0.015;
    if (running && !strides && !flyer) y += Math.abs(Math.sin(t * (useGlb ? 7 : 11) + seed)) * (useGlb ? 0.12 : 0.09);
    let z = 0;
    let s = useGlb && !strides && !fallen ? 1 + Math.sin(t * 1.8 + seed) * 0.012 : 1;
    let lean = 0;
    if (cue) {
      const arc = Math.sin(Math.PI * p);
      if (cue.kind === 'attack' || cue.kind === 'boss_strike' || cue.kind === 'rune') {
        x = arc * 0.8;
        if (!strides) lean = -arc * 0.18; // a sculpt leans into the blow
      }
      if (cue.kind === 'victory') y += arc * 0.3;
      // (A rigged model with its own clip for the move does it itself: the Hollow King's Shadow Tide.)
      if ((cue.kind === 'skill' || cue.kind === 'transform') && !(useGlb && clips?.[cue.kind])) {
        x = arc * 0.4;
        y += arc * 0.35;
      }
      if (cue.kind === 'transform') s *= 1 + arc * 0.12;
      if (cue.kind === 'boss_sweep') s = 1 + arc * 0.15;
      // Hellfire Charge: a dash down the lane and back, low and leaning.
      if (cue.kind === 'charge') {
        x = Math.sin(Math.PI * Math.min(1, p * 1.25)) * 2.6;
        lean = -Math.sin(Math.PI * p) * 0.3;
      }
      // Infernal Slam: up, then down hard, then the shockwave rolls out (a rigged model leaps itself).
      if (cue.kind === 'slam' && !(useGlb && clips?.slam)) {
        y += p < 0.45 ? Math.sin((p / 0.45) * (Math.PI / 2)) * 0.9 : Math.max(0, 0.9 * (1 - (p - 0.45) / 0.12));
        lean = p < 0.45 ? 0.15 * (p / 0.45) : -0.25 * Math.max(0, 1 - (p - 0.45) / 0.3);
      }
      if (cue.kind === 'hit' || cue.kind === 'block') z = Math.sin(p * 40) * 0.08 * (1 - p);
      if (cue.kind === 'dodge') z = arc * 0.35;
      if (cue.kind === 'defend') s = 1 + arc * 0.05;
    }
    if (shock.current) {
      // The Infernal Slam's hellfire ring, or the Shadow Tide spreading from where the blade went in.
      const tide = cue?.kind === 'skill' && TIDE_CASTERS.has(modelKey);
      const on = (cue?.kind === 'slam' || tide) && p > 0.5;
      const q = on ? (p - 0.5) / 0.5 : 0;
      shock.current.visible = on;
      shock.current.scale.setScalar(0.5 + q * (tide ? 8 : 5.5));
      if (shockMat.current) {
        shockMat.current.opacity = on ? 0.85 * (1 - q) : 0;
        shockMat.current.color.set(tide ? PALETTE.venom : '#ff5a1f');
      }
    }
    if (aura.current) aura.current.opacity = 0.11 + Math.sin(t * 2.6 + seed) * 0.05;
    if (rage.current) rage.current.opacity = 0.14 + Math.sin(t * 6 + seed) * 0.05 + Math.sin(t * 15.3) * 0.025;
    // Fallen: topple once the death cue has played (or straight away if there was none).
    const down = fallen && (!death || now >= death.at);
    // A model with its own death clip falls by itself; the stand-ins topple over.
    const ownFall = Boolean(useGlb && clips?.death);
    const targetRot = down && !ownFall ? -Math.PI / 2 : running && !strides ? -0.14 : lean; // lean into the run
    g.rotation.z += (targetRot - g.rotation.z) * 0.12;
    // A beaten enemy lies still a moment, then sinks through the floor and is gone (Arena drops it
    // from the scene three seconds after it falls).
    if (down) downSince.current ??= now;
    else downSince.current = null;
    const sink = villain && down ? Math.min(1, Math.max(0, (now - downSince.current - 1500) / 1200)) * 2.2 : 0;
    g.position.set(x, (down && !ownFall ? (flyer ? -0.9 : -0.05) : y) - sink, z);
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

  if (VILLAINS_ONLY && !villain && !keeper && !useGlb) return null; // after every hook, so their order never changes

  // Name tag height: a Blender model sized in the manifest puts it just over its head.
  const glbHeight = useGlb ? models.get?.(modelKey)?.height : null;
  const height = glbHeight ? glbHeight * scale : 2 * scale * (modelKey.startsWith('boss_morvath') ? 1.7 : modelKey.startsWith('boss_') ? 1.3 : 1);
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
              <GlbModel modelKey={modelKey} cues={cues} fallen={fallen} motion={motion} opts={models.get?.(modelKey) ?? {}} clipsRef={clipsRef} />
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

      {/* Morvath's shadow armour on a real model: a violet shell that breathes. It is a mesh, not a
          light, so it comes and goes without recompiling every material in the scene. */}
      {armoured && useGlb && !fallen && (
        <mesh position={[0, height * 0.5, 0]} scale={[height * 0.3, height * 0.56, height * 0.3]}>
          <sphereGeometry args={[1, 24, 16]} />
          <meshBasicMaterial ref={aura} color="#8a4dff" transparent opacity={0.12} blending={AdditiveBlending} depthWrite={false} side={BackSide} />
        </mesh>
      )}
      {/* The Infernal Slam's shockwave, rolling out across the floor. */}
      <mesh ref={shock} position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[0.8, 1.05, 48]} />
        <meshBasicMaterial ref={shockMat} color="#ff5a1f" transparent opacity={0} depthWrite={false} />
      </mesh>
      {/* Enraged: hellfire burns inside it. A glowing shell and a halo on the floor, not a light: a new
          light mid-fight would make every material in the scene recompile, a freeze of a second or more. */}
      {enraged && !fallen && (
        <>
          <mesh position={[0, height * 0.5, 0]} scale={[height * 0.32, height * 0.58, height * 0.32]}>
            <sphereGeometry args={[1, 24, 16]} />
            <meshBasicMaterial ref={rage} color="#ff3a12" transparent opacity={0.16} blending={AdditiveBlending} depthWrite={false} side={BackSide} />
          </mesh>
          <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[height * 0.45, 32]} />
            <meshBasicMaterial color="#ff4a1a" transparent opacity={0.22} blending={AdditiveBlending} depthWrite={false} />
          </mesh>
        </>
      )}

      {(selected || telegraphed) && (
        <mesh ref={ring} position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.62, 0.78, 32, 1, 0, Math.PI * 1.75]} />
          <meshBasicMaterial color={telegraphed ? PALETTE.blood : PALETTE.bronze} transparent opacity={0.9} />
        </mesh>
      )}

      {label && !(villain && fallen) && (
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
