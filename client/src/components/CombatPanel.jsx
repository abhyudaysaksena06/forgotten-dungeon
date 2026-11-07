import { useMemo, useState } from 'react';
import { COMBAT_ACTIONS, createCombatHandlers } from '../lib/actions.js';
import { Chip, Countdown, HpBar } from './bits.jsx';

// #region C1 telegraph-panel
function Telegraph({ boss, players }) {
  const t = boss.telegraph;
  if (!t) return null;
  const target = t.targetId ? players.find((p) => p.id === t.targetId)?.name : 'the whole party';
  const dmg = t.damage + (boss.enraged ? 5 : 0);
  return (
    <div className="mt-3 border-l-2 border-blood bg-blood/10 px-3 py-2">
      <p className="eyebrow text-blood">Next, the King will use</p>
      <p className="font-display text-2xl leading-tight">{t.name}</p>
      <p className="text-sm text-bone/80">
        {dmg} damage to {target}
        {t.poison ? ', and poisons' : ''}. Defend to halve it.
      </p>
    </div>
  );
}
// #endregion C1

export default function CombatPanel({ state, me, meta, act, serverNow }) {
  const combat = state.combat;
  const alive = state.enemies.filter((e) => e.hp > 0);
  const [targetId, setTargetId] = useState(null);
  const [allyId, setAllyId] = useState(me.id);
  const [itemUid, setItemUid] = useState('');
  const [busy, setBusy] = useState(false);
  // One intent per hero per round: a double-click or retry reuses the key, so it can never act twice.
  const roundKey = combat && `round-${state.code}-${state.sceneIndex}-${combat.round}`;
  const handlers = useMemo(() => createCombatHandlers((type, payload) => act(type, payload, roundKey)), [act, roundKey]);
  if (!combat) return null;

  const target = alive.find((e) => e.id === targetId) ?? alive[0];
  const ability = meta.classes[me.cls].ability;
  const usable = me.inventory.filter((s) => meta.items[s.item].target !== 'story');
  const chosenItem = usable.find((s) => s.uid === itemUid) ?? usable[0];
  const submitted = combat.submitted.includes(me.id);
  const waiting = state.players.filter((p) => !p.fallen && p.stun === 0 && !combat.submitted.includes(p.id));
  const locked = busy || combat.closed || submitted || me.fallen || me.stun > 0;

  const args = {
    attack: { targetId: target?.id },
    defend: {},
    ability: { targetId: ability.target === 'ally' ? allyId : target?.id },
    item: { itemUid: chosenItem?.uid, targetId: allyId },
  };
  const disabled = {
    ability: me.cooldown > 0,
    item: !chosenItem,
  };

  async function run(action) {
    setBusy(true);
    await handlers[action.handler](args[action.type]);
    setBusy(false);
  }

  const boss = state.boss && state.enemies.find((e) => e.id === state.boss.id);
  // #region C1 boss-targets
  // The King has his own bar above; he only joins the target list once thralls appear.
  const minions = state.enemies.filter((e) => !e.boss);
  const targetCards = boss && minions.length ? [boss, ...minions] : minions;
  // #endregion C1

  return (
    <section className="panel p-4" aria-label="Combat">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="eyebrow">Combat · round {combat.round}</p>
        {!combat.closed && <Countdown endsAt={combat.endsAt} serverNow={serverNow} />}
      </header>

      {/* #region C1 boss-panel */}
      {boss && (
        <div className="mb-4">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="font-display text-3xl leading-none text-bone">{boss.name}</h3>
            <span className="flex gap-1">
              {state.boss.enraged && <Chip className="border-blood text-blood">Enraged</Chip>}
              {state.boss.shardBonusReady && <Chip className="border-frost text-frost">Shards: first hit ×2</Chip>}
            </span>
          </div>
          <div className="mt-2">
            <HpBar hp={boss.hp} maxHp={boss.maxHp} label="The King" thick />
          </div>
          <Telegraph boss={state.boss} players={state.players} />
        </div>
      )}
      {/* #endregion C1 */}

      <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Target">
        {targetCards.map((e) => {
            const selected = target?.id === e.id;
            return (
              <button
                key={e.id}
                role="radio"
                aria-checked={selected}
                disabled={e.hp === 0}
                onClick={() => setTargetId(e.id)}
                className={`rounded border p-2 text-left transition-colors ${
                  selected ? 'border-blood bg-blood/10' : 'border-crypt-4 bg-crypt/60 hover:border-blood/60'
                } ${e.hp === 0 ? 'opacity-35' : ''}`}
              >
                <span className="flex items-baseline justify-between text-sm">
                  <span>{e.name}</span>
                  <span className="font-mono text-[10px] text-ash">DEF {e.def}</span>
                </span>
                <HpBar hp={e.hp} maxHp={e.maxHp} />
              </button>
            );
          })}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {COMBAT_ACTIONS.map((action) => (
          <button
            key={action.type}
            className={`btn ${action.type === 'attack' ? 'btn-primary' : ''}`}
            disabled={locked || disabled[action.type]}
            onClick={() => run(action)}
            title={action.type === 'ability' ? ability.description : undefined}
          >
            {action.type === 'ability' ? `${ability.name}${me.cooldown ? ` (${me.cooldown})` : ''}` : action.label}
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <label className="flex items-center gap-2">
          <span className="eyebrow">Item</span>
          <select className="field w-auto py-1 text-sm" value={chosenItem?.uid ?? ''} onChange={(e) => setItemUid(e.target.value)} disabled={!usable.length}>
            {usable.length === 0 && <option value="">Nothing usable</option>}
            {usable.map((s) => (
              <option key={s.uid} value={s.uid}>
                {meta.items[s.item].name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          <span className="eyebrow">on</span>
          <select className="field w-auto py-1 text-sm" value={allyId} onChange={(e) => setAllyId(e.target.value)}>
            {state.players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} {p.fallen ? '(Fallen)' : `(${p.hp}/${p.maxHp})`}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="mt-3 font-mono text-xs text-ash" aria-live="polite">
        {me.fallen
          ? 'You have Fallen. A Mend or a Revive Charm can bring you back.'
          : me.stun > 0
            ? 'You are Stunned and lose this turn.'
            : submitted
              ? waiting.length
                ? `Action locked in. Waiting for ${waiting.map((p) => p.name).join(', ')}.`
                : 'Resolving…'
              : 'Pick a target, then an action. Heroes who do not act in time raise their guard.'}
      </p>
    </section>
  );
}
