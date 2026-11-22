import { hpPercent, hpTone, secondsLeft } from '../lib/format.js';
import { useNow } from '../useRoom.js';

const TONE = { high: 'bg-verdigris', mid: 'bg-bronze', low: 'bg-blood', fallen: 'bg-crypt-4' };

export function HpBar({ hp, maxHp, label = 'HP', thick = false }) {
  const pct = hpPercent(hp, maxHp);
  return (
    <div>
      <div className="flex items-baseline justify-between font-mono text-[11px] text-ash">
        <span>{label}</span>
        <span className={hp === 0 ? 'text-blood' : 'text-bone'}>
          {hp}/{maxHp}
        </span>
      </div>
      <div
        className={`mt-1 overflow-hidden rounded-sm bg-crypt ${thick ? 'h-3' : 'h-1.5'}`}
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={maxHp}
        aria-valuenow={hp}
      >
        <div className={`h-full transition-[width] duration-500 ${TONE[hpTone(hp, maxHp)]}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function Countdown({ endsAt, serverNow, total = 30 }) {
  useNow(250);
  const left = secondsLeft(endsAt, serverNow());
  const pct = Math.min(100, (left / total) * 100);
  return (
    <div className="flex items-center gap-2 font-mono text-xs text-ash" aria-live="off">
      <div className="h-1 w-20 overflow-hidden rounded-sm bg-crypt">
        <div className={`h-full ${left <= 5 ? 'bg-blood' : 'bg-bronze'} transition-[width] duration-200`} style={{ width: `${pct}%` }} />
      </div>
      <span className={left <= 5 ? 'text-blood' : ''}>{left}s</span>
    </div>
  );
}

export function StatusChips({ p }) {
  return (
    <span className="flex flex-wrap gap-1">
      {p.fallen && <Chip className="border-blood text-blood">Fallen</Chip>}
      {p.poison > 0 && <Chip className="border-venom text-venom">Poison {p.poison}</Chip>}
      {p.stun > 0 && <Chip className="border-frost text-frost">Stunned</Chip>}
      {p.defending && <Chip className="border-bronze text-bronze">Guarding</Chip>}
    </span>
  );
}

export function Chip({ children, className = '' }) {
  return <span className={`rounded-sm border px-1.5 py-px font-mono text-[10px] uppercase tracking-wider ${className}`}>{children}</span>;
}

export function ShardTrack({ found, total }) {
  return (
    <span className="flex items-center gap-1" title={`${found} of ${total} Memory Shards`} aria-label={`${found} of ${total} Memory Shards`}>
      {Array.from({ length: total }, (_, i) => (
        <svg key={i} viewBox="0 0 10 14" className={`h-3.5 w-2.5 ${i < found ? 'fill-frost' : 'fill-none stroke-crypt-4'}`} strokeWidth="1.2">
          <path d="M5 0 10 5 5 14 0 5Z" />
        </svg>
      ))}
    </span>
  );
}
