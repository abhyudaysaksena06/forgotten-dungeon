import { useState } from 'react';

export default function Inventory({ me, players, meta, act, phase }) {
  const [targetId, setTargetId] = useState(me.id);
  const slots = Array.from({ length: meta.inventorySlots }, (_, i) => me.inventory[i] ?? null);
  const canUse = phase === 'scene' && !me.fallen;

  return (
    <section className="panel p-3" aria-label="Your pack">
      <header className="mb-2 flex items-center justify-between gap-2">
        <p className="eyebrow">
          Your pack · {me.inventory.length}/{meta.inventorySlots}
        </p>
        {canUse && (
          <select className="field w-auto py-0.5 text-xs" value={targetId} onChange={(e) => setTargetId(e.target.value)} aria-label="Use items on">
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                on {p.id === me.id ? 'yourself' : p.name}
              </option>
            ))}
          </select>
        )}
      </header>
      <ul className="grid grid-cols-3 gap-1.5">
        {slots.map((slot, i) => {
          if (!slot) return <li key={`empty-${i}`} className="h-16 rounded border border-dashed border-crypt-4" aria-label="Empty slot" />;
          const item = meta.items[slot.item];
          const usable = canUse && item.target !== 'story';
          return (
            <li key={slot.uid}>
              <button
                className="flex h-16 w-full flex-col justify-between rounded border border-crypt-4 bg-crypt/70 p-1.5 text-left transition-colors hover:border-bronze-dim disabled:hover:border-crypt-4"
                disabled={!usable}
                title={item.description}
                onClick={() => act('use_item', { itemUid: slot.uid, targetId }, `item-${phase}-${slot.uid}`)}
              >
                <span className="text-xs leading-tight text-bone">{item.name}</span>
                <span className="font-mono text-[9px] uppercase tracking-wider text-ash">
                  {item.target === 'story' ? 'key item' : usable ? 'use' : phase === 'combat' ? 'in action bar' : ''}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
