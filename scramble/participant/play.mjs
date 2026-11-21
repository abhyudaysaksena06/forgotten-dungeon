// One command to play: installs what's missing, builds the game's screens once, then runs the game
// server and opens the game in your browser. The server restarts by itself whenever you save a file
// in server/src, so fix a rune, save, and reload the page.
//
//   npm start
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const win = process.platform === 'win32';
const npm = win ? 'npm.cmd' : 'npm';
const port = process.env.PORT || '3001';
const url = `http://localhost:${port}`;

const [major] = process.versions.node.split('.').map(Number);
if (major < 22) {
  console.error(`This game needs Node 22 or later (you have ${process.version}). Get it from https://nodejs.org`);
  process.exit(1);
}

function run(args, what) {
  console.log(`\n» ${what}…`);
  const r = spawnSync(npm, args, { cwd: root, stdio: 'inherit', shell: win });
  if (r.status !== 0) {
    console.error(`\n${what} failed. Fix the error above and run npm start again.`);
    process.exit(r.status ?? 1);
  }
}

if (!existsSync(join(root, 'node_modules'))) run(['install', '--no-audit', '--no-fund'], 'Installing (first run only)');
if (!existsSync(join(root, 'client', 'dist', 'index.html'))) run(['run', 'build', '-w', 'client'], 'Building the game (first run only)');

const server = spawn(process.execPath, ['--watch-path=server/src', '--watch-preserve-output', 'server/src/index.js'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, PORT: port, CLIENT_ORIGIN: url },
});

async function openWhenReady() {
  for (let i = 0; i < 200; i++) {
    const up = await fetch(url).then(() => true, () => false);
    if (up) break;
    await new Promise((r) => setTimeout(r, 300));
  }
  console.log(`\n  ▶  Play at ${url}   (Ctrl+C stops the game)\n`);
  if (process.env.NO_BROWSER === '1') return;
  const [cmd, args] = win ? ['cmd', ['/c', 'start', '', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  try {
    spawn(cmd, args, { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
  } catch {}
}
openWhenReady();

const stop = () => server.kill();
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
server.on('exit', (code) => process.exit(code ?? 0));
