import { Types } from 'mongoose';
import { companyRepository } from '../companies/company.repository.js';
import { userRepository } from '../users/user.repository.js';
import { sessionRepository } from './session.repository.js';
import { toPublicUser } from '../users/user.service.js';
import { Role } from '../users/user.types.js';
import { CompanyStatus } from '../companies/company.types.js';
import { hashPassword, comparePassword } from '../../utils/password.js';
import { hashToken, tokensMatch } from '../../utils/tokenHash.js';
import { slugify } from '../../utils/slugify.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../utils/jwt.js';
import { durationToMs } from '../../utils/duration.js';
import { env } from '../../config/env.js';
import { ConflictError, UnauthorizedError, ForbiddenError } from '../../errors/index.js';
import type { RegisterCompanyInput, LoginInput } from './auth.schema.js';
import type { AuthResult, AuthTokens } from './auth.types.js';
import type { UserDocument } from '../users/user.model.js';

export interface SessionMeta {
  userAgent?: string | null;
  ipAddress?: string | null;
}

/**
 * Creates a new Session row and signs a token pair bound to it - both
 * access and refresh tokens carry the session's id as `sid`. Each call
 * (each login/registration) creates its OWN session, so a user can be
 * signed in on several devices at once, each independently listable and
 * revocable via GET/DELETE /auth/sessions - this is the "log out of all
 * devices" feature.
 */
async function issueTokenPair(user: UserDocument, meta: SessionMeta = {}): Promise<AuthTokens> {
  const sessionId = new Types.ObjectId().toString();

  const accessToken = signAccessToken({
    sub: user._id.toString(),
    companyId: user.companyId.toString(),
    role: user.role,
    sid: sessionId,
  });
  const refreshToken = signRefreshToken({ sub: user._id.toString(), sid: sessionId });

  // hashToken (SHA-256), not hashPassword (bcrypt) - see tokenHash.ts.
  // bcrypt truncates at 72 bytes, which silently broke rotation: a JWT and
  // its own rotated successor share an identical prefix well past 72 bytes
  // (same header + sub/sid; only iat/exp/jti differ, appended later), so
  // bcrypt hashed them as the same effective input.
  const refreshTokenHash = hashToken(refreshToken);
  const expiresAt = new Date(Date.now() + durationToMs(env.JWT_REFRESH_EXPIRES_IN));

  await sessionRepository.create({
    id: sessionId,
    userId: user._id.toString(),
    refreshTokenHash,
    userAgent: meta.userAgent ?? null,
    ipAddress: meta.ipAddress ?? null,
    expiresAt,
  });

  return { accessToken, refreshToken };
}

async function generateUniqueSlug(companyName: string): Promise<string> {
  const base = slugify(companyName) || 'company';
  let candidate = base;
  let suffix = 1;

  while (await companyRepository.existsBySlug(candidate)) {
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }

  return candidate;
}

export const authService = {
  /**
   * Creates a brand new tenant (Company) plus its first user, who is
   * automatically granted the OWNER role. This is the only place in the
   * system where a Company is created without an existing authenticated
   * tenant context.
   */
  async registerCompany(input: RegisterCompanyInput, meta: SessionMeta = {}): Promise<AuthResult> {
    const emailTaken = await userRepository.existsByEmail(input.email);
    if (emailTaken) {
      throw new ConflictError('Email is already registered');
    }

    const slug = await generateUniqueSlug(input.companyName);
    const company = await companyRepository.create({
      name: input.companyName,
      slug,
      city: input.city,
      businessType: input.businessType ?? null,
    });

    const passwordHash = await hashPassword(input.password);
    const user = await userRepository.create({
      companyId: company._id.toString(),
      name: input.ownerName,
      email: input.email,
      passwordHash,
      role: Role.OWNER,
    });

    const tokens = await issueTokenPair(user, meta);
    return { user: toPublicUser(user), tokens };
  },

  async login(input: LoginInput, meta: SessionMeta = {}): Promise<AuthResult> {
    const user = await userRepository.findByEmailWithSecrets(input.email);
    if (!user) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const passwordMatches = await comparePassword(input.password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedError('Invalid email or password');
    }

    if (!user.isActive) {
      throw new ForbiddenError('This account has been deactivated');
    }

    const company = await companyRepository.findById(user.companyId.toString());
    if (!company || company.status !== CompanyStatus.ACTIVE) {
      throw new ForbiddenError('This company account is currently suspended');
    }

    const tokens = await issueTokenPair(user, meta);
    return { user: toPublicUser(user), tokens };
  },

  /**
   * Rotates the refresh token IN PLACE for the same session - the session
   * id stays the same across refreshes, only the token value and its
   * stored hash change (sessionRepository.updateHash). If the session
   * can't be found, or the presented token doesn't match its stored hash
   * (possible theft/reuse of an old token), the session is deleted
   * defensively and the caller must log in again - this only ends the one
   * session, not every device the user is signed in on.
   */
  async refresh(refreshTokenRaw: string): Promise<AuthResult> {
    let userId: string;
    let sessionId: string;
    try {
      const payload = verifyRefreshToken(refreshTokenRaw);
      userId = payload.sub;
      sessionId = payload.sid;
    } catch {
      throw new UnauthorizedError('Invalid or expired refresh token');
    }

    const session = await sessionRepository.findByIdAndUserWithHash(sessionId, userId);
    if (!session) {
      throw new UnauthorizedError('Session not found, please log in again');
    }

    const matches = tokensMatch(refreshTokenRaw, session.refreshTokenHash);
    if (!matches) {
      await sessionRepository.deleteById(sessionId);
      throw new UnauthorizedError('Session invalid, please log in again');
    }

    const user = await userRepository.findById(userId);
    if (!user) {
      await sessionRepository.deleteById(sessionId);
      throw new UnauthorizedError('Session invalid, please log in again');
    }
    if (!user.isActive) {
      throw new ForbiddenError('This account has been deactivated');
    }

    const newRefreshToken = signRefreshToken({ sub: userId, sid: sessionId });
    const newAccessToken = signAccessToken({
      sub: userId,
      companyId: user.companyId.toString(),
      role: user.role,
      sid: sessionId,
    });
    const newHash = hashToken(newRefreshToken);
    const expiresAt = new Date(Date.now() + durationToMs(env.JWT_REFRESH_EXPIRES_IN));
    await sessionRepository.updateHash(sessionId, newHash, expiresAt);

    return {
      user: toPublicUser(user),
      tokens: { accessToken: newAccessToken, refreshToken: newRefreshToken },
    };
  },

  /** Ends only the current device's session, not every device the user is signed in on. */
  async logout(userId: string, sessionId: string): Promise<void> {
    await sessionRepository.deleteByIdAndUser(sessionId, userId);
  },
};
