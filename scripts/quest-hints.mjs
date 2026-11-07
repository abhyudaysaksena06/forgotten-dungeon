// Writes the organisers' hint sheets for CTF hint tokens:
//   organiser/hints/ALL_HINTS.md   every bug: round, symptom, three hint levels, and the fix
//   organiser/hints/<team>.md      only that team's bugs, numbered per round (what a mentor reads out)
//   organiser/hints/hint-log.csv   one row per hint given, to track each team's token spend
//
//   node scripts/quest-hints.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { QUEST_BUGS, ROUNDS, bugById } from '../scramble/quest-bugs.mjs';
import { ROOT, loadRegistry } from './quest-kit.mjs';

const dir = join(ROOT, 'organiser', 'hints');
mkdirSync(dir, { recursive: true });
const LEVELS = ['Level 1 — the mechanic', 'Level 2 — where in the code', 'Level 3 — the direction of the fix'];
const fixOf = (b) => b.patches.map((p) => `\`${p.file}\`: \`${p.replace.trim().split('\n')[0]}\` should be \`${p.find.trim().split('\n')[0]}\``).join('; ');

let all = '# Hint sheet — all bugs (organisers only)\n\nHints go one level at a time: a team pays for Level 1 first, then Level 2, then Level 3.\nA hint points the way; it never hands over the fix.\n';
for (const [round, title] of Object.entries(ROUNDS)) {
  all += `\n## Round ${round}: ${title}\n`;
  for (const b of QUEST_BUGS.filter((x) => x.round === Number(round))) {
    all += `\n### ${b.id} ${b.name} (${b.kind}, ${b.points} marks)\n\n**Symptom:** ${b.symptom}\n\n`;
    b.hints.forEach((h, i) => (all += `- ${LEVELS[i]}: ${h}\n`));
    all += `\n**Fix (for mentors):** ${fixOf(b)}\n`;
  }
}
writeFileSync(join(dir, 'ALL_HINTS.md'), all);

let teams = [];
try {
  teams = loadRegistry().teams;
} catch {
  console.log('No registry yet; wrote ALL_HINTS.md only. Run scripts/quest-teams.mjs, then this again.');
}
for (const t of teams) {
  let md = `# Hints for ${t.teamName} (${t.teamId})\n\nRead hints out one level at a time and log each one in hint-log.csv.\n`;
  for (const round of Object.keys(ROUNDS)) {
    const bugs = t.bugs.map(bugById).filter((b) => b.round === Number(round));
    if (!bugs.length) continue;
    md += `\n## Round ${round}\n`;
    bugs.forEach((b, i) => {
      md += `\n### Round ${round}, bug ${String.fromCharCode(97 + i)} (${b.id})\n\n`;
      b.hints.forEach((h, k) => (md += `- ${LEVELS[k]}: ${h}\n`));
    });
  }
  writeFileSync(join(dir, `${t.teamId}.md`), md);
}
writeFileSync(join(dir, 'hint-log.csv'), 'Time,Team,Round,Bug,Level,Tokens spent,Given by\n');
console.log(`Wrote ${join(dir, 'ALL_HINTS.md')}${teams.length ? `, ${teams.length} team sheets` : ''} and hint-log.csv`);
