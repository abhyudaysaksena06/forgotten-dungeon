// The AI contract: { narration: string, suggested_choices: string[] }. Nothing else survives.
// The DM's words are flavour only — the server never reads them for HP, items, wins or losses.

export const NARRATION_MAX = 700;
export const CHOICE_MAX = 80;
export const CHOICES_MAX = 4;

export function validateDmOutput(raw) {
  let data = raw;
  if (typeof raw === 'string') {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      data = JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
  if (!data || typeof data !== 'object' || typeof data.narration !== 'string') return null;
  const narration = clean(data.narration).slice(0, NARRATION_MAX);
  if (!narration) return null;
  const suggested = Array.isArray(data.suggested_choices) ? data.suggested_choices : [];
  const suggested_choices = suggested
    .filter((c) => typeof c === 'string')
    .map((c) => clean(c).slice(0, CHOICE_MAX))
    .filter(Boolean)
    .slice(0, CHOICES_MAX);
  return { narration, suggested_choices };
}

function clean(text) {
  // Strip control characters and markup; the client renders text, never HTML.
  return text.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').replace(/<[^>]*>/g, '').trim();
}
