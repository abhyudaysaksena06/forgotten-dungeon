import { HpBar, StatusChips } from './bits.jsx';

export default function PartyPanel({ players, meId, meta }) {
  return (
    <section aria-label="Party" className="space-y-2">
      <p className="eyebrow">Party</p>
      {players.map((p) => {
        const cls = meta.classes[p.cls];
        return (
          <article
            key={p.id}
            className={`panel p-3 ${p.id === meId ? 'border-bronze-dim' : ''} ${p.fallen ? 'opacity-60' : ''}`}
          >
            <header className="flex items-baseline justify-between gap-2">
              <h3 className="truncate font-display text-xl leading-none">
                {p.name}
                {p.id === meId && <span className="ml-1.5 font-mono text-[10px] text-bronze">you</span>}
                {p.npc && <span className="ml-1.5 font-mono text-[10px] text-verdigris">companion</span>}
              </h3>
              <span className="flex items-center gap-1.5 font-mono text-[11px] text-ash">
                {cls?.name}
              </span>
            </header>
            <div className="mt-2">
              <HpBar hp={p.hp} maxHp={p.maxHp} />
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <StatusChips p={p} />
              <span className="ml-auto shrink-0 font-mono text-[10px] text-ash" title={cls?.ability.description}>
                {cls?.ability.name} {p.cooldown > 0 ? `· ${p.cooldown}` : '· ready'}
              </span>
            </div>
            <p className="mt-1 font-mono text-[10px] text-ash/70">
              ATK {p.atk} · DEF {p.def}
            </p>
          </article>
        );
      })}
    </section>
  );
}
