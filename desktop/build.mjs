// Stages the game for packaging: the built client, the server code (plain, editable files) and the
// server's own dependencies, into desktop/stage. Then: npx electron-builder --projectDir stage
import { cpSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const run = (cmd, cwd) => execSync(cmd, { cwd, stdio: 'inherit' });
// Real file paths on every system (a URL's pathname is '/D:/...' on Windows).
const here = join(fileURLToPath(new URL('.', import.meta.url)), '/');
const repo = join(fileURLToPath(new URL('..', import.meta.url)), '/');
run('npm run build -w client', repo);
rmSync(`${here}stage`, { recursive: true, force: true });
mkdirSync(`${here}stage/game/client`, { recursive: true });
cpSync(`${repo}client/dist`, `${here}stage/game/client/dist`, { recursive: true });
cpSync(`${repo}server`, `${here}stage/game/server`, { recursive: true, filter: (p) => !/node_modules|[/\\]saves([/\\]|$)|[/\\]test([/\\]|$)/.test(p.slice(repo.length + 6)) });
const server = JSON.parse(readFileSync(`${repo}server/package.json`, 'utf8'));
const desk = JSON.parse(readFileSync(`${here}package.json`, 'utf8'));
cpSync(`${here}main.cjs`, `${here}stage/main.cjs`);
writeFileSync(`${here}stage/package.json`, JSON.stringify({
  name: 'forgotten-dungeon', productName: 'The Forgotten Dungeon', version: desk.version, main: 'main.cjs',
  description: 'The Forgotten Dungeon', author: 'The Forgotten Dungeon team',
  dependencies: server.dependencies, build: desk.build,
  devDependencies: { electron: desk.devDependencies.electron },
}, null, 2));
run('npm install --omit=dev --no-audit --no-fund', `${here}stage`);
console.log('staged in desktop/stage');
