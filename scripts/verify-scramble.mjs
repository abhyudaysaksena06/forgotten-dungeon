// Proves the scramble is fair, per the build guide: every hidden test passes on the clean build,
// each Curse makes exactly its own test fail (and nothing else), stripping the Client Calls fails
// exactly C1/C2, and the full participant build fails every planted tag with zero regressions.
//
//   node scripts/verify-scramble.mjs            # everything (~1–2 min)
//   node scripts/verify-scramble.mjs --only=A4  # one Curse
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { CLIENT_CALLS } from '../server/src/admin/calls.js';
import { judgeRepo } from './judge.mjs';
import { ALL_CURSES, ROOT, buildParticipant } from './scramble.mjs';

const args = cliArgs(process.argv.slice(2));
const CALLS = CLIENT_CALLS.map((c) => c.id);
const ALL_TAGS = [...ALL_CURSES, ...CALLS];
const scratch = join(ROOT, '.scramble', 'verify');

let failures = 0;
function check(label, { results, regressions }, expectFail) {
  const wrong = [];
  for (const tag of ALL_TAGS) {
    if (results[tag] === undefined) wrong.push(`${tag} missing`);
    else if (expectFail.includes(tag) === results[tag]) wrong.push(`${tag} ${results[tag] ? 'passed' : 'failed'}`);
  }
  for (const r of regressions) wrong.push(`guard failed: ${r}`);
  if (wrong.length) failures++;
  console.log(`${wrong.length ? '✖' : '✔'} ${label.padEnd(34)} ${wrong.length ? wrong.join('; ') : `fails: ${expectFail.join(', ') || 'nothing'}`}`);
}

async function scenario(label, options, expectFail) {
  const out = join(scratch, label.replace(/\W+/g, '-'));
  buildParticipant({ out, participantFiles: false, ...options });
  check(label, await judgeRepo(out, { label: 'verify' }), expectFail);
  rmSync(out, { recursive: true, force: true });
}

const only = args.only?.split(',');
if (!only) await scenario('clean build', { curses: [], stripCalls: false }, []);
for (const id of only ?? ALL_CURSES) await scenario(`curse ${id} alone`, { curses: [id], stripCalls: false }, [id]);
if (!only) {
  await scenario('client calls stripped', { curses: [], stripCalls: true }, CALLS);
  await scenario('full participant build', { curses: ALL_CURSES, stripCalls: true }, ALL_TAGS);
}
rmSync(scratch, { recursive: true, force: true });
console.log(failures ? `\n${failures} scenario(s) failed.` : '\nAll scenarios behave as designed.');
process.exitCode = failures ? 1 : 0;

// --name value or --name=value
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
