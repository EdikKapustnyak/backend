import { Types } from 'mongoose';
import { platformAdminRepository } from './admin.repository.js';
import { adminSessionRepository } from './admin-session.repository.js';
import { comparePassword } from '../../utils/password.js';
import { hashToken, tokensMatch } from '../../utils/tokenHash.js';
import { signAdminAccessToken, signAdminRefreshToken, verifyAdminRefreshToken } from './admin-jwt.js';
import { durationToMs } from '../../utils/duration.js';
import { env } from '../../config/env.js';
import { UnauthorizedError, ForbiddenError } from '../../errors/index.js';
import type { AdminLoginInput } from './admin-auth.schema.js';
import type { PublicPlatformAdmin } from './admin.types.js';
import type { PlatformAdminDocument } from './admin.model.js';

export interface AdminSessionMeta {
  userAgent?: string | null;
  ipAddress?: string | null;
}

export interface AdminAuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AdminAuthResult {
  admin: PublicPlatformAdmin;
  tokens: AdminAuthTokens;
}

export function toPublicAdmin(admin: PlatformAdminDocument): PublicPlatformAdmin {
  return {
    id: admin._id.toString(),
    email: admin.email,
    name: admin.name,
  };
}

/** Mirrors auth.service.ts's issueTokenPair - one PlatformAdminSession row per login, independently listable/revocable in principle, though no sessions-list endpoint exists yet (v1 is a single admin). */
async function issueAdminTokenPair(
  admin: PlatformAdminDocument,
  meta: AdminSessionMeta = {},
): Promise<AdminAuthTokens> {
  const sessionId = new Types.ObjectId().toString();

  const accessToken = signAdminAccessToken({ sub: admin._id.toString(), sid: sessionId });
  const refreshToken = signAdminRefreshToken({ sub: admin._id.toString(), sid: sessionId });

  const refreshTokenHash = hashToken(refreshToken);
  const expiresAt = new Date(Date.now() + durationToMs(env.ADMIN_JWT_REFRESH_EXPIRES_IN));

  await adminSessionRepository.create({
    id: sessionId,
    adminId: admin._id.toString(),
    refreshTokenHash,
    userAgent: meta.userAgent ?? null,
    ipAddress: meta.ipAddress ?? null,
    expiresAt,
  });

  return { accessToken, refreshToken };
}

export const adminAuthService = {
  async login(input: AdminLoginInput, meta: AdminSessionMeta = {}): Promise<AdminAuthResult> {
    const admin = await platformAdminRepository.findByEmailWithSecrets(input.email);
    if (!admin) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const passwordMatches = await comparePassword(input.password, admin.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedError('Invalid email or password');
    }

    if (!admin.isActive) {
      throw new ForbiddenError('This admin account has been deactivated');
    }

    const tokens = await issueAdminTokenPair(admin, meta);
    return { admin: toPublicAdmin(admin), tokens };
  },

  /** Rotates the refresh token in place, same shape as auth.service.ts's refresh - see its own doc comment for the full reasoning (theft/reuse detection via stored-hash comparison). */
  async refresh(refreshTokenRaw: string): Promise<AdminAuthResult> {
    let adminId: string;
    let sessionId: string;
    try {
      const payload = verifyAdminRefreshToken(refreshTokenRaw);
      adminId = payload.sub;
      sessionId = payload.sid;
    } catch {
      throw new UnauthorizedError('Invalid or expired refresh token');
    }

    const session = await adminSessionRepository.findByIdAndAdminWithHash(sessionId, adminId);
    if (!session) {
      throw new UnauthorizedError('Session not found, please log in again');
    }

    const matches = tokensMatch(refreshTokenRaw, session.refreshTokenHash);
    if (!matches) {
      await adminSessionRepository.deleteById(sessionId);
      throw new UnauthorizedError('Session invalid, please log in again');
    }

    const admin = await platformAdminRepository.findById(adminId);
    if (!admin) {
      await adminSessionRepository.deleteById(sessionId);
      throw new UnauthorizedError('Session invalid, please log in again');
    }
    if (!admin.isActive) {
      throw new ForbiddenError('This admin account has been deactivated');
    }

    const newRefreshToken = signAdminRefreshToken({ sub: adminId, sid: sessionId });
    const newAccessToken = signAdminAccessToken({ sub: adminId, sid: sessionId });
    const newHash = hashToken(newRefreshToken);
    const expiresAt = new Date(Date.now() + durationToMs(env.ADMIN_JWT_REFRESH_EXPIRES_IN));
    await adminSessionRepository.updateHash(sessionId, newHash, expiresAt);

    return {
      admin: toPublicAdmin(admin),
      tokens: { accessToken: newAccessToken, refreshToken: newRefreshToken },
    };
  },

  async logout(adminId: string, sessionId: string): Promise<void> {
    await adminSessionRepository.deleteByIdAndAdmin(sessionId, adminId);
  },
};
