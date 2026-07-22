import { SubscriptionPlan } from '../companies/company.types.js';

/**
 * Single source of truth for what each plan technically restricts - see
 * ADR-0001 (docs/adr/0001-payments-and-subscriptions.md) for the original
 * proposal and the "Billing & subscriptions" README section for the
 * confirmed decision. Change a number here and every enforcement point
 * (the warehouse/user resource-limit checks) picks it up automatically,
 * no other file needs to change.
 */
export interface PlanLimits {
  /** null = unlimited */
  maxWarehouses: number | null;
  /** null = unlimited */
  maxUsers: number | null;
  /**
   * Kept as a per-plan flag (not hardcoded true everywhere) even though
   * every plan is currently true - confirmed decision: AI features (waste
   * analytics narrative, local events) are available on every plan, not
   * gated behind Business+ as ADR-0001 originally proposed. `requireFeature`
   * (middlewares/requireFeature.ts) is no longer wired to any route as a
   * result, but stays in the codebase as reusable infrastructure for a
   * future feature gate - see its own doc comment.
   */
  aiFeatures: boolean;
}

/** Confirmed business decision (not ADR-0001's illustrative numbers anymore). */
export const PLAN_LIMITS: Record<SubscriptionPlan, PlanLimits> = {
  [SubscriptionPlan.BASIC]: { maxWarehouses: 1, maxUsers: 35, aiFeatures: true },
  [SubscriptionPlan.BUSINESS]: { maxWarehouses: 5, maxUsers: 150, aiFeatures: true },
  [SubscriptionPlan.ENTERPRISE]: { maxWarehouses: null, maxUsers: null, aiFeatures: true },
};

/**
 * Confirmed business decision: how long a company stays in PAST_DUE
 * (reads work, writes blocked - see requireActiveSubscription) after a
 * failed payment before being automatically escalated to SUSPENDED
 * (nothing works). See companies/companyStatusEscalation.ts for where
 * this is actually applied.
 */
export const GRACE_PERIOD_DAYS = 7;

export type BillingPeriodMonths = 1 | 3 | 6 | 12;

export const BILLING_PERIODS: readonly BillingPeriodMonths[] = [1, 3, 6, 12];

/**
 * Base price per calendar month, in the smallest unit of STRIPE_CURRENCY
 * (e.g. cents for USD). Confirmed business decision - matches the public
 * landing page pricing (frontend/src/features/landing/components/LandingPricing.tsx).
 * Basic isn't sold through checkout (see billing.schema.ts) - every new
 * company gets it by default, free, with no Stripe subscription at all -
 * but it keeps a price here in case that changes later.
 */
export const PLAN_MONTHLY_PRICE: Record<SubscriptionPlan, number> = {
  [SubscriptionPlan.BASIC]: 2900,
  [SubscriptionPlan.BUSINESS]: 7900,
  [SubscriptionPlan.ENTERPRISE]: 19900,
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
