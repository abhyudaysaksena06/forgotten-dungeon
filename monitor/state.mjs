// Dashboard state: folds agent reports ("beats") into one record per team and a timeline of events.
// Pure functions, so the dashboard can rebuild everything by replaying its log after a restart.

export const OFFLINE_AFTER_MS = 2 * 60 * 1000;
const MAX_EVENTS_PER_TEAM = 300;
/** Lines added in one commit, or to uncommitted work between two reports, that count as a big change. */
export const BIG_CHANGE_LINES = 150;

/**
 * `agentHash`: the fingerprint of the organiser's copy of the agent; a different one means a team
 * edited theirs. `venueNetwork`: start of the venue Wi-Fi addresses (e.g. "192.168.10."); a computer
 * with an address outside it is flagged.
 */
export function createState(expectedTeams = [], { agentHash = null, venueNetwork = null, bigChange = BIG_CHANGE_LINES } = {}) {
  const state = { teams: new Map(), config: { agentHash, venueNetwork, bigChange } };
  for (const id of expectedTeams) team(state, id);
  return state;
}

function team(state, id) {
  if (!state.teams.has(id)) {
    state.teams.set(id, { id, hosts: new Map(), events: [], everFlagged: new Set(), firstSeen: null, lastSeen: null });
  }
  return state.teams.get(id);
}

/** Tools in a report that are not allowed, as short labels. `running` hits are worse than `installed` ones. */
/** Network problems in a report: more than one network, or one outside the venue's. */
export function networkFlags(report, venueNetwork = null) {
  const nets = report.networks ?? [];
  const out = [];
  if (nets.length > 1) out.push(`Connected to ${nets.length} networks (${nets.map((n) => n.name).join(', ')}): possible hotspot`);
  if (venueNetwork) {
    const outside = nets.filter((n) => !n.address.startsWith(venueNetwork));
    if (outside.length) out.push(`Not on venue Wi-Fi: ${outside.map((n) => `${n.name} ${n.address}`).join(', ')}`);
  }
  return out;
}

export function flagsOf(report) {
  const running = (report.processes ?? []).filter((p) => !p.allowed).map((p) => p.tool);
  const installed = (report.extensions ?? []).filter((e) => !e.allowed).map((e) => `${e.tool} (${e.editor} extension)`);
  const editors = (report.aiEditorsInstalled ?? []).map((e) => `${e} (AI editor installed)`);
  return { running: [...new Set(running)].sort(), installed: [...new Set([...installed, ...editors])].sort() };
}

function push(t, event) {
  t.events.push(event);
  if (t.events.length > MAX_EVENTS_PER_TEAM) t.events.splice(0, t.events.length - MAX_EVENTS_PER_TEAM);
}

/** Applies one report received at `now` (ms). Returns the events it produced. */
export function applyBeat(state, report, now) {
  const t = team(state, report.team);
  const hostId = String(report.host ?? 'unknown');
  const prev = t.hosts.get(hostId);
  const flags = flagsOf(report);
  const at = new Date(now).toISOString();
  const out = [];
  const add = (kind, text) => {
    const e = { at, host: hostId, kind, text };
    out.push(e);
    push(t, e);
  };

  if (!prev) add('info', `Monitor started on ${hostId} (${report.os ?? '?'})`);
  else if (now - prev.receivedAt > OFFLINE_AFTER_MS) add('warn', `Back online after ${Math.round((now - prev.receivedAt) / 60000)} min offline`);
  else if (prev.report.startedAt !== report.startedAt) add('warn', 'Monitor was restarted');

  const before = prev ? flagsOf(prev.report) : { running: [], installed: [] };
  for (const tool of flags.running.filter((x) => !before.running.includes(x))) add('alert', `Running: ${tool}`);
  for (const tool of before.running.filter((x) => !flags.running.includes(x))) add('info', `Closed: ${tool}`);
  for (const tool of flags.installed.filter((x) => !before.installed.includes(x))) add('warn', `Installed: ${tool}`);
  if (report.processScanOk === false && prev?.report.processScanOk !== false) add('warn', 'Could not read running programs on this computer');

  const { agentHash, venueNetwork, bigChange } = state.config;
  const tampered = Boolean(agentHash && report.agentHash !== agentHash);
  if (tampered && (!prev || prev.report.agentHash !== report.agentHash)) add('alert', 'Monitor code differs from the organiser copy (edited or old version)');
  const nets = networkFlags(report, venueNetwork);
  const prevNets = prev ? networkFlags(prev.report, venueNetwork) : [];
  for (const text of nets.filter((x) => !prevNets.includes(x))) add('warn', text);

  const g = report.git ?? {};
  const pg = prev?.report.git ?? {};
  if (g.repo && pg.repo && g.commits > pg.commits && g.lastCommit) {
    const size = g.lastCommit.added != null ? ` (+${g.lastCommit.added} −${g.lastCommit.removed})` : '';
    add('commit', `Commit ${g.lastCommit.hash}${size}: ${g.lastCommit.message}`);
    if (g.lastCommit.added >= bigChange) add('warn', `Big commit: ${g.lastCommit.added} lines added at once`);
  }
  // Uncommitted work that grew by a lot within one report interval (about 30 s) looks like a paste.
  const grew = (g.uncommitted?.added ?? 0) - (pg.uncommitted?.added ?? 0);
  if (prev && g.repo && pg.repo && g.commits === pg.commits && grew >= bigChange) add('warn', `${grew} lines added in ${Math.round((now - prev.receivedAt) / 1000)} s (possible paste)`);
  if (g.repo && pg.repo && g.commits < pg.commits) add('warn', `Commit count went down (${pg.commits} → ${g.commits})`);

  for (const tool of flags.running) t.everFlagged.add(tool);
  t.hosts.set(hostId, { report, receivedAt: now, flags, tampered, nets });
  t.firstSeen ??= now;
  t.lastSeen = now;
  return out;
}

/** Marks hosts that stopped reporting. Call on a timer; returns new offline events. */
export function sweep(state, now) {
  const out = [];
  for (const t of state.teams.values()) {
    for (const [hostId, h] of t.hosts) {
      if (h.offlineNoted || now - h.receivedAt <= OFFLINE_AFTER_MS) continue;
      h.offlineNoted = true;
      const e = { at: new Date(now).toISOString(), host: hostId, kind: 'warn', text: 'Went offline (monitor stopped or lost network)' };
      push(t, e);
      out.push(e);
    }
  }
  return out;
}

/** JSON-friendly view for the dashboard page. */
export function snapshot(state, now) {
  const teams = [...state.teams.values()]
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
    .map((t) => {
      const hosts = [...t.hosts.entries()].map(([host, h]) => {
        const g = h.report.git ?? {};
        return {
          host,
          os: h.report.os,
          online: now - h.receivedAt <= OFFLINE_AFTER_MS,
          lastSeenSec: Math.round((now - h.receivedAt) / 1000),
          running: [...h.flags.running, ...(h.tampered ? ['Edited monitor'] : [])],
          network: h.nets,
          networks: h.report.networks ?? [],
          installed: h.flags.installed,
          allowedSeen: [...(h.report.processes ?? []), ...(h.report.extensions ?? [])].filter((x) => x.allowed).map((x) => x.tool),
          git: g.repo ? { commits: g.commits, lastCommit: g.lastCommit, changedCount: g.changedCount, changedFiles: g.changedFiles, uncommitted: g.uncommitted } : null,
        };
      });
      let status = 'ok';
      if (!hosts.length) status = 'never';
      else if (hosts.some((h) => h.online && h.running.length)) status = 'alert';
      else if (hosts.some((h) => !h.online || h.installed.length || h.network.length)) status = 'warn';
      const bigChanges = t.events.filter((e) => /^Big commit|possible paste\)$/.test(e.text)).length;
      return { id: t.id, status, hosts, everFlagged: [...t.everFlagged].sort(), bigChanges, events: t.events.slice(-60).reverse() };
    });
  return { now: new Date(now).toISOString(), teams };
}
