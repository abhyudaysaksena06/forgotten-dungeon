// In-memory persistence with the same shape as the Postgres tables in schema.sql.
// Swap for a Supabase/Postgres store at deploy time; the RoomManager only uses these methods.
export class MemoryStore {
  rooms = new Map(); // code -> snapshot
  actions = new Map(); // `${code}:${actionId}` -> row
  events = []; // { roomCode, entry }
  scores = new Map(); // code -> score

  async saveRoom(code, snapshot) {
    this.rooms.set(code, structuredClone(snapshot));
  }

  async loadRoom(code) {
    const snap = this.rooms.get(code);
    return snap ? structuredClone(snap) : null;
  }

  // Mirrors the unique (room_code, idempotency_key) constraint. Returns false on a duplicate.
  async recordAction(code, actionId, row) {
    const key = `${code}:${actionId}`;
    if (this.actions.has(key)) return false;
    this.actions.set(key, { ...row, createdAt: Date.now() });
    return true;
  }

  async appendEvents(code, entries) {
    for (const entry of entries) this.events.push({ roomCode: code, entry });
    if (this.events.length > 20_000) this.events.splice(0, this.events.length - 20_000);
  }

  async saveScore(code, score) {
    this.scores.set(code, score);
  }
}
