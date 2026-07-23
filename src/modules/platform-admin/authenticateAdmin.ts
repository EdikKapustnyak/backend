import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { UnauthorizedError } from '../../errors/index.js';
import { verifyAdminAccessToken } from './admin-jwt.js';

function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim() || null;
}

/**
 * Mirrors middlewares/authenticate.ts, but verifies against the separate
 * admin JWT secret and attaches req.adminAuth (never req.auth) - every
 * platform-admin route handler reads identity from req.adminAuth only.
 */
export function authenticateAdmin(req: Request, _res: Response, next: NextFunction): void {
  const token = extractBearerToken(req);

  if (!token) {
    next(new UnauthorizedError('Access token is missing'));
    return;
  }

  try {
    const payload = verifyAdminAccessToken(token);
    req.adminAuth = {
      adminId: payload.sub,
      sessionId: payload.sid,
    };
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      next(new UnauthorizedError('Access token has expired'));
      return;
    }
    next(new UnauthorizedError('Invalid access token'));
  }
}
