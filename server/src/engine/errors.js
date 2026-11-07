// Rule violations the client caused. Anything else thrown is a server bug.
export class GameError extends Error {
  constructor(code, message) {
    super(message ?? code);
    this.code = code;
  }
}

export function assert(condition, code, message) {
  if (!condition) throw new GameError(code, message);
}
