// The AI tells the story; the server runs the rules. Provider chain:
//   LLM (optional, ~8 s timeout) -> scripted narrator -> pre-written fallback line.
import { createAnthropicNarrator } from './anthropic.js';
import { fallbackNarration } from './fallbackLines.js';
import { scriptedNarration } from './scripted.js';
import { validateDmOutput } from './validate.js';

export function createDungeonMaster({ provider = 'scripted', apiKey, model, timeoutMs = 8000, llm } = {}) {
  const remote = llm ?? (provider === 'anthropic' && apiKey ? createAnthropicNarrator({ apiKey, model }) : null);

  return {
    mode: remote ? 'llm' : 'scripted',
    async narrate(context) {
      if (remote) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const raw = await remote(context, controller.signal);
          const valid = validateDmOutput(raw);
          if (valid) return { ...valid, source: 'llm' };
        } catch {
          // Timeout or bad response: fall through to the script.
        } finally {
          clearTimeout(timer);
        }
      }
      const scripted = validateDmOutput(scriptedNarration(context));
      if (scripted) return { ...scripted, source: 'scripted' };
      return { ...fallbackNarration(context), source: 'fallback' };
    },
  };
}
