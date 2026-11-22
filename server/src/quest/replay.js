// Rebuilds a run from its profile and its list of inputs. Used by autosave (resume after a
// restart) and by the judge (on a clean copy of the engine, to catch cheating).
import { QuestError, createRun, step } from './engine.js';

export function replay(profile, actions, engine = { createRun, step }) {
  let state = engine.createRun(profile);
  for (let i = 0; i < actions.length; i++) {
    try {
      state = engine.step(state, actions[i]);
    } catch (err) {
      if (!(err instanceof QuestError) && err?.name !== 'QuestError' && !err?.code) throw err;
      return { state, applied: i, invalidAt: i, error: err.message };
    }
  }
  return { state, applied: actions.length, invalidAt: null, error: null };
}
