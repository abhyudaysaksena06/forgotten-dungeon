// Tiny synthesized sounds — no audio files. Muted state is a per-browser preference.
let ctx;
let muted = (() => {
  try {
    return localStorage.getItem('forgotten-dungeon.muted') === '1';
  } catch {
    return false;
  }
})();

export const isMuted = () => muted;
export function setMuted(value) {
  muted = value;
  try {
    localStorage.setItem('forgotten-dungeon.muted', value ? '1' : '0');
  } catch {
    // Preference just won't stick.
  }
}

function tone(freq, start, duration, type = 'triangle', gain = 0.06) {
  ctx ??= new (window.AudioContext || window.webkitAudioContext)();
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  amp.gain.setValueAtTime(gain, ctx.currentTime + start);
  amp.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + duration);
  osc.connect(amp).connect(ctx.destination);
  osc.start(ctx.currentTime + start);
  osc.stop(ctx.currentTime + start + duration);
}

const SOUNDS = {
  roll: () => [0, 0.05, 0.1, 0.16, 0.24].forEach((t, i) => tone(300 + i * 40, t, 0.05, 'square', 0.03)),
  hit: () => tone(110, 0, 0.18, 'sawtooth', 0.05),
  crit: () => [523, 659, 784].forEach((f, i) => tone(f, i * 0.07, 0.25)),
  fail: () => [220, 165].forEach((f, i) => tone(f, i * 0.12, 0.3, 'sine')),
  chime: () => [659, 880, 1175].forEach((f, i) => tone(f, i * 0.1, 0.5, 'sine', 0.05)),
};

export function play(name) {
  if (muted) return;
  try {
    SOUNDS[name]?.();
  } catch {
    // Audio blocked until the first user gesture; ignore.
  }
}
