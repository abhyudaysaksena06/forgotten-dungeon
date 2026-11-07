// Balance simulator: plays seeded single-hero runs (hero + 3 AI companions) and prints win rates.
// The hero is played two ways: "careless" (always attacks, takes the first option) and
// "careful" (plays like a companion: reads the telegraph, heals, defends).
//   node scripts/balance.mjs
//   node scripts/balance.mjs --runs=200 --boss-base=140 --crown=30 --wail=12
import { availableOptions } from '../src/engine/game.js';
import { BOSS_ATTACKS, ENEMIES } from '../src/engine/combat.js';
import { SCENES } from '../src/engine/dungeon.js';
import { npcCombatAction, npcUpkeep, npcVote } from '../src/engine/npc.js';
import { aid, makeManager, playToEnd, startedRoom } from '../test/helpers.js';

const args = cliArgs(process.argv.slice(2));
const runs = Number(args.runs ?? 60);
if (args['boss-base']) ENEMIES.forgotten_king.hp = Number(args['boss-base']);
if (args['boss-def']) ENEMIES.forgotten_king.def = Number(args['boss-def']);
if (args.crown) BOSS_ATTACKS.crown_strike.damage = Number(args.crown);
if (args.wail) BOSS_ATTACKS.grave_wail.damage = Number(args.wail);

const careless = () => ({});

function careful(manager, code) {
  return (s) => {
    const hero = s.players[s.hostId];
    if (s.phase === 'scene') {
      // Between rooms the careful hero tends to themselves like a companion would.
      for (const intent of npcUpkeep(s, hero)) {
        const type = intent.type === 'item' ? 'use_item' : 'use_ability';
        manager.perform(code, hero.id, { actionId: aid(), type, payload: intent }).catch(() => {});
      }
      return { optionId: npcVote(s, hero, availableOptions(s, SCENES[s.sceneIndex])).optionId };
    }
    return { combat: npcCombatAction(s, hero) };
  };
}

console.log(`${runs} runs each · King HP ${ENEMIES.forgotten_king.hp}+60/hero · Crown ${BOSS_ATTACKS.crown_strike.damage} · Wail ${BOSS_ATTACKS.grave_wail.damage}`);
for (const cls of ['warrior', 'mage', 'rogue', 'healer']) {
  const row = [];
  for (const [label, strategy] of [['careless', null], ['careful', careful]]) {
    let wins = 0;
    let score = 0;
    for (let i = 0; i < runs; i++) {
      const { manager } = makeManager({ seed: `balance-${i}` });
      const { code } = await startedRoom(manager, cls);
      const s = await playToEnd(manager, code, strategy ? strategy(manager, code) : careless, 1500);
      if (s.phase === 'victory') wins++;
      score += s.score?.total ?? 0;
    }
    row.push(`${label} ${String(Math.round((100 * wins) / runs)).padStart(3)}% (score ${String(Math.round(score / runs)).padStart(3)})`);
  }
  console.log(`hero ${cls.padEnd(8)} ${row.join('   ')}`);
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
