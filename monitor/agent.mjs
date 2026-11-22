#!/usr/bin/env node
// Event monitor agent. Each team runs this on every laptop they use during the round:
//
//   npm run monitor -- --server http://<organiser-ip>:4545 --team team03 --key <event key>
//
// Every 30 seconds it sends the organiser's dashboard a short report: which known AI tools are
// running or installed as editor extensions (only names on the lists in monitor/rules.mjs), and the
// team's git activity in this folder (commit count, last commit, names of changed files).
// It never reads keystrokes, the screen, the clipboard, browser history, file contents or passwords.
// Run with --dry-run to see exactly what would be sent without sending anything.
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir, hostname, networkInterfaces, platform } from 'node:os';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { EXTENSION_DIRS, matchExtension, scanProcesses } from './rules.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));

export const AGENT_VERSION = 1;
const MAX_CHANGED_FILES = 40;

export const NOTICE = `
  ┌──────────────────────────────────────────────────────────────────────────────┐
  │  EVENT MONITOR: only Gemini is allowed as an AI tool during this round.      │
  │                                                                              │
  │  While this runs, every 30 seconds it tells the organisers:                  │
  │   • which known AI apps are running (e.g. Cursor, ChatGPT, Claude, Copilot), │
  │   • which AI extensions your code editors have installed,                    │
  │   • this game folder's git activity: commit count, last commit message and   │
  │     time, and the NAMES of changed files (not their contents),               │
  │   • how many lines each commit and your uncommitted work add or remove,      │
  │   • this computer's name, operating system and network connections (so a     │
  │     phone hotspot shows up), and a fingerprint of this monitor's own code.   │
  │                                                                              │
  │  It does NOT record keystrokes, your screen, clipboard, browsing history,    │
  │  file contents, passwords, or any program that is not on the AI-tool list.   │
  │  Stopping it is allowed, but the organisers will see your team go offline.   │
  │  The full list it checks is in monitor/rules.mjs.                            │
  └──────────────────────────────────────────────────────────────────────────────┘
`;

function run(cmd, args, opts = {}) {
  return new Promise((done) => {
    execFile(cmd, args, { timeout: 10000, maxBuffer: 8 * 1024 * 1024, windowsHide: true, ...opts }, (err, stdout) =>
      done(err ? null : String(stdout)),
    );
  });
}

/**
 * Running programs as { name, cmd }, from the OS process table. This list stays on the computer:
 * collect() only sends the AI tools that scanProcesses() matches in it.
 */
export async function listProcesses() {
  if (platform() === 'win32') {
    const ps = await run('powershell', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      "Get-CimInstance Win32_Process | ForEach-Object { $_.Name + \"`t\" + $(if ($_.CommandLine) { $_.CommandLine } else { $_.ExecutablePath }) }",
    ]);
    if (ps) return ps.split(/\r?\n/).filter(Boolean).map((l) => ({ name: l.split('\t')[0], cmd: l.split('\t').slice(1).join('\t') }));
    const out = await run('tasklist', ['/fo', 'csv', '/nh']);
    return (out ?? '').split(/\r?\n/).map((l) => ({ name: l.split('","')[0]?.replace(/^"/, ''), cmd: '' })).filter((p) => p.name);
  }
  const out = await run('ps', ['-A', '-ww', '-o', 'args=']);
  if (out) {
    // The name is the last path part of the first word. A path with spaces (macOS "LM Studio.app")
    // splits early, but the rules' `paths` patterns check the whole line anyway.
    return out.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => ({ name: l.split(/\s+/)[0].split('/').pop(), cmd: l }));
  }
  const names = await run('ps', ['-A', '-o', 'comm=']);
  return (names ?? '').split('\n').map((l) => ({ name: l.trim().split('/').pop(), cmd: l.trim() })).filter((p) => p.name);
}

// Virtual adapters (Docker, VMs, VPN tunnels, Apple's peer-to-peer links) are not a second network.
const VIRTUAL_IFACE = /^(lo|docker|br-|veth|virbr|vmnet|vboxnet|vethernet|utun|awdl|llw|bridge|anpi|ap\d|tailscale|zt|wg)/i;

/** The computer's network connections (name and IPv4 address), so a phone hotspot shows up. */
export function networks() {
  return Object.entries(networkInterfaces())
    .flatMap(([name, addrs]) => (addrs ?? []).filter((a) => a.family === 'IPv4' && !a.internal).map((a) => ({ name, address: a.address, cidr: a.cidr })))
    .filter((n) => !VIRTUAL_IFACE.test(n.name) && !n.address.startsWith('169.254.'))
    .slice(0, 8);
}

/** A fingerprint of the agent's own code, so the dashboard can tell if a team edited it. */
export function agentHash() {
  const h = createHash('sha256');
  for (const f of ['agent.mjs', 'rules.mjs']) h.update(readFileSync(join(HERE, f)));
  return h.digest('hex').slice(0, 16);
}

/** `git --shortstat` output → { added, removed } line counts. */
export function parseShortstat(text) {
  const n = (re) => Number(String(text ?? '').match(re)?.[1] ?? 0);
  return { added: n(/(\d+) insertions?\(\+\)/), removed: n(/(\d+) deletions?\(-\)/) };
}

// Lock files and build output change by thousands of lines on their own; they say nothing about pasting.
const NOT_CODE = [':(exclude)**/package-lock.json', ':(exclude)package-lock.json', ':(exclude)**/dist/**'];

export function scanExtensions(home = homedir()) {
  const editors = [];
  const extensions = new Map();
  for (const { editor, dir, aiEditor } of EXTENSION_DIRS) {
    const path = join(home, dir);
    if (!existsSync(path)) continue;
    if (aiEditor) editors.push(editor);
    let names = [];
    try {
      names = readdirSync(path);
    } catch {
      continue;
    }
    for (const name of names) {
      const hit = matchExtension(name);
      if (!hit) continue;
      const key = `${editor}:${hit.id}`;
      extensions.set(key, { tool: hit.tool, id: hit.id, editor, allowed: Boolean(hit.allowed) });
    }
  }
  return { aiEditorsInstalled: editors, extensions: [...extensions.values()] };
}

export async function gitActivity(repo) {
  const git = (...args) => run('git', ['-C', repo, ...args]);
  if ((await git('rev-parse', '--is-inside-work-tree'))?.trim() !== 'true') return { repo: false };
  const commits = Number((await git('rev-list', '--count', 'HEAD'))?.trim() ?? 0) || 0;
  const last = (await git('log', '-1', '--format=%h%x09%cI%x09%s'))?.trim().split('\t') ?? [];
  const status = (await git('status', '--porcelain', '--untracked-files=normal')) ?? '';
  const uncommitted = parseShortstat(await git('diff', '--shortstat', 'HEAD', '--', '.', ...NOT_CODE));
  const lastSize = parseShortstat(await git('show', '--shortstat', '--format=', 'HEAD', '--', '.', ...NOT_CODE));
  const changed = status
    .split('\n')
    .filter(Boolean)
    .map((l) => l.slice(3).trim())
    .filter((f) => !f.includes('node_modules'));
  return {
    repo: true,
    commits,
    lastCommit: last[0] ? { hash: last[0], at: last[1], message: (last[2] ?? '').slice(0, 120), ...lastSize } : null,
    uncommitted,
    changedFiles: changed.slice(0, MAX_CHANGED_FILES),
    changedCount: changed.length,
  };
}

export async function collect({ team, repo, startedAt }) {
  const [procs, git] = await Promise.all([listProcesses(), gitActivity(repo)]);
  return {
    v: AGENT_VERSION,
    team,
    host: hostname().slice(0, 64),
    os: platform(),
    startedAt,
    sentAt: new Date().toISOString(),
    agentHash: agentHash(),
    networks: networks(),
    processes: scanProcesses(procs),
    processScanOk: procs.length > 0,
    ...scanExtensions(),
    git,
  };
}

function parseArgs(argv) {
  const opts = { interval: 30, repo: process.cwd() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--server') opts.server = next();
    else if (a === '--team') opts.team = next();
    else if (a === '--key') opts.key = next();
    else if (a === '--interval') opts.interval = Math.max(10, Number(next()) || 30);
    else if (a === '--repo') opts.repo = resolve(next());
    else if (a === '--yes') opts.yes = true;
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--help' || a === '-h') opts.help = true;
    else throw new Error(`Unknown option ${a}`);
  }
  opts.server ??= process.env.MONITOR_SERVER;
  opts.team ??= process.env.MONITOR_TEAM;
  opts.key ??= process.env.MONITOR_KEY;
  return opts;
}

function summary(r) {
  const flagged = [...r.processes, ...r.extensions].filter((x) => !x.allowed).map((x) => x.tool);
  const ai = flagged.length ? `NOT ALLOWED: ${[...new Set(flagged)].join(', ')}` : 'no disallowed AI tools seen';
  const git = r.git.repo ? `${r.git.commits} commits, ${r.git.changedCount} changed files` : 'no git repo';
  return `${ai} · ${git}`;
}

async function consent(opts) {
  console.log(NOTICE);
  if (opts.yes) return true;
  if (!process.stdin.isTTY) {
    console.error('Run this in a terminal so you can agree, or pass --yes once your team has read the notice.');
    return false;
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question('  Type "yes" to agree and start: ');
  rl.close();
  return answer.trim().toLowerCase() === 'yes';
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log('Usage: npm run monitor -- --server http://IP:4545 --team team03 --key KEY [--interval 30] [--dry-run]');
    return;
  }
  const startedAt = new Date().toISOString();
  if (opts.dryRun) {
    console.log(JSON.stringify(await collect({ team: opts.team ?? '(not set)', repo: opts.repo, startedAt }), null, 2));
    return;
  }
  const missing = ['server', 'team', 'key'].filter((k) => !opts[k]);
  if (missing.length) throw new Error(`Missing --${missing.join(', --')}. Your organiser gives you these at the start.`);
  if (!/^[\w-]{1,32}$/.test(opts.team)) throw new Error('--team must look like team03.');
  if (!(await consent(opts))) {
    console.log('  Not started. Talk to an organiser: the monitor is required for this round.');
    process.exitCode = 1;
    return;
  }

  const url = new URL('/beat', opts.server).href;
  let failures = 0;
  const beat = async () => {
    const report = await collect({ team: opts.team, repo: opts.repo, startedAt });
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-monitor-key': opts.key },
        body: JSON.stringify(report),
        signal: AbortSignal.timeout(8000),
      });
      if (res.status === 401) throw new Error('the event key was not accepted');
      if (!res.ok) throw new Error(`dashboard replied ${res.status}`);
      failures = 0;
      console.log(`  [${new Date().toLocaleTimeString()}] sent: ${summary(report)}`);
    } catch (err) {
      failures++;
      console.log(`  [${new Date().toLocaleTimeString()}] could not reach the dashboard (${err.cause?.code ?? err.message}). Retrying.`);
      if (failures === 3) console.log('  Tell an organiser if this keeps happening.');
    }
  };
  console.log(`  Monitoring started for ${opts.team}. Leave this window open. Press Ctrl+C to stop.\n`);
  await beat();
  setInterval(beat, opts.interval * 1000);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`  ${err.message}`);
    process.exitCode = 1;
  });
}
