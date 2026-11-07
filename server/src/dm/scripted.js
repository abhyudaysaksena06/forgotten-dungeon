// The default narrator: no network, no API key. Builds narration from the scene script and the
// live party state, so it never "forgets" HP, items or shards.

const OUTCOME_LINES = {
  critical_success: 'A perfect moment — the dungeon itself seems to bow.',
  success: 'It works. The way ahead opens.',
  partial: 'It works, but not cleanly; someone is bleeding for it.',
  fail: 'It goes wrong, the way things in old places always do.',
  critical_fail: 'Catastrophe. The whole party will remember this one.',
};

export function scriptedNarration(context) {
  const t = context.trigger ?? {};
  const parts = [];
  switch (t.type) {
    case 'scene_intro':
      parts.push(context.scene?.intro ?? 'The dark presses close.');
      if (context.bossIntent) parts.push(`He raises a hand: ${context.bossIntent.attack}, aimed at ${context.bossIntent.target}.`);
      break;
    case 'check_result':
      parts.push(OUTCOME_LINES[t.outcome] ?? 'The dice have spoken.');
      break;
    case 'combat_round': {
      const foes = context.enemies ?? [];
      const list = foes.map((e) => `${e.name} (${e.hp}/${e.maxHp})`).join(', ');
      parts.push(foes.length ? `${list} still ${foes.length > 1 ? 'stand' : 'stands'}.` : 'The last foe sways.');
      if (context.bossIntent) {
        parts.push(`${context.bossIntent.enraged ? 'Enraged, the' : 'The'} King draws breath for ${context.bossIntent.attack} against ${context.bossIntent.target}.`);
      }
      break;
    }
    case 'combat_won':
      parts.push('Silence returns, broken only by the party catching its breath.');
      break;
    case 'victory':
      parts.push('The Forgotten King remembers, at the very end, what it was to be mortal — and lets go.');
      break;
    case 'defeat':
      parts.push('The last light goes out. The checkpoint stones glow, offering one more chance.');
      break;
    default:
      return null;
  }

  if (t.type !== 'victory' && t.type !== 'defeat') {
    const hurt = (context.party ?? []).filter((p) => !p.fallen && p.maxHp && p.hp / p.maxHp < 0.35);
    const fallen = (context.party ?? []).filter((p) => p.fallen);
    if (fallen.length) parts.push(`${fallen.map((p) => p.name).join(' and ')} ${fallen.length > 1 ? 'lie' : 'lies'} Fallen.`);
    else if (hurt.length) parts.push(`${hurt[0].name} is badly hurt (${hurt[0].hp} HP).`);
    if (t.type === 'scene_intro' && context.shards?.found) {
      const n = context.shards.found;
      parts.push(n > 1 ? `The ${n} Memory Shards in your packs hum softly.` : 'The Memory Shard in your pack hums softly.');
    }
  }
  return { narration: parts.join(' '), suggested_choices: context.options ?? [] };
}
