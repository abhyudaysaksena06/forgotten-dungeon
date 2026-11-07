// Talks to the Quest API (server/src/quest/routes.js). The server owns every number; this file
// only sends inputs and receives the new state.
const KEY = 'forgotten-dungeon.quest';

export function loadQuestSession() {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? 'null');
  } catch {
    return null;
  }
}

export function saveQuestSession(session) {
  try {
    localStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    // Not persisted: the player picks the team again after a refresh.
  }
}

export function clearQuestSession() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}

// The hosted build (Vercel, VITE_HOSTED=1) has a stateless server: this browser keeps each team's
// list of inputs and sends it with every request; the server replays it on the real engine and
// returns the new list. The local server keeps runs itself, so nothing changes there.
const HOSTED = import.meta.env.VITE_HOSTED === '1';
const actionsKey = (teamId) => `${KEY}.actions.${teamId}`;

function loadActions(teamId) {
  try {
    const list = JSON.parse(localStorage.getItem(actionsKey(teamId)) ?? '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function storeActions(teamId, actions) {
  try {
    localStorage.setItem(actionsKey(teamId), JSON.stringify(actions));
  } catch {
    // Not persisted: a refresh starts the run over.
  }
}

export async function questApi(path, options = {}) {
  const run = HOSTED && path.match(/^\/([^/]+)\/(session|act|reset|save)$/);
  if (!run) return request(path, options);
  const teamId = decodeURIComponent(run[1]);
  const data = await request(path, { ...options, method: 'POST', body: { ...options.body, actions: loadActions(teamId) } });
  if (Array.isArray(data.actions)) storeActions(teamId, data.actions);
  return data;
}

async function request(path, { method = 'GET', body, code } = {}) {
  const res = await fetch(`/api/quest${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(code ? { 'x-team-code': code } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({ ok: false, error: { message: `Server replied ${res.status}.` } }));
  if (data.ok === false) throw Object.assign(new Error(data.error?.message ?? 'Request failed.'), { code: data.error?.code });
  return data;
}

let metaPromise;
export function loadQuestMeta() {
  metaPromise ??= questApi('/meta');
  return metaPromise;
}

// Which Blender models have been dropped into client/public/models/ (see the README there).
let manifestPromise;
export function loadModelManifest() {
  manifestPromise ??= fetch('/models/manifest.json')
    .then((r) => (r.ok ? r.json() : []))
    // Each entry is a model key, or { key, turn, height } for a model that needs turning or sizing.
    .then((list) => new Map((Array.isArray(list) ? list : []).map((e) => (typeof e === 'string' ? [e, {}] : [e.key, e]))))
    .catch(() => new Map());
  return manifestPromise;
}
