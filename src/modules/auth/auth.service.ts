import { companyRepository } from '../companies/company.repository.js';
import { userRepository } from '../users/user.repository.js';
import { toPublicUser } from '../users/user.service.js';
import { Role } from '../users/user.types.js';
import { CompanyStatus } from '../companies/company.types.js';
import { hashPassword, comparePassword } from '../../utils/password.js';
import { slugify } from '../../utils/slugify.js';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../../utils/jwt.js';
import { ConflictError, UnauthorizedError, ForbiddenError } from '../../errors/index.js';
import type { RegisterCompanyInput, LoginInput } from './auth.schema.js';
import type { AuthResult, AuthTokens } from './auth.types.js';
import type { UserDocument } from '../users/user.model.js';

async function issueTokenPair(user: UserDocument): Promise<AuthTokens> {
  const accessToken = signAccessToken({
    sub: user._id.toString(),
    companyId: user.companyId.toString(),
    role: user.role,
  });
  const refreshToken = signRefreshToken({ sub: user._id.toString() });

  const refreshTokenHash = await hashPassword(refreshToken);
  await userRepository.setRefreshTokenHash(user._id.toString(), refreshTokenHash);

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
  async registerCompany(input: RegisterCompanyInput): Promise<AuthResult> {
    const emailTaken = await userRepository.existsByEmail(input.email);
    if (emailTaken) {
      throw new ConflictError('Email is already registered');
    }

    const slug = await generateUniqueSlug(input.companyName);
    const company = await companyRepository.create({ name: input.companyName, slug });

    const passwordHash = await hashPassword(input.password);
    const user = await userRepository.create({
      companyId: company._id.toString(),
      name: input.ownerName,
      email: input.email,
      passwordHash,
      role: Role.OWNER,
    });

    const tokens = await issueTokenPair(user);
    return { user: toPublicUser(user), tokens };
  },

  async login(input: LoginInput): Promise<AuthResult> {
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

    const tokens = await issueTokenPair(user);
    return { user: toPublicUser(user), tokens };
  },

  /**
   * Rotates the refresh token: the old one is invalidated and a new pair
   * is issued. If token reuse is detected (hash mismatch), the stored
   * refresh token is cleared, forcing re-authentication.
   */
  async refresh(refreshTokenRaw: string): Promise<AuthResult> {
    let userId: string;
    try {
      const payload = verifyRefreshToken(refreshTokenRaw);
      userId = payload.sub;
    } catch {
      throw new UnauthorizedError('Invalid or expired refresh token');
    }

    const user = await userRepository.findByIdWithRefreshHash(userId);
    if (!user || !user.refreshTokenHash) {
      throw new UnauthorizedError('Session not found, please log in again');
    }

    const matches = await comparePassword(refreshTokenRaw, user.refreshTokenHash);
    if (!matches) {
      // Possible token theft/reuse - revoke the session defensively.
      await userRepository.setRefreshTokenHash(userId, null);
      throw new UnauthorizedError('Session invalid, please log in again');
    }

    if (!user.isActive) {
      throw new ForbiddenError('This account has been deactivated');
    }

    const tokens = await issueTokenPair(user);
    return { user: toPublicUser(user), tokens };
  },

  async logout(userId: string): Promise<void> {
    await userRepository.setRefreshTokenHash(userId, null);
  },
};
