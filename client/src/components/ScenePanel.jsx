import { useState } from 'react';
import { Countdown } from './bits.jsx';

export default function ScenePanel({ state, me, meta, act, serverNow }) {
  const vote = state.vote;
  const [busy, setBusy] = useState(false);
  const [mendTarget, setMendTarget] = useState(me?.id);
  if (!vote) return null;

  const myVote = vote.votes[me.id];
  const alive = state.players.filter((p) => !p.fallen);
  // The hero's vote counts double.
  const weight = (p) => (p.npc ? 1 : 2);
  const tally = (optionId) => alive.filter((p) => vote.votes[p.id] === optionId).reduce((n, p) => n + weight(p), 0);
  const ability = me.cls ? meta.classes[me.cls].ability : null;
  const canUseAbility = ability && !ability.combatOnly && !me.fallen && me.cooldown === 0;

  async function choose(optionId) {
    setBusy(true);
    await act('vote', { optionId }, `vote-${state.code}-${vote.id}-${optionId}`);
    setBusy(false);
  }

  return (
    <section className="panel p-4" aria-label="Choose what to do">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="eyebrow">{me.fallen ? 'Your companions decide while you are Fallen' : myVote ? 'Your vote is in (it counts double)' : 'Your call — your vote counts double'}</p>
        {!vote.closed && <Countdown endsAt={vote.endsAt} serverNow={serverNow} />}
      </header>

      <div className="space-y-2">
        {vote.options.map((o) => {
          const voters = state.players.filter((p) => vote.votes[p.id] === o.id);
          const mine = myVote === o.id;
          return (
            <button
              key={o.id}
              onClick={() => choose(o.id)}
              disabled={busy || vote.closed || me.fallen}
              aria-pressed={mine}
              className={`group w-full rounded border px-3 py-3 text-left transition-colors ${
                mine ? 'border-bronze bg-bronze/10' : 'border-crypt-4 bg-crypt/60 hover:border-bronze-dim'
              }`}
            >
              <span className="block text-base leading-snug text-bone">{o.label}</span>
              <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-ash">
                {o.noCheck ? (
                  <span className="text-verdigris">No roll · uses a {meta.items[o.requires]?.name}</span>
                ) : (
                  <>
                    <span>{meta.skills[o.skill]}</span>
                    <span>{o.dc ? `DC ${o.dc} (${o.difficulty})` : 'DC ?'}</span>
                    {Object.entries(meta.classes)
                      .filter(([, c]) => c.specialty === o.skill)
                      .map(([id, c]) => (
                        <span key={id} className="text-bronze/80">
                          +3 {c.name}
                        </span>
                      ))}
                  </>
                )}
                {voters.length > 0 && (
                  <span className="ml-auto text-bone/80">
                    {voters.map((p) => (p.npc ? p.name : 'You')).join(', ')} · {tally(o.id)}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {(state.scouted || canUseAbility) && (
        <footer className="mt-4 flex flex-wrap items-center gap-3 border-t border-crypt-3 pt-3 text-sm">
          {state.scouted && <span className="text-verdigris">Scouted{state.nextRoom ? ` · next: ${state.nextRoom}` : ''}</span>}
          {canUseAbility && ability.id === 'scout' && !state.scouted && (
            <button className="btn py-1 text-sm" onClick={() => act('use_ability', {})}>
              Scout ahead
            </button>
          )}
          {canUseAbility && ability.id === 'mend' && (
            <span className="flex items-center gap-2">
              <select className="field w-auto py-1 text-sm" value={mendTarget} onChange={(e) => setMendTarget(e.target.value)} aria-label="Mend target">
                {state.players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.hp}/{p.maxHp})
                  </option>
                ))}
              </select>
              <button className="btn py-1 text-sm" onClick={() => act('use_ability', { targetId: mendTarget })}>
                Mend
              </button>
            </span>
          )}
        </footer>
      )}
    </section>
  );
}
