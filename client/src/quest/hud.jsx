// The in-game HUD: a slim top bar, a boss bar, compact party and enemy lists, ability slots with
// cooldown sweeps, subtitles for NPC lines and a help panel for the controls.
import { useEffect, useState } from 'react';
import './hud.css';

// ---------- icons (inline SVG, so they're crisp and themeable) ----------

const P = {
  sword: 'M14.5 3.5 20.5 3.5 20.5 9.5 9 21 3 15Z M6 18l-2.5 2.5 M12 9l3 3',
  burst: 'M12 2l2.2 6.6L21 9l-5.4 4.1L17.6 20 12 16.2 6.4 20l2-6.9L3 9l6.8-.4Z',
  rune: 'M12 2 20 12 12 22 4 12Z M12 6v12 M8.5 10.5 15.5 13.5',
  shield: 'M12 2 20 5v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5Z',
  flask: 'M9 2h6 M10 2v6L4.5 18.5A2.2 2.2 0 0 0 6.4 22h11.2a2.2 2.2 0 0 0 1.9-3.5L14 8V2 M7 15h10',
  meal: 'M4 11h16a8 8 0 0 1-16 0Z M8 7c0-2 2-2 2-4 M13 7c0-2 2-2 2-4',
  retreat: 'M10 6 4 12l6 6 M4 12h11a5 5 0 0 1 0 10h-2',
  wait: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z M12 7v5l3 2',
  gear: 'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z M12 2v3 M12 19v3 M2 12h3 M19 12h3 M4.9 4.9l2.1 2.1 M17 17l2.1 2.1 M4.9 19.1 7 17 M17 7l2.1-2.1',
  help: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z M9.5 9.5a2.5 2.5 0 0 1 4.9.7c0 1.7-2.4 2-2.4 3.6 M12 17h.01',
  door: 'M5 21V4a1 1 0 0 1 1-1h9l4 2v16 M3 21h18 M12 12h.01',
  bolt: 'M13 2 4 14h7l-1 8 9-12h-7Z',
  torch: 'M12 2c2 3 3 4.5 3 6.5a3 3 0 0 1-6 0C9 7 10 5 12 2Z M10.5 12h3l-1 10h-1Z',
  coin: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z M12 7v10 M9.5 9.5h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4',
  heart: 'M12 21 4 13a5 5 0 0 1 8-6 5 5 0 0 1 8 6Z',
  bone: 'M7 7a2 2 0 1 1-2-3 2 2 0 1 1 3 2l9 9a2 2 0 1 1 2 3 2 2 0 1 1-3-2Z',
};

export function Icon({ name, size = 22, className = '' }) {
  return (
    <svg className={`icon ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={P[name]} />
    </svg>
  );
}

// ---------- top bar ----------

export function TopBar({ view, meta, lowSpec, onLowSpec, onLeave, sensitivity, onSensitivity, audio, onAudio, firstPerson, onToggleView, onHelp, onMenu, onRewind, onReset, busy }) {
  const [open, setOpen] = useState(false);
  useEffect(() => onMenu?.(open), [open, onMenu]);
  const s = view.state;
  const room = s.phase === 'combat' ? meta.rooms[s.combat.roomId] : null;
  const place = room ? room.name : s.location === 'camp' ? 'The Camp' : s.phase === 'setup' ? 'The Shattered Heart' : meta.rooms[s.location]?.name;
  return (
    <header className="hud-topbar">
      <div className="topbar-title">
        <span className="topbar-round">{room ? `Round ${room.round}` : view.team.name}</span>
        <span className="topbar-place">{place}</span>
      </div>
      <div className="topbar-chips">
        <Chip icon="torch" value={s.torches} label="Torches" warn={s.torches <= 3} />
        <Chip icon="coin" value={s.gold} label="Gold" />
        <Chip icon="flask" value={s.potions} label="Potions" />
        <Chip icon="meal" value={s.meals} label="Meals" />
        <Chip icon="bone" value={s.parts} label="Monster parts" />
        <Chip icon="heart" value={`${s.fragments.length}/5`} label="Heart fragments" good={s.throneOpen} />
      </div>
      <div className="topbar-buttons">
        <button className="icon-btn" onClick={onHelp} title="Controls (F1)" aria-label="Controls">
          <Icon name="help" size={18} />
        </button>
        <button className={`icon-btn ${open ? 'is-on' : ''}`} onClick={() => setOpen((o) => !o)} title="Settings" aria-label="Settings" aria-expanded={open}>
          <Icon name="gear" size={18} />
        </button>
        <button className="icon-btn" onClick={onLeave} title="Leave" aria-label="Leave">
          <Icon name="door" size={18} />
        </button>
        {open && (
          <div className="hud-settings glass" role="dialog" aria-label="Settings">
            <p className="settings-title">Settings</p>
            <Slider label="Mouse sensitivity" value={sensitivity} min={0.2} max={3} step={0.1} show={`${sensitivity.toFixed(1)}×`} onChange={onSensitivity} />
            {[
              ['master', 'Volume'],
              ['music', 'Music'],
              ['sfx', 'Effects'],
            ].map(([k, label]) => (
              <Slider key={k} label={label} value={audio[k]} min={0} max={1} step={0.05} show={`${Math.round(audio[k] * 100)}%`} onChange={(v) => onAudio({ [k]: v })} />
            ))}
            <Toggle label="First-person view (V)" checked={firstPerson} onChange={onToggleView} />
            <Toggle label="Mute all sound" checked={audio.muted} onChange={() => onAudio({ muted: !audio.muted })} />
            <Toggle label="Low spec (no shadows or glow)" checked={lowSpec} onChange={onLowSpec} />
            <p className="settings-title mt-3">Progress</p>
            <p className="text-xs text-ash">Saved automatically after every move{view.saved ? ` (turn ${view.saved.turn})` : ''}. Come back any time to carry on.</p>
            {(view.checkpoints ?? []).length > 0 && (
              <div className="mt-1.5 grid gap-1">
                {view.checkpoints.map((cp) => (
                  <button key={cp.room} className="btn px-2 py-1 text-left text-xs" disabled={busy} onClick={() => onRewind?.(cp)}>
                    Play Round {cp.round} again <small className="font-mono text-[10px] text-ash">· {cp.name}</small>
                  </button>
                ))}
              </div>
            )}
            <button className="btn mt-1.5 w-full px-2 py-1 text-xs text-blood" disabled={busy} onClick={() => onReset?.()}>
              Reset the whole game
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

function Chip({ icon, value, label, warn, good }) {
  return (
    <span className={`chip ${warn ? 'is-warn' : ''} ${good ? 'is-good' : ''}`} title={label}>
      <Icon name={icon} size={15} />
      <b>{value}</b>
    </span>
  );
}

function Slider({ label, value, min, max, step, show, onChange }) {
  return (
    <label className="setting">
      <span>
        {label} <em>{show}</em>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <label className="setting-toggle">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={onChange} />
      <i aria-hidden="true" />
    </label>
  );
}

// ---------- boss bar ----------

const MORVATH_PHASE = ['', 'The Shadow Knight', 'The Change', 'Dragon’s Breath'];

export function BossBar({ state }) {
  const c = state.combat;
  const boss = c.enemies.find((e) => e.boss && e.hp > 0);
  if (!boss) return null;
  const pct = Math.max(0, (boss.hp / boss.maxHp) * 100);
  const tele = c.telegraph;
  const target = tele?.targetId ? state.party.find((m) => m.id === tele.targetId)?.name : null;
  let badge = null;
  let tell = null;
  if (boss.ultimate) {
    badge = boss.armoured ? 'Armoured · Rune Strike breaks it' : 'Armour broken · strike now';
    if (tele) tell = tele.move === 'charge' ? 'Draws in shadow-fire: Dragon’s Breath next round' : tele.lanes ? `${tele.name} → the ${tele.lanes.join(' and ')} lanes (${tele.damage})` : `${tele.name} → ${target ?? 'everyone'} (${tele.damage})`;
  } else if (boss.hiddenIn) badge = `Hidden in the ${boss.hiddenIn} lane`;
  else if (boss.stance === 'counter') badge = 'Counter stance · don’t hit';
  if (!boss.ultimate && c.danger && c.danger.round === c.round + 1) tell = `${c.danger.name} → the ${c.danger.lanes.join(' and ')} lane${c.danger.lanes.length > 1 ? 's' : ''} (${c.danger.damage}${c.danger.poison ? ' + poison' : ''})`;
  return (
    <section className="hud-boss" aria-label="Boss">
      <div className="boss-head">
        <span className="boss-name">{boss.name}</span>
        {boss.ultimate && <span className="boss-phase">Phase {boss.phase} · {MORVATH_PHASE[boss.phase]}</span>}
        <span className="boss-hp">
          {Math.max(0, boss.hp)} / {boss.maxHp}
        </span>
      </div>
      <div className="boss-bar">
        <span className="boss-ghost" style={{ width: `${pct}%` }} />
        <span className={`boss-fill ${boss.armoured ? 'is-armoured' : ''}`} style={{ width: `${pct}%` }} />
      </div>
      {(badge || tell) && (
        <div className="boss-tells">
          {badge && <span className={`boss-badge ${boss.armoured || boss.stance === 'counter' ? 'is-warn' : ''}`}>{badge}</span>}
          {tell && <span className="boss-tell">Next: {tell}</span>}
        </div>
      )}
    </section>
  );
}

// ---------- party ----------

export function PartyPanel({ party, meta, inFight }) {
  return (
    <section className="hud-party2" aria-label="Party">
      {party.map((m) => {
        const pct = Math.max(0, Math.min(100, (m.hp / m.maxHp) * 100));
        const cls = meta.classes[m.cls];
        return (
          <article key={m.id} className={`pcard ${m.controlled ? 'is-you' : ''} ${m.fallen ? 'is-fallen' : ''}`}>
            <span className={`pcard-portrait cls-${m.cls}`}>{m.name[0]}</span>
            <div className="pcard-body">
              <div className="pcard-top">
                <span className="pcard-name">
                  {m.name}
                  {m.controlled && <em>you</em>}
                </span>
                <span className="pcard-meta">
                  {inFight && m.lane ? `${m.lane} · ` : ''}lv {m.level}
                </span>
              </div>
              <div className="pcard-bar">
                <span className={pct > 60 ? 'hp-hi' : pct > 30 ? 'hp-mid' : 'hp-lo'} style={{ width: `${pct}%` }} />
              </div>
              <div className="pcard-foot">
                <span>
                  {m.hp}/{m.maxHp}
                </span>
                <span>{m.fallen ? <b className="text-blood">Fallen</b> : m.poison ? <b className="text-venom">Poisoned</b> : m.cooldown ? `${cls.skill.name} ${m.cooldown}` : `${cls.skill.name} ready`}</span>
              </div>
              {m.maxShield > 0 && (
                <>
                  <div className="pcard-bar is-thin" title="Shield: takes blows before health">
                    <span className="shield" style={{ width: `${Math.max(0, Math.min(100, (m.shield / m.maxShield) * 100))}%` }} />
                  </div>
                  <div className="pcard-foot">
                    <span>shield {m.shield}/{m.maxShield}</span>
                    {m.sword && meta.sword && (
                      <span title={`${meta.sword.name}: edge adds damage; a broken sword hits for half`}>
                        {m.sword.durability === 0 ? <b className="text-blood">sword broken</b> : `edge ${Math.round((m.sword.sharpness / meta.sword.sharpness) * 100)}% · wear ${100 - Math.round((m.sword.durability / meta.sword.durability) * 100)}%`}
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
          </article>
        );
      })}
    </section>
  );
}

// ---------- enemies (minions; the boss has its bar) ----------

export function EnemyList({ state, targetId, onTarget }) {
  const list = state.combat.enemies.filter((e) => !e.boss && e.hp > 0); // the beaten are gone from the list too
  if (!list.length) return null;
  return (
    <section className="hud-foes" aria-label="Enemies">
      {list.map((e) => (
        <button key={e.id} disabled={e.hp <= 0} onClick={() => onTarget(e.id)} className={`foe ${e.id === targetId && e.hp > 0 ? 'is-target' : ''} ${e.hp <= 0 ? 'is-dead' : ''}`}>
          <span className="foe-top">
            <span>{e.name}</span>
            <span className="foe-meta">{e.flying ? 'flying' : `DEF ${e.def}`}</span>
          </span>
          <span className="foe-bar">
            <span style={{ width: `${Math.max(0, (e.hp / e.maxHp) * 100)}%` }} />
          </span>
        </button>
      ))}
    </section>
  );
}

// ---------- abilities ----------

function Slot({ icon, label, keyName, onClick, disabled, cooldown = 0, max = 1, count, primary, warn }) {
  const sweep = cooldown > 0 ? Math.min(1, cooldown / max) : 0;
  return (
    <button className={`slot ${primary ? 'is-primary' : ''} ${warn ? 'is-warn' : ''}`} onClick={onClick} disabled={disabled} title={label}>
      <Icon name={icon} size={26} />
      {sweep > 0 && <span className="slot-cd" style={{ '--cd': `${sweep * 360}deg` }} />}
      {cooldown > 0 && <span className="slot-cd-num">{cooldown}</span>}
      {count !== undefined && <span className="slot-count">{count}</span>}
      <kbd>{keyName}</kbd>
      <span className="slot-label">{label}</span>
    </button>
  );
}

export function AbilityBar({ me, skill, target, canReach, potions, meals, rune, runeTarget, canRetreat, busy, aimGap, reach, lane, danger, clock, autoRounds, onToggleAuto, onAttack, onDefend, onSkill, onRune, onPotion, onMeal, onRetreat, onWait }) {
  const near = aimGap !== null && aimGap <= reach;
  const exposed = lane && danger?.has(lane);
  const clockPct = clock ? Math.max(0, Math.min(100, (clock.left / 6) * 100)) : 0;
  return (
    <div className="hud-abilities">
      <div className="ability-info">
        {lane && <span className={`lane-pill ${exposed ? 'is-danger' : ''}`}>{exposed ? `${lane} lane · move!` : `${lane} lane`}</span>}
        {target && (
          <span className="target-pill">
            {target.name}
            {aimGap !== null && <b className={near ? 'is-near' : 'is-far'}>{near ? `${aimGap} m · in reach` : `${aimGap} m · too far`}</b>}
          </span>
        )}
        <button className={`clock-pill ${autoRounds ? '' : 'is-off'}`} onClick={onToggleAuto} title="Auto rounds: your party and the enemies act every few seconds even if you don't.">
          {autoRounds && clock ? (
            <>
              <span className="clock-bar">
                <span style={{ width: `${clockPct}%` }} />
              </span>
              {clock.paused ? 'paused' : `${Math.ceil(clock.left)}s`}
            </>
          ) : (
            'auto off'
          )}
        </button>
      </div>
      <div className="ability-slots">
        {me.fallen ? (
          <>
            <p className="fallen-note">{me.name} has fallen.</p>
            <Slot icon="wait" label="Wait" keyName="F" onClick={onWait} disabled={busy} primary />
          </>
        ) : (
          <>
            <Slot icon="sword" label="Attack" keyName="F" onClick={onAttack} disabled={busy || !target || !canReach} primary />
            <Slot icon="burst" label={skill.name} keyName="E" onClick={onSkill} disabled={busy || me.cooldown > 0} cooldown={me.cooldown} max={skill.cooldown + 1} />
            <Slot icon="rune" label="Rune Strike" keyName="Q" onClick={onRune} disabled={busy || me.runeCooldown > 0 || !runeTarget} cooldown={me.runeCooldown} max={(rune.cooldown ?? 3) + 1} />
            <Slot icon="shield" label="Defend" keyName="R" onClick={onDefend} disabled={busy} warn={exposed} />
            <Slot icon="flask" label="Potion" keyName="H" onClick={onPotion} disabled={busy || potions <= 0} count={potions} />
            {meals > 0 && <Slot icon="meal" label="Meal" keyName="G" onClick={onMeal} disabled={busy} count={meals} />}
            {canRetreat && <Slot icon="retreat" label="Retreat" keyName="X" onClick={onRetreat} disabled={busy} />}
          </>
        )}
      </div>
    </div>
  );
}

// ---------- subtitles (NPC lines) ----------

export function Subtitle({ speech, meta }) {
  const npc = speech.npc ? meta.npcs[speech.npc] : null;
  const text = npc ? speech.text.replace(/^[^:]+:\s*/, '') : speech.text;
  const [shown, setShown] = useState(true);
  useEffect(() => {
    setShown(true);
    const t = setTimeout(() => setShown(false), 9000);
    return () => clearTimeout(t);
  }, [speech.text]);
  return (
    <div className={`hud-subtitle ${shown ? '' : 'is-gone'}`} role="status">
      {npc && <span className="sub-name">{npc.name}</span>}
      <span className="sub-text">{text}</span>
    </div>
  );
}

// ---------- help ----------

const CONTROLS = [
  ['Move', 'W A S D'],
  ['Jump', 'Space'],
  ['Look / aim', 'Click the view, then move the mouse · Esc frees the cursor'],
  ['Attack', 'Right-click · F · left-click while aiming'],
  ['Skill', 'E · back side button'],
  ['Rune Strike', 'Q · middle-click'],
  ['Defend', 'R · forward side button'],
  ['Potion / Meal', 'H / G'],
  ['Retreat', 'X'],
  ['Next target', 'Tab · 1–6'],
  ['First / third person', 'V'],
  ['Quest log', 'J'],
  ['Controls', 'F1'],
];

export function HelpPanel({ onClose }) {
  return (
    <div className="hud-help-backdrop" onClick={onClose}>
      <div className="hud-help glass" role="dialog" aria-label="Controls" onClick={(e) => e.stopPropagation()}>
        <div className="help-head">
          <p className="settings-title">Controls</p>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <dl>
          {CONTROLS.map(([what, keys]) => (
            <div key={what} className="help-row">
              <dt>{what}</dt>
              <dd>{keys}</dd>
            </div>
          ))}
        </dl>
        <p className="help-note">Red lanes on the floor are hit next round: walk out of them before you act. Wait too long and the round plays out without you.</p>
      </div>
    </div>
  );
}
