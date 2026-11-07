// Organiser helper: runs the last scrambled build (from scripts/scramble.mjs) on port 3002,
// so you can see the Curses in play next to the clean build on 3001.
process.env.PORT ??= '3002';
await import('../.scramble/participant/server/src/index.js');
