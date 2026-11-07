// Judges teams for the Round 2 rulebook. Cheat-proof by construction: each run is rebuilt from the
// team's saved INPUTS on the organiser's clean engine with the OFFICIAL profile, so edited stats,
// engines or saves can't raise the score. Bugs are scored by the hidden tests on the team's code;
// readiness / route choices by the random forest.
//
//   node scripts/quest-judge.mjs --team team03 --repo ../submissions/team03
//   node scripts/quest-judge.mjs --all --submissions ../submissions      # every team -> results/rubric.csv
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOMS } from '../server/src/quest/data.js';
import { loadForest, predictGood } from '../server/src/quest/forest.js';
import { replay } from '../server/src/quest/replay.js';
import { profileHash } from '../server/src/quest/teams.js';
import { ROOT, bugById, loadRegistry, runHiddenTests, runTeamTestsAgainstBugs, teamFrom } from './quest-kit.mjs';

// Rulebook weights (section 8). Change them here if the organisers finalise different ones.
export const WEIGHTS = { fixes: 0.35, progression: 0.25, codeQuality: 0.15, testing: 0.15, aiUse: 0.1 };

// How the automatic columns are built (each out of 100).
export const PROGRESSION = { perRoom: 10, morvath: 40, decisions: 20 }; // 4 rooms + Morvath + forest
// Testing & stability is earned, never given: an untouched repo scores 0.
//   coverage  — the share of the team's bug points that their own tests catch (a test passes on the
//               original game and fails with that bug put back; see runTeamTestsAgainstBugs)
//   stability — the fix score scaled to 40, minus 10 per guard test their changes broke
export const TESTING = { coverage: 60, stability: 40, regressionCost: 10 };

export async function judgeTeam({ teamId, repo, savePath, registry = loadRegistry(), forest = loadForest() }) {
  const team = teamFrom(registry, teamId);
  const official = team.profile;
  const path = savePath ?? (repo ? join(resolve(repo), 'server', 'saves', `${teamId}.json`) : null);
  const flags = [];

  // 1. Replay the inputs on the clean engine with the official profile.
  let save = { actions: [] };
  if (path && existsSync(path)) save = JSON.parse(readFileSync(path, 'utf8'));
  else flags.push(`No save found${path ? ` at ${path}` : ''}; progression scored as zero.`);
  const result = replay(official, Array.isArray(save.actions) ? save.actions : []);
  const s = result.state;
  const tampered = Boolean(save.profileHash && save.profileHash !== profileHash(official));
  if (tampered) flags.push('The save was made with a different team profile than the official one (stats, seed or torches edited).');
  const repoProfile = repo && join(resolve(repo), 'server', 'teams', 'profile.json');
  if (repoProfile && existsSync(repoProfile) && profileHash(JSON.parse(readFileSync(repoProfile, 'utf8'))) !== profileHash(official)) {
    flags.push('server/teams/profile.json was edited. Scored from the official profile.');
  }
  if (result.invalidAt !== null) {
    flags.push(`The clean engine rejected input ${result.invalidAt + 1} of ${save.actions.length} ("${result.error}"); progress after it does not count. Usual causes: an unfixed bug, a fix that changes the real rules, or tampering.`);
  }

  // 2. Readiness / route decisions, judged by the random forest against this team's own stats.
  const decisions = forest
    ? s.decisions.map((d) => {
        const p = predictGood(forest, d.features);
        return { turn: d.turn, at: d.at, choice: d.choice, pGood: Math.round(p * 100) / 100, verdict: p >= 0.5 ? 'good' : 'poor' };
      })
    : [];
  if (!forest) flags.push('No forest model found (server/src/quest/model/route-forest.json); decisions not scored.');
  const goodShare = decisions.length ? decisions.filter((d) => d.verdict === 'good').length / decisions.length : 0;

  // 3. Progression (out of 100).
  const rooms = s.fragments.filter((r) => !ROOMS[r].final);
  const won = s.phase === 'victory';
  const progression = Math.round(rooms.length * PROGRESSION.perRoom + (won ? PROGRESSION.morvath : 0) + goodShare * PROGRESSION.decisions);

  // 4. Verified bug fixes and stability, by the hidden tests on the team's code.
  const bugs = [];
  let regressions = [];
  let tests = { caught: [], baselineTests: 0, failingOnReference: [] };
  if (repo) {
    const [run, own] = await Promise.all([runHiddenTests(repo, teamId), runTeamTestsAgainstBugs(repo, team.bugs, official, `${teamId}-tests`)]);
    regressions = run.regressions;
    tests = own;
    for (const id of team.bugs) {
      const bug = bugById(id);
      bugs.push({ id, round: bug.round, name: bug.name, kind: bug.kind, points: bug.points, fixed: run.results[id] === true, caught: own.caught.includes(id) });
    }
  }
  const possible = bugs.reduce((n, b) => n + b.points, 0);
  const points = (list) => list.reduce((n, b) => n + b.points, 0);
  const fixes = possible ? Math.round((100 * points(bugs.filter((b) => b.fixed))) / possible) : 0;
  const coverage = possible ? (TESTING.coverage * points(bugs.filter((b) => b.caught))) / possible : 0;
  const stability = Math.max(0, (TESTING.stability * fixes) / 100 - TESTING.regressionCost * regressions.length);
  const testing = repo ? Math.round(coverage + stability) : 0;

  return {
    teamId,
    teamName: team.teamName,
    tier: team.tier,
    scores: { fixes, progression, testing, codeQuality: null, aiUse: null },
    detail: { rooms: rooms.map((r) => ROOMS[r].name), morvath: won, decisions, goodShare, bugs, regressions, tests, tampered, rejectedAt: result.invalidAt },
    flags,
    run: { phase: s.phase, turn: s.turn, torches: s.torches, wipes: s.stats.wipes, leader: s.leaderId },
  };
}

// One CSV row per team. Mentors fill the two blank columns (0–100) and may adjust Testing; the
// weighted total is a spreadsheet formula, so it updates as they type.
export function rubricCsv(cards) {
  const header = ['Team', 'Name', 'Tier', 'Verified bug fixes (35%)', 'Gameplay progression (25%)', 'Code quality (15%) — mentor', 'Testing & stability (15%)', 'Responsible AI use (10%) — mentor', 'Weighted total', 'Bugs fixed', 'Bugs caught by own tests', 'Rooms', 'Morvath', 'Good decisions', 'Flags'];
  const rows = cards.map((c, i) => {
    const r = i + 2;
    const formula = `=ROUND(${WEIGHTS.fixes}*D${r}+${WEIGHTS.progression}*E${r}+${WEIGHTS.codeQuality}*F${r}+${WEIGHTS.testing}*G${r}+${WEIGHTS.aiUse}*H${r},1)`;
    const fixed = c.detail.bugs.filter((b) => b.fixed).map((b) => b.id);
    return [
      c.teamId,
      c.teamName,
      c.tier,
      c.scores.fixes,
      c.scores.progression,
      '',
      c.scores.testing,
      '',
      formula,
      `${fixed.length}/${c.detail.bugs.length} ${fixed.join(' ')}`,
      `${c.detail.tests.caught.length}/${c.detail.bugs.length} ${c.detail.tests.caught.join(' ')}`,
      c.detail.rooms.length,
      c.detail.morvath ? 'yes' : 'no',
      `${Math.round(c.detail.goodShare * 100)}% of ${c.detail.decisions.length}`,
      c.flags.join(' | '),
    ];
  });
  const cell = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  return [header, ...rows].map((row) => row.map(cell).join(',')).join('\n') + '\n';
}

function printCard(c) {
  console.log(`\n${c.teamName} (${c.teamId}, ${c.tier} start) — run ${c.run.phase} at turn ${c.run.turn}, led by ${c.run.leader ?? 'nobody yet'}`);
  console.log(`  Verified bug fixes   ${String(c.scores.fixes).padStart(3)} / 100`);
  for (const b of c.detail.bugs) console.log(`     ${b.fixed ? '✔' : '✖'} R${b.round} ${b.id} ${b.name} (${b.kind})${b.caught ? ' — caught by their tests' : ''}`);
  console.log(`  Gameplay progression ${String(c.scores.progression).padStart(3)} / 100   rooms ${c.detail.rooms.length}, Morvath ${c.detail.morvath ? 'defeated' : 'not defeated'}, ${Math.round(c.detail.goodShare * 100)}% good decisions`);
  const t = c.detail.tests;
  console.log(`  Testing & stability  ${String(c.scores.testing).padStart(3)} / 100   their tests catch ${t.caught.length}/${c.detail.bugs.length} bugs (${t.baselineTests} pass on the original game), ${c.detail.regressions.length} regression(s)${c.detail.regressions.length ? `: ${c.detail.regressions.join('; ')}` : ''}`);
  if (t.failingOnReference.length) console.log(`     not counted (fail on the original game): ${t.failingOnReference.join('; ')}`);
  console.log('  Code quality, Responsible AI use: for mentors');
  for (const f of c.flags) console.log(`  ⚠ ${f}`);
  if (c.detail.decisions.length) {
    console.log('  Decisions:');
    for (const d of c.detail.decisions) console.log(`     turn ${String(d.turn).padStart(3)} at ${d.at.padEnd(4)} → ${d.choice.padEnd(6)} ${d.verdict.padEnd(4)} (p=${d.pGood})`);
  }
}

// ---- CLI ----
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = cliArgs(process.argv.slice(2));
  const registry = loadRegistry();
  const out = resolve(args.out ?? join(ROOT, 'organiser', 'results'));
  let cards;
  if (args.all) {
    if (!args.submissions) throw new Error('--all needs --submissions <folder with one repo per team id>');
    cards = [];
    for (const t of registry.teams) {
      const repo = join(resolve(args.submissions), t.teamId);
      cards.push(await judgeTeam({ teamId: t.teamId, repo: existsSync(repo) ? repo : undefined, registry }));
    }
  } else {
    if (!args.team) {
      console.error('Usage: node scripts/quest-judge.mjs --team <id> --repo <their repo> [--save <save.json>]\n       node scripts/quest-judge.mjs --all --submissions <folder>');
      process.exit(2);
    }
    cards = [await judgeTeam({ teamId: args.team, repo: args.repo, savePath: args.save && resolve(args.save), registry })];
  }
  cards.forEach(printCard);
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, args.all ? 'rubric.csv' : `${cards[0].teamId}.csv`), rubricCsv(cards));
  writeFileSync(join(out, args.all ? 'cards.json' : `${cards[0].teamId}.json`), JSON.stringify(cards, null, 2));
  console.log(`\nWrote ${join(out, args.all ? 'rubric.csv' : `${cards[0].teamId}.csv`)} — open it in Excel or Sheets; mentors fill in the two blank columns.`);
}

function cliArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const m = argv[i].match(/^--([^=]+)(?:=(.*))?$/s);
    if (!m) continue;
    if (m[2] !== undefined) o[m[1]] = m[2];
    else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) o[m[1]] = argv[++i];
    else o[m[1]] = true;
  }
  return o;
}
void dirname;
