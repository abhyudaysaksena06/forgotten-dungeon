// Optional LLM narrator. Server-side only; the key is read from the environment and never sent
// to the browser. Returns raw text — dungeonMaster.js validates it.
import { DM_SYSTEM_PROMPT, buildUserPrompt } from './prompt.js';

export function createAnthropicNarrator({ apiKey, model }) {
  return async function narrate(context, signal) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 400,
        system: DM_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildUserPrompt(context) }],
      }),
    });
    if (!res.ok) throw new Error(`LLM HTTP ${res.status}`);
    const body = await res.json();
    return body.content?.find((c) => c.type === 'text')?.text ?? '';
  };
}
