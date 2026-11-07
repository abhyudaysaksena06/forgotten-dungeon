const TIER = { easy: 'text-verdigris', medium: 'text-bronze', advanced: 'text-blood', relic: 'text-frost' };

export function CurseList({ curses }) {
  return (
    <ul className="divide-y divide-crypt-3">
      {curses.map((c) => (
        <li key={c.id} className="flex items-start gap-3 py-2">
          <span className={`w-7 shrink-0 font-mono text-xs font-semibold ${TIER[c.tier]}`}>{c.id}</span>
          <span className="min-w-0 flex-1">
            <span className={`block font-display text-lg leading-tight ${c.lifted ? 'text-ash line-through decoration-verdigris/70' : ''}`}>{c.name}</span>
            <span className="block text-xs text-ash">{c.symptom ?? 'Symptom hidden — find it in play.'}</span>
          </span>
          <span className={`shrink-0 font-mono text-[10px] uppercase ${c.lifted ? 'text-verdigris' : 'text-ash/70'}`}>
            {c.lifted ? 'lifted' : `${c.points} pts`}
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function CurseLedger({ event, onClose }) {
  if (!event) return null;
  const lifted = event.curses.filter((c) => c.lifted).length;
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-crypt/70 backdrop-blur-sm" onClick={onClose}>
      <aside
        className="h-full w-full max-w-md overflow-y-auto border-l border-crypt-3 bg-crypt-2 p-5"
        onClick={(e) => e.stopPropagation()}
        aria-label="Curse Ledger"
        role="dialog"
      >
        <header className="mb-4 flex items-baseline justify-between">
          <h2 className="font-display text-3xl text-bronze">Curse Ledger</h2>
          <button className="btn px-2 py-1 text-sm" onClick={onClose} autoFocus>
            Close
          </button>
        </header>
        <p className="mb-3 text-sm text-ash">
          {lifted} of {event.curses.length} curses lifted. Each one is a bug in this site; the organisers' judge lifts it when your fix
          passes.
        </p>
        <CurseList curses={event.curses} />
        <h3 className="eyebrow mt-6 mb-2">Client calls</h3>
        <ul className="space-y-1 text-sm">
          {event.calls.map((c) => (
            <li key={c.id} className="flex justify-between">
              <span>{c.name}</span>
              <span className={`font-mono text-xs ${c.released ? 'text-verdigris' : 'text-ash'}`}>{c.released ? 'released' : `at ${c.releaseAt} min`}</span>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
