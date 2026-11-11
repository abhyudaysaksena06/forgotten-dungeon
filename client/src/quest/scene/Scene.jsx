// The 3D canvas: the map between fights, the room during a fight. In a fight the camera follows
// the leader from behind; drag with the mouse (or use ← →) to look around, scroll to zoom.
import { Component, Suspense, memo, useEffect, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PerformanceMonitor } from '@react-three/drei';
import { useGLTF } from '@react-three/drei';
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing';
import { ACESFilmicToneMapping, AgXToneMapping, AmbientLight, DirectionalLight, HemisphereLight, PointLight, Scene as ThreeScene, Vector3 } from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { Arena, loadRoomLayout, prepareRoom, setLampCap } from './Arena.jsx';
import { MapView } from './MapView.jsx';
import { InkContext, PALETTE, TOON_RAMP } from './placeholders.jsx';
import { toonify } from './toon.js';
import { CAMERA, forwardOf, insideShape, rightOf } from './world.js';

const EYE_HEIGHT = 1.6; // metres: a first-person camera at the leader's eyes
const MAP_VIEW = { pos: new Vector3(1.6, 13, 12.5), look: new Vector3(1.6, 0, -0.6) };

// Blender's default view transform is AgX; match it in the artist's rooms.
function ToneMapping({ blender }) {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    gl.toneMapping = blender ? AgXToneMapping : ACESFilmicToneMapping;
  }, [gl, blender]);
  return null;
}

function CameraRig({ view, world }) {
  const look = useRef(MAP_VIEW.look.clone());
  const want = useRef(new Vector3());
  const wantLook = useRef(new Vector3());
  const bob = useRef(0);
  useFrame(({ camera, size }, dt) => {
    const leader = view === 'arena' ? world.actors.get(world.leaderId) : null;
    // First person (like a shooter): the camera is the leader's eyes and follows the mouse exactly,
    // with no smoothing, so the crosshair is always where you look.
    if (leader && world.firstPerson) {
      const [fx, fz] = forwardOf(world.camYaw);
      const p = world.fpPitch ?? 0;
      bob.current += leader.motion === 'run' ? dt * 11 : 0;
      const eye = leader.y + EYE_HEIGHT + (leader.motion === 'run' ? Math.sin(bob.current) * 0.035 : 0);
      camera.position.set(leader.x, eye, leader.z);
      look.current.set(leader.x + fx * Math.cos(p) * 10, eye + Math.sin(p) * 10, leader.z + fz * Math.cos(p) * 10);
      camera.lookAt(look.current);
      return;
    }
    if (leader) {
      const [fx, fz] = forwardOf(world.camYaw);
      // In a walled Blender room the camera pulls in rather than end up behind a wall.
      let d = world.camDist;
      if (world.room.enclosed) {
        // A room may give the camera more room than the walkable floor (up to its inner walls).
        const area = world.room.view ?? world.room.bounds;
        const shapes = Array.isArray(area) ? area : [area];
        while (d > 0.8 && !shapes.some((s) => insideShape(s, leader.x - fx * d, leader.z - fz * d, 0.3))) d -= 0.25;
      }
      // Pulled in by a wall, it rises instead, so the fight stays in view: a little, not so far that it
      // stares down at the floor (in the Hollow Barracks Kael starts with a wall at his back, and a
      // tall rise hid the Hollow King above the top of the screen).
      const rise = Math.min(1, Math.max(0, world.camDist - d) * 0.3);
      // Mouse-look tilt (world.camPitch) orbits the camera up and down around the leader.
      const tilt = (world.camPitch ?? 0) * d;
      // Over the shoulder: the camera sits a little to the leader's right and looks well past them,
      // so the crosshair in the middle of the screen points into the room, not at your own hero.
      // The look-ahead shrinks when a wall pulls the camera in, so the hero stays on screen.
      const [rx, rz] = rightOf(world.camYaw);
      const shoulder = Math.min(0.9, 0.3 + d * 0.1);
      const ahead = 1.2 + Math.max(d, 4) * 0.6; // far enough to see the fight, near enough to keep Kael in frame
      // ...but never up into a low ceiling.
      const ceiling = (world.room.ceiling ?? Infinity) - 0.25;
      want.current.set(
        leader.x - fx * d + rx * shoulder,
        Math.min(ceiling, Math.max(leader.y + 0.6, leader.y + CAMERA.height * Math.max(d < world.camDist ? 0.35 : 0.8, d / CAMERA.distance) + rise + tilt)),
        leader.z - fz * d + rz * shoulder,
      );
      // Mouse up and down aims the crosshair up and down: the point looked at rises and falls too
      // (the camera alone rising barely moves the aim, and a low ceiling stops it).
      const aimY = -Math.tan((world.camPitch ?? 0) * 0.9) * ahead;
      wantLook.current.set(leader.x + fx * ahead + rx * shoulder, leader.y + CAMERA.lookHeight + aimY, leader.z + fz * ahead + rz * shoulder);
      const k = 1 - Math.pow(0.0004, dt); // close follow, still smooth
      camera.position.lerp(want.current, k);
      look.current.lerp(wantLook.current, k);
    } else {
      const k = 1 - Math.pow(0.02, dt);
      camera.position.lerp(MAP_VIEW.pos, k);
      look.current.lerp(MAP_VIEW.look, k);
    }
    // A narrow (portrait) screen sees less from side to side: on the map, widen the view so the
    // whole map still fits (the fight keeps its usual lens).
    const fov = view === 'map' && camera.aspect < 1.45 ? Math.min(95, (2 * Math.atan((Math.tan((25 * Math.PI) / 180) * 1.3) / camera.aspect) * 180) / Math.PI) : 50;
    // ...and on a phone the Journey sheet covers the lower half, so the map is drawn higher up.
    const lift = view === 'map' && camera.aspect < 1 ? Math.round(size.height * 0.11) : 0;
    if (Math.abs(camera.fov - fov) > 0.1 || (camera.view?.offsetY ?? 0) !== lift) {
      camera.fov = fov;
      if (lift) camera.setViewOffset(size.width, size.height, 0, lift, size.width, size.height);
      else camera.clearViewOffset();
      camera.updateProjectionMatrix();
    }
    camera.lookAt(look.current);
  });
  return null;
}

// What's under the crosshair: the living enemy whose body is nearest the middle of the screen,
// within a small circle. Written to world.aimedId every frame of a fight, mouse captured or not.
const AIM_RADIUS = 0.18; // in screen units (the screen is 2 wide)
function AimProbe({ world }) {
  const v = useRef(new Vector3());
  useFrame(({ camera, size }) => {
    const aspect = size.width / size.height;
    let best = null;
    let bestD = AIM_RADIUS;
    for (const [id, a] of world.actors) {
      if (a.kind !== 'enemy' || !a.alive) continue;
      // Check the chest and the head, so tall bosses are easy to aim at.
      for (const h of a.flyer ? [1.5, 2.1] : [0.9, 1.6]) {
        v.current.set(a.x, (a.y ?? 0) + h * (a.ultimate ? 1.6 : a.boss ? 1.2 : 1), a.z).project(camera);
        if (v.current.z > 1) continue; // behind the camera
        const d = Math.hypot(v.current.x * aspect, v.current.y);
        if (d < bestD) {
          best = id;
          bestD = d;
        }
      }
    }
    world.aimedId = best;
  });
  return null;
}

// Mouse look, like a shooter: click the view to capture the mouse, then moving it turns and tilts
// the camera and a left click attacks (world.onPrimary). Esc gives the cursor back for the menus.
// Without the capture, dragging still turns the camera; the wheel zooms. Only in a fight.
const LOOK_SENSITIVITY = 0.0026;
function CameraControls({ world, active }) {
  const el = useThree((s) => s.gl.domElement);
  useEffect(() => {
    if (!active) {
      if (document.pointerLockElement === el) document.exitPointerLock?.();
      return;
    }
    let lastX = null;
    let lastY = null;
    const locked = () => document.pointerLockElement === el;
    // Mouse buttons: right = attack (also left while the mouse is captured), middle = Rune Strike,
    // back / forward side buttons = skill / defend. See world.onMouse in QuestGame.
    const down = (e) => {
      // On a Mac trackpad, Ctrl+click is the right click: it attacks too.
      const button = e.button === 0 && e.ctrlKey ? 2 : e.button;
      if (button === 2 || button === 1 || button === 3 || button === 4) {
        e.preventDefault();
        world.onMouse?.(button);
        return;
      }
      if (locked()) {
        world.onMouse?.(0);
        return;
      }
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const noMenu = (e) => e.preventDefault();
    // Capture the mouse with raw input (no OS acceleration, like a shooter); fall back to plain
    // capture where raw input isn't supported.
    const click = () => {
      if (locked()) return;
      try {
        const p = el.requestPointerLock?.({ unadjustedMovement: true });
        p?.catch?.(() => el.requestPointerLock?.()?.catch?.(() => {}));
      } catch {
        el.requestPointerLock?.();
      }
    };
    // Mouse look listens to mousemove while captured: it keeps firing even with a button held.
    const look = (e) => {
      if (!locked()) return;
      // Browsers sometimes report one huge jump when the capture starts or the window refocuses.
      if (Math.abs(e.movementX) > 300 || Math.abs(e.movementY) > 300) return;
      const s = LOOK_SENSITIVITY * (world.sensitivity ?? 1);
      world.camYaw -= e.movementX * s;
      if (world.firstPerson) world.fpPitch = Math.max(-1.5, Math.min(1.5, (world.fpPitch ?? 0) - e.movementY * s));
      else world.camPitch = Math.max(-1.25, Math.min(1.3, (world.camPitch ?? 0) + e.movementY * s));
    };
    const move = (e) => {
      if (locked() || lastX === null || !e.buttons) return;
      // Dragging with a button held turns and tilts, like mouse look.
      const s = 0.006 * (world.sensitivity ?? 1);
      world.camYaw -= (e.clientX - lastX) * s;
      if (lastY !== null) {
        const dy = e.clientY - lastY;
        if (world.firstPerson) world.fpPitch = Math.max(-1.5, Math.min(1.5, (world.fpPitch ?? 0) - dy * s));
        else world.camPitch = Math.max(-1.25, Math.min(1.3, (world.camPitch ?? 0) + dy * s));
      }
      lastX = e.clientX;
      lastY = e.clientY;
    };
    document.addEventListener('mousemove', look);
    const up = () => {
      lastX = null;
      lastY = null;
    };
    el.addEventListener('click', click);
    el.addEventListener('contextmenu', noMenu);
    const wheel = (e) => {
      e.preventDefault();
      world.camDist = Math.max(CAMERA.min, Math.min(CAMERA.max, world.camDist + e.deltaY * 0.01));
    };
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    el.addEventListener('wheel', wheel, { passive: false });
    return () => {
      document.removeEventListener('mousemove', look);
      el.removeEventListener('click', click);
      el.removeEventListener('contextmenu', noMenu);
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      el.removeEventListener('wheel', wheel);
    };
  }, [el, world, active]);
  return null;
}

// The preloader: every model (and the map's miniatures) and every room layout is loaded before the
// game shows, then each room's shaders are compiled the way its fight draws it: its own lamps, the
// game's light rig (one ambient, one hemisphere, two directional, no shadow), a skeleton, and
// Blender's tone mapping. Entering a room then waits for neither a download nor a shader compile.
const roomKeys = (models) => [...models.keys()].filter((k) => k.startsWith('room_'));
const modelsMeta = { current: new Map() }; // the whole manifest, for the actors' options

// The batches the game loads in: the first opens the game (the map's miniatures, the characters, the
// skeletons, rooms 1 and 2); rooms 3 and 4 with the Nemesis and the Hollow King follow, then the
// Throne with Morvath.
// A run resumed inside a later room brings that room's batch forward into the first.
const LATER = [
  ['room_3', 'room_4', 'boss_nemesis', 'boss_hollow_king'],
  ['room_5', 'boss_morvath_knight', 'boss_morvath_dragon'],
];
export function loadBatches(models, state) {
  modelsMeta.current = models;
  const here = state?.combat?.roomId ?? (state?.location && state.location !== 'camp' ? state.location : null);
  const hereKey = here ? `room_${here.slice(1)}` : null;
  const later = LATER.map((keys) => keys.filter((k) => models.has(k)));
  const forward = later.findIndex((keys) => keys.includes(hereKey));
  const pick = (keys) => new Map(keys.map((k) => [k, models.get(k)]));
  const laterKeys = new Set(later.flat());
  const first = [...models.keys()].filter((k) => !laterKeys.has(k) || (forward >= 0 && later[forward].includes(k)));
  const rest = later.map((keys, i) => (i === forward ? [] : keys)).filter((keys) => keys.length);
  const batches = [first, ...rest].map(pick);
  // Every map miniature comes with the first batch: the map shows all five rooms at once.
  const minis = [...models.keys()].filter((k) => models.get(k)?.mini && !first.includes(k)).map((k) => `/models/${k}.mini.glb`);
  return batches.map((b, i) => ({ models: b, urls: [...modelUrls(b), ...(i === 0 ? minis : [])] }));
}
// The characters any room may show (everything that isn't a room), among the given batches.
export const actorKeys = (batches) => batches.flatMap((b) => [...b.models.keys()]).filter((k) => !k.startsWith('room_'));
export function modelUrls(models) {
  return [...models.keys()].flatMap((k) => [`/models/${k}.glb`, ...(models.get(k)?.mini ? [`/models/${k}.mini.glb`] : [])]);
}

// The game loads in batches (see loadBatches): the first one opens the game; the others download
// and compile in the background while it is played. A batch's rooms are compiled with every
// character that can stand in them (`actors`: the ones loaded so far plus the batch's own).
function Warmup({ models, actors, lowSpec, onDone, background = false }) {
  const urls = modelUrls(models);
  const actorUrls = actors.map((k) => `/models/${k}.glb`);
  const loaded = useGLTF([...urls, ...actorUrls]); // suspends until every model is in
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const live = useThree((s) => s.scene);
  useEffect(() => {
    let alive = true;
    (async () => {
      const all = [...urls, ...actorUrls];
      const byUrl = new Map(all.map((u, i) => [u, loaded[i]]));
      await Promise.all(roomKeys(models).map(loadRoomLayout));
      const villains = actors.map((k) => {
        const copy = cloneSkinned(byUrl.get(`/models/${k}.glb`).scene);
        return modelsMeta.current.get(k)?.toon === false ? copy : toonify(copy, { ramp: TOON_RAMP, outline: !lowSpec });
      });
      for (const key of roomKeys(models)) {
        if (!alive) break;
        const room = byUrl.get(`/models/${key}.glb`).scene;
        prepareRoom(room, models.get(key)?.toon);
        if (background && room.parent) continue; // on screen already: drawing it compiled it
        const home = room.parent; // a fight already showing this room gets it back afterwards
        const rig = new ThreeScene();
        rig.fog = live.fog;
        // The fight's lights: the game's rig and Kael's torch (light counts are part of every shader).
        rig.add(new AmbientLight(), new HemisphereLight(), new DirectionalLight(), new DirectionalLight(), new PointLight(), room, ...villains);
        const tone = gl.toneMapping;
        gl.toneMapping = AgXToneMapping;
        let done;
        try {
          done = gl.compileAsync(rig, camera); // builds every program now; only the wait is async
        } catch {
          done = null; // a shader that fails here fails the same way in the fight
        }
        gl.toneMapping = tone; // before any frame is drawn, so the live view never changes look
        try {
          await done;
        } catch {
          // as above
        }
        rig.remove(room, ...villains);
        home?.add(room);
        if (background) await new Promise((r) => setTimeout(r, 50)); // let the game breathe between rooms
      }
      if (alive) onDone();
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

// A model that fails to load must not keep the game behind the loading screen: let it start, and let
// the fight show the stand-in.
class PreloadGuard extends Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err) {
    console.warn('Preloading stopped early:', err?.message ?? err);
    this.props.onDone();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

// The quality ladder. The game watches its own frame rate in a fight: when it can't hold its pace it
// steps down (sharpness first, then the glow, then the rooms' dimmer lamps), and steps back up when
// there is room to spare. The step a machine settles on is remembered for the next visit.
const QUALITY = [
  { dpr: 1.5, lamps: 16, bloom: true },
  { dpr: 1.25, lamps: 16, bloom: true },
  { dpr: 1, lamps: 16, bloom: false },
  { dpr: 1, lamps: 8, bloom: false },
  { dpr: 0.85, lamps: 5, bloom: false },
  { dpr: 0.7, lamps: 3, bloom: false },
];
const QUALITY_KEY = 'forgotten-dungeon.quality';
function readQuality() {
  try {
    const q = Number(localStorage.getItem(QUALITY_KEY));
    return Number.isInteger(q) && q >= 0 && q < QUALITY.length ? q : 0;
  } catch {
    return 0;
  }
}

// Judges the frame rate only once a view has settled (entering a room compiles shaders: a hitch that
// says nothing about the machine).
function QualityWatch({ settleKey, onStep }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(false);
    const t = setTimeout(() => setReady(true), 2500);
    return () => clearTimeout(t);
  }, [settleKey]);
  if (!ready) return null;
  return (
    <PerformanceMonitor
      key={settleKey}
      bounds={(refresh) => (refresh > 90 ? [55, 85] : [45, 57])}
      flipflops={4}
      onDecline={() => onStep(1)}
      onIncline={() => onStep(-1)}
    />
  );
}

export default memo(Scene);
function Scene({ state, meta, models, cues, targetId, onTarget, onTravel, lowSpec, world, reach, firstPerson, batches, loaded, warmed, onWarmed }) {
  // A fight, or a cleared room whose cage is open, shows the room; anywhere else, the map.
  const view = state.phase === 'combat' || state.cages ? 'arena' : 'map';
  // In a Blender room its own lamps set the mood, so the generic fill lights step back.
  const roomId = state.combat?.roomId ?? (state.cages ? state.location : null);
  const roomKey = roomId ? `room_${roomId.slice(1)}` : null;
  const blenderRoom = Boolean(roomKey && models.has(roomKey));
  // In the artist's rooms only their own lamps light the scene (a faint ambient keeps the heroes
  // readable), with Blender's AgX tone mapping and no added effects.
  const fill = blenderRoom ? 0 : 1;
  const [quality, setQuality] = useState(() => (lowSpec ? Math.max(3, readQuality()) : readQuality()));
  const q = QUALITY[quality];
  useEffect(() => {
    setLampCap(q.lamps);
    try {
      localStorage.setItem(QUALITY_KEY, String(quality));
    } catch {
      // Not remembered: the next visit learns again.
    }
  }, [q.lamps, quality]);
  const stepQuality = (d) => setQuality((v) => Math.min(QUALITY.length - 1, Math.max(lowSpec ? 3 : 0, v + d)));
  const devicePr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
  return (
    <Canvas
      shadows={!lowSpec}
      dpr={Math.min(devicePr, lowSpec ? Math.min(1, q.dpr) : q.dpr)}
      camera={{ fov: 50, position: MAP_VIEW.pos.toArray(), near: 0.1, far: 140 }}
      onPointerMissed={() => (document.body.style.cursor = 'default')}
    >
      <color attach="background" args={[PALETTE.crypt]} />
      {/* The artist's rooms are played at twice their modelled size: the fog starts further out there. */}
      <fog attach="fog" args={[PALETTE.crypt, blenderRoom ? 36 : 18, blenderRoom ? 85 : 40]} />
      {/* Bright, anime-style light: flat colour bands read clearly and the ink outlines show. */}
      <ambientLight intensity={blenderRoom ? 0.12 : 0.75} color="#b4bad4" />
      <ToneMapping blender={blenderRoom} />
      <hemisphereLight args={['#e6d6bc', '#2a2236', 0.8 * fill]} />
      <directionalLight
        position={[-6, 10, 6]}
        intensity={1.9 * fill}
        color="#ffe2b8"
        castShadow={!lowSpec && !blenderRoom} // a Blender room turns this light off: no shadow pass for nothing
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={12}
        shadow-camera-bottom={-12}
      />
      {/* Cool rim light from behind separates the characters from the dark walls. */}
      <directionalLight position={[4, 6, -9]} intensity={0.9 * fill} color="#8fb3ff" />
      {batches && loaded > warmed && (
        <PreloadGuard key={warmed} onDone={() => onWarmed(warmed + 1)}>
          <Suspense fallback={null}>
            <Warmup
              models={batches[warmed].models}
              actors={actorKeys(batches.slice(0, warmed + 1))}
              lowSpec={lowSpec}
              background={warmed > 0}
              onDone={() => onWarmed(warmed + 1)}
            />
          </Suspense>
        </PreloadGuard>
      )}
      {batches && warmed >= batches.length && <QualityWatch settleKey={`${view}:${roomKey}`} onStep={stepQuality} />}
      <CameraRig view={view} world={world} />
      <CameraControls world={world} active={view === 'arena'} />
      {view === 'arena' && <AimProbe world={world} />}
      <InkContext.Provider value={!lowSpec}>
        {view === 'arena' ? (
          <Arena state={state} meta={meta} models={models} cues={cues} targetId={targetId} onTarget={onTarget} world={world} reach={reach} firstPerson={firstPerson} />
        ) : (
          <MapView state={state} meta={meta} models={models} onTravel={onTravel} lowSpec={lowSpec} />
        )}
      </InkContext.Provider>
      {/* Glow: candles, lava, runes and fire bloom; a soft vignette frames the scene. */}
      {!lowSpec && !blenderRoom && q.bloom && (
        <EffectComposer multisampling={0}>
          <Bloom mipmapBlur luminanceThreshold={0.9} luminanceSmoothing={0.15} intensity={0.6} />
          <Vignette offset={0.25} darkness={0.55} />
        </EffectComposer>
      )}
    </Canvas>
  );
}
