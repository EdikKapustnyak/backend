import { InviteModel, type InviteDocument } from './invite.model.js';

interface CreateInviteInput {
  userId: string;
  companyId: string;
  tokenHash: string;
  expiresAt: Date;
}

export const inviteRepository = {
  async create(input: CreateInviteInput): Promise<InviteDocument> {
    return InviteModel.create(input);
  },

  /**
   * Untenanted by design - looks up by hash, not by a raw token or id (the
   * raw token only ever lives in the email link and the request body,
   * never stored) - the whole point of accept-invite is that it runs
   * before any auth context, let alone a companyId, exists. The
   * `expiresAt` check is defensive on top of the TTL index: Mongo's TTL
   * sweep runs on a background cycle (up to ~60s lag), so a token could
   * still be present, but past its logical expiry, right after it ticks
   * over - same defensive pattern as local-event.repository's cache lookup.
   */
  async findValidByTokenHash(tokenHash: string): Promise<InviteDocument | null> {
    return InviteModel.findOne({ tokenHash, expiresAt: { $gt: new Date() } })
      .setOptions({ skipTenantScope: true })
      .exec();
  },

  /** Untenanted - the id here always comes from a token already verified by findValidByTokenHash above, not from user input directly. */
  async deleteById(id: string): Promise<void> {
    await InviteModel.deleteOne({ _id: id }).setOptions({ skipTenantScope: true }).exec();
  },

  /** Untenanted - invalidates any previously issued invite for this user before issuing a new one (userId alone is sufficient; not currently called anywhere, kept for a future resend-invite feature). */
  async deleteAllByUser(userId: string): Promise<void> {
    await InviteModel.deleteMany({ userId }).setOptions({ skipTenantScope: true }).exec();
  },
};
