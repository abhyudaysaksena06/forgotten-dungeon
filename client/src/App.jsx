import { useEffect, useState } from 'react';
import { clearSession, loadSession, saveSession } from './lib/session.js';
import { api, loadMeta } from './net.js';
import Admin from './screens/Admin.jsx';
import Game from './screens/Game.jsx';
import Landing from './screens/Landing.jsx';
import QuestApp from './quest/QuestApp.jsx';

function useHash() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const on = () => setHash(window.location.hash);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash;
}

// #/admin: organiser dashboard · #/legacy: the earlier voting-round game · default: the Quest.
export default function App() {
  const hash = useHash();
  if (hash.startsWith('#/admin')) return <Admin />;
  if (hash.startsWith('#/legacy')) return <LegacyApp />;
  return <QuestApp />;
}

function LegacyApp() {
  const [session, setSession] = useState(() => loadSession());
  const [resumed, setResumed] = useState(false);
  const [meta, setMeta] = useState(null);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    loadMeta().then(setMeta, () => setNotice('Cannot reach the game server. Is it running on port 3001?'));
  }, []);

  const enter = (s) => {
    saveSession(s);
    setSession(s);
    setResumed(true);
    setNotice(null);
  };
  const leave = (message) => {
    clearSession();
    setSession(null);
    setResumed(false);
    setNotice(message ?? null);
  };

  // After a refresh, the saved token re-claims the same hero (it never creates a second one).
  useEffect(() => {
    if (!session || resumed) return;
    if (session.spectate) return setResumed(true);
    api('/api/rooms/join', { method: 'POST', body: { code: session.code, token: session.token, name: session.name } }).then(
      () => setResumed(true),
      (err) => leave(err.message),
    );
  }, [session, resumed]);

  if (!session) return <Landing onEnter={enter} notice={notice} />;
  if (!meta || !resumed) return <div className="grid min-h-dvh place-items-center font-mono text-sm text-ash">{notice ?? 'Lighting the torches…'}</div>;
  return <Game session={session} meta={meta} onLeave={leave} />;
}
