import jwt, { type SignOptions } from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { env } from '../../config/env.js';

/**
 * Mirrors utils/jwt.ts exactly, but signed/verified with the separate
 * ADMIN_JWT_* secrets - a platform-admin token must never verify against
 * the tenant secrets or vice versa, even if someone tried to replay one
 * against the other system's middleware.
 */

export interface AdminAccessTokenPayload {
  sub: string;
  /** Display-only - never used for authorization, only to flag the "current" session if a sessions list is ever added. */
  sid: string;
}

export interface AdminRefreshTokenPayload {
  sub: string;
  sid: string;
}

export function signAdminAccessToken(payload: AdminAccessTokenPayload): string {
  const options: SignOptions = {
    expiresIn: env.ADMIN_JWT_ACCESS_EXPIRES_IN as SignOptions['expiresIn'],
  };
  return jwt.sign(payload, env.ADMIN_JWT_ACCESS_SECRET, options);
}

export function signAdminRefreshToken(payload: AdminRefreshTokenPayload): string {
  const options: SignOptions = {
    expiresIn: env.ADMIN_JWT_REFRESH_EXPIRES_IN as SignOptions['expiresIn'],
    // See utils/jwt.ts's identical comment - guarantees uniqueness across
    // rotations even within the same second, which the stored-hash replay
    // check depends on.
    jwtid: randomUUID(),
  };
  return jwt.sign(payload, env.ADMIN_JWT_REFRESH_SECRET, options);
}

export function verifyAdminAccessToken(token: string): AdminAccessTokenPayload {
  return jwt.verify(token, env.ADMIN_JWT_ACCESS_SECRET) as AdminAccessTokenPayload;
}

export function verifyAdminRefreshToken(token: string): AdminRefreshTokenPayload {
  return jwt.verify(token, env.ADMIN_JWT_REFRESH_SECRET) as AdminRefreshTokenPayload;
}
