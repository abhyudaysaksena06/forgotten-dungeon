import { useEffect, useMemo, useRef, useState } from 'react';

const TONE = {
  narration: 'font-body italic text-bone/90',
  chat: 'text-frost',
  npc: 'text-verdigris/90',
  check: 'font-mono text-xs text-bronze',
  attack: 'text-bone/85',
  enemy_attack: 'text-blood/90',
  fallen: 'text-blood font-medium',
  shard: 'text-frost',
  loot: 'text-verdigris',
  item: 'text-verdigris',
  stage: 'font-display text-lg text-bronze',
  stage_clear: 'font-display text-lg text-verdigris',
  victory: 'font-display text-xl text-verdigris',
  defeat: 'font-display text-xl text-blood',
  telegraph: 'text-blood/80',
  boss_phase: 'font-medium text-blood',
  fate: 'font-mono text-xs text-bronze',
};

export default function LogChat({ log, whispers, say, me, spectator }) {
  const [text, setText] = useState('');
  const listRef = useRef(null);

  // Whispers are local to this browser and never part of the shared log.
  const entries = useMemo(() => {
    const ws = whispers.map((w, i) => ({
      key: `w${i}-${w.at}`,
      at: w.at,
      whisper: true,
      text: w.fromId === me?.id ? `you whisper to ${w.to}: ${w.text}` : `${w.from} whispers: ${w.text}`,
    }));
    return [...log.map((e) => ({ ...e, key: `l${e.id}` })), ...ws].slice(-120);
  }, [log, whispers, me?.id]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries.length]);

  async function send(e) {
    e.preventDefault();
    if (!text.trim()) return;
    const reply = await say(text);
    if (reply?.ok) setText('');
  }

  return (
    <section className="panel flex min-h-0 flex-col" aria-label="Chronicle and chat">
      <p className="eyebrow px-3 pt-3">Chronicle</p>
      <ol ref={listRef} className="mt-2 max-h-[26rem] min-h-40 flex-1 space-y-1.5 overflow-y-auto px-3 pb-2 text-sm leading-snug" aria-live="polite">
        {entries.map((e) => (
          <li key={e.key} className={e.whisper ? 'border-l-2 border-frost/60 pl-2 text-frost/90 italic' : TONE[e.type] ?? 'text-ash'}>
            {e.text}
          </li>
        ))}
      </ol>
      {!spectator && (
      <form onSubmit={send} className="flex gap-2 border-t border-crypt-3 p-2">
        <input
          className="field py-1.5 text-sm"
          value={text}
          maxLength={300}
          onChange={(e) => setText(e.target.value)}
          placeholder="Talk to the party, or /w Quill defend"
          aria-label="Chat message"
        />
        <button className="btn px-3 py-1.5 text-sm" disabled={!text.trim()}>
          Send
        </button>
      </form>
      )}
    </section>
  );
}
