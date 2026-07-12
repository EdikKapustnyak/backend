import type { CookieOptions, Request, Response } from 'express';
import { authService } from './auth.service.js';
import { sessionService } from './session.service.js';
import { ctrlWrapper } from '../../utils/ctrlWrapper.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { durationToMs } from '../../utils/duration.js';
import { env, isProduction } from '../../config/env.js';
import { UnauthorizedError, NotFoundError } from '../../errors/index.js';
import { userRepository } from '../users/user.repository.js';
import { toPublicUser } from '../users/user.service.js';

const REFRESH_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: 'strict',
  domain: env.COOKIE_DOMAIN,
  path: '/',
  maxAge: durationToMs(env.JWT_REFRESH_EXPIRES_IN),
};

function setRefreshCookie(res: Response, refreshToken: string): void {
  res.cookie(env.REFRESH_COOKIE_NAME, refreshToken, REFRESH_COOKIE_OPTIONS);
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(env.REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    domain: env.COOKIE_DOMAIN,
    path: '/',
  });
}

/** Best-effort device metadata for the Session row - never used for auth decisions, display only. */
function sessionMetaFromRequest(req: Request): { userAgent: string | null; ipAddress: string | null } {
  return {
    userAgent: req.headers['user-agent'] ?? null,
    ipAddress: req.ip ?? null,
  };
}

export const registerCompany = ctrlWrapper(async (req: Request, res: Response) => {
  const result = await authService.registerCompany(req.body, sessionMetaFromRequest(req));
  setRefreshCookie(res, result.tokens.refreshToken);
  sendSuccess(
    res,
    { user: result.user, accessToken: result.tokens.accessToken },
    'Company and owner account created successfully',
    201,
  );
});

export const login = ctrlWrapper(async (req: Request, res: Response) => {
  const result = await authService.login(req.body, sessionMetaFromRequest(req));
  setRefreshCookie(res, result.tokens.refreshToken);
  sendSuccess(res, { user: result.user, accessToken: result.tokens.accessToken }, 'Logged in successfully');
});

export const refresh = ctrlWrapper(async (req: Request, res: Response) => {
  const refreshToken = req.cookies?.[env.REFRESH_COOKIE_NAME] as string | undefined;
  if (!refreshToken) {
    throw new UnauthorizedError('Refresh token is missing');
  }

  const result = await authService.refresh(refreshToken);
  setRefreshCookie(res, result.tokens.refreshToken);
  sendSuccess(res, { user: result.user, accessToken: result.tokens.accessToken }, 'Token refreshed');
});

/** Ends only the current device's session - see logoutAllDevices for "log out everywhere". */
export const logout = ctrlWrapper(async (req: Request, res: Response) => {
  if (req.auth) {
    await authService.logout(req.auth.userId, req.auth.sessionId);
  }
  clearRefreshCookie(res);
  sendSuccess(res, null, 'Logged out successfully');
});

export const me = ctrlWrapper(async (req: Request, res: Response) => {
  if (!req.auth) {
    throw new UnauthorizedError();
  }

  const user = await userRepository.findByIdInCompany(req.auth.userId, req.auth.companyId);
  if (!user) {
    throw new NotFoundError('User not found');
  }

  sendSuccess(res, toPublicUser(user), 'Current user');
});

export const listSessions = ctrlWrapper(async (req: Request, res: Response) => {
  if (!req.auth) throw new UnauthorizedError();

  const sessions = await sessionService.listSessions(req.auth.userId, req.auth.sessionId);
  sendSuccess(res, sessions);
});

export const revokeSession = ctrlWrapper(async (req: Request, res: Response) => {
  if (!req.auth) throw new UnauthorizedError();

  const revoked = await sessionService.revokeSession(req.auth.userId, req.params['id'] as string);
  if (!revoked) throw new NotFoundError('Session not found');

  sendSuccess(res, null, 'Session revoked');
});

/** "Log out everywhere" - revokes every session, including the current one, so the caller is logged out too. */
export const logoutAllDevices = ctrlWrapper(async (req: Request, res: Response) => {
  if (!req.auth) throw new UnauthorizedError();

  await sessionService.revokeAllSessions(req.auth.userId);
  clearRefreshCookie(res);
  sendSuccess(res, null, 'Logged out of all devices');
});
