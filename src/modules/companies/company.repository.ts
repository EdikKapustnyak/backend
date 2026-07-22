import { CompanyModel, type CompanyDocument } from './company.model.js';
import { CompanyStatus } from './company.types.js';
import type { SubscriptionPlan } from './company.types.js';

interface CreateCompanyInput {
  name: string;
  slug: string;
  subscriptionPlan?: SubscriptionPlan;
  city: string;
  businessType?: string | null;
}

interface UpdateCompanyProfileInput {
  name?: string;
  city?: string;
  businessType?: string | null;
  largeDiscrepancyAbsThreshold?: number;
  largeDiscrepancyPercentThreshold?: number;
  wasteAnalyticsDefaultLookbackDays?: number;
  localEventsCacheTtlDays?: number;
}

interface UpdateSubscriptionStateInput {
  subscriptionPlan?: SubscriptionPlan;
  status?: CompanyStatus;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string | null;
  currentPeriodEnd?: Date | null;
  pastDueSince?: Date | null;
}

export const companyRepository = {
  async create(input: CreateCompanyInput): Promise<CompanyDocument> {
    return CompanyModel.create(input);
  },

  async findBySlug(slug: string): Promise<CompanyDocument | null> {
    return CompanyModel.findOne({ slug }).exec();
  },

  async findById(id: string): Promise<CompanyDocument | null> {
    return CompanyModel.findById(id).exec();
  },

  /** Untenanted by design - Company IS the tenant boundary, not tenant-scoped data (tenantScopePlugin is not applied to this schema at all). Used only by the Stripe webhook handler, which has no auth context, just a customer id from the event payload. */
  async findByStripeCustomerId(stripeCustomerId: string): Promise<CompanyDocument | null> {
    return CompanyModel.findOne({ stripeCustomerId }).exec();
  },

  async existsBySlug(slug: string): Promise<boolean> {
    const count = await CompanyModel.countDocuments({ slug }).exec();
    return count > 0;
  },

  async updateProfile(
    id: string,
    input: UpdateCompanyProfileInput,
  ): Promise<CompanyDocument | null> {
    return CompanyModel.findByIdAndUpdate(
      id,
      { $set: input },
      { new: true, runValidators: true },
    ).exec();
  },

  /** Used only by billing.service.ts, driven by Stripe webhook events - never by user-facing request handlers directly. */
  async updateSubscriptionState(
    id: string,
    input: UpdateSubscriptionStateInput,
  ): Promise<CompanyDocument | null> {
    return CompanyModel.findByIdAndUpdate(id, { $set: input }, { new: true }).exec();
  },

  /**
   * Bulk PAST_DUE -> SUSPENDED for every company whose grace period ended
   * at or before `cutoff` (i.e. pastDueSince + GRACE_PERIOD_DAYS <= now).
   * Used by jobs/gracePeriodSweep.ts - the proactive companion to
   * billing.service.ts's per-request lazy escalation, for companies that
   * stop making requests entirely during their grace period. One
   * updateMany rather than find-then-loop, since this can touch many
   * companies per run.
   */
  async suspendExpiredGracePeriods(cutoff: Date): Promise<number> {
    const result = await CompanyModel.updateMany(
      { status: CompanyStatus.PAST_DUE, pastDueSince: { $lte: cutoff } },
      { $set: { status: CompanyStatus.SUSPENDED } },
    ).exec();
    return result.modifiedCount;
  },
};
