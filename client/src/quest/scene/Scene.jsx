// The 3D canvas: the map between fights, the room during a fight. In a fight the camera follows
// the leader from behind; drag with the mouse (or use ← →) to look around, scroll to zoom.
import { Component, Suspense, useEffect, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing';
import { ACESFilmicToneMapping, AgXToneMapping, AmbientLight, DirectionalLight, HemisphereLight, Scene as ThreeScene, Vector3 } from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { Arena, loadRoomLayout, prepareRoom } from './Arena.jsx';
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
  useFrame(({ camera }, dt) => {
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
      // Pulled in by a wall, it rises instead, looking down more steeply, so the fight stays in view.
      const rise = Math.max(0, world.camDist - d) * 0.9;
      // Mouse-look tilt (world.camPitch) orbits the camera up and down around the leader.
      const tilt = (world.camPitch ?? 0) * d;
      // Over the shoulder: the camera sits a little to the leader's right and looks well past them,
      // so the crosshair in the middle of the screen points into the room, not at your own hero.
      // The look-ahead shrinks when a wall pulls the camera in, so the hero stays on screen.
      const [rx, rz] = rightOf(world.camYaw);
      const shoulder = Math.min(0.9, 0.3 + d * 0.1);
      const ahead = 1.2 + d * 0.6; // far enough to see the fight, near enough to keep Kael in frame
      // ...but never up into a low ceiling.
      const ceiling = (world.room.ceiling ?? Infinity) - 0.25;
      want.current.set(
        leader.x - fx * d + rx * shoulder,
        Math.min(ceiling, Math.max(leader.y + 0.6, leader.y + CAMERA.height * Math.max(0.8, d / CAMERA.distance) + rise + tilt)),
        leader.z - fz * d + rz * shoulder,
      );
      wantLook.current.set(leader.x + fx * ahead + rx * shoulder, leader.y + CAMERA.lookHeight, leader.z + fz * ahead + rz * shoulder);
      const k = 1 - Math.pow(0.0004, dt); // close follow, still smooth
      camera.position.lerp(want.current, k);
      look.current.lerp(wantLook.current, k);
    } else {
      const k = 1 - Math.pow(0.02, dt);
      camera.position.lerp(MAP_VIEW.pos, k);
      look.current.lerp(MAP_VIEW.look, k);
    }
    camera.lookAt(look.current);
  });
  return null;
}

// What's under the crosshair: the living enemy whose body is nearest the middle of the screen,
// within a small circle. Written to world.aimedId every frame while the mouse is captured.
const AIM_RADIUS = 0.18; // in screen units (the screen is 2 wide)
function AimProbe({ world }) {
  const v = useRef(new Vector3());
  useFrame(({ camera, size }) => {
    if (!document.pointerLockElement && !world.firstPerson) {
      world.aimedId = null;
      return;
    }
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
    const locked = () => document.pointerLockElement === el;
    // Mouse buttons: right = attack (also left while the mouse is captured), middle = Rune Strike,
    // back / forward side buttons = skill / defend. See world.onMouse in QuestGame.
    const down = (e) => {
      if (e.button === 2 || e.button === 1 || e.button === 3 || e.button === 4) {
        e.preventDefault();
        world.onMouse?.(e.button);
        return;
      }
      if (locked()) {
        world.onMouse?.(0);
        return;
      }
      lastX = e.clientX;
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
      if (world.firstPerson) world.fpPitch = Math.max(-1.3, Math.min(1.3, (world.fpPitch ?? 0) - e.movementY * s));
      else world.camPitch = Math.max(-0.45, Math.min(0.8, (world.camPitch ?? 0) + e.movementY * s));
    };
    const move = (e) => {
      if (locked() || lastX === null || !e.buttons) return;
      world.camYaw -= (e.clientX - lastX) * 0.006 * (world.sensitivity ?? 1);
      lastX = e.clientX;
    };
    document.addEventListener('mousemove', look);
    const up = () => (lastX = null);
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
export function modelUrls(models) {
  return [...models.keys()].flatMap((k) => [`/models/${k}.glb`, ...(models.get(k)?.mini ? [`/models/${k}.mini.glb`] : [])]);
}

function Warmup({ models, lowSpec, onDone }) {
  const urls = modelUrls(models);
  const loaded = useGLTF(urls); // suspends until every model is in
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const live = useThree((s) => s.scene);
  useEffect(() => {
    let alive = true;
    (async () => {
      const byUrl = new Map(urls.map((u, i) => [u, loaded[i]]));
      await Promise.all(roomKeys(models).map(loadRoomLayout));
      const villains = [...models.keys()]
        .filter((k) => !k.startsWith('room_'))
        .map((k) => {
          const copy = cloneSkinned(byUrl.get(`/models/${k}.glb`).scene);
          return models.get(k)?.toon === false ? copy : toonify(copy, { ramp: TOON_RAMP, outline: !lowSpec });
        });
      const tone = gl.toneMapping;
      for (const key of roomKeys(models)) {
        if (!alive) break;
        const room = byUrl.get(`/models/${key}.glb`).scene;
        prepareRoom(room, models.get(key)?.toon);
        const home = room.parent; // a fight already showing this room gets it back afterwards
        const rig = new ThreeScene();
        rig.fog = live.fog;
        rig.add(new AmbientLight(), new HemisphereLight(), new DirectionalLight(), new DirectionalLight(), room, ...villains);
        gl.toneMapping = AgXToneMapping;
        try {
          await gl.compileAsync(rig, camera);
        } catch {
          // a shader that fails here fails the same way in the fight; nothing to gain by stopping
        }
        rig.remove(room, ...villains);
        home?.add(room);
      }
      gl.toneMapping = tone;
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

export default function Scene({ state, meta, models, cues, targetId, onTarget, onTravel, lowSpec, world, reach, firstPerson, preloaded, downloaded, onPreloaded }) {
  // A fight, or a cleared room whose cage is open, shows the room; anywhere else, the map.
  const view = state.phase === 'combat' || state.cages ? 'arena' : 'map';
  // In a Blender room its own lamps set the mood, so the generic fill lights step back.
  const roomId = state.combat?.roomId ?? (state.cages ? state.location : null);
  const roomKey = roomId ? `room_${roomId.slice(1)}` : null;
  const blenderRoom = Boolean(roomKey && models.has(roomKey));
  // In the artist's rooms only their own lamps light the scene (a faint ambient keeps the heroes
  // readable), with Blender's AgX tone mapping and no added effects.
  const fill = blenderRoom ? 0 : 1;
  return (
    <Canvas
      shadows={!lowSpec}
      dpr={lowSpec ? 1 : [1, 1.5]}
      camera={{ fov: 50, position: MAP_VIEW.pos.toArray(), near: 0.1, far: 90 }}
      onPointerMissed={() => (document.body.style.cursor = 'default')}
    >
      <color attach="background" args={[PALETTE.crypt]} />
      <fog attach="fog" args={[PALETTE.crypt, 18, 40]} />
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
      {!preloaded && downloaded && (
        <PreloadGuard onDone={onPreloaded}>
          <Suspense fallback={null}>
            <Warmup models={models} lowSpec={lowSpec} onDone={onPreloaded} />
          </Suspense>
        </PreloadGuard>
      )}
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
      {!lowSpec && !blenderRoom && (
        <EffectComposer multisampling={0}>
          <Bloom mipmapBlur luminanceThreshold={0.9} luminanceSmoothing={0.15} intensity={0.6} />
          <Vignette offset={0.25} darkness={0.55} />
        </EffectComposer>
      )}
    </Canvas>
  );
}
