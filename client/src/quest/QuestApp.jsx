import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { clearQuestSession, loadQuestSession, questApi, saveQuestSession } from './api.js';

// The game (and the whole 3D engine with it) loads as its own file, so the title page shows at
// once instead of waiting a megabyte. It is fetched quietly while the title is read, and the
// loading screen ("Lighting the torches…") covers the rest.
const loadGame = () => import('./QuestGame.jsx');
const QuestGame = lazy(loadGame);

export default function QuestApp() {
  const [session, setSession] = useState(() => loadQuestSession());
  const [notice, setNotice] = useState(null);

  const leave = useCallback((message) => {
    clearQuestSession();
    setSession(null);
    setNotice(message ?? null);
  }, []);

  useEffect(() => {
    const idle = window.requestIdleCallback ?? ((f) => setTimeout(f, 300));
    idle(() => loadGame());
  }, []);

  if (session)
    return (
      <Suspense fallback={<div aria-busy="true" style={{ position: 'fixed', inset: 0, background: '#161922' }} />}>
        <QuestGame session={session} onLeave={leave} />
      </Suspense>
    );
  return (
    <TeamLogin
      notice={notice}
      onEnter={(s) => {
        saveQuestSession(s);
        setNotice(null);
        setSession(s);
      }}
    />
  );
}

function TeamLogin({ notice, onEnter }) {
  const [teams, setTeams] = useState(null);
  const [teamId, setTeamId] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    questApi('/teams')
      .then((r) => {
        setTeams(r.teams);
        if (r.teams.length === 1) setTeamId(r.teams[0].id);
      })
      .catch(() => setError('Cannot reach the game server. Start it with: npm run dev'));
  }, []);

  const team = teams?.find((t) => t.id === teamId);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await questApi(`/${encodeURIComponent(teamId)}/session`, { method: 'POST', code: code.trim().toUpperCase() });
      onEnter({ teamId, code: code.trim().toUpperCase() });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto grid min-h-dvh max-w-5xl content-center gap-12 px-4 py-12 md:grid-cols-[1.2fr_1fr] md:px-8">
      <section>
        <p className="eyebrow mb-4">The Forgotten Dungeon · Round 2</p>
        <h1 className="font-display text-6xl leading-[0.95] sm:text-7xl md:text-8xl">
          The Shattered
          <br />
          <span className="text-bronze">Heart</span>
        </h1>
        <p className="mt-6 max-w-md text-lg leading-relaxed text-bone/80">
          The Heart of Eternity broke into five pieces, and Eldermoor sank beneath the earth. Kael goes alone, with his Iron Sword and his
          shield, through four rounds of the dungeon to Morvath, the Shadow Dragon, on the Throne of Eternity. In every room a Healer and a
          Weaponsmith wait in a cage that opens when its skeletons fall. Every corridor costs a torch.
        </p>
        <p className="mt-4 max-w-md text-sm text-ash">
          You are a Runewright: the dungeon runs on runes, and the runes are written wrong. If the quest becomes impossible, the fault may
          be a broken rune in the code. Find it, fix it, and carry on: your progress is saved after every move.
        </p>
      </section>

      <form className="panel space-y-4 self-center p-6" onSubmit={submit}>
        <h2 className="font-display text-3xl text-bronze">Begin your quest</h2>
        {notice && <p className="rounded border border-blood/60 bg-blood/10 px-3 py-2 text-sm">{notice}</p>}
        <label className="block">
          <span className="eyebrow">Team</span>
          <select className="field mt-1.5" value={teamId} onChange={(e) => setTeamId(e.target.value)} disabled={!teams}>
            <option value="" disabled>
              {teams ? 'Choose your team' : 'Loading…'}
            </option>
            {teams?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        {team?.needsCode && (
          <label className="block">
            <span className="eyebrow">Team code</span>
            <input className="field mt-1.5 font-mono tracking-[0.3em] uppercase" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" />
          </label>
        )}
        {error && (
          <p role="alert" className="text-sm text-blood">
            {error}
          </p>
        )}
        <button className="btn btn-primary w-full" disabled={!teamId || busy || (team?.needsCode && !code.trim())}>
          {busy ? 'Opening the gate…' : 'Enter the dungeon'}
        </button>
      </form>
    </main>
  );
}
