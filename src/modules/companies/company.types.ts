import type { Types } from 'mongoose';

export enum SubscriptionPlan {
  BASIC = 'basic',
  BUSINESS = 'business',
  ENTERPRISE = 'enterprise',
}

export enum CompanyStatus {
  ACTIVE = 'active',
  /**
   * A Stripe payment failed but the grace period (see billing/plan.config.ts)
   * hasn't elapsed yet. Reads still work; writes are blocked by
   * requireActiveSubscription until the payment method is fixed or the
   * grace period runs out and this becomes SUSPENDED.
   */
  PAST_DUE = 'past_due',
  SUSPENDED = 'suspended',
}

export interface CompanyDocumentShape {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  subscriptionPlan: SubscriptionPlan;
  status: CompanyStatus;
  /** Stripe Customer id (`cus_...`) - null until the company's first checkout. */
  stripeCustomerId: string | null;
  /** Stripe Subscription id (`sub_...`) - null until a subscription is actually created. */
  stripeSubscriptionId: string | null;
  /** End of the current billing period, mirrored from Stripe on every relevant webhook event. */
  currentPeriodEnd: Date | null;
  /** When the company first entered PAST_DUE - null while ACTIVE. Used to compute when the grace period elapses. */
  pastDueSince: Date | null;
  /** Used by the local-events AI feature to search for relevant events. Required since registration. */
  city: string;
  /** Free text (e.g. "кофейня", "ресторан") - used to make AI recommendations relevant. */
  businessType: string | null;
  /** A discrepancy of at least this many units is flagged as "large" during inventarization. */
  largeDiscrepancyAbsThreshold: number;
  /** A discrepancy of at least this % of the counted item's systemQuantity is flagged as "large". Stored as 0-100, not 0-1. */
  largeDiscrepancyPercentThreshold: number;
  /** How many days GET /analytics/waste(/narrative) looks back by default when `from` isn't given. */
  wasteAnalyticsDefaultLookbackDays: number;
  /** How many days a GET /local-events result is cached before the next request calls the AI again. */
  localEventsCacheTtlDays: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicCompany {
  id: string;
  name: string;
  slug: string;
  subscriptionPlan: SubscriptionPlan;
  status: CompanyStatus;
  currentPeriodEnd: Date | null;
  pastDueSince: Date | null;
  city: string;
  businessType: string | null;
  largeDiscrepancyAbsThreshold: number;
  largeDiscrepancyPercentThreshold: number;
  wasteAnalyticsDefaultLookbackDays: number;
  localEventsCacheTtlDays: number;
  createdAt: Date;
  updatedAt: Date;
}
