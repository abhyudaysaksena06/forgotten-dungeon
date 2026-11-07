import { useState } from 'react';
import { normalizeRoomCode } from '../lib/roomCode.js';
import { api } from '../net.js';

const ROUND = [
  'The Dungeon Master describes the room.',
  'Your three companions say what they would do. Your vote counts double.',
  'The server rolls a d20 for the best-suited hero.',
  'HP, items and enemies change. Only the server can change them.',
  'The Dungeon Master tells you what happened.',
];

export default function Landing({ onEnter, notice }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  async function start(e) {
    e.preventDefault();
    setError(null);
    setBusy('start');
    try {
      const res = await api('/api/rooms', { method: 'POST', body: { name } });
      onEnter({ code: res.code, token: res.token, playerId: res.playerId, name });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  function watch(e) {
    e.preventDefault();
    onEnter({ code: normalizeRoomCode(code), spectate: true });
  }

  return (
    <main className="mx-auto grid min-h-dvh max-w-5xl content-center gap-12 px-4 py-12 md:grid-cols-[1.15fr_1fr] md:gap-16 md:px-8">
      <section>
        <p className="eyebrow mb-4">One hero · three AI companions · 3 stages · 1 king</p>
        <h1 className="font-display text-6xl leading-[0.95] text-bone sm:text-7xl md:text-8xl">
          The Forgotten
          <br />
          <span className="text-bronze">Dungeon</span>
        </h1>
        <p className="mt-6 max-w-md text-lg leading-relaxed text-bone/80">
          An AI Dungeon Master tells the story. The server rolls every die. Lead three companions through the Broken Gate and the Ashen
          Library to the King who forgot his own name.
        </p>
        <ol className="mt-10 max-w-md space-y-2 border-l border-crypt-4 pl-5">
          {ROUND.map((step, i) => (
            <li key={step} className="flex gap-3 text-sm text-ash">
              <span className="font-mono text-bronze">{i + 1}</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="space-y-6 self-center">
        {notice && <p className="rounded border border-blood/60 bg-blood/10 px-3 py-2 text-sm">{notice}</p>}
        <form className="panel p-5" onSubmit={start}>
          <h2 className="font-display text-2xl text-bronze">Start a run</h2>
          <label className="mt-3 block">
            <span className="eyebrow">Hero name</span>
            <input
              className="field mt-1.5 text-lg"
              value={name}
              maxLength={16}
              autoFocus
              placeholder="One word, e.g. Mirelle"
              onChange={(e) => setName(e.target.value.replace(/\s/g, ''))}
            />
          </label>
          <button className="btn btn-primary mt-4 w-full" disabled={!name || busy}>
            {busy ? 'Opening the gate…' : 'Start a run'}
          </button>
        </form>

        <form className="panel p-5" onSubmit={watch}>
          <h2 className="font-display text-2xl text-bronze">Watch a run</h2>
          <p className="mt-1 text-sm text-ash">Spectate someone's run with its code. You can see the chronicle but not act.</p>
          <label className="mt-3 block">
            <span className="eyebrow">Run code</span>
            <input
              className="field mt-1.5 font-mono text-xl tracking-[0.3em] uppercase"
              value={code}
              placeholder="ABC23"
              autoComplete="off"
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
          <button className="btn mt-4 w-full" disabled={!normalizeRoomCode(code)}>
            Watch run
          </button>
        </form>
        {error && (
          <p role="alert" className="text-sm text-blood">
            {error}
          </p>
        )}
        <a href="#/admin" className="block text-right font-mono text-xs text-ash/60 hover:text-ash">
          Organiser dashboard →
        </a>
      </section>
    </main>
  );
}
