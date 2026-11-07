// Builds each team's own participant repo: its profile, its bugs, no hidden tests or judge model.
//
//   node scripts/quest-build.mjs --out ../builds            # every team -> ../builds/team01 …
//   node scripts/quest-build.mjs --team team03 --out ../builds
import { join, resolve } from 'node:path';
import { buildRepo, loadRegistry } from './quest-kit.mjs';

const args = cliArgs(process.argv.slice(2));
const registry = loadRegistry();
const outRoot = resolve(args.out ?? join('.scramble', 'quest-builds'));
const teams = args.team ? registry.teams.filter((t) => t.teamId === args.team) : registry.teams;
if (!teams.length) throw new Error(`No team ${args.team} in the registry.`);
for (const t of teams) {
  const dest = buildRepo({ out: join(outRoot, t.teamId), bugs: t.bugs, profile: t.profile });
  console.log(`${t.teamId} → ${dest}  (${t.bugs.length} bugs)`);
}

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
