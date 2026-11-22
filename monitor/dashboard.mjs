#!/usr/bin/env node
// Organiser dashboard for the event monitor. Run it on the organiser laptop, on the venue network:
//
//   node monitor/dashboard.mjs --teams 12
//
// It prints two keys. Give teams the EVENT KEY (they pass it to the agent). Keep the VIEW KEY for
// organisers: the dashboard page is http://<this-ip>:4545/?view=<view key>.
// Reports are appended to monitor-data/beats.jsonl and replayed on restart. No dependencies.
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { agentHash } from './agent.mjs';
import { applyBeat, createState, snapshot, sweep } from './state.mjs';

const MAX_BODY = 64 * 1024;

function parseArgs(argv) {
  const opts = { port: 4545, data: resolve('monitor-data') };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--port') opts.port = Number(next());
    else if (a === '--teams') opts.teams = next();
    else if (a === '--key') opts.key = next();
    else if (a === '--view-key') opts.viewKey = next();
    else if (a === '--data') opts.data = resolve(next());
    else if (a === '--venue') opts.venue = next();
    else throw new Error(`Unknown option ${a}`);
  }
  opts.key ??= process.env.MONITOR_KEY ?? randomBytes(4).toString('hex');
  opts.viewKey ??= process.env.MONITOR_VIEW_KEY ?? randomBytes(12).toString('hex');
  return opts;
}

export function expectedTeams(spec) {
  if (!spec) return [];
  if (/^\d+$/.test(spec)) return Array.from({ length: Number(spec) }, (_, i) => `team${String(i + 1).padStart(2, '0')}`);
  return spec.split(',').map((s) => s.trim()).filter(Boolean);
}

const same = (a, b) => {
  const x = Buffer.from(String(a ?? ''));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
};

/** Keeps only the fields the dashboard uses, with sane sizes, so a bad agent can't bloat the log. */
export function cleanReport(r) {
  const str = (v, n = 120) => (typeof v === 'string' ? v.slice(0, n) : undefined);
  const list = (v, n = 50) => (Array.isArray(v) ? v.slice(0, n) : []);
  const tool = (x) => ({ tool: str(x?.tool, 80) ?? '?', allowed: x?.allowed === true, ...(x?.editor ? { editor: str(x.editor, 40) } : {}), ...(x?.id ? { id: str(x.id, 80) } : {}) });
  const g = r.git ?? {};
  const lines = (x) => (x ? { added: Number(x.added) || 0, removed: Number(x.removed) || 0 } : undefined);
  return {
    team: str(r.team, 32),
    host: str(r.host, 64) ?? 'unknown',
    os: str(r.os, 16),
    startedAt: str(r.startedAt, 40),
    agentHash: str(r.agentHash, 64),
    networks: list(r.networks, 8).map((n) => ({ name: str(n?.name, 40) ?? '?', address: str(n?.address, 40) ?? '' })),
    processScanOk: r.processScanOk !== false,
    processes: list(r.processes).map(tool),
    extensions: list(r.extensions).map(tool),
    aiEditorsInstalled: list(r.aiEditorsInstalled, 10).map((e) => str(e, 40)).filter(Boolean),
    git: g.repo
      ? {
          repo: true,
          commits: Number(g.commits) || 0,
          lastCommit: g.lastCommit ? { hash: str(g.lastCommit.hash, 12), at: str(g.lastCommit.at, 40), message: str(g.lastCommit.message), ...lines(g.lastCommit) } : null,
          uncommitted: lines(g.uncommitted),
          changedFiles: list(g.changedFiles, 40).map((f) => str(f, 200)).filter(Boolean),
          changedCount: Number(g.changedCount) || 0,
        }
      : { repo: false },
  };
}

export function createDashboard({ key, viewKey, teams = [], dataDir = null, clock = Date.now, venueNetwork = null, expectedHash = agentHash() }) {
  const state = createState(teams, { agentHash: expectedHash, venueNetwork });
  const log = dataDir ? join(dataDir, 'beats.jsonl') : null;
  if (log) {
    mkdirSync(dataDir, { recursive: true });
    if (existsSync(log)) {
      for (const line of readFileSync(log, 'utf8').split('\n')) {
        if (!line) continue;
        try {
          const { at, report } = JSON.parse(line);
          applyBeat(state, report, at);
        } catch {
          // a half-written last line after a crash: skip it
        }
      }
    }
  }

  const send = (res, code, body, type = 'application/json') => {
    res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
    res.end(type === 'application/json' ? JSON.stringify(body) : body);
  };

  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (req.method === 'POST' && url.pathname === '/beat') {
      if (!same(req.headers['x-monitor-key'], key)) return send(res, 401, { ok: false, error: 'bad key' });
      let size = 0;
      const chunks = [];
      req.on('data', (c) => {
        size += c.length;
        if (size > MAX_BODY) req.destroy();
        else chunks.push(c);
      });
      req.on('end', () => {
        let report;
        try {
          report = cleanReport(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch {
          return send(res, 400, { ok: false, error: 'bad json' });
        }
        if (!report.team || !/^[\w-]{1,32}$/.test(report.team)) return send(res, 400, { ok: false, error: 'bad team' });
        const at = clock();
        if (log) appendFileSync(log, `${JSON.stringify({ at, ip: req.socket.remoteAddress, report })}\n`);
        for (const e of applyBeat(state, report, at)) if (e.kind === 'alert') console.log(`  ALERT ${report.team} @ ${e.host}: ${e.text}`);
        send(res, 200, { ok: true });
      });
      return;
    }
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/state')) {
      if (!same(url.searchParams.get('view'), viewKey)) return send(res, 401, 'Add ?view=<view key> to the address.', 'text/plain');
      if (url.pathname === '/state') return send(res, 200, snapshot(state, clock()));
      return send(res, 200, PAGE, 'text/html; charset=utf-8');
    }
    send(res, 404, { ok: false });
  });

  const timer = setInterval(() => sweep(state, clock()), 15000);
  timer.unref();
  server.on('close', () => clearInterval(timer));
  return { server, state };
}

const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Event monitor</title><style>
:root{--bg:#f6f7f9;--card:#fff;--ink:#1d2330;--mute:#6b7280;--line:#e5e7eb;--ok:#15803d;--warn:#b45309;--alert:#b91c1c;--never:#6b7280}
@media (prefers-color-scheme:dark){:root{--bg:#111418;--card:#1a1f26;--ink:#e6e9ee;--mute:#9aa3af;--line:#2a313b;--ok:#4ade80;--warn:#fbbf24;--alert:#f87171;--never:#9aa3af}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.45 system-ui,sans-serif;padding:16px}
h1{font-size:18px;margin:0 0 4px}.sub{color:var(--mute);margin-bottom:16px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px;align-items:start}
.card{background:var(--card);border:1px solid var(--line);border-left:5px solid var(--never);border-radius:8px;padding:12px}
.card.ok{border-left-color:var(--ok)}.card.warn{border-left-color:var(--warn)}.card.alert{border-left-color:var(--alert)}
.head{display:flex;justify-content:space-between;align-items:baseline}.id{font-weight:700;font-size:16px}
.badge{font-size:12px;font-weight:600;text-transform:uppercase}.ok .badge{color:var(--ok)}.warn .badge{color:var(--warn)}.alert .badge{color:var(--alert)}.never .badge{color:var(--never)}
.host{margin-top:8px;padding-top:8px;border-top:1px dashed var(--line)}.mute{color:var(--mute)}
.bad{color:var(--alert);font-weight:600}.amber{color:var(--warn)}
details{margin-top:8px}summary{cursor:pointer;color:var(--mute)}ul{margin:4px 0;padding-left:18px}
.ev{font-size:12px}.ev .t{color:var(--mute)}.ev.alert{color:var(--alert)}.ev.warn{color:var(--warn)}
</style></head><body><h1>Event monitor</h1><div class="sub" id="sub">Loading…</div><div class="grid" id="grid"></div>
<script>
const view=new URLSearchParams(location.search).get('view');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const label={ok:'Gemini only',warn:'Check',alert:'Other AI running',never:'Not connected'};
const ago=s=>s<60?s+'s ago':Math.round(s/60)+' min ago';
function host(h){const g=h.git;return '<div class="host"><div><b>'+esc(h.host)+'</b> <span class="mute">'+esc(h.os)+' · '+(h.online?'online, ':'<span class=amber>OFFLINE</span>, ')+ago(h.lastSeenSec)+'</span></div>'+
(h.running.length?'<div class="bad">Running: '+h.running.map(esc).join(', ')+'</div>':'')+
(h.installed.length?'<div class="amber">Installed: '+h.installed.map(esc).join(', ')+'</div>':'')+
(h.network.length?h.network.map(n=>'<div class="amber">'+esc(n)+'</div>').join(''):'')+
'<div class="mute">Network: '+(h.networks.map(n=>esc(n.name+' '+n.address)).join(', ')||'none')+'</div>'+
(h.allowedSeen.length?'<div class="mute">Allowed: '+[...new Set(h.allowedSeen)].map(esc).join(', ')+'</div>':'')+
(g?'<div>'+g.commits+' commits'+(g.lastCommit?' · last: <span class="mute">'+esc(g.lastCommit.message)+'</span>':'')+' · '+g.changedCount+' changed files'+(g.uncommitted?' (+'+g.uncommitted.added+' −'+g.uncommitted.removed+' lines)':'')+'</div>'+
(g.changedFiles.length?'<details><summary>Changed files</summary><ul>'+g.changedFiles.map(f=>'<li>'+esc(f)+'</li>').join('')+'</ul></details>':''):'<div class="mute">No git repo in the game folder</div>')+'</div>'}
function card(t){return '<div class="card '+t.status+'"><div class="head"><span class="id">'+esc(t.id)+'</span><span class="badge">'+label[t.status]+'</span></div>'+
(t.everFlagged.length?'<div class="bad" style="margin-top:4px">Seen during the round: '+t.everFlagged.map(esc).join(', ')+'</div>':'')+
(t.bigChanges?'<div class="amber">Big changes or pastes: '+t.bigChanges+' (see timeline)</div>':'')+
t.hosts.map(host).join('')+
(t.events.length?'<details><summary>Timeline ('+t.events.length+')</summary>'+t.events.map(e=>'<div class="ev '+e.kind+'"><span class="t">'+new Date(e.at).toLocaleTimeString()+' '+esc(e.host)+'</span> '+esc(e.text)+'</div>').join('')+'</details>':'')+'</div>'}
const open=new Set();
async function tick(){try{const r=await fetch('/state?view='+encodeURIComponent(view));const s=await r.json();
open.clear();document.querySelectorAll('details[open]').forEach(d=>open.add(d.dataset.k));
const c={};s.teams.forEach(t=>c[t.status]=(c[t.status]||0)+1);
document.getElementById('sub').textContent=s.teams.length+' teams · '+(c.alert||0)+' other AI · '+(c.warn||0)+' check · '+(c.ok||0)+' Gemini only · '+(c.never||0)+' not connected · updated '+new Date().toLocaleTimeString();
const g=document.getElementById('grid');g.innerHTML=s.teams.map(card).join('');
g.querySelectorAll('.card').forEach((el,i)=>el.querySelectorAll('details').forEach((d,j)=>{d.dataset.k=i+':'+j;if(open.has(d.dataset.k))d.open=true}));
}catch(e){document.getElementById('sub').textContent='Dashboard unreachable, retrying…'}}
tick();setInterval(tick,5000);
</script></body></html>`;

function lanAddresses() {
  return Object.values(networkInterfaces())
    .flat()
    .filter((a) => a && a.family === 'IPv4' && !a.internal)
    .map((a) => a.address);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const opts = parseArgs(process.argv.slice(2));
  const { server } = createDashboard({ key: opts.key, viewKey: opts.viewKey, teams: expectedTeams(opts.teams), dataDir: opts.data, venueNetwork: opts.venue });
  server.listen(opts.port, '0.0.0.0', () => {
    const ips = lanAddresses();
    const ip = ips[0] ?? 'localhost';
    console.log(`\n  Event monitor dashboard is running.\n`);
    console.log(`  EVENT KEY (give to teams):  ${opts.key}`);
    console.log(`  Teams run:                  npm run monitor -- --server http://${ip}:${opts.port} --team teamNN --key ${opts.key}`);
    console.log(`  Dashboard (organisers only): http://localhost:${opts.port}/?view=${opts.viewKey}`);
    if (ips.length > 1) console.log(`  This laptop's addresses:    ${ips.join(', ')}`);
    console.log(`  Monitor fingerprint:        ${agentHash()} (teams' copies must match)`);
    if (!opts.venue) console.log(`  Tip: pass --venue ${ip.split('.').slice(0, 3).join('.')}. to flag laptops that are not on the venue Wi-Fi.`);
    console.log(`  Reports are saved to ${join(opts.data, 'beats.jsonl')}\n`);
  });
}
