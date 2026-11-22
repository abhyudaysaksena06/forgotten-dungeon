import { useCallback, useEffect, useState } from 'react';
import { CurseList } from '../components/CurseLedger.jsx';
import { formatClock } from '../lib/format.js';
import { api } from '../net.js';
import { useNow } from '../useRoom.js';

const TOKEN_KEY = 'forgotten-dungeon.admin';

function readToken() {
  try {
    return sessionStorage.getItem(TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
}

export default function Admin() {
  const [token, setToken] = useState(readToken);
  const [draft, setDraft] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [judging, setJudging] = useState(false);
  const [lastJudge, setLastJudge] = useState(null);
  useNow(1000);

  const call = useCallback((path, method = 'GET') => api(`/api/admin${path}`, { method, headers: { 'x-admin-token': token } }), [token]);

  const refresh = useCallback(async () => {
    try {
      setData(await call('/overview'));
      setError(null);
    } catch (err) {
      setError(err.message);
      if (err.code === 'unauthorized') setToken('');
    }
  }, [call]);

  useEffect(() => {
    if (!token) return;
    refresh();
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, [token, refresh]);

  if (!token) {
    return (
      <main className="mx-auto grid min-h-dvh max-w-sm content-center px-4">
        <h1 className="font-display text-4xl text-bronze">Organiser dashboard</h1>
        <form
          className="mt-6 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            try {
              sessionStorage.setItem(TOKEN_KEY, draft);
            } catch {
              // Kept for this tab only.
            }
            setToken(draft);
          }}
        >
          <label className="block">
            <span className="eyebrow">Admin token</span>
            <input className="field mt-1 font-mono" type="password" value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus />
          </label>
          <p className="text-xs text-ash">The server prints it at startup, or set ADMIN_TOKEN in server/.env.</p>
          {error && <p className="text-sm text-blood">{error}</p>}
          <button className="btn btn-primary w-full" disabled={!draft}>
            Open dashboard
          </button>
          <a href="#/" className="block text-center font-mono text-xs text-ash hover:text-bone">
            ← back to the game
          </a>
        </form>
      </main>
    );
  }

  if (!data) return <div className="grid min-h-dvh place-items-center font-mono text-sm text-ash">{error ?? 'Loading…'}</div>;

  const { event, health } = data;
  const elapsed = event.timer.startedAt ? Date.now() - event.timer.startedAt : null;
  const left = elapsed != null ? event.timer.durationMinutes * 60_000 - elapsed : null;

  async function runJudge() {
    setJudging(true);
    try {
      setLastJudge(await call('/judge', 'POST'));
      refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setJudging(false);
    }
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 md:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-crypt-3 pb-4">
        <div>
          <p className="eyebrow">Organiser dashboard</p>
          <h1 className="font-display text-4xl text-bronze">The Forgotten Dungeon</h1>
        </div>
        <div className="font-mono text-xs text-ash">
          up {formatClock(health.uptime * 1000)} · {health.memoryMb} MB · {health.sockets ?? 0} sockets · DM {health.dm}
        </div>
      </header>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <section className="panel p-4">
          <p className="eyebrow">Event clock</p>
          <p className="mt-2 font-mono text-5xl">{left != null ? formatClock(left) : formatClock(event.timer.durationMinutes * 60_000)}</p>
          <p className="mt-1 text-sm text-ash">{elapsed != null ? `${Math.floor(elapsed / 60_000)} min in` : 'Not started'}</p>
          <button className="btn mt-4" onClick={() => call('/timer/start', 'POST').then(refresh)}>
            {event.timer.startedAt ? 'Restart clock' : 'Start clock'}
          </button>

          <p className="eyebrow mt-6">Client calls</p>
          <ul className="mt-2 space-y-2">
            {event.calls.map((c) => {
              const due = elapsed != null && elapsed >= c.releaseAt * 60_000 && !c.released;
              return (
                <li key={c.id} className="flex items-center justify-between gap-2">
                  <span className="text-sm">
                    {c.name} <span className={`font-mono text-xs ${due ? 'text-blood' : 'text-ash'}`}>· {due ? 'due now' : `${c.releaseAt} min`}</span>
                  </span>
                  <button className="btn px-3 py-1 text-sm" disabled={c.released} onClick={() => call(`/calls/${c.id}/release`, 'POST').then(refresh)}>
                    {c.released ? 'Released' : 'Release'}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="panel p-4">
          <div className="flex items-center justify-between">
            <p className="eyebrow">Judge</p>
            <span className="font-mono text-xs text-ash">{event.judgeRuns} runs</span>
          </div>
          <button className="btn btn-primary mt-3 w-full" disabled={judging} onClick={runJudge}>
            {judging ? 'Running the tests…' : 'Run judge tests'}
          </button>
          {lastJudge && (
            <div className="mt-3 font-mono text-xs">
              <p className="text-ash">
                {Object.keys(lastJudge.results).length} tags in {lastJudge.ms} ms · lifted: {lastJudge.lifted.join(', ') || 'none'}
              </p>
              <p className="mt-2 flex flex-wrap gap-1">
                {Object.entries(lastJudge.results).map(([id, pass]) => (
                  <span key={id} className={`rounded-sm px-1.5 py-0.5 ${pass ? 'bg-verdigris/20 text-verdigris' : 'bg-blood/20 text-blood'}`}>
                    {id}
                  </span>
                ))}
              </p>
            </div>
          )}
          <div className="mt-4">
            <CurseList curses={event.curses} />
          </div>
        </section>

        <section className="panel p-4">
          <p className="eyebrow">Leaderboard</p>
          {data.leaderboard.length === 0 && <p className="mt-3 text-sm text-ash">No runs yet. Runs appear here as soon as someone starts one.</p>}
          <ol className="mt-3 space-y-2">
            {data.leaderboard.map((r, i) => (
              <li key={r.code} className="flex items-baseline gap-3">
                <span className="w-5 font-mono text-sm text-ash">{i + 1}</span>
                <span className="font-mono text-bronze">{r.code}</span>
                <span className="min-w-0 flex-1 truncate text-sm">{r.players.filter((p) => !p.npc).map((p) => p.name).join(', ')}</span>
                <span className="font-mono text-lg">{r.score.total}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>

      {event.calls
        .filter((c) => c.released)
        .map((c) => (
          <section key={c.id} className="panel mt-6 border-bronze-dim p-5">
            <p className="eyebrow">Incoming call · {c.caller}</p>
            <h2 className="mt-1 font-display text-4xl text-bronze">{c.name}</h2>
            <div className="mt-4 grid gap-6 lg:grid-cols-[3fr_2fr]">
              <div className="space-y-3 text-lg leading-relaxed">
                {c.transcript.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
              <div>
                <p className="eyebrow mb-2">Done means</p>
                <ul className="list-disc space-y-1.5 pl-5 text-sm text-bone/85">
                  {c.acceptance.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        ))}

      <section className="panel mt-6 overflow-x-auto p-4">
        <p className="eyebrow mb-3">Room health</p>
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="font-mono text-[11px] text-ash uppercase">
            <tr>
              <th className="py-1 font-normal">Room</th>
              <th className="font-normal">Phase</th>
              <th className="font-normal">Stage</th>
              <th className="font-normal">Heroes</th>
              <th className="font-normal">Shards</th>
              <th className="font-normal">Retries</th>
            </tr>
          </thead>
          <tbody>
            {data.rooms.map((r) => (
              <tr key={r.code} className="border-t border-crypt-3 align-top">
                <td className="py-2 font-mono text-bronze">{r.code}</td>
                <td>{r.phase}</td>
                <td className="font-mono">{r.stage}</td>
                <td>
                  {r.players.map((p) => (
                    <span key={p.name} className={`mr-3 inline-block ${p.connected ? '' : 'text-ash/60'}`}>
                      {p.name} <span className="font-mono text-xs text-ash">{p.cls ?? '—'} {p.maxHp ? `${p.hp}/${p.maxHp}` : ''}</span>
                    </span>
                  ))}
                </td>
                <td className="font-mono">{r.shards}/5</td>
                <td className="font-mono">{r.retries}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
