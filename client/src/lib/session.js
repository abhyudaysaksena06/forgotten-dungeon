// The reconnect token lives in this browser only. Storage can be unavailable (private mode), so
// every access is guarded and the game still works for the current tab.
const KEY = 'forgotten-dungeon.session';
let memory = null;

export function loadSession() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : memory;
  } catch {
    return memory;
  }
}

export function saveSession(session) {
  memory = session;
  try {
    localStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    // Not persisted; a refresh will need the room code again.
  }
}

export function clearSession() {
  memory = null;
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}
