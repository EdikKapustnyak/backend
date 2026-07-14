import { userRepository } from './user.repository.js';
import { inviteRepository } from './invite.repository.js';
import { companyRepository } from '../companies/company.repository.js';
import { hashPassword } from '../../utils/password.js';
import { generateOpaqueToken, hashToken } from '../../utils/tokenHash.js';
import { escapeHtml } from '../../utils/escapeHtml.js';
import { mailer, isMailerConfigured } from '../../utils/mailer.js';
import { billingService } from '../billing/billing.service.js';
import { logger } from '../../utils/logger.js';
import { env } from '../../config/env.js';
import { ConflictError } from '../../errors/index.js';
import type { UserDocument } from './user.model.js';
import type { PublicUser } from './user.types.js';
import type { InviteUserInput } from './user.schema.js';

const INVITE_TTL_DAYS = 7;

export function toPublicUser(user: UserDocument): PublicUser {
  return {
    id: user._id.toString(),
    companyId: user.companyId.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    passwordSet: user.passwordSet,
    createdAt: user.createdAt,
  };
}

function buildInviteEmailHtml(params: {
  inviteeName: string;
  companyName: string;
  acceptUrl: string;
}): string {
  const name = escapeHtml(params.inviteeName);
  const company = escapeHtml(params.companyName);
  const url = escapeHtml(params.acceptUrl);

  // Deliberately plain, table-free HTML (no React Email / MJML dependency
  // for a single transactional email) - kept simple on purpose, revisit if
  // more email templates get added later.
  return `
    <p>Hi ${name},</p>
    <p>You've been invited to join <strong>${company}</strong>.</p>
    <p><a href="${url}">Click here to set your password and get started</a></p>
    <p>This link expires in ${INVITE_TTL_DAYS} days. If you weren't expecting this invite, you can ignore this email.</p>
  `.trim();
}

export interface InviteNewUserResult {
  user: PublicUser;
  /**
   * The raw accept-invite link - only present when the email could NOT be
   * sent (mailer not configured, or the provider rejected it), so the
   * owner/admin who invited this person can share it manually instead of
   * the invite silently going nowhere. Never present on a successful send.
   */
  inviteLink: string | null;
}

export const userService = {
  /**
   * Creates a pending user (unusable placeholder password, passwordSet:
   * false) plus a single-use invite token, and emails an accept-invite
   * link. The invited person chooses their own password when they accept -
   * see authService.acceptInvite. Falls back to returning the link in the
   * response instead of throwing if email delivery isn't configured or
   * fails, since inviting a teammate must keep working in environments
   * without Resend set up (e.g. local dev).
   */
  async inviteNewUser(
    input: InviteUserInput,
    companyId: string,
  ): Promise<InviteNewUserResult> {
    const emailTaken = await userRepository.existsByEmail(input.email);
    if (emailTaken) {
      throw new ConflictError('Email is already registered');
    }

    const currentUserCount = await userRepository.countInCompany(companyId);
    await billingService.assertResourceLimit(companyId, 'users', currentUserCount);

    // Unusable on purpose: a random, high-entropy string nobody could ever
    // type in as a password, hashed the same way a real password would be.
    // comparePassword() against it will always fail, which is what backs
    // the passwordSet check in authService.login - but that check exists
    // for a clear error path, not as a substitute for this placeholder.
    const placeholderHash = await hashPassword(generateOpaqueToken());

    const user = await userRepository.create({
      companyId,
      name: input.name,
      email: input.email,
      passwordHash: placeholderHash,
      passwordSet: false,
      role: input.role,
    });

    const rawToken = generateOpaqueToken();
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
    await inviteRepository.create({
      userId: user._id.toString(),
      companyId,
      tokenHash: hashToken(rawToken),
      expiresAt,
    });

    const acceptUrl = `${env.FRONTEND_URL}/accept-invite?token=${rawToken}`;

    if (!isMailerConfigured()) {
      logger.warn(
        { userId: user._id.toString() },
        'Mailer not configured - returning invite link in the API response instead of emailing it',
      );
      return { user: toPublicUser(user), inviteLink: acceptUrl };
    }

    try {
      const company = await companyRepository.findById(companyId);
      const html = buildInviteEmailHtml({
        inviteeName: input.name,
        companyName: company?.name ?? 'your company',
        acceptUrl,
      });
      await mailer.sendMail({
        to: input.email,
        subject: `You've been invited to join ${company?.name ?? 'the team'}`,
        html,
      });
      return { user: toPublicUser(user), inviteLink: null };
    } catch (err) {
      logger.error(
        { err, userId: user._id.toString() },
        'Failed to send invite email - returning invite link in the API response instead',
      );
      return { user: toPublicUser(user), inviteLink: acceptUrl };
    }
  },
};
