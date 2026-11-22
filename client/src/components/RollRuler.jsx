import { formatRoll, outcomeLabel, rollBands } from '../lib/format.js';

// The d20 laid out as a ruler: every face coloured by what it would have meant, the DC marked,
// and the face the server actually rolled dropped onto it.
const BAND = {
  fumble: 'bg-blood/70',
  fail: 'bg-blood/25',
  partial: 'bg-bronze/35',
  success: 'bg-verdigris/35',
  crit: 'bg-verdigris',
};

function D20Ruler({ roll }) {
  const bands = rollBands(roll);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate text-sm text-bone/90">{roll.label}</span>
        <span className="shrink-0 font-mono text-xs text-ash">{roll.dc != null ? `DC ${roll.dc}` : 'Attack'}</span>
      </div>
      <div className="relative mt-9 grid gap-px" style={{ gridTemplateColumns: 'repeat(20, minmax(0, 1fr))' }}>
        {bands.map((band, i) => {
          const face = i + 1;
          const rolled = face === roll.value;
          return (
            <div key={face} className="relative">
              <div className={`h-5 ${BAND[band]} ${rolled ? 'ring-2 ring-bone' : ''}`} />
              {rolled && (
                <span className="marker-drop absolute -top-7 left-1/2 -translate-x-1/2 rounded-sm bg-bone px-1 font-mono text-xs font-semibold text-crypt">
                  {face}
                </span>
              )}
              {(face === 1 || face === 10 || face === 20) && <span className="absolute top-6 left-0 font-mono text-[9px] text-ash/70">{face}</span>}
            </div>
          );
        })}
      </div>
      <div className="mt-5 flex items-baseline justify-between gap-3">
        <span className="font-mono text-lg text-bone">{formatRoll(roll)}</span>
        <span className={`font-display text-xl ${/fail|miss/.test(roll.outcome ?? '') ? 'text-blood' : 'text-verdigris'}`}>
          {outcomeLabel(roll.outcome)}
        </span>
      </div>
    </div>
  );
}

export default function RollRuler({ rolls }) {
  if (!rolls?.length) return null;
  const d20s = rolls.filter((r) => r.die === 'd20');
  const others = rolls.filter((r) => r.die !== 'd20');
  return (
    <section className="panel p-4" aria-label="Last rolls">
      <p className="eyebrow mb-4">The dice</p>
      <div className="space-y-6">
        {d20s.map((roll, i) => (
          <D20Ruler key={`${roll.label}-${i}`} roll={roll} />
        ))}
      </div>
      {others.length > 0 && (
        <p className="mt-4 font-mono text-xs text-ash">
          {others.map((r) => `${r.label}: ${r.die} ${formatRoll(r)}`).join(' · ')}
        </p>
      )}
    </section>
  );
}
