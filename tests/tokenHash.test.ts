import { describe, it, expect } from 'vitest';
import { hashToken, tokensMatch } from '../src/utils/tokenHash.js';

describe('hashToken / tokensMatch', () => {
  it('matches a token against its own hash', () => {
    const token = 'some.jwt.token';
    expect(tokensMatch(token, hashToken(token))).toBe(true);
  });

  it('rejects a completely different token', () => {
    expect(tokensMatch('token-a', hashToken('token-b'))).toBe(false);
  });

  it('distinguishes two long strings that share an identical 100+ byte prefix', () => {
    // This is exactly the shape of the bug this file exists to prevent:
    // a refresh token and its own rotated successor share an identical
    // header + sub/sid prefix (well past bcrypt's 72-byte truncation
    // point) and only differ in fields appended at the very end
    // (iat/exp/jti). bcrypt hashed these as the same effective input;
    // SHA-256 must not make the same mistake.
    const sharedPrefix = 'A'.repeat(100);
    const tokenA = `${sharedPrefix}.suffix-one`;
    const tokenB = `${sharedPrefix}.suffix-two`;

    expect(tokenA.length).toBeGreaterThan(72);
    expect(tokenA.slice(0, 72)).toBe(tokenB.slice(0, 72));

    const hashA = hashToken(tokenA);
    expect(tokensMatch(tokenA, hashA)).toBe(true);
    expect(tokensMatch(tokenB, hashA)).toBe(false);
  });

  it('produces a fixed-length hex digest regardless of input length', () => {
    expect(hashToken('short')).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken('a'.repeat(500))).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejects a malformed/wrong-length stored hash rather than throwing', () => {
    expect(tokensMatch('some-token', 'not-a-real-hash')).toBe(false);
  });
});
