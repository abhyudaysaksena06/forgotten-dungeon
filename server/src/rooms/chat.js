export const CHAT_MAX = 300;

// "/whisper Name hello" or "/w Name hello" -> private; anything else is said to the party.
export function parseChat(raw) {
  const text = String(raw ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .trim()
    .slice(0, CHAT_MAX);
  if (!text) return null;
  // #region C2 whisper-parse
  const whisper = text.match(/^\/(?:whisper|w)\s+(\S+)\s+([\s\S]+)$/i);
  if (whisper) return { kind: 'whisper', to: whisper[1].replace(/^@/, ''), text: whisper[2].trim() };
  // #endregion C2
  if (text.startsWith('/')) return { kind: 'error', message: 'Unknown command.' };
  return { kind: 'say', text };
}
