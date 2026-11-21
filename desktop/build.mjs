// Stages the game for packaging: the built client, the server code (plain, editable files) and the
// server's own dependencies, into desktop/stage. Then: npx electron-builder --projectDir stage
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
// --bugged: plants every rune from scramble/quest-bugs.mjs into the staged server (a practice build:
// default profile, its saves are not judged).
// --team team03: plants that team's runes and adds its profile from organiser/registry.json (the
// build a team plays at the event; its saves replay with the team's official stats).
const argv = process.argv.slice(2);
const TEAM = argv.includes('--team') ? argv[argv.indexOf('--team') + 1] : null;
const BUGGED = argv.includes('--bugged') || Boolean(TEAM);
const run = (cmd, cwd) => execSync(cmd, { cwd, stdio: 'inherit' });
// Real file paths on every system (a URL's pathname is '/D:/...' on Windows).
const here = join(fileURLToPath(new URL('.', import.meta.url)), '/');
const repo = join(fileURLToPath(new URL('..', import.meta.url)), '/');
run('npm run build -w client', repo);
rmSync(`${here}stage`, { recursive: true, force: true });
mkdirSync(`${here}stage/game/client`, { recursive: true });
cpSync(`${repo}client/dist`, `${here}stage/game/client/dist`, { recursive: true });
cpSync(`${repo}server`, `${here}stage/game/server`, { recursive: true, filter: (p) => !/node_modules|[/\\](saves|teams)([/\\]|$)|[/\\]test([/\\]|$)/.test(p.slice(repo.length + 6)) });
let team = null;
if (TEAM) {
  const registry = join(repo, 'organiser', 'registry.json');
  if (!existsSync(registry)) throw new Error('No organiser/registry.json. Run: node scripts/quest-teams.mjs');
  team = JSON.parse(readFileSync(registry, 'utf8')).teams.find((t) => t.teamId === TEAM);
  if (!team) throw new Error(`No team ${TEAM} in organiser/registry.json`);
  mkdirSync(`${here}stage/game/server/teams`, { recursive: true });
  writeFileSync(`${here}stage/game/server/teams/profile.json`, JSON.stringify(team.profile, null, 2));
}
if (BUGGED) {
  const { QUEST_BUGS } = await import(`${new URL('../scramble/quest-bugs.mjs', import.meta.url).href}`);
  const planted = QUEST_BUGS.filter((b) => !team || team.bugs.includes(b.id));
  for (const bug of [...planted].sort((a, b) => a.id.localeCompare(b.id))) {
    for (const p of bug.patches) {
      const file = join(here, 'stage/game', p.file);
      const text = readFileSync(file, 'utf8').replace(/\r\n/g, '\n'); // Windows checkouts use CRLF
      if (text.split(p.find).length !== 2) throw new Error(`${bug.id}: patch does not match ${p.file}`);
      writeFileSync(file, text.replace(p.find, () => p.replace));
    }
  }
  console.log(`planted ${planted.length} bugs${team ? ` for ${team.teamId}` : ''}`);
}
const server = JSON.parse(readFileSync(`${repo}server/package.json`, 'utf8'));
const desk = JSON.parse(readFileSync(`${here}package.json`, 'utf8'));
const NAME = team ? `The Forgotten Dungeon (${team.teamName})` : BUGGED ? 'The Forgotten Dungeon (Bugged)' : 'The Forgotten Dungeon';
cpSync(`${here}main.cjs`, `${here}stage/main.cjs`);
writeFileSync(`${here}stage/package.json`, JSON.stringify({
  name: team ? `forgotten-dungeon-${team.teamId}` : BUGGED ? 'forgotten-dungeon-bugged' : 'forgotten-dungeon', productName: NAME, version: desk.version, main: 'main.cjs',
  description: NAME, author: 'The Forgotten Dungeon team',
  dependencies: server.dependencies,
  build: { ...desk.build, productName: NAME, appId: desk.build.appId + (team ? `.${team.teamId}` : BUGGED ? '.bugged' : '') },
  devDependencies: { electron: desk.devDependencies.electron },
}, null, 2));
run('npm install --omit=dev --no-audit --no-fund', `${here}stage`);
console.log('staged in desktop/stage');
