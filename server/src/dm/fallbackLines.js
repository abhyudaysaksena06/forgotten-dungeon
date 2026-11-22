// 20 pre-written lines for when the narrator is slow, broken or switched off.
// Placeholders: {party} {scene} {stage} {enemy}.
export const FALLBACK_LINES = {
  scene_intro: [
    'Dust drifts down from the vaulted ceiling as {party} step into {scene}.',
    'The torchlight shivers. {scene} has been waiting a very long time for visitors.',
    'Somewhere below, a bell tolls once. {party} press on into {scene}.',
    'The air in {scene} tastes of old iron and older secrets.',
  ],
  check_result: [
    'The dungeon tests you, and the dice give their answer.',
    'Stone grinds against stone; whatever happened, there is no going back.',
    'For a heartbeat the shadows hold still — then the moment passes.',
    'The echoes of your choice roll away down the corridor.',
  ],
  combat_round: [
    'Steel rings on bone, and the darkness answers with a hiss.',
    'Sparks scatter across the flagstones as the melee surges.',
    '{enemy} reels, gathers itself, and comes again.',
    'Breath comes ragged now. Every blow counts.',
  ],
  combat_won: [
    'The last of the foes collapses into dust and silence.',
    'The fight is over. The dungeon holds its breath, listening for the next one.',
  ],
  victory: [
    'The Forgotten King exhales one last memory and is gone. {party} are remembered.',
    'Crowns clatter from the empty throne. The dungeon will tell this story for a thousand years.',
  ],
  defeat: [
    'The torches gutter out one by one. But the dungeon is patient, and so is fate. Try again.',
    'Darkness closes over {party}. The checkpoint stones begin to glow...',
  ],
};

export const FALLBACK_COUNT = Object.values(FALLBACK_LINES).reduce((n, lines) => n + lines.length, 0);

export function fallbackNarration(context, pick = (n) => Math.floor(Math.random() * n)) {
  const lines = FALLBACK_LINES[context.trigger?.type] ?? FALLBACK_LINES.check_result;
  const line = lines[pick(lines.length)];
  const vars = {
    party: context.party?.map((p) => p.name).join(', ') || 'the party',
    scene: context.scene?.title ?? 'the dark',
    stage: context.stage?.name ?? 'the dungeon',
    enemy: context.enemies?.[0]?.name ?? 'The enemy',
  };
  return { narration: line.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? ''), suggested_choices: [] };
}
