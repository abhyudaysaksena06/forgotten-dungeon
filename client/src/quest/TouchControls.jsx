// Touch play (phones and tablets): a stick at the bottom left walks Kael the way WASD does, and a
// drag anywhere else on the view turns and tilts the camera, so the crosshair can go anywhere.
// The action buttons are the HUD's own (tap to attack, defend, and so on).
import { useEffect, useRef, useState } from 'react';

export function useCoarsePointer() {
  const query = '(pointer: coarse)';
  const [coarse, setCoarse] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(query).matches);
  useEffect(() => {
    const m = window.matchMedia?.(query);
    if (!m) return;
    const on = () => setCoarse(m.matches);
    m.addEventListener?.('change', on);
    return () => m.removeEventListener?.('change', on);
  }, []);
  return coarse;
}

const PITCH = { third: [-1.25, 1.3], first: [-1.5, 1.5] };

export function TouchControls({ world }) {
  const knob = useRef(null);
  const stick = useRef(null);
  useEffect(() => () => (world.stick = null), [world]);

  const moveStick = (e) => {
    const r = stick.current.getBoundingClientRect();
    const R = r.width / 2;
    let x = (e.clientX - (r.left + R)) / R;
    let y = (e.clientY - (r.top + R)) / R;
    const n = Math.hypot(x, y);
    if (n > 1) {
      x /= n;
      y /= n;
    }
    world.stick = { x, y: -y }; // up on screen = forward
    if (knob.current) knob.current.style.transform = `translate(${x * R * 0.6}px, ${y * R * 0.6}px)`;
  };
  const endStick = () => {
    world.stick = null;
    if (knob.current) knob.current.style.transform = '';
  };

  const last = useRef(null);
  const look = (e) => {
    if (!last.current || last.current.id !== e.pointerId) return;
    const dx = e.clientX - last.current.x;
    const dy = e.clientY - last.current.y;
    last.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    const s = 0.0065 * (world.sensitivity ?? 1);
    world.camYaw -= dx * s;
    if (world.firstPerson) world.fpPitch = Math.max(PITCH.first[0], Math.min(PITCH.first[1], (world.fpPitch ?? 0) - dy * s));
    else world.camPitch = Math.max(PITCH.third[0], Math.min(PITCH.third[1], (world.camPitch ?? 0) + dy * s));
  };

  return (
    <>
      <div
        className="touch-look"
        onPointerDown={(e) => (last.current = { id: e.pointerId, x: e.clientX, y: e.clientY })}
        onPointerMove={look}
        onPointerUp={() => (last.current = null)}
        onPointerCancel={() => (last.current = null)}
      />
      <div
        ref={stick}
        className="touch-stick"
        onPointerDown={(e) => {
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            // A finger the browser no longer tracks: the stick still follows moves over it.
          }
          moveStick(e);
        }}
        onPointerMove={(e) => e.buttons && moveStick(e)}
        onPointerUp={endStick}
        onPointerCancel={endStick}
        aria-label="Move"
      >
        <div ref={knob} className="knob" />
      </div>
    </>
  );
}
