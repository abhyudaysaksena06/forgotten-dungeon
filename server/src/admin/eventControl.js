// Organiser controls for one event: the clock, Client Call releases, the Curse Ledger and judge runs.
import { CLIENT_CALLS } from './calls.js';
import { CURSES } from './curses.js';

export class EventControl {
  constructor({ durationMinutes = 90, clock = Date.now, broadcast = () => {} } = {}) {
    this.clock = clock;
    this.broadcast = broadcast;
    this.timer = { startedAt: null, durationMinutes };
    this.calls = Object.fromEntries(CLIENT_CALLS.map((c) => [c.id, { released: false, at: null }]));
    this.curses = Object.fromEntries(CURSES.map((c) => [c.id, { lifted: false, at: null }]));
    this.judgeRuns = [];
  }

  startTimer() {
    this.timer.startedAt = this.clock();
    this.broadcast('event', this.publicInfo());
  }

  releaseCall(id) {
    const call = this.calls[id];
    if (!call || call.released) return false;
    Object.assign(call, { released: true, at: this.clock() });
    const meta = CLIENT_CALLS.find((c) => c.id === id);
    this.broadcast('banner', { kind: 'call', title: `Incoming: ${meta.name}` });
    this.broadcast('event', this.publicInfo());
    return true;
  }

  // Applies a judge run: newly passing Curses are lifted (with a banner), failing ones re-cursed.
  recordJudgeRun(run) {
    const lifted = [];
    for (const curse of CURSES) {
      const pass = run.results[curse.id];
      if (pass === undefined) continue;
      const entry = this.curses[curse.id];
      if (pass && !entry.lifted) {
        Object.assign(entry, { lifted: true, at: this.clock() });
        lifted.push(curse.id);
        this.broadcast('banner', { kind: 'curse', id: curse.id, title: `Curse lifted! ${curse.name}` });
      } else if (!pass && entry.lifted) {
        Object.assign(entry, { lifted: false, at: null });
      }
    }
    this.judgeRuns.push({ at: this.clock(), results: run.results, lifted });
    this.broadcast('event', this.publicInfo());
    return lifted;
  }

  // A call's script is only shown once it has been released.
  publicInfo() {
    return {
      timer: this.timer,
      serverNow: this.clock(),
      calls: CLIENT_CALLS.map(({ transcript, acceptance, caller, ...c }) => ({
        ...c,
        ...this.calls[c.id],
        ...(this.calls[c.id].released ? { transcript, acceptance, caller } : {}),
      })),
      curses: CURSES.map((c) => ({ ...c, ...this.curses[c.id] })),
      judgeRuns: this.judgeRuns.length,
    };
  }
}
