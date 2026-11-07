// Builds the participant ("scrambled") repo from this clean build:
//   - plants the chosen Curses (scramble/curses.mjs),
//   - strips both Client Call features (the #region C1 / C2 blocks),
//   - leaves out every organiser file: hidden tests, docs, call scripts, balance tools, this kit.
//
//   node scripts/scramble.mjs --out ../forgotten-dungeon-participant
//   node scripts/scramble.mjs --out ../fd-light --curses E1,E2,E3,E4,M1,M3,A1,A4,R1,R2
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLIENT_CALLS } from '../server/src/admin/calls.js';
import { CURSES } from '../server/src/admin/curses.js';
import { CURSE_PATCHES, REGION_REPLACEMENTS } from '../scramble/curses.mjs';

export const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
export const ALL_CURSES = CURSES.map((c) => c.id);

// Paths (relative to the repo root) that never ship to participants.
const ORGANISER_ONLY = [
  'node_modules',
  '.git',
  '.claude',
  '.scramble',
  '.judge',
  'docs',
  'scramble',
  'scripts/scramble.mjs',
  'scripts/verify-scramble.mjs',
  'scripts/judge.mjs',
  'scripts/run-participant.mjs',
  'server/test',
  'client/test',
  'server/scripts',
  'client/dist',
  'server/.env',
];
const SOURCE_EXT = /\.(m?js|jsx|css|html)$/;

export function stripRegions(text, file, { calls = ['C1', 'C2'] } = {}) {
  const lines = text.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const start = lines[i].match(/#region (C\d) ([\w-]+)/);
    if (!start || !calls.includes(start[1])) {
      out.push(lines[i]);
      continue;
    }
    const end = lines.findIndex((l, j) => j > i && l.includes(`#endregion ${start[1]}`));
    if (end === -1) throw new Error(`${file}: #region ${start[1]} ${start[2]} has no #endregion`);
    const replacement = REGION_REPLACEMENTS[start[2]];
    if (replacement === undefined) throw new Error(`${file}: no replacement for region "${start[2]}"`);
    const indent = lines[i].match(/^\s*/)[0];
    if (replacement) out.push(...replacement.split('\n').map((l) => (l ? indent + l : l)));
    i = end;
  }
  return out.join('\n');
}

function applyPatch(dir, id, patch) {
  const path = join(dir, patch.file);
  if (patch.create !== undefined) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, patch.create);
    return;
  }
  const text = readFileSync(path, 'utf8');
  const count = text.split(patch.find).length - 1;
  if (count !== 1) throw new Error(`Curse ${id}: expected 1 match in ${patch.file}, found ${count}:\n${patch.find}`);
  writeFileSync(path, text.replace(patch.find, () => patch.replace));
}

const participantCalls = () =>
  `// The client calls for this round. Your organiser will ring with the details.\nexport const CLIENT_CALLS = ${JSON.stringify(
    CLIENT_CALLS.map(({ id, name, releaseAt, points }) => ({ id, name, releaseAt, points })),
    null,
    2,
  )};\n`;

const participantCurses = (planted) =>
  `// The Curse Ledger: the bugs hidden in this build. Symptoms are for you to discover.\nexport const CURSES = ${JSON.stringify(
    CURSES.filter((c) => planted.includes(c.id)).map((c) => ({ ...c, symptom: null })),
    null,
    2,
  )};\n`;

/**
 * Copies the clean repo to `out` and scrambles it.
 * curses: ids to plant. stripCalls: remove the Client Call features. participantFiles: swap in the
 * participant README, ledger and call titles.
 */
export function buildParticipant({ out, curses = ALL_CURSES, stripCalls = true, participantFiles = true }) {
  const dest = resolve(out);
  if (dest === ROOT || ROOT.startsWith(dest + sep)) throw new Error('Refusing to build into the clean repo itself.');
  rmSync(dest, { recursive: true, force: true });
  const skip = new Set(ORGANISER_ONLY.map((p) => join(ROOT, p)));
  // Entry by entry: the scratch folders live inside the repo, and cpSync refuses to copy into itself.
  for (const name of readdirSync(ROOT)) {
    if (skip.has(join(ROOT, name))) continue;
    cpSync(join(ROOT, name), join(dest, name), {
      recursive: true,
      filter: (src) => !skip.has(src) && !src.split(sep).includes('node_modules'),
    });
  }

  for (const id of [...curses].sort()) {
    if (!CURSE_PATCHES[id]) throw new Error(`Unknown curse ${id}`);
    for (const patch of CURSE_PATCHES[id]) applyPatch(dest, id, patch);
  }

  if (stripCalls) {
    for (const top of ['server/src', 'client/src']) {
      walkFiles(join(dest, top), (path) => {
        if (!SOURCE_EXT.test(path)) return;
        const text = readFileSync(path, 'utf8');
        if (!text.includes('#region C')) return;
        writeFileSync(path, stripRegions(text, relative(dest, path)));
      });
    }
  }

  if (participantFiles) {
    writeFileSync(join(dest, 'server/src/admin/calls.js'), participantCalls());
    writeFileSync(join(dest, 'server/src/admin/curses.js'), participantCurses(curses));
    cpSync(join(ROOT, 'scramble/participant/README.md'), join(dest, 'README.md'));
    for (const side of ['server', 'client']) {
      mkdirSync(join(dest, side, 'test'), { recursive: true });
      cpSync(join(ROOT, 'scramble/participant/example.test.js'), join(dest, side, 'test', 'example.test.js'));
    }
  }
  return { dest, curses: [...curses].sort(), stripCalls };
}

function walkFiles(dir, visit) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(path, visit);
    else visit(path);
  }
}

// ---- CLI ----
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = cliArgs(process.argv.slice(2));
  const out = args.out ?? join(ROOT, '.scramble', 'participant');
  const curses = args.curses ? args.curses.split(',').map((s) => s.trim().toUpperCase()) : ALL_CURSES;
  const built = buildParticipant({ out, curses });
  // Remember what was planted so the judge only scores those Curses.
  mkdirSync(join(ROOT, '.scramble'), { recursive: true });
  writeFileSync(join(ROOT, '.scramble', 'last-build.json'), JSON.stringify({ ...built, at: new Date().toISOString() }, null, 2));
  console.log(`Participant build written to ${built.dest}`);
  console.log(`Curses planted: ${built.curses.join(', ')}`);
  console.log('Client Calls stripped: C1, C2');
  console.log('Next: node scripts/verify-scramble.mjs (proves every hidden test fails only on its own Curse).');
  if (!existsSync(join(built.dest, 'package.json'))) process.exitCode = 1;
}

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
