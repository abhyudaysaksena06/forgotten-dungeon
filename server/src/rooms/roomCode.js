import { randomInt } from 'node:crypto';

// No 0/O or 1/I, so codes survive being read aloud.
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 5;

export function generateRoomCode() {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

// " ab c12 " -> "ABC12": players type codes however they like.
export function normalizeRoomCode(raw) {
  return String(raw ?? '')
    .replace(/\s+/g, '')
    .toUpperCase();
}
