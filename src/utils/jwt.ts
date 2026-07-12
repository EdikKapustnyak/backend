import jwt, { type SignOptions } from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { env } from '../config/env.js';
import type { Role } from '../modules/users/user.types.js';

export interface AccessTokenPayload {
  sub: string;
  companyId: string;
  role: Role;
  /** Display-only - never used for authorization, only to flag the "current" session in GET /auth/sessions. */
  sid: string;
}

export interface RefreshTokenPayload {
  sub: string;
  /** Identifies which Session document this token belongs to. */
  sid: string;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  const options: SignOptions = {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as SignOptions['expiresIn'],
  };
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, options);
}

export function signRefreshToken(payload: RefreshTokenPayload): string {
  const options: SignOptions = {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN as SignOptions['expiresIn'],
    // jsonwebtoken's `iat` only has second-level precision, and our payload
    // is otherwise fixed (sub, sid) - two refreshes of the same session
    // within the same second would sign byte-identical tokens without
    // this, which would make rotation's stored-hash comparison always
    // "match" for the stale token too, silently defeating replay
    // detection. A random jti guarantees every issued token is unique
    // regardless of timing.
    jwtid: randomUUID(),
  };
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, options);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshTokenPayload;
}
