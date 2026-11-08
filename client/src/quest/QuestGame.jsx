import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useGLTF } from '@react-three/drei';
import { loadModelManifest, loadQuestMeta, questApi } from './api.js';
import { applySettings, play, playCues, readAudioSettings, setMusic, unlock } from './audio.js';
import { AbilityBar, BossBar, EnemyList, HelpPanel, PartyPanel, Subtitle, TopBar } from './hud.jsx';
import { BANNER_MS, bannersFor, cutInFor } from './banners.js';
import { cuesFor } from './events.js';
import Scene from './scene/Scene.jsx';
import { morvathStrength } from './scene/MapView.jsx';
import { REACH, createWorld, gap, laneOf, nearestEnemy, yawTo } from './scene/world.js';

// Draco-compressed models (room 3) decode with three.js's own decoder, served from public/draco/,
// so no model depends on a CDN being reachable during the event.
useGLTF.setDecoderPath('/draco/');

const MOVE_KEYS = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']);

// The party acts on its own: if the leader does nothing for this long in a fight, the round plays
// out anyway (a plain "wait" input, saved and replayed like any other), so the companions and
// enemies keep fighting. It pauses whenever the player is busy elsewhere.
const ROUND_SECONDS = 6;
const AUTO_KEY = 'forgotten-dungeon.autorounds';
const COACH_KEY = 'forgotten-dungeon.coach';
const readCoach = () => {
  try {
    return Number(localStorage.getItem(COACH_KEY) ?? 0);
  } catch {
    return 0;
  }
};
// The first-fight coach: each step clears when the player does the thing.
const COACH = [
  { title: 'Move', text: 'Walk with W A S D. Click the view to look around with the mouse; Esc frees the cursor.' },
  { title: 'Attack', text: 'Walk up to an enemy until the ring under it turns green, then right-click (or press F).' },
  { title: 'Read the floor', text: 'Red lanes on the floor are hit next round. Step into another lane before you act. The action bar shows your lane.' },
  { title: 'Your other moves', text: 'E: your hero’s skill · Q: Rune Strike (the only thing that breaks Morvath’s armour) · R: defend · H: potion · J: quests. Wait too long and the round plays without you.' },
];
const SENS_KEY = 'forgotten-dungeon.sensitivity';
const VIEW_KEY = 'forgotten-dungeon.view';
const readFirstPerson = () => {
  try {
    return localStorage.getItem(VIEW_KEY) !== 'third';
  } catch {
    return true;
  }
};
const readSensitivity = () => {
  try {
    const v = Number(localStorage.getItem(SENS_KEY));
    return v >= 0.2 && v <= 3 ? v : 1;
  } catch {
    return 1;
  }
};
const readAuto = () => {
  try {
    return localStorage.getItem(AUTO_KEY) !== '0';
  } catch {
    return true;
  }
};

const LOW_SPEC_KEY = 'forgotten-dungeon.lowspec';
const readLowSpec = () => {
  try {
    return localStorage.getItem(LOW_SPEC_KEY) === '1';
  } catch {
    return false;
  }
};

export default function QuestGame({ session, onLeave }) {
  const [meta, setMeta] = useState(null);
  const [models, setModels] = useState(() => new Map());
  const [world] = useState(createWorld); // where everyone stands in a fight (see scene/world.js)
  const [autoRounds, setAutoRounds] = useState(readAuto);
  const [clock, setClock] = useState(null); // { left, paused } while the round clock runs
  const [view, setView] = useState(null);
  const [cues, setCues] = useState([]);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const [targetId, setTargetId] = useState(null);
  const [picker, setPicker] = useState(null); // { kind, title } for choosing an ally
  const [lowSpec, setLowSpec] = useState(readLowSpec);
  const [banners, setBanners] = useState([]); // queue of { kind, title, sub, note }
  const [logOpen, setLogOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'F1') {
        e.preventDefault();
        setHelpOpen((o) => !o);
      } else if (e.key === 'Escape') setHelpOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const [coach, setCoachStep] = useState(readCoach);
  const setCoach = useCallback((n) => {
    setCoachStep((cur) => {
      const next = Math.max(cur, n);
      try {
        localStorage.setItem(COACH_KEY, String(next));
      } catch {
        // Then it just shows again next time.
      }
      return next;
    });
  }, []);
  const coachStart = useRef(null);
  const coachTurn = useRef(null);
  const prev = useRef(null);
  const metaRef = useRef(null);
  const path = `/${encodeURIComponent(session.teamId)}`;

  const apply = useCallback((v, lead = []) => {
    const now = performance.now();
    const fresh = cuesFor(prev.current, v.state, now);
    playCues(fresh);
    setCues((old) => [...old.filter((c) => c.at > now - 6000), ...fresh]);
    const news = [...lead, ...bannersFor(prev.current, v.state, metaRef.current)];
    if (news.length) setBanners((q) => [...q, ...news].slice(-6));
    prev.current = v.state;
    setView(v);
  }, []);

  useEffect(() => {
    let alive = true;
    Promise.all([loadQuestMeta(), loadModelManifest(), questApi(`${path}/session`, { method: 'POST', code: session.code })])
      .then(([m, manifest, v]) => {
        if (!alive) return;
        metaRef.current = m;
        setMeta(m);
        setModels(manifest);
        // Start fetching every Blender model now (the rooms and the skeletons), so a fight doesn't
        // wait for a big download.
        for (const key of manifest.keys()) useGLTF.preload(`/models/${key}.glb`);
        apply(v);
      })
      .catch((err) => alive && onLeave(err.message));
    return () => {
      alive = false;
    };
  }, [path, session.code, apply, onLeave]);

  // Sound: browsers allow it only after a click or key press.
  const [audio, setAudio] = useState(readAudioSettings);
  const [soundOn, setSoundOn] = useState(false);
  useEffect(() => {
    const start = () => {
      unlock();
      setSoundOn(true);
    };
    window.addEventListener('pointerdown', start, { once: true });
    window.addEventListener('keydown', start, { once: true });
    return () => {
      window.removeEventListener('pointerdown', start);
      window.removeEventListener('keydown', start);
    };
  }, []);
  const changeAudio = (next) => setAudio(applySettings(next));
  const place = view?.state?.phase === 'combat' ? view.state.combat.roomId : 'map';
  useEffect(() => {
    if (soundOn) setMusic(place);
  }, [soundOn, place]);
  const bannerNow = banners[0];
  useEffect(() => {
    if (bannerNow) play(bannerNow.kind);
  }, [bannerNow]);

  // Banners play one after another.
  useEffect(() => {
    if (!banners.length) return;
    const t = setTimeout(() => setBanners((q) => q.slice(1)), BANNER_MS[banners[0].kind] ?? 1500);
    return () => clearTimeout(t);
  }, [banners]);

  // J opens the quest log anywhere.
  useEffect(() => {
    const onKey = (e) => {
      if (e.target instanceof HTMLInputElement || e.repeat) return;
      if (e.key.toLowerCase() === 'j') setLogOpen((o) => !o);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  const act = useCallback(
    async (action) => {
      if (busy) return;
      setBusy(true);
      setPicker(null);
      try {
        // In a fight the leader's lane is wherever they are standing.
        const leader = world.actors.get(world.leaderId);
        const sent = prev.current?.phase === 'combat' && leader && !action.lane ? { ...action, lane: laneOf(world, leader.x, leader.z) } : action;
        const v = await questApi(`${path}/act`, { method: 'POST', body: { action: sent }, code: session.code });
        if (['attack', 'skill', 'rune'].includes(action.type)) setCoach(2);
        if (coach === 2) {
          coachTurn.current ??= v.state.turn;
          if (v.state.turn - coachTurn.current >= 2) setCoach(3);
        }
        const me = prev.current?.party.find((m) => m.controlled);
        const cut = cutInFor(action, me, metaRef.current);
        apply(v, cut ? [cut] : []);
      } catch (err) {
        setToast(err.message);
      } finally {
        setBusy(false);
      }
    },
    [busy, path, session.code, apply, coach, setCoach, world],
  );

  const state = view?.state;
  const phase = state?.phase;
  const me = state?.party.find((m) => m.controlled);
  const living = useMemo(() => (state?.combat?.enemies ?? []).filter((e) => e.hp > 0), [state]);
  const skill = me && meta ? meta.classes[me.cls].skill : null;
  const reachKind = me && meta ? meta.classes[me.cls].reach : 'melee';
  const reach = REACH[reachKind] ?? REACH.melee;
  const canReach = useCallback((e) => Boolean(e) && (!e.flying || reachKind !== 'melee'), [reachKind]);

  // Movement: WASD (or ↑ ↓) walks, Space jumps, ← → turn the camera. Only in a fight.
  useEffect(() => {
    if (phase !== 'combat') {
      world.keys.clear();
      return;
    }
    const typing = (e) => e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement;
    const down = (e) => {
      if (typing(e)) return;
      const k = e.key.toLowerCase();
      if (MOVE_KEYS.has(k)) {
        world.keys.add(k);
        if (k.startsWith('arrow')) e.preventDefault();
      } else if (k === ' ') {
        e.preventDefault();
        if (!e.repeat) {
          world.jumpQueued = true;
          play('jump');
        }
      }
    };
    const up = (e) => world.keys.delete(e.key.toLowerCase());
    const clear = () => world.keys.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clear);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', clear);
      clear();
    };
  }, [phase, world]);

  // Who the leader aims at: the clicked enemy, else the nearest one they can hit. Positions
  // change every frame, so this is refreshed a few times a second.
  const [aim, setAim] = useState({ nearestId: null, gap: null });
  useEffect(() => {
    if (phase !== 'combat') return;
    const tick = () => {
      // With the mouse captured, aim with the crosshair: the enemy under it on screen becomes the target.
      const aimedId = document.pointerLockElement || world.firstPerson ? world.aimedId : null;
      const sighted = aimedId ? living.find((e) => e.id === aimedId && canReach(e)) : null;
      if (sighted && sighted.id !== targetId) setTargetId(sighted.id);
      const near = nearestEnemy(world, living, canReach)?.id ?? null;
      const id = living.some((e) => e.id === targetId) ? targetId : near;
      const g = id ? Math.round(gap(world, id) * 10) / 10 : null;
      const l = world.actors.get(world.leaderId);
      const lane = l ? laneOf(world, l.x, l.z) : null;
      if (l && coach === 0) {
        coachStart.current ??= { x: l.x, z: l.z };
        if (Math.hypot(l.x - coachStart.current.x, l.z - coachStart.current.z) > 1.5) setCoach(1);
      }
      const onTarget = Boolean(sighted);
      setAim((a) => (a.nearestId === near && a.gap === g && a.lane === lane && a.onTarget === onTarget ? a : { nearestId: near, gap: g, lane, onTarget }));
    };
    tick();
    const t = setInterval(tick, 150);
    return () => clearInterval(t);
  }, [phase, living, targetId, canReach, world, coach, setCoach]);

  const target = living.find((e) => e.id === targetId) ?? living.find((e) => e.id === aim.nearestId) ?? living.find(canReach) ?? living[0];
  // Rune Strike goes at Morvath when he is in the room, else at the current target.
  const runeTarget = living.find((e) => e.ultimate) ?? target;

  // Anything that hits an enemy needs the leader close enough; the leader turns to face it.
  const strikeAt = (enemy, action) => {
    if (!enemy) return setToast('No enemy in sight.');
    if (!canReach(enemy)) return setToast(`${me.name} can’t reach a flying enemy. Your companions can.`);
    if (gap(world, enemy.id) > reach) {
      setTargetId(enemy.id);
      return setToast(`Too far from ${enemy.name}: move closer (WASD).`);
    }
    const l = world.actors.get(world.leaderId);
    const a = world.actors.get(enemy.id);
    if (l && a) l.yaw = yawTo(a.x - l.x, a.z - l.z);
    act(action);
  };
  const doAttack = () => strikeAt(target, { type: 'attack', targetId: target?.id });
  const doSkill = () => {
    if (!skill || !me) return;
    if (skill.target === 'ally') setPicker({ kind: 'skill', title: `${skill.name}: choose an ally` });
    else if (skill.target === 'enemy') strikeAt(target, { type: 'skill', targetId: target?.id });
    else act({ type: 'skill' });
  };
  const doRune = () => strikeAt(runeTarget, { type: 'rune', targetId: runeTarget?.id });
  const cycleTarget = () => {
    const order = living.filter(canReach).sort((a, b) => gap(world, a.id) - gap(world, b.id));
    if (!order.length) return;
    const i = order.findIndex((e) => e.id === target?.id);
    setTargetId(order[(i + 1) % order.length].id);
  };

  // Ability keys: F attack · E skill · Q Rune Strike · R defend · H potion · G meal · X retreat ·
  // Tab next target · 1–6 pick a target. The handlers change every render, so read the latest.
  const handlers = useRef({});
  handlers.current = { doAttack, doSkill, doRune, cycleTarget, act, me, living };
  // Mouse buttons in a fight: left (mouse captured) or right = attack, middle = Rune Strike,
  // back side button = skill, forward side button = defend.
  world.onMouse = (button) => {
    const h = handlers.current;
    if (phase !== 'combat') return;
    if (h.me?.fallen) return h.act({ type: 'wait' });
    if (button === 0 || button === 2) h.doAttack();
    else if (button === 1) h.doRune();
    else if (button === 3) h.doSkill();
    else if (button === 4) h.act({ type: 'defend' });
  };

  // Mouse-look sensitivity, kept in this browser.
  const [sensitivity, setSensitivity] = useState(readSensitivity);
  world.sensitivity = sensitivity;
  // First person (default, like a shooter) or third person over the shoulder. V switches.
  const [firstPerson, setFirstPerson] = useState(readFirstPerson);
  world.firstPerson = firstPerson;
  const toggleView = useCallback(() => {
    setFirstPerson((v) => {
      try {
        localStorage.setItem(VIEW_KEY, v ? 'third' : 'first');
      } catch {
        // Preference just won't stick.
      }
      return !v;
    });
  }, []);
  useEffect(() => {
    const onKey = (e) => {
      if (e.target instanceof HTMLInputElement || e.repeat) return;
      if (e.key.toLowerCase() === 'v') toggleView();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleView]);
  const changeSensitivity = (v) => {
    setSensitivity(v);
    try {
      localStorage.setItem(SENS_KEY, String(v));
    } catch {
      // Preference just won't stick.
    }
  };

  // Mouse look: is the mouse captured by the 3D view right now? (Esc releases it.)
  const [mouseLook, setMouseLook] = useState(false);
  useEffect(() => {
    const change = () => setMouseLook(Boolean(document.pointerLockElement));
    document.addEventListener('pointerlockchange', change);
    return () => document.removeEventListener('pointerlockchange', change);
  }, []);
  // Menus need the cursor: give it back when a picker or the quest log opens, or the fight ends.
  useEffect(() => {
    if ((picker || logOpen || helpOpen || settingsOpen || phase !== 'combat') && document.pointerLockElement) document.exitPointerLock?.();
  }, [picker, logOpen, helpOpen, settingsOpen, phase]);
  useEffect(() => {
    if (phase !== 'combat') return;
    const onKey = (e) => {
      if (e.target instanceof HTMLInputElement || e.repeat) return;
      const h = handlers.current;
      const k = e.key.toLowerCase();
      if (k === 'tab') {
        e.preventDefault();
        h.cycleTarget();
      } else if (/^[1-6]$/.test(k) && h.living[Number(k) - 1]) setTargetId(h.living[Number(k) - 1].id);
      else if (k === 'f') h.me?.fallen ? h.act({ type: 'wait' }) : h.doAttack();
      else if (k === 'e') h.doSkill();
      else if (k === 'q') h.doRune();
      else if (k === 'r') h.act({ type: 'defend' });
      else if (k === 'h') setPicker({ kind: 'potion', title: 'Potion: choose an ally' });
      else if (k === 'g') setPicker({ kind: 'meal', title: 'Monster Meal: choose an ally' });
      else if (k === 'x') h.act({ type: 'retreat' });
      else if (k === 'escape') setPicker(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase]);

  // The round clock. Restarts after every round; holds while a request is in flight, a picker or
  // the quest log is open, a banner is showing, or the game window isn't in front.
  const holdClock = useRef(false);
  holdClock.current = busy || Boolean(picker) || logOpen || helpOpen || settingsOpen || banners.length > 0;
  const turn = state?.turn;
  useEffect(() => {
    if (phase !== 'combat' || !autoRounds) {
      setClock(null);
      return;
    }
    let left = ROUND_SECONDS;
    let last = performance.now();
    const t = setInterval(() => {
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;
      if (holdClock.current || document.hidden || !document.hasFocus()) return setClock({ left, paused: true });
      left -= dt;
      if (left <= 0) {
        left = ROUND_SECONDS;
        handlers.current.act({ type: 'wait' });
      }
      setClock({ left: Math.max(0, left), paused: false });
    }, 200);
    return () => clearInterval(t);
  }, [phase, autoRounds, turn]);

  const toggleAuto = () =>
    setAutoRounds((v) => {
      try {
        localStorage.setItem(AUTO_KEY, v ? '0' : '1');
      } catch {
        // Preference just won't stick.
      }
      return !v;
    });

  if (!state || !meta) return <div className="grid min-h-dvh place-items-center font-mono text-sm text-ash">Lighting the torches…</div>;

  const toggleLowSpec = () => {
    setLowSpec((v) => {
      try {
        localStorage.setItem(LOW_SPEC_KEY, v ? '0' : '1');
      } catch {
        // Preference just won't stick.
      }
      return !v;
    });
  };

  const pick = (memberId) => {
    if (picker.kind === 'potion' || picker.kind === 'meal') act({ type: picker.kind, targetId: memberId });
    else if (picker.kind === 'skill') act({ type: 'skill', targetId: memberId });
    else act({ type: picker.kind, memberId });
  };

  return (
    <div className="quest-root">
      <div className="quest-canvas">
        <Scene
          state={state}
          meta={meta}
          models={models}
          cues={cues}
          targetId={target?.id}
          onTarget={setTargetId}
          onTravel={(o) => act({ type: 'travel', to: o.to })}
          lowSpec={lowSpec}
          world={world}
          reach={reach}
          firstPerson={firstPerson}
        />
      </div>

      <TopBar view={view} meta={meta} lowSpec={lowSpec} onLowSpec={toggleLowSpec} onLeave={() => onLeave()} sensitivity={sensitivity} onSensitivity={changeSensitivity} audio={audio} onAudio={changeAudio} firstPerson={firstPerson} onToggleView={toggleView} onHelp={() => setHelpOpen(true)} onMenu={setSettingsOpen} />
      {view.note && <div className="hud-note">{view.note}</div>}

      {state.phase === 'setup' && <HeroSelect state={state} meta={meta} busy={busy} onLead={(memberId) => act({ type: 'lead', memberId })} />}
      {state.phase !== 'setup' && <PartyPanel party={state.party} meta={meta} inFight={state.phase === 'combat'} />}
      {state.phase !== 'setup' && <Chronicle log={state.log} rolls={state.lastRolls} />}
      {state.speech && state.phase !== 'setup' && <Subtitle speech={state.speech} meta={meta} />}
      {helpOpen && <HelpPanel onClose={() => setHelpOpen(false)} />}
      {state.phase !== 'setup' && state.phase !== 'victory' && state.phase !== 'defeat' && (
        <QuestTracker state={state} open={logOpen} onToggle={() => setLogOpen((o) => !o)} />
      )}
      {phase === 'combat' && coach < COACH.length && (
        <div className="hud-coach" role="note">
          <p className="eyebrow text-gold">
            How to play · {coach + 1}/{COACH.length} · {COACH[coach].title}
          </p>
          <p className="mt-1 text-sm leading-snug">{COACH[coach].text}</p>
          <div className="mt-2 flex gap-2">
            {coach === COACH.length - 1 && (
              <button className="btn px-2 py-0.5 text-xs" onClick={() => setCoach(COACH.length)}>
                Got it
              </button>
            )}
            <button className="font-mono text-[10px] text-ash hover:text-bone" onClick={() => setCoach(COACH.length)}>
              Skip tutorial
            </button>
          </div>
        </div>
      )}
      {phase === 'combat' && firstPerson && !mouseLook && <div className={`crosshair ${aim.onTarget ? 'on-target' : ''}`} aria-hidden="true" />}
      {phase === 'combat' && (mouseLook ? <div className={`crosshair ${aim.onTarget ? 'on-target' : ''}`} aria-hidden="true" /> : <p className="look-hint">Click the view to look around with the mouse · Esc frees the cursor</p>)}
      {banners[0] && <Banner key={`${banners[0].title}-${banners.length}-${state.turn}`} banner={banners[0]} />}

      {state.phase === 'combat' && (
        <>
          <BossBar state={state} />
          <EnemyList state={state} targetId={target?.id} onTarget={setTargetId} />
          <AbilityBar
            me={me}
            skill={skill}
            target={target}
            canReach={canReach(target)}
            potions={state.potions}
            meals={state.meals}
            rune={meta.runeStrike}
            runeTarget={runeTarget}
            canRetreat={!meta.rooms[state.combat.roomId].final}
            busy={busy}
            aimGap={aim.gap}
            lane={aim.lane}
            danger={dangerSoon(state)}
            reach={reach}
            clock={clock}
            autoRounds={autoRounds}
            onToggleAuto={toggleAuto}
            onAttack={doAttack}
            onDefend={() => act({ type: 'defend' })}
            onSkill={doSkill}
            onPotion={() => setPicker({ kind: 'potion', title: 'Potion: choose an ally' })}
            onMeal={() => setPicker({ kind: 'meal', title: 'Monster Meal: choose an ally' })}
            onRune={doRune}
            onRetreat={() => act({ type: 'retreat' })}
            onWait={() => act({ type: 'wait' })}
          />
        </>
      )}

      {state.phase === 'map' && (
        <MapPanel state={state} meta={meta} busy={busy} act={act} setPicker={setPicker} />
      )}

      {(state.phase === 'victory' || state.phase === 'defeat') && <EndScreen view={view} session={session} path={path} onRestart={async () => apply(await questApi(`${path}/reset`, { method: 'POST', code: session.code }))} />}

      {picker && <AllyPicker picker={picker} party={state.party} onPick={pick} onClose={() => setPicker(null)} />}
      {toast && (
        <div role="alert" className="hud-toast">
          {toast}
        </div>
      )}
    </div>
  );
}

// ---------- HUD pieces ----------

// Lanes about to be hit next round (a boss's marked lanes or Morvath's breath).
function dangerSoon(state) {
  const c = state.combat;
  return new Set([...(c?.danger && c.danger.round === c.round + 1 ? c.danger.lanes : []), ...(c?.telegraph?.lanes ?? [])]);
}

function MapPanel({ state, meta, busy, act, setPicker }) {
  const travel = state.options.filter((o) => o.type === 'travel');
  const atCamp = state.location === 'camp';
  const has = (type) => state.options.some((o) => o.type === type);
  return (
    <section className="hud-map" aria-label="Journey">
      <p className="eyebrow text-gold">Journey</p>
      <div className="mt-2 space-y-1.5">
        {travel.map((o) => {
          const room = meta.rooms[o.to];
          return (
            <button key={o.to} className={`hud-choice ${o.fight ? '' : 'is-quiet'}`} disabled={busy} onClick={() => act({ type: 'travel', to: o.to })}>
              <span>
                {o.to === 'camp' ? 'Return to the camp' : `${o.fight ? 'Enter' : 'Walk to'} ${room.name}`}
                {questFor(state, o.to) && <small className="block font-mono text-[10px] text-gold">Quest · {questFor(state, o.to).title}</small>}
                {room?.final && (
                  <small className="block font-mono text-[10px] text-blood">
                    Morvath at {morvathStrength(state, meta)}% · +{Math.round((meta.finalGrowth ?? 0) * 100)}% for every extra room you clear
                  </small>
                )}
              </span>
              <span className="font-mono text-[11px] text-ash">
                {o.cost} torch{o.cost === 1 ? '' : 'es'}
                {o.fight ? ` · round ${room.round}` : ''}
              </span>
            </button>
          );
        })}
      </div>
      {atCamp && <p className="eyebrow mt-3">Camp</p>}
      {atCamp && (
        <div className="mt-1.5 grid grid-cols-3 gap-1.5">
          <button className="btn px-2 py-1.5 text-sm" disabled={busy || !has('rest')} onClick={() => act({ type: 'rest' })} title={meta.powerUps.rest.text}>
            Rest <small className="block font-mono text-[10px] text-ash">1 torch</small>
          </button>
          <button className="btn px-2 py-1.5 text-sm" disabled={busy || !has('altar')} onClick={() => setPicker({ kind: 'altar', title: 'Rune Altar (+3 ATK, +3 DEF): choose a hero' })} title={meta.powerUps.altar.text}>
            Rune Altar <small className="block font-mono text-[10px] text-ash">1 torch · {meta.powerUps.altar.gold}g</small>
          </button>
          <button className="btn px-2 py-1.5 text-sm" disabled={busy || !has('forge')} onClick={() => setPicker({ kind: 'forge', title: 'Forge (+5 ATK): choose a hero' })} title={meta.powerUps.forge.text}>
            Forge <small className="block font-mono text-[10px] text-ash">{meta.powerUps.forge.gold}g</small>
          </button>
        </div>
      )}
      {atCamp && (
        <div className="mt-3 border-t border-crypt-3 pt-2">
          <p className="eyebrow">Pip’s pot</p>
          <div className="mt-1.5 grid grid-cols-2 gap-1.5">
            <button className="btn px-2 py-1.5 text-sm" disabled={busy || !state.pip.some((o) => o.item === 'potion')} onClick={() => act({ type: 'trade', item: 'potion' })} title={meta.pip.potion.text}>
              Buy potion <small className="block font-mono text-[10px] text-ash">{meta.pip.potion.gold}g</small>
            </button>
            <button className="btn px-2 py-1.5 text-sm" disabled={busy || !state.pip.some((o) => o.item === 'meal')} onClick={() => act({ type: 'trade', item: 'meal' })} title={meta.pip.meal.text}>
              Cook a meal <small className="block font-mono text-[10px] text-ash">{meta.pip.meal.parts} parts ({state.parts})</small>
            </button>
          </div>
        </div>
      )}
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <button className="btn px-2 py-1 text-sm" disabled={busy || state.potions <= 0} onClick={() => setPicker({ kind: 'potion', title: 'Potion: choose an ally' })}>
          Drink a potion ({state.potions})
        </button>
        <button className="btn px-2 py-1 text-sm" disabled={busy || state.meals <= 0} onClick={() => setPicker({ kind: 'meal', title: 'Monster Meal: choose an ally' })}>
          Eat a meal ({state.meals})
        </button>
      </div>
    </section>
  );
}

function AllyPicker({ picker, party, onPick, onClose }) {
  const allowFallen = picker.kind === 'skill' || picker.kind === 'altar' || picker.kind === 'forge';
  return (
    <div className="hud-picker" role="dialog" aria-label={picker.title}>
      <p className="eyebrow mb-2">{picker.title}</p>
      <div className="grid grid-cols-2 gap-1.5">
        {party.map((m) => (
          <button key={m.id} className="btn px-2 py-1.5 text-sm" disabled={m.fallen && !allowFallen} onClick={() => onPick(m.id)}>
            {m.name} <small className="font-mono text-[10px] text-ash">{m.fallen ? 'Fallen' : `${m.hp}/${m.maxHp}`}</small>
          </button>
        ))}
      </div>
      <button className="mt-2 w-full font-mono text-xs text-ash hover:text-bone" onClick={onClose}>
        Cancel (Esc)
      </button>
    </div>
  );
}

function Chronicle({ log, rolls }) {
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [log.length, log]);
  return (
    <section className="hud-log" aria-label="Chronicle">
      <div className="flex items-center justify-between">
        <button className="eyebrow hover:text-bone" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          Chronicle {open ? '▾' : '▸'}
        </button>
        {rolls?.length > 0 && (
          <span className="flex gap-1">
            {rolls.map((r, i) => (
              <span key={i} className={`dice ${r.value === 20 ? 'is-crit' : r.value <= 3 ? 'is-miss' : ''}`} title={`${r.by} rolled ${r.value}`}>
                {r.value}
              </span>
            ))}
          </span>
        )}
      </div>
      <ol ref={ref} className="mt-1 max-h-48 space-y-0.5 overflow-y-auto pr-1 text-[13px] leading-snug" aria-live="polite">
        {log.slice(open ? -40 : -3).map((line, i) => (
          <li key={`${log.length}-${i}`} className={/Fallen|shadows claim|falls …|bursts open/.test(line) ? 'text-blood' : /cleared|Victory|shatters|level/.test(line) ? 'text-verdigris' : /: “/.test(line) ? 'italic text-frost' : 'text-bone/80'}>
            {line}
          </li>
        ))}
      </ol>
    </section>
  );
}

function EndScreen({ view, session, path, onRestart }) {
  const s = view.state;
  const won = s.phase === 'victory';
  const [saving, setSaving] = useState(false);
  async function download() {
    setSaving(true);
    try {
      const { save } = await questApi(`${path}/save`, { code: session.code });
      const url = URL.createObjectURL(new Blob([JSON.stringify(save, null, 1)], { type: 'application/json' }));
      const a = Object.assign(document.createElement('a'), { href: url, download: `${view.team.id}-save.json` });
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="hud-end">
      <div className={`panel border-2 p-6 ${won ? 'border-verdigris/70' : 'border-blood/70'}`}>
        <h2 className={`font-display text-5xl ${won ? 'text-verdigris' : 'text-blood'}`}>{won ? 'The Heart beats again' : 'The shadows claim another soul'}</h2>
        <p className="mt-2 text-bone/80">
          {won ? 'The runes are restored. Eldermoor remembers its Runewright.' : '…but runes can always be rewritten. Fix what is broken and try again.'}
        </p>
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-sm">
          <dt className="text-ash">Heart fragments</dt>
          <dd>{s.fragments.length} / 5</dd>
          <dt className="text-ash">Wipes</dt>
          <dd>{s.stats.wipes}</dd>
          <dt className="text-ash">Turns</dt>
          <dd>{s.turn}</dd>
          <dt className="text-ash">Torches left</dt>
          <dd>{s.torches}</dd>
          <dt className="text-ash">Quests cleared</dt>
          <dd>
            {(s.quests ?? []).filter((q) => q.done).length} / {(s.quests ?? []).length}
          </dd>
        </dl>
        <div className="mt-5 flex flex-wrap gap-2">
          <button className="btn btn-primary" disabled={saving} onClick={download}>
            Download save
          </button>
          <button
            className="btn"
            onClick={() => {
              if (window.confirm('Start a new run? Your current save is archived, and the dice stay the same.')) onRestart();
            }}
          >
            Start over
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- choosing the leader ----------

function HeroSelect({ state, meta, busy, onLead }) {
  return (
    <div className="hud-end" style={{ width: 'min(60rem, 96vw)' }}>
      <div className="panel p-5">
        <p className="eyebrow">Party formation</p>
        <h2 className="font-display text-4xl text-bronze">Choose your leader</h2>
        <p className="mt-1 max-w-2xl text-sm text-bone/80">
          You control your leader; the other three follow as companions. Only the leader’s Rune Strike can break Morvath’s shadow armour.
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {state.party.map((m) => {
            const c = meta.classes[m.cls];
            return (
              <button key={m.id} className="panel flex flex-col p-3 text-left transition-colors hover:border-bronze" disabled={busy} onClick={() => onLead(m.id)}>
                <span className="font-display text-2xl leading-none">{c.title}</span>
                <span className="mt-1 font-mono text-[11px] text-bronze">{c.role}</span>
                <span className="mt-2 text-xs text-bone/80">{c.bio}</span>
                <span className="mt-2 font-mono text-[11px] text-ash">
                  HP {m.maxHp} · ATK {m.atk} · DEF {m.def}
                </span>
                <span className="mt-1 text-xs text-ash">
                  {c.skill.name}: {c.skill.text}
                </span>
                <span className="mt-auto pt-2 font-mono text-[10px] text-ash">Carries: {c.startingItem}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}


// ---------- quests ----------

// The open quest that sends the party to this room, if any.
function questFor(state, roomId) {
  return (state.quests ?? []).find((q) => !q.done && (q.room === roomId || (roomId === 'r5' && q.id === 'throne')));
}

const KIND_LABEL = { main: 'Main', room: 'Quest', side: 'Side' };

function QuestTracker({ state, open, onToggle }) {
  const quests = state.quests ?? [];
  const fightRoom = state.phase === 'combat' ? state.combat.roomId : null;
  // In a fight, only the quest for this room; on the map, what's still open (main quests first).
  const shown = open
    ? [...quests.filter((q) => !q.done), ...quests.filter((q) => q.done)]
    : fightRoom
      ? quests.filter((q) => q.room === fightRoom || (fightRoom === 'r5' && q.id === 'throne'))
      : quests.filter((q) => !q.done).slice(0, 4);
  const cleared = quests.filter((q) => q.done).length;
  return (
    <section className={`hud-quests ${open ? 'is-open' : ''}`} aria-label="Quests">
      <div className="flex items-center justify-between gap-2">
        <p className="eyebrow text-gold">
          {open ? 'Quest log' : 'Quests'} <span className="text-ash">· {cleared}/{quests.length} clear</span>
        </p>
        <button className="font-mono text-[10px] text-ash hover:text-bone" onClick={onToggle}>
          {open ? 'Close' : 'Log'} <kbd>J</kbd>
        </button>
      </div>
      <ol className="mt-1.5 space-y-2">
        {shown.map((q) => (
          <QuestItem key={q.id} quest={q} full={open} />
        ))}
      </ol>
    </section>
  );
}

function QuestItem({ quest: q, full }) {
  return (
    <li className={`quest-item ${q.done ? 'is-done' : ''} quest-${q.kind}`}>
      <p className="flex items-baseline justify-between gap-2">
        <span className="font-display text-[15px] leading-tight">{q.title}</span>
        <span className="quest-tag">{q.done ? 'Clear' : KIND_LABEL[q.kind]}</span>
      </p>
      {full && (
        <p className="mt-0.5 text-xs text-bone/75">
          {q.giver && <span className="text-frost">{q.giver}: </span>}
          {q.text}
        </p>
      )}
      <ul className="mt-1 space-y-0.5">
        {q.steps.map((st) => (
          <li key={st.text} className={`quest-step ${st.done ? 'is-done' : ''}`}>
            <span aria-hidden="true">{st.done ? '◆' : '◇'}</span> {st.text}
            {st.count && !st.done && (
              <span className="ml-1 font-mono text-[10px] text-ash">
                {st.count[0]}/{st.count[1]}
              </span>
            )}
          </li>
        ))}
      </ul>
      {full && <p className="mt-1 font-mono text-[10px] text-gold/80">Reward: {q.reward}</p>}
    </li>
  );
}

// ---------- anime-style banner ----------

function Banner({ banner }) {
  return (
    <div className={`hud-banner banner-${banner.kind}`} role="status" aria-live="assertive">
      <div className="banner-strip">
        <p className="banner-title">{banner.title}</p>
        {banner.sub && <p className="banner-sub">{banner.sub}</p>}
        {banner.note && <p className="banner-note">{banner.note}</p>}
      </div>
    </div>
  );
}
