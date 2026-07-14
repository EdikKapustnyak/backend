import { SubscriptionPlan } from '../companies/company.types.js';

/**
 * Single source of truth for what each plan technically restricts - see
 * ADR-0001 (docs/adr/0001-payments-and-subscriptions.md) for the reasoning.
 * These specific numbers are a starting proposal from that ADR, not a
 * final business decision - change them here and every enforcement point
 * (requireFeature, the warehouse/user resource-limit checks) picks it up
 * automatically, no other file needs to change.
 */
export interface PlanLimits {
  /** null = unlimited */
  maxWarehouses: number | null;
  /** null = unlimited */
  maxUsers: number | null;
  /** Gates the AI assistant (waste analytics narrative + local events) - the only per-call cost this app doesn't control per company. */
  aiFeatures: boolean;
}

export const PLAN_LIMITS: Record<SubscriptionPlan, PlanLimits> = {
  [SubscriptionPlan.BASIC]: { maxWarehouses: 1, maxUsers: 3, aiFeatures: false },
  [SubscriptionPlan.BUSINESS]: { maxWarehouses: 5, maxUsers: 15, aiFeatures: true },
  [SubscriptionPlan.ENTERPRISE]: { maxWarehouses: null, maxUsers: null, aiFeatures: true },
};

export type BillingPeriodMonths = 1 | 3 | 6 | 12;

export const BILLING_PERIODS: readonly BillingPeriodMonths[] = [1, 3, 6, 12];

/**
 * Base price per calendar month, in the smallest unit of STRIPE_CURRENCY
 * (e.g. cents for USD). Illustrative, from ADR-0001 - a pricing decision,
 * not an engineering one. Basic isn't sold through checkout (see
 * billing.schema.ts) - every new company gets it by default, free, with
 * no Stripe subscription at all - but it keeps a price here in case that
 * changes later.
 */
export const PLAN_MONTHLY_PRICE: Record<SubscriptionPlan, number> = {
  [SubscriptionPlan.BASIC]: 1900,
  [SubscriptionPlan.BUSINESS]: 4900,
  [SubscriptionPlan.ENTERPRISE]: 14900,
};

/** Discount applied to the total when paying for multiple months upfront. Illustrative - see ADR-0001. */
const PERIOD_DISCOUNT: Record<BillingPeriodMonths, number> = {
  1: 0,
  3: 0.05,
  6: 0.1,
  12: 0.15,
};

/** Total price for `period` months of `plan`, in the smallest currency unit, discount already applied and rounded to a whole unit. */
export function computeTotalPrice(plan: SubscriptionPlan, period: BillingPeriodMonths): number {
  const monthly = PLAN_MONTHLY_PRICE[plan];
  const discount = PERIOD_DISCOUNT[period];
  return Math.round(monthly * period * (1 - discount));
}
