import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Hashes an opaque, high-entropy token (refresh token JWTs) for storage and
 * later comparison.
 *
 * Deliberately NOT bcrypt (see utils/password.ts, which is still correct
 * for actual user passwords): bcrypt silently truncates its input at 72
 * bytes. A refresh token JWT is typically 200+ characters, and the part
 * that makes a rotated token different from its predecessor (iat/exp/jti)
 * is appended AFTER the shared, identical part (header + sub/sid claims,
 * which come first in the JSON payload). That shared prefix alone already
 * exceeds 72 bytes, so bcrypt was hashing the same effective input for a
 * token and its own successor - comparePassword(oldToken, hash(newToken))
 * was incorrectly returning true, silently defeating rotation-based replay
 * detection.
 *
 * Tokens are already high-entropy (unlike human-chosen passwords), so they
 * don't need bcrypt's deliberately slow, salted work factor - a fast,
 * full-length, deterministic hash is the correct tool here.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Constant-time comparison, to avoid leaking timing information about the stored hash. */
export function tokensMatch(rawToken: string, storedHash: string): boolean {
  const computed = Buffer.from(hashToken(rawToken), 'hex');
  const stored = Buffer.from(storedHash, 'hex');
  if (computed.length !== stored.length) return false;
  return timingSafeEqual(computed, stored);
}
