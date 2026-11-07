import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { newActionId } from './lib/actions.js';
import { play } from './sfx.js';

const ACK_TIMEOUT_MS = 5000;

// One socket per seat. The server decides everything; this hook only mirrors its state.
export function useRoom(session, onKicked) {
  const [state, setState] = useState(null);
  const [event, setEvent] = useState(null);
  const [whispers, setWhispers] = useState([]);
  const [banners, setBanners] = useState([]);
  const [toast, setToast] = useState(null);
  const [online, setOnline] = useState(false);
  const socketRef = useRef(null);
  const offsetRef = useRef(0);
  const lastRollKey = useRef('');

  useEffect(() => {
    if (!session) return;
    const auth = session.spectate ? { code: session.code, spectate: true } : { code: session.code, token: session.token };
    const socket = io({ auth, transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => setOnline(true));
    socket.on('disconnect', () => setOnline(false));
    socket.on('connect_error', (err) => {
      if (err.message === 'not_member') onKicked?.('That run no longer exists — the server may have restarted. Start a new run.');
      if (err.message === 'room_not_found') onKicked?.('No run with that code. Check the code and try again.');
    });
    socket.on('state', (next) => {
      offsetRef.current = next.serverNow - Date.now();
      const key = JSON.stringify(next.lastRolls?.map((r) => [r.label, r.value]));
      if (next.lastRolls?.length && key !== lastRollKey.current) {
        const outcomes = next.lastRolls.map((r) => r.outcome);
        play(outcomes.some((o) => o === 'critical' || o === 'critical_success') ? 'crit' : outcomes.some((o) => o === 'fail' || o === 'critical_fail') ? 'fail' : 'roll');
      }
      lastRollKey.current = key;
      setState(next);
    });
    socket.on('event', setEvent);
    // #region C2 whisper-listener
    socket.on('whisper', (w) => setWhispers((list) => [...list.slice(-49), w]));
    // #endregion C2
    socket.on('banner', (b) => {
      play('chime');
      const id = Math.random();
      setBanners((list) => [...list, { ...b, id }]);
      setTimeout(() => setBanners((list) => list.filter((x) => x.id !== id)), 4600);
    });
    return () => socket.close();
  }, [session?.code, session?.token]);

  const showError = useCallback((message) => {
    setToast({ message, id: Math.random() });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // Sends an intent. `key` names the intent (e.g. "this potion", "my action this round") and is
  // used as the idempotency key, so a double-click or a lost-ack retry is recognised by the server
  // instead of running twice.
  const act = useCallback(
    (type, payload = {}, key) =>
      new Promise((resolve) => {
        const socket = socketRef.current;
        if (!socket) return resolve({ ok: false });
        const message = { actionId: key ?? newActionId(), type, payload };
        const handle = (reply) => {
          if (!reply.ok) showError(reply.error?.message ?? 'That did not work.');
          resolve(reply);
        };
        socket.timeout(ACK_TIMEOUT_MS).emit('action', message, (err, reply) => {
          if (!err) return handle(reply);
          socket.timeout(ACK_TIMEOUT_MS).emit('action', message, (err2, reply2) =>
            handle(err2 ? { ok: false, error: { message: 'The server did not answer. Check your connection.' } } : reply2),
          );
        });
      }),
    [showError],
  );

  const say = useCallback(
    (text) =>
      new Promise((resolve) => {
        socketRef.current?.emit('chat', { text }, (reply) => {
          if (!reply?.ok) showError(reply?.error?.message ?? 'Message not sent.');
          resolve(reply);
        });
      }),
    [showError],
  );

  const serverNow = useCallback(() => Date.now() + offsetRef.current, []);

  return { state, event, whispers, banners, toast, online, act, say, serverNow };
}

export function useNow(intervalMs = 250) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
