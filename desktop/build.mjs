// Stages the game for packaging: the built client, the server code (plain, editable files) and the
// server's own dependencies, into desktop/stage. Then: npx electron-builder --projectDir stage
import { cpSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
// --bugged: plants every rune from scramble/quest-bugs.mjs into the staged server (the event build).
const BUGGED = process.argv.includes('--bugged');
const run = (cmd, cwd) => execSync(cmd, { cwd, stdio: 'inherit' });
// Real file paths on every system (a URL's pathname is '/D:/...' on Windows).
const here = join(fileURLToPath(new URL('.', import.meta.url)), '/');
const repo = join(fileURLToPath(new URL('..', import.meta.url)), '/');
run('npm run build -w client', repo);
rmSync(`${here}stage`, { recursive: true, force: true });
mkdirSync(`${here}stage/game/client`, { recursive: true });
cpSync(`${repo}client/dist`, `${here}stage/game/client/dist`, { recursive: true });
cpSync(`${repo}server`, `${here}stage/game/server`, { recursive: true, filter: (p) => !/node_modules|[/\\]saves([/\\]|$)|[/\\]test([/\\]|$)/.test(p.slice(repo.length + 6)) });
if (BUGGED) {
  const { QUEST_BUGS } = await import(`${new URL('../scramble/quest-bugs.mjs', import.meta.url).href}`);
  for (const bug of [...QUEST_BUGS].sort((a, b) => a.id.localeCompare(b.id))) {
    for (const p of bug.patches) {
      const file = join(here, 'stage/game', p.file);
      const text = readFileSync(file, 'utf8').replace(/\r\n/g, '\n'); // Windows checkouts use CRLF
      if (text.split(p.find).length !== 2) throw new Error(`${bug.id}: patch does not match ${p.file}`);
      writeFileSync(file, text.replace(p.find, () => p.replace));
    }
  }
  console.log(`planted ${QUEST_BUGS.length} bugs`);
}
const server = JSON.parse(readFileSync(`${repo}server/package.json`, 'utf8'));
const desk = JSON.parse(readFileSync(`${here}package.json`, 'utf8'));
const NAME = BUGGED ? 'The Forgotten Dungeon (Bugged)' : 'The Forgotten Dungeon';
cpSync(`${here}main.cjs`, `${here}stage/main.cjs`);
writeFileSync(`${here}stage/package.json`, JSON.stringify({
  name: BUGGED ? 'forgotten-dungeon-bugged' : 'forgotten-dungeon', productName: NAME, version: desk.version, main: 'main.cjs',
  description: NAME, author: 'The Forgotten Dungeon team',
  dependencies: server.dependencies,
  build: { ...desk.build, productName: NAME, appId: desk.build.appId + (BUGGED ? '.bugged' : '') },
  devDependencies: { electron: desk.devDependencies.electron },
}, null, 2));
run('npm install --omit=dev --no-audit --no-fund', `${here}stage`);
console.log('staged in desktop/stage');
