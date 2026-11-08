// Big anime-style announcements: BATTLE START!, BOSS BATTLE!, VICTORY!, LEVEL UP!, quest pops.
// Worked out from what changed between two server states, so they always match what happened.

const roomName = (meta, id) => meta?.rooms?.[id]?.name ?? '';

export function bannersFor(prev, next, meta) {
  if (!next) return [];
  // A brand-new run: Kael sets out, and the first quests are handed out.
  if (!prev) {
    const quests = next.turn === 0 ? (next.quests ?? []).filter((q) => !q.done) : [];
    return quests.length ? [{ kind: 'quest', title: 'New Quests', sub: quests.map((q) => q.title).join(' · '), note: '' }] : [];
  }
  const out = [];
  const pc = prev.combat;
  const nc = next.combat;

  // A fight starts.
  if (next.phase === 'combat' && (prev.phase !== 'combat' || pc?.roomId !== nc.roomId)) {
    const final = meta?.rooms?.[nc.roomId]?.final;
    out.push({ kind: final ? 'boss' : 'battle', title: final ? 'Final Battle' : 'Battle Start!', sub: roomName(meta, nc.roomId) });
  }
  // Same fight, next wave: the room's boss steps out.
  if (pc && nc && pc.roomId === nc.roomId && nc.waveIndex > pc.waveIndex) {
    const boss = nc.enemies.find((e) => e.boss && e.hp > 0);
    out.push({ kind: 'boss', title: 'Boss Battle!', sub: boss?.name ?? '' });
  }
  // Morvath changes phase.
  const pb = pc?.enemies.find((e) => e.ultimate);
  const nb = nc?.enemies.find((e) => e.ultimate);
  if (pb && nb && nb.phase > pb.phase) {
    out.push(nb.phase === 2 ? { kind: 'boss', title: 'The Change', sub: 'Morvath becomes the Shadow Dragon' } : { kind: 'boss', title: 'Dragon’s Breath', sub: 'Defend when the fire is drawn in' });
  }
  // A room is won.
  if (prev.phase === 'combat' && next.phase === 'map' && next.fragments.length > prev.fragments.length) {
    out.push({ kind: 'victory', title: 'Victory!', sub: `Heart fragment ${next.fragments.length} of 5`, note: next.cages ? 'The cage is open: the Healer and the Weaponsmith are free' : '' });
  }
  // The whole party fell.
  if ((next.stats?.wipes ?? 0) > (prev.stats?.wipes ?? 0)) {
    out.push({ kind: 'defeat', title: 'Defeated…', sub: `${next.party[0]?.name ?? 'The hero'} wakes by the campfire` });
  }
  // Level ups.
  const ups = next.party.filter((m) => m.level > (prev.party.find((p) => p.id === m.id)?.level ?? m.level));
  if (ups.length) out.push({ kind: 'level', title: 'Level Up!', sub: ups.map((m) => `${m.name} Lv ${m.level}`).join(' · ') });

  // Quests: finished first, then new ones.
  const before = new Map((prev.quests ?? []).map((q) => [q.id, q]));
  for (const q of next.quests ?? []) {
    if (q.done && before.has(q.id) && !before.get(q.id).done) out.push({ kind: 'quest', title: 'Quest Clear!', sub: q.title, note: `Reward: ${q.reward}` });
  }
  const fresh = (next.quests ?? []).filter((q) => !before.has(q.id) && !q.done);
  if (fresh.length) out.push({ kind: 'quest', title: fresh.length > 1 ? 'New Quests' : 'New Quest', sub: fresh.map((q) => q.title).join(' · '), note: fresh.length === 1 && fresh[0].giver ? `From ${fresh[0].giver}` : '' });
  return out;
}

// A skill cut-in for the player's own move.
export function cutInFor(action, me, meta) {
  if (!me || !meta) return null;
  if (action.type === 'rune') return { kind: 'skill', title: 'Rune Strike!', sub: me.name };
  if (action.type === 'skill') return { kind: 'skill', title: `${meta.classes[me.cls].skill.name}!`, sub: me.name };
  return null;
}

export const BANNER_MS = { skill: 950, battle: 1500, boss: 1700, victory: 1700, defeat: 1900, level: 1500, quest: 2200 };
