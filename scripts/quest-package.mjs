// Packages a ready-to-push game repo: the bugged game, one-command start (`npm start`), a player
// README and a first git commit. Push the folder to a new (private) repo, or hand out the zip.
// The answer key (scramble/), hidden tests, judge model data and organiser tools never go in.
//
//   node scripts/quest-package.mjs --team team03 --out ../packages      # a team's own bugs + profile
//   node scripts/quest-package.mjs --all-teams --out ../packages         # every team in the registry
//   node scripts/quest-package.mjs --practice --out ../packages          # all 23 bugs, practice profile
//   add --zip to also write <name>.zip next to each folder, --no-git to skip the first commit
//
// Team packages are the ones to judge: their saves replay with the team's official profile.
// A practice package is for trying the game out; its saves are not judged.
import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { BUG_IDS } from '../scramble/quest-bugs.mjs';
import { buildRepo, loadRegistry } from './quest-kit.mjs';

const args = cliArgs(process.argv.slice(2));
const outRoot = resolve(args.out ?? join('.scramble', 'packages'));

const jobs = [];
if (args.practice) jobs.push({ name: 'practice', bugs: BUG_IDS, profile: null });
if (args.team || args['all-teams']) {
  const registry = loadRegistry();
  const teams = args['all-teams'] ? registry.teams : registry.teams.filter((t) => String(args.team).split(',').includes(t.teamId));
  if (!teams.length) throw new Error(`No team ${args.team} in the registry.`);
  for (const t of teams) jobs.push({ name: t.teamId, bugs: t.bugs, profile: t.profile });
}
if (!jobs.length) {
  console.error('Say what to package: --team team03, --all-teams or --practice (see the top of this file).');
  process.exit(1);
}

const git = (cwd, ...a) => execFileSync('git', a, { cwd, stdio: 'pipe' });
for (const job of jobs) {
  const dest = buildRepo({ out: join(outRoot, `forgotten-dungeon-${job.name}`), bugs: job.bugs, profile: job.profile });
  if (!args['no-git']) {
    git(dest, 'init', '-q', '-b', 'main');
    git(dest, 'add', '-A');
    git(dest, '-c', 'user.name=The Forgotten Dungeon', '-c', 'user.email=organisers@forgotten-dungeon.invalid', 'commit', '-q', '-m', 'The Forgotten Dungeon: The Shattered Heart');
  }
  let zip = '';
  if (args.zip) {
    zip = `${dest}.zip`;
    if (existsSync(zip)) rmSync(zip);
    if (process.platform === 'win32') execFileSync('powershell', ['-NoProfile', '-Command', `Compress-Archive -Path '${dest}' -DestinationPath '${zip}'`]);
    else execFileSync('zip', ['-qr', zip, `forgotten-dungeon-${job.name}`], { cwd: outRoot });
  }
  console.log(`${job.name.padEnd(9)} → ${dest}${zip ? `  +  ${zip}` : ''}  (${job.bugs.length} bugs${job.profile ? `, profile ${job.profile.teamId}` : ', practice profile'})`);
}
console.log('\nPush one: cd <folder> && git remote add origin <new private repo url> && git push -u origin main');

function cliArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const m = argv[i].match(/^--([^=]+)(?:=(.*))?$/s);
    if (!m) continue;
    if (m[2] !== undefined) out[m[1]] = m[2];
    else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) out[m[1]] = argv[++i];
    else out[m[1]] = true;
  }
  return out;
}
