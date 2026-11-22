import { useState } from 'react';

const SKILL_HINT = { might: 'forcing, smashing', arcana: 'runes, magic', cunning: 'traps, locks', wisdom: 'lore, spirits, poison' };
const COMPANION_NAMES = { warrior: 'Brannoc', mage: 'Ysolde', rogue: 'Quill', healer: 'Maren' };

export default function Lobby({ state, me, meta, act, onLeave }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(state.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked; the code is on screen.
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 md:px-8">
      <header className="flex flex-wrap items-end justify-between gap-6 border-b border-crypt-3 pb-6">
        <div>
          <p className="eyebrow">Run code — others can watch with it</p>
          <button onClick={copy} className="mt-1 font-mono text-5xl font-semibold tracking-[0.25em] text-bronze hover:text-bone" title="Copy run code">
            {state.code}
          </button>
          <span className="ml-3 font-mono text-xs text-ash" aria-live="polite">
            {copied ? 'copied' : ''}
          </span>
        </div>
        <button className="btn text-sm" onClick={() => onLeave()}>
          Abandon run
        </button>
      </header>

      <section className="mt-8">
        <h2 className="font-display text-3xl">Choose your class, {me.name}</h2>
        <p className="mt-1 text-sm text-ash">The three classes you don't pick join you as AI companions. Each class gets +3 on checks that match its specialty.</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Object.entries(meta.classes).map(([id, c]) => {
            const picked = me.cls === id;
            return (
              <button
                key={id}
                onClick={() => act('choose_class', { cls: id })}
                aria-pressed={picked}
                className={`panel flex flex-col p-4 text-left transition-colors ${picked ? 'border-bronze bg-bronze/10' : 'hover:border-bronze-dim'}`}
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className="font-display text-3xl leading-none">{c.name}</span>
                  <span className="font-mono text-[11px] text-ash">{picked ? 'you' : `or ${COMPANION_NAMES[id]}`}</span>
                </span>
                <span className="mt-3 grid grid-cols-3 gap-2 font-mono text-xs">
                  <Stat label="HP" value={c.hp} />
                  <Stat label="ATK" value={c.atk} />
                  <Stat label="DEF" value={c.def} />
                </span>
                <span className="mt-4 text-sm text-bronze">{c.ability.name}</span>
                <span className="text-sm text-bone/80">{c.ability.description}</span>
                <span className="mt-1 font-mono text-[11px] text-ash">Cooldown {c.ability.cooldown} rounds</span>
                <span className="mt-3 text-xs text-ash">
                  +3 {meta.skills[c.specialty]} ({SKILL_HINT[c.specialty]})
                </span>
                <span className="mt-auto pt-3 text-xs text-ash">Starts with {itemList(c.startingItems, meta)}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="mt-10 flex flex-wrap items-center justify-between gap-4">
        <p className="max-w-xl text-sm text-ash">
          {me.cls
            ? `Your companions: ${Object.keys(meta.classes)
                .filter((c) => c !== me.cls)
                .map((c) => `${COMPANION_NAMES[c]} the ${meta.classes[c].name}`)
                .join(', ')}.`
            : 'Pick a class to meet your companions.'}
        </p>
        <button className="btn btn-primary px-8 py-3 text-lg" disabled={!me.cls} onClick={() => act('start')}>
          Enter the dungeon
        </button>
      </section>
    </main>
  );
}

// ['health_potion', 'health_potion', 'torch'] -> "2× Health Potion, Torch"
function itemList(items, meta) {
  const counts = items.reduce((acc, id) => acc.set(id, (acc.get(id) ?? 0) + 1), new Map());
  return [...counts].map(([id, n]) => `${n > 1 ? `${n}× ` : ''}${meta.items[id].name}`).join(', ');
}

function Stat({ label, value }) {
  return (
    <span className="rounded-sm bg-crypt px-2 py-1">
      <span className="block text-[10px] text-ash">{label}</span>
      <span className="text-base text-bone">{value}</span>
    </span>
  );
}
