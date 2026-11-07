import { GameError } from './engine/errors.js';
import { errorReply } from './http.js';
import { normalizeRoomCode } from './rooms/roomCode.js';

// Each socket is bound at handshake to one seat by its token, or to a read-only spectator view.
// Actions never name a room or player themselves, so nobody can act anywhere but their own seat.
export function attachSockets(io, { manager, control }) {
  io.use((socket, next) => {
    const { code, token, spectate } = socket.handshake.auth ?? {};
    if (spectate === true) {
      if (!manager.exists(code)) return next(new Error('room_not_found'));
      socket.data = { code: normalizeRoomCode(code), playerId: null, spectator: true };
      return next();
    }
    const auth = manager.authenticate(code, token);
    if (!auth) return next(new Error('not_member'));
    socket.data = { ...auth, spectator: false };
    next();
  });

  io.on('connection', async (socket) => {
    const { code, playerId, spectator } = socket.data;
    socket.join(`room:${code}`);
    socket.emit('state', manager.view(code));
    socket.emit('event', control.publicInfo());

    const refuse = (ack) => ack?.(errorReply(new GameError('spectator', 'You are watching this run; only its hero can act.')));
    if (spectator) {
      socket.on('action', (msg, ack) => refuse(ack));
      socket.on('chat', (msg, ack) => refuse(ack));
      return;
    }

    const self = `player:${code}:${playerId}`;
    socket.join(self);
    await manager.setConnected(code, playerId, true).catch(() => {});

    socket.on('action', async (msg, ack) => {
      try {
        const result = await manager.perform(code, playerId, msg ?? {});
        ack?.({ ok: true, result });
      } catch (err) {
        ack?.(errorReply(err));
      }
    });

    socket.on('chat', async (msg, ack) => {
      try {
        const out = await manager.chat(code, playerId, msg?.text);
        // #region C2 whisper-delivery
        if (out?.kind === 'whisper') {
          // Only the sender and the recipient. Not the room, not spectators, not the log, not the DM.
          for (const w of [out, ...out.replies]) {
            io.to(`player:${code}:${w.fromId}`).to(`player:${code}:${w.toId}`).emit('whisper', { ...w, replies: undefined });
          }
        }
        // #endregion C2
        ack?.({ ok: true });
      } catch (err) {
        ack?.(errorReply(err));
      }
    });

    socket.on('disconnect', async () => {
      const remaining = await io.in(self).fetchSockets();
      if (remaining.length === 0) await manager.setConnected(code, playerId, false).catch(() => {});
    });
  });
}
