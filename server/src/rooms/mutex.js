// Per-room lock: every state change in a room runs one at a time, in arrival order.
export class Mutex {
  #tail = Promise.resolve();

  run(fn) {
    const result = this.#tail.then(fn);
    this.#tail = result.catch(() => {});
    return result;
  }
}
