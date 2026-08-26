import { randomBytes } from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

// Largest multiple of the alphabet size below 256 — bytes at or above this
// threshold are rejected so every character stays uniformly distributed.
const REJECTION_THRESHOLD = 256 - (256 % ALPHABET.length);

/**
 * Short SMS-friendly invite code: base62, 12 chars by default (~71 bits of
 * entropy). Alphanumeric-only so SMS clients autolink the URL reliably.
 * The code is a credential — it is hashed at rest exactly like the previous
 * 64-hex invite tokens, and brute force is blocked by the consume throttle.
 */
export const generateInviteCode = (length = 12): string => {
  let code = '';
  while (code.length < length) {
    for (const byte of randomBytes(length)) {
      if (byte >= REJECTION_THRESHOLD) continue;
      code += ALPHABET[byte % ALPHABET.length];
      if (code.length === length) break;
    }
  }
  return code;
};
