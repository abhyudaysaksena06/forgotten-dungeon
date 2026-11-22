// Mirrors the server: " ab c12 " -> "ABC12".
export function normalizeRoomCode(raw) {
  return String(raw ?? '')
    .replace(/\s+/g, '')
    .toUpperCase();
}
