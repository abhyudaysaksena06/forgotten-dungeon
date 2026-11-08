// Proves the Quest bugs are fair: the clean build passes every hidden test, each bug alone fails
// exactly its own tag with no guard regressions, and (with a registry) each team's build fails
// exactly its planted tags. It also checks the cage locks (server/src/quest/locks.js): a build's
// cage in round N stays shut by exactly as many broken runes as it has bugs in round N (1–4).
//
//   node scripts/quest-verify.mjs            # clean + every bug alone + every registry team
//   node scripts/quest-verify.mjs --only Q04
import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { BUG_IDS, bugById } from '../scramble/quest-bugs.mjs';
import { REGISTRY, ROOT, buildRepo, loadRegistry, runHiddenTests } from './quest-kit.mjs';

const args = cliArgs(process.argv.slice(2));
const scratch = join(ROOT, '.scramble', 'quest-verify');
let failures = 0;

async function scenario(label, bugs) {
  const out = join(scratch, label.replace(/\W+/g, '-'));
  buildRepo({ out, bugs, participant: false });
  const { results, regressions } = await runHiddenTests(out, 'verify');
  const locks = JSON.parse(
    execFileSync(process.execPath, ['--input-type=module', '-e', "const { brokenRunes } = await import('./server/src/quest/locks.js'); console.log(JSON.stringify([1, 2, 3, 4].map(brokenRunes)));"], { cwd: out, encoding: 'utf8' }),
  );
  rmSync(out, { recursive: true, force: true });
  const wrong = [];
  for (const id of BUG_IDS) {
    if (results[id] === undefined) wrong.push(`${id} missing`);
    else if (bugs.includes(id) === results[id]) wrong.push(`${id} ${results[id] ? 'passed' : 'failed'}`);
  }
  for (const r of regressions) wrong.push(`guard failed: ${r}`);
  locks.forEach((n, i) => {
    const want = bugs.filter((id) => bugById(id).round === i + 1).length;
    if (n !== want) wrong.push(`round ${i + 1} cage: ${n} broken rune(s), expected ${want}`);
  });
  if (wrong.length) failures++;
  console.log(`${wrong.length ? '✖' : '✔'} ${label.padEnd(28)} ${wrong.length ? wrong.join('; ') : `fails: ${bugs.join(', ') || 'nothing'}`}`);
}

const only = typeof args.only === 'string' ? args.only.split(',') : null;
if (!only) await scenario('clean build', []);
for (const id of only ?? BUG_IDS) await scenario(`bug ${id} alone`, [id]);
if (!only && existsSync(REGISTRY)) for (const t of loadRegistry().teams) await scenario(`team ${t.teamId}`, t.bugs);
rmSync(scratch, { recursive: true, force: true });
console.log(failures ? `\n${failures} scenario(s) failed.` : '\nAll scenarios behave as designed.');
process.exitCode = failures ? 1 : 0;

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
