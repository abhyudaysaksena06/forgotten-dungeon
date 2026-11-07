import { useState } from 'react';
import CombatPanel from '../components/CombatPanel.jsx';
import CurseLedger from '../components/CurseLedger.jsx';
import Inventory from '../components/Inventory.jsx';
import LogChat from '../components/LogChat.jsx';
import PartyPanel from '../components/PartyPanel.jsx';
import RollRuler from '../components/RollRuler.jsx';
import ScenePanel from '../components/ScenePanel.jsx';
import { ShardTrack } from '../components/bits.jsx';
import { formatClock } from '../lib/format.js';
import { isMuted, setMuted } from '../sfx.js';
import { useNow, useRoom } from '../useRoom.js';
import Lobby from './Lobby.jsx';

export default function Game({ session, meta, onLeave }) {
  const room = useRoom(session, onLeave);
  const { state, event, act } = room;
  const [ledgerOpen, setLedgerOpen] = useState(false);

  if (!state) {
    return <div className="grid min-h-dvh place-items-center font-mono text-sm text-ash">{room.online ? 'Reading the map…' : 'Connecting to the dungeon…'}</div>;
  }
  const spectator = Boolean(session.spectate);
  const me = state.players.find((p) => p.id === session.playerId) ?? null;
  if (!me && !spectator) return null;

  return (
    <>
      <Banners banners={room.banners} />
      {room.toast && (
        <div role="alert" className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded border border-blood bg-crypt-2 px-4 py-2 text-sm shadow-lg">
          {room.toast.message}
        </div>
      )}
      {ledgerOpen && <CurseLedger event={event} onClose={() => setLedgerOpen(false)} />}

      {state.phase === 'lobby' && spectator ? (
        <p className="grid min-h-dvh place-items-center px-4 text-center font-mono text-sm text-ash">
          Run {state.code}: the hero is still choosing a class. This page updates when the run begins.
        </p>
      ) : state.phase === 'lobby' ? (
        <Lobby state={state} me={me} meta={meta} act={act} onLeave={onLeave} />
      ) : (
        <div className="mx-auto max-w-[90rem] px-4 pb-10 md:px-6">
          <StatusBar state={state} event={event} online={room.online} serverNow={room.serverNow} spectator={spectator} onLedger={() => setLedgerOpen(true)} onLeave={onLeave} />
          <div className="mt-4 grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)_20rem]">
            <div className="order-2 lg:order-1">
              <PartyPanel players={state.players} meId={me?.id} meta={meta} />
            </div>
            <div className="order-1 min-w-0 space-y-4 lg:order-2">
              <Narration state={state} />
              {(state.phase === 'victory' || state.phase === 'defeat') && <EndScreen state={state} act={act} spectator={spectator} />}
              {!spectator && state.phase === 'scene' && <ScenePanel state={state} me={me} meta={meta} act={act} serverNow={room.serverNow} />}
              {!spectator && state.phase === 'combat' && (
                <CombatPanel key={state.scene?.id} state={state} me={me} meta={meta} act={act} serverNow={room.serverNow} />
              )}
              <RollRuler rolls={state.lastRolls} />
            </div>
            <div className="order-3 space-y-4">
              {me && <Inventory me={me} players={state.players} meta={meta} act={act} phase={state.phase} />}
              <LogChat log={state.log} whispers={room.whispers} say={room.say} me={me} spectator={spectator} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function StatusBar({ state, event, online, serverNow, spectator, onLedger, onLeave }) {
  useNow(1000);
  const [muted, setMutedState] = useState(isMuted());
  const timer = event?.timer;
  const remaining = timer?.startedAt ? timer.startedAt + timer.durationMinutes * 60_000 - serverNow() : null;
  const lifted = event?.curses.filter((c) => c.lifted).length ?? 0;

  return (
    <header className="sticky top-0 z-30 -mx-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-crypt-3 bg-crypt/90 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
      <div className="min-w-0">
        <p className="eyebrow">
          {spectator ? `Watching run ${state.code}` : `Stage ${state.stage} of 3 · run ${state.code}`}
        </p>
        <h1 className="truncate font-display text-2xl leading-tight text-bronze">{state.stageName}</h1>
      </div>
      <div className="flex items-center gap-2">
        <span className="eyebrow">Shards</span>
        <ShardTrack found={state.shards.found} total={state.shards.total} />
      </div>
      {remaining != null && (
        <div className="font-mono text-sm">
          <span className="eyebrow mr-2">Event</span>
          <span className={remaining < 10 * 60_000 ? 'text-blood' : 'text-bone'}>{formatClock(remaining)}</span>
        </div>
      )}
      <div className="ml-auto flex items-center gap-2">
        <span className={`font-mono text-[11px] ${online ? 'text-verdigris' : 'text-blood'}`}>{online ? '● online' : '● reconnecting'}</span>
        <button className="btn px-3 py-1 text-sm" onClick={onLedger}>
          Curse Ledger <span className="font-mono text-xs text-ash">
            {lifted}/{event?.curses.length ?? 0}
          </span>
        </button>
        <button
          className="btn px-2 py-1 text-sm"
          aria-pressed={muted}
          onClick={() => {
            setMuted(!muted);
            setMutedState(!muted);
          }}
        >
          {muted ? 'Sound off' : 'Sound on'}
        </button>
        <button className="btn px-2 py-1 text-sm" onClick={() => onLeave()}>
          {spectator ? 'Stop watching' : 'Leave'}
        </button>
      </div>
    </header>
  );
}

function Narration({ state }) {
  const n = state.narration;
  return (
    <article className="relative px-1 py-2">
      <p className="eyebrow">
        {state.scene?.title}
        {n && <span className="ml-2 text-ash/60">· Dungeon Master{n.source === 'llm' ? '' : ' (scripted)'}</span>}
      </p>
      <p key={n?.text ?? state.scene?.id} className="ink mt-2 max-w-[62ch] text-xl leading-relaxed text-bone md:text-2xl md:leading-relaxed">
        {n?.text ?? state.scene?.intro}
      </p>
    </article>
  );
}

function EndScreen({ state, act, spectator }) {
  const won = state.phase === 'victory';
  const s = state.score;
  const rows = s && [
    ['Stage clears', s.stageClears, 100],
    ['Forgotten King', s.boss, 150],
    ['Survivors', s.survival, 50],
    ['Speed', s.speed, 50],
    ['Memory Shards', s.shards, 50],
  ];
  return (
    <section className={`panel border-2 p-5 ${won ? 'border-verdigris/70' : 'border-blood/70'}`}>
      <h2 className={`font-display text-5xl ${won ? 'text-verdigris' : 'text-blood'}`}>{won ? 'Victory' : 'The party has Fallen'}</h2>
      {s && (
        <table className="mt-4 w-full max-w-sm font-mono text-sm">
          <tbody>
            {rows.map(([label, v, max]) => (
              <tr key={label} className="border-b border-crypt-3">
                <td className="py-1 text-ash">{label}</td>
                <td className="py-1 text-right">
                  {v}
                  <span className="text-ash/60">/{max}</span>
                </td>
              </tr>
            ))}
            <tr>
              <td className="pt-2 text-bone">Hero Score</td>
              <td className="pt-2 text-right text-lg text-bronze">{s.total}</td>
            </tr>
          </tbody>
        </table>
      )}
      {!won && !spectator && (
        <div className="mt-5">
          <button className="btn btn-primary" onClick={() => act('retry')}>
            Retry from the start of Stage {state.stage}
          </button>
          <p className="mt-2 text-xs text-ash">Retrying keeps your progress but gives up the speed bonus.</p>
        </div>
      )}
    </section>
  );
}

function Banners({ banners }) {
  return banners.map((b, i) => (
    <div
      key={b.id}
      role="status"
      className={`banner fixed left-1/2 z-50 rounded border-2 px-6 py-3 text-center shadow-2xl ${
        b.kind === 'curse' ? 'border-verdigris bg-crypt-2' : 'border-bronze bg-crypt-2'
      }`}
      style={{ top: `${1 + i * 4.5}rem` }}
    >
      <p className="eyebrow">{b.kind === 'curse' ? 'The judge has spoken' : 'The phone is ringing'}</p>
      <p className={`font-display text-3xl ${b.kind === 'curse' ? 'text-verdigris' : 'text-bronze'}`}>{b.title}</p>
    </div>
  ));
}
