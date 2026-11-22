// Run with: node --test monitor/test/
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseShortstat } from '../agent.mjs';
import { cleanReport, createDashboard, expectedTeams } from '../dashboard.mjs';
import { extensionId, matchExtension, matchProcess, scanProcesses } from '../rules.mjs';
import { OFFLINE_AFTER_MS, applyBeat, createState, snapshot, sweep } from '../state.mjs';

test('process rules: names, install paths and node-launched CLIs', () => {
  assert.equal(matchProcess('Cursor.exe').tool, 'Cursor');
  assert.equal(matchProcess({ name: 'code', cmd: '/Applications/Cursor.app/Contents/MacOS/Cursor' }).tool, 'Cursor');
  assert.equal(matchProcess({ name: 'x.exe', cmd: 'C:\\Users\\a\\AppData\\Local\\Programs\\cursor\\x.exe' }).tool, 'Cursor');
  assert.equal(matchProcess({ name: 'node', cmd: 'node /usr/lib/node_modules/@anthropic-ai/claude-code/cli.js' }).tool, 'Claude (desktop or Claude Code)');
  assert.equal(matchProcess({ name: 'node', cmd: 'node /usr/lib/node_modules/@google/gemini-cli/dist/index.js' }).allowed, true);
  assert.equal(matchProcess({ name: 'code', cmd: 'code CLAUDE.md' }), null);
  assert.equal(matchProcess('bash'), null);
  assert.deepEqual(scanProcesses(['bash', 'chatgpt', 'ChatGPT', 'gemini']), [
    { tool: 'ChatGPT desktop', allowed: false },
    { tool: 'Gemini CLI', allowed: true },
  ]);
});

test('extension rules strip versions and platforms', () => {
  assert.equal(extensionId('github.copilot-chat-0.26.1-darwin-arm64'), 'github.copilot-chat');
  assert.equal(matchExtension('GitHub.copilot-1.250.0').tool, 'GitHub Copilot');
  assert.equal(matchExtension('google.geminicodeassist-2.30.0').allowed, true);
  assert.equal(matchExtension('esbenp.prettier-vscode-11.0.0'), null);
});

test('shortstat parsing', () => {
  assert.deepEqual(parseShortstat(' 3 files changed, 210 insertions(+), 4 deletions(-)'), { added: 210, removed: 4 });
  assert.deepEqual(parseShortstat(' 1 file changed, 1 insertion(+)'), { added: 1, removed: 0 });
  assert.deepEqual(parseShortstat(''), { added: 0, removed: 0 });
});

const beat = (over = {}) => ({
  team: 'team01',
  host: 'lap1',
  os: 'linux',
  startedAt: 's1',
  agentHash: 'good',
  networks: [{ name: 'wlan0', address: '10.0.0.5' }],
  processes: [],
  extensions: [],
  aiEditorsInstalled: [],
  git: { repo: true, commits: 5, lastCommit: { hash: 'a', message: 'm', added: 3, removed: 1 }, uncommitted: { added: 0, removed: 0 }, changedFiles: [], changedCount: 0 },
  ...over,
});
const texts = (events) => events.map((e) => e.text);

test('state: alerts, closing, offline, restart', () => {
  const s = createState(['team01', 'team02'], { agentHash: 'good' });
  assert.deepEqual(texts(applyBeat(s, beat(), 0)), ['Monitor started on lap1 (linux)']);
  assert.equal(snapshot(s, 0).teams[0].status, 'ok');
  assert.equal(snapshot(s, 0).teams[1].status, 'never');

  assert.deepEqual(texts(applyBeat(s, beat({ processes: [{ tool: 'Cursor', allowed: false }] }), 30e3)), ['Running: Cursor']);
  assert.equal(snapshot(s, 30e3).teams[0].status, 'alert');
  assert.deepEqual(texts(applyBeat(s, beat(), 60e3)), ['Closed: Cursor']);
  const snap = snapshot(s, 60e3).teams[0];
  assert.equal(snap.status, 'ok');
  assert.deepEqual(snap.everFlagged, ['Cursor']);

  const late = 60e3 + OFFLINE_AFTER_MS + 1;
  assert.deepEqual(texts(sweep(s, late)), ['Went offline (monitor stopped or lost network)']);
  assert.deepEqual(sweep(s, late + 1000), []);
  assert.equal(snapshot(s, late).teams[0].status, 'warn');
  assert.match(texts(applyBeat(s, beat(), late + 1000))[0], /^Back online/);
  assert.deepEqual(texts(applyBeat(s, beat({ startedAt: 's2' }), late + 2000)), ['Monitor was restarted']);
});

test('state: edited agent, hotspot, big commit, paste', () => {
  const s = createState([], { agentHash: 'good', venueNetwork: '10.0.0.' });
  applyBeat(s, beat(), 0);
  assert.deepEqual(texts(applyBeat(s, beat({ agentHash: 'evil' }), 1)), ['Monitor code differs from the organiser copy (edited or old version)']);
  assert.equal(snapshot(s, 1).teams[0].status, 'alert');

  const hotspot = beat({ networks: [{ name: 'wlan0', address: '10.0.0.5' }, { name: 'usb0', address: '172.20.10.2' }] });
  assert.deepEqual(texts(applyBeat(s, hotspot, 2)), [
    'Connected to 2 networks (wlan0, usb0): possible hotspot',
    'Not on venue Wi-Fi: usb0 172.20.10.2',
  ]);

  const s2 = createState();
  applyBeat(s2, beat(), 0);
  const paste = beat({ git: { ...beat().git, uncommitted: { added: 400, removed: 0 } } });
  assert.deepEqual(texts(applyBeat(s2, paste, 30e3)), ['400 lines added in 30 s (possible paste)']);
  const big = beat({ git: { ...beat().git, commits: 6, lastCommit: { hash: 'b', message: 'fix all', added: 500, removed: 20 } } });
  assert.deepEqual(texts(applyBeat(s2, big, 60e3)), ['Commit b (+500 −20): fix all', 'Big commit: 500 lines added at once']);
  assert.equal(snapshot(s2, 60e3).teams[0].bigChanges, 2);
});

test('dashboard helpers', () => {
  assert.deepEqual(expectedTeams('3'), ['team01', 'team02', 'team03']);
  assert.deepEqual(expectedTeams('a, b'), ['a', 'b']);
  const r = cleanReport({ team: 'team01', processes: [{ tool: 'X', allowed: 'yes', junk: 1 }], git: { repo: true, commits: '4' }, extra: 'dropped' });
  assert.deepEqual(r.processes, [{ tool: 'X', allowed: false }]);
  assert.equal(r.git.commits, 4);
  assert.equal(r.extra, undefined);
});

test('dashboard HTTP: keys are checked and reports show up', async () => {
  const { server } = createDashboard({ key: 'k1', viewKey: 'v1', teams: ['team01'], expectedHash: 'good' });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const post = (key, body) => fetch(`${base}/beat`, { method: 'POST', headers: { 'x-monitor-key': key }, body: JSON.stringify(body) });
    assert.equal((await post('wrong', beat())).status, 401);
    assert.equal((await post('k1', beat({ team: '../x' }))).status, 400);
    assert.equal((await post('k1', beat({ processes: [{ tool: 'Cursor', allowed: false }] }))).status, 200);
    assert.equal((await fetch(`${base}/state`)).status, 401);
    const state = await (await fetch(`${base}/state?view=v1`)).json();
    assert.equal(state.teams[0].status, 'alert');
    assert.equal((await fetch(`${base}/?view=v1`)).headers.get('content-type'), 'text/html; charset=utf-8');
  } finally {
    server.close();
  }
});

test('network blocklist never blocks Gemini, GitHub or npm', async () => {
  const { readBlocklist, render } = await import('../network/make-blocklists.mjs');
  const domains = readBlocklist();
  const keep = ['gemini.google.com', 'aistudio.google.com', 'generativelanguage.googleapis.com', 'github.com', 'registry.npmjs.org'];
  for (const host of keep) assert.ok(!domains.some((d) => host === d || host.endsWith(`.${d}`)), `${host} is blocked`);
  assert.ok(domains.includes('chatgpt.com') && domains.includes('claude.ai'));
  assert.match(render('dnsmasq', ['a.com']), /^address=\/a\.com\/0\.0\.0\.0$/);
  assert.deepEqual(JSON.parse(render('chrome', ['a.com'])).URLBlocklist, ['a.com']);
});
