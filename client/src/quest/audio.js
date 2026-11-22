// Sound for the quest, synthesized with Web Audio: no audio files, works offline.
// Effects follow the same timed cues as the 3D animations; music is a generative score per room.
// Browsers only allow sound after a click or key press, so everything waits for `unlock()`.

const KEY = 'forgotten-dungeon.audio';
const DEFAULTS = { master: 0.8, music: 0.5, sfx: 0.8, muted: false };

export function readAudioSettings() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

let ctx = null;
let out = null;
let musicBus = null;
let sfxBus = null;
let settings = readAudioSettings();
let noiseBuffer = null;

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  out = ctx.createGain();
  const comp = ctx.createDynamicsCompressor(); // keeps big moments from clipping
  out.connect(comp).connect(ctx.destination);
  musicBus = ctx.createGain();
  sfxBus = ctx.createGain();
  musicBus.connect(out);
  sfxBus.connect(out);
  noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
  const d = noiseBuffer.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  applySettings(settings);
  return ctx;
}

export function unlock() {
  const c = ensure();
  if (c && c.state === 'suspended') c.resume();
}

export function applySettings(next) {
  settings = { ...settings, ...next };
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Preference just won't stick.
  }
  if (!ctx) return settings;
  const t = ctx.currentTime;
  out.gain.setTargetAtTime(settings.muted ? 0 : settings.master, t, 0.05);
  musicBus.gain.setTargetAtTime(settings.music * 0.6, t, 0.05);
  sfxBus.gain.setTargetAtTime(settings.sfx, t, 0.05);
  return settings;
}

// ---------- building blocks ----------

function env(gain, t, attack, peak, decay) {
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(peak, t + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function tone({ freq, type = 'sine', at = 0, attack = 0.005, decay = 0.3, peak = 0.3, slideTo, bus = sfxBus, detune = 0 }) {
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.detune.value = detune;
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + attack + decay);
  env(g, t, attack, peak, decay);
  o.connect(g).connect(bus);
  o.start(t);
  o.stop(t + attack + decay + 0.05);
}

function noise({ at = 0, attack = 0.002, decay = 0.2, peak = 0.3, filter = 'bandpass', freq = 1200, q = 1, sweepTo, bus = sfxBus }) {
  const t = ctx.currentTime + at;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  const f = ctx.createBiquadFilter();
  f.type = filter;
  f.frequency.setValueAtTime(freq, t);
  f.Q.value = q;
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + attack + decay);
  const g = ctx.createGain();
  env(g, t, attack, peak, decay);
  src.connect(f).connect(g).connect(bus);
  src.start(t, Math.random() * 0.5);
  src.stop(t + attack + decay + 0.05);
}

// ---------- effects ----------

const SFX = {
  slash: () => noise({ decay: 0.16, peak: 0.35, freq: 3000, sweepTo: 600, q: 2 }),
  hit: (amount = 10) => {
    const big = Math.min(1, amount / 40);
    tone({ freq: 140, slideTo: 50, decay: 0.18, peak: 0.35 + big * 0.3, type: 'triangle' });
    noise({ decay: 0.09, peak: 0.25 + big * 0.2, freq: 900, filter: 'lowpass' });
  },
  crit: () => {
    SFX.hit(40);
    tone({ freq: 1600, at: 0.02, decay: 0.25, peak: 0.12, type: 'square', slideTo: 900 });
  },
  block: () => {
    tone({ freq: 880, decay: 0.35, peak: 0.18, type: 'triangle' });
    tone({ freq: 1320, decay: 0.25, peak: 0.08, type: 'sine', at: 0.01 });
  },
  spell: () => [523, 659, 784, 1047].forEach((f, i) => tone({ freq: f, at: i * 0.05, decay: 0.35, peak: 0.12, type: 'triangle' })),
  heal: () => [392, 523, 659, 784].forEach((f, i) => tone({ freq: f, at: i * 0.07, decay: 0.5, peak: 0.1 })),
  death: () => tone({ freq: 330, slideTo: 70, decay: 0.7, peak: 0.25, type: 'sawtooth' }),
  shatter: () => {
    noise({ decay: 0.5, peak: 0.4, freq: 5000, filter: 'highpass', q: 0.5 });
    [1760, 2350, 3140].forEach((f, i) => tone({ freq: f, at: i * 0.03, decay: 0.4, peak: 0.07, type: 'triangle' }));
  },
  roar: () => {
    tone({ freq: 90, slideTo: 45, attack: 0.08, decay: 1.1, peak: 0.45, type: 'sawtooth' });
    tone({ freq: 95, slideTo: 48, attack: 0.08, decay: 1.1, peak: 0.3, type: 'sawtooth', detune: 30 });
    noise({ attack: 0.1, decay: 1.0, peak: 0.25, freq: 400, filter: 'lowpass', sweepTo: 150 });
  },
  heavy: () => {
    tone({ freq: 80, slideTo: 35, decay: 0.45, peak: 0.6, type: 'triangle' });
    noise({ decay: 0.3, peak: 0.35, freq: 500, filter: 'lowpass' });
  },
  whoosh: () => noise({ attack: 0.02, decay: 0.22, peak: 0.12, freq: 600, sweepTo: 2200, q: 0.8 }),
  // Rune Strike: a rising chime, then the blade.
  rune: () => {
    [523, 784, 1175].forEach((f, i) => tone({ freq: f, at: i * 0.04, decay: 0.3, peak: 0.1, type: 'triangle', slideTo: f * 1.5 }));
    SFX.slash();
  },
  // Hellfire Charge: hooves of stone and a rush of air.
  charge: () => {
    [0, 0.09, 0.18, 0.27].forEach((at) => tone({ freq: 70, slideTo: 45, at, decay: 0.16, peak: 0.35, type: 'triangle' }));
    noise({ at: 0.1, attack: 0.15, decay: 0.5, peak: 0.22, freq: 500, sweepTo: 1800, q: 0.7 });
  },
  // Infernal Slam: the blade hits the floor, the floor answers.
  slam: () => {
    tone({ freq: 60, slideTo: 28, at: 0.42, decay: 0.9, peak: 0.75, type: 'triangle' });
    noise({ at: 0.42, decay: 0.7, peak: 0.45, freq: 300, filter: 'lowpass', sweepTo: 90 });
    noise({ at: 0.45, attack: 0.05, decay: 0.9, peak: 0.18, freq: 2200, filter: 'bandpass', q: 0.6, sweepTo: 600 });
  },
  step: () => noise({ decay: 0.04, peak: 0.05, freq: 700, filter: 'lowpass' }),
  jump: () => noise({ attack: 0.02, decay: 0.2, peak: 0.08, freq: 800, sweepTo: 2400, q: 1.5 }),
  click: () => tone({ freq: 660, decay: 0.06, peak: 0.06, type: 'triangle' }),
  // banner stingers
  battle: () => {
    [0, 0.14, 0.28].forEach((at) => tone({ freq: 70, slideTo: 40, at, decay: 0.25, peak: 0.5, type: 'triangle' }));
    [220, 277, 330].forEach((f) => tone({ freq: f, at: 0.3, attack: 0.03, decay: 0.8, peak: 0.08, type: 'sawtooth' }));
  },
  boss: () => {
    SFX.roar();
    [110, 131, 156].forEach((f) => tone({ freq: f, at: 0.2, attack: 0.05, decay: 1.2, peak: 0.08, type: 'sawtooth' }));
  },
  victory: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone({ freq: f, at: i * 0.09, decay: 0.6, peak: 0.13, type: 'triangle' })),
  defeat: () => [392, 349, 311, 262].forEach((f, i) => tone({ freq: f, at: i * 0.22, decay: 0.7, peak: 0.12, type: 'sawtooth' })),
  level: () => [440, 554, 659, 880, 1109].forEach((f, i) => tone({ freq: f, at: i * 0.06, decay: 0.4, peak: 0.1 })),
  quest: () => [784, 988, 1175].forEach((f, i) => tone({ freq: f, at: i * 0.1, decay: 0.7, peak: 0.1 })),
  skill: () => SFX.spell(),
};

export function play(name, arg) {
  if (!ensure() || ctx.state !== 'running' || settings.muted) return;
  SFX[name]?.(arg);
}

// The 3D cues (see events.js) carry what happened and when; sound follows them.
const CUE_SOUND = { attack: 'slash', rune: 'rune', skill: 'skill', hit: 'hit', heal: 'heal', death: 'death', block: 'block', defend: 'block', dodge: 'whoosh', boss_strike: 'heavy', boss_sweep: 'roar', transform: 'roar', armour_break: 'shatter', charge: 'charge', slam: 'slam' };

export function playCues(cues) {
  if (!ctx || ctx.state !== 'running') return;
  const now = performance.now();
  for (const c of cues) {
    const name = c.crit ? 'crit' : CUE_SOUND[c.kind];
    if (!name) continue;
    const wait = Math.max(0, c.at - now);
    setTimeout(() => play(name, c.amount), wait);
  }
}

// ---------- music ----------

// Each place has a key and a mood: [root Hz, scale steps, pulse beats per minute or 0].
const THEMES = {
  map: [110, [0, 3, 5, 7, 10], 0],
  r1: [98, [0, 3, 5, 7, 10], 72],
  r2: [104, [0, 2, 3, 7, 8], 76],
  r3: [92.5, [0, 3, 5, 6, 10], 80],
  r4: [87.3, [0, 1, 5, 7, 8], 88],
  r5: [73.4, [0, 1, 3, 6, 7], 100],
};

let music = null; // { key, nodes, timer }

function stopMusic() {
  if (!music) return;
  const t = ctx.currentTime;
  for (const n of music.nodes) {
    try {
      n.gain?.gain.setTargetAtTime(0.0001, t, 0.6);
      n.osc?.stop(t + 2);
    } catch {
      // already stopped
    }
  }
  clearInterval(music.timer);
  music = null;
}

export function setMusic(key) {
  if (!ensure() || ctx.state !== 'running') return;
  if (music?.key === key) return;
  stopMusic();
  const [root, scale, bpm] = THEMES[key] ?? THEMES.map;
  const nodes = [];
  // Drone: two detuned saws and a fifth, through a slow-breathing low-pass filter.
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 500;
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfo.frequency.value = 0.07;
  lfoGain.gain.value = 250;
  lfo.connect(lfoGain).connect(filter.frequency);
  lfo.start();
  nodes.push({ osc: lfo });
  const pad = ctx.createGain();
  pad.gain.value = 0.0001;
  pad.gain.setTargetAtTime(0.12, ctx.currentTime, 1.5);
  filter.connect(pad).connect(musicBus);
  nodes.push({ gain: pad });
  for (const [mult, detune] of [[1, -6], [1, 7], [1.5, 0], [0.5, 0]]) {
    const o = ctx.createOscillator();
    o.type = mult === 0.5 ? 'sine' : 'sawtooth';
    o.frequency.value = root * mult;
    o.detune.value = detune;
    o.connect(filter);
    o.start();
    nodes.push({ osc: o });
  }
  // Bells: a slow, random melody from the room's scale; a heartbeat drum in fights.
  let beat = 0;
  const stepMs = bpm ? 60000 / bpm / 2 : 900;
  const timer = setInterval(() => {
    if (ctx.state !== 'running') return;
    beat += 1;
    if (Math.random() < (bpm ? 0.35 : 0.3)) {
      const deg = scale[Math.floor(Math.random() * scale.length)];
      const oct = Math.random() < 0.3 ? 4 : 2;
      tone({ freq: root * oct * Math.pow(2, deg / 12), decay: 1.6, attack: 0.01, peak: 0.05, type: 'triangle', bus: musicBus });
    }
    if (bpm && beat % 2 === 0) {
      tone({ freq: 60, slideTo: 38, decay: 0.22, peak: key === 'r5' ? 0.35 : 0.22, type: 'sine', bus: musicBus });
      if (key === 'r5' && beat % 4 === 0) noise({ decay: 0.12, peak: 0.12, freq: 200, filter: 'lowpass', bus: musicBus });
    }
  }, stepMs);
  music = { key, nodes, timer };
}
