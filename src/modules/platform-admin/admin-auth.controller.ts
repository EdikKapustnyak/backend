import type { CookieOptions, Request, Response } from 'express';
import { adminAuthService, toPublicAdmin } from './admin-auth.service.js';
import { platformAdminRepository } from './admin.repository.js';
import { ctrlWrapper } from '../../utils/ctrlWrapper.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { durationToMs } from '../../utils/duration.js';
import { env, isProduction } from '../../config/env.js';
import { UnauthorizedError } from '../../errors/index.js';

const ADMIN_REFRESH_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: 'strict',
  domain: env.COOKIE_DOMAIN,
  path: '/',
  maxAge: durationToMs(env.ADMIN_JWT_REFRESH_EXPIRES_IN),
};

function setAdminRefreshCookie(res: Response, refreshToken: string): void {
  res.cookie(env.ADMIN_REFRESH_COOKIE_NAME, refreshToken, ADMIN_REFRESH_COOKIE_OPTIONS);
}

function clearAdminRefreshCookie(res: Response): void {
  res.clearCookie(env.ADMIN_REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    domain: env.COOKIE_DOMAIN,
    path: '/',
  });
}

function sessionMetaFromRequest(req: Request): { userAgent: string | null; ipAddress: string | null } {
  return {
    userAgent: req.headers['user-agent'] ?? null,
    ipAddress: req.ip ?? null,
  };
}

export const adminLogin = ctrlWrapper(async (req: Request, res: Response) => {
  const result = await adminAuthService.login(req.body, sessionMetaFromRequest(req));
  setAdminRefreshCookie(res, result.tokens.refreshToken);
  sendSuccess(res, { admin: result.admin, accessToken: result.tokens.accessToken }, 'Logged in successfully');
});

export const adminRefresh = ctrlWrapper(async (req: Request, res: Response) => {
  const refreshToken = req.cookies?.[env.ADMIN_REFRESH_COOKIE_NAME] as string | undefined;
  if (!refreshToken) {
    throw new UnauthorizedError('Refresh token is missing');
  }

  const result = await adminAuthService.refresh(refreshToken);
  setAdminRefreshCookie(res, result.tokens.refreshToken);
  sendSuccess(res, { admin: result.admin, accessToken: result.tokens.accessToken }, 'Token refreshed');
});

export const adminLogout = ctrlWrapper(async (req: Request, res: Response) => {
  if (req.adminAuth) {
    await adminAuthService.logout(req.adminAuth.adminId, req.adminAuth.sessionId);
  }
  clearAdminRefreshCookie(res);
  sendSuccess(res, null, 'Logged out successfully');
});

export const getCurrentAdmin = ctrlWrapper(async (req: Request, res: Response) => {
  if (!req.adminAuth) throw new UnauthorizedError();
  const admin = await platformAdminRepository.findById(req.adminAuth.adminId);
  if (!admin) throw new UnauthorizedError();
  sendSuccess(res, toPublicAdmin(admin));
});
