import { z } from 'zod';
import { SubscriptionPlan } from '../companies/company.types.js';

export const checkoutSessionSchema = z.object({
  // Basic isn't sold through checkout - every company gets it by default,
  // free, with no Stripe subscription at all (see plan.config.ts).
  // Checkout is only how you *upgrade* away from it.
  plan: z.enum([SubscriptionPlan.BUSINESS, SubscriptionPlan.ENTERPRISE]),
  period: z.union([z.literal(1), z.literal(3), z.literal(6), z.literal(12)]),
});

export type CheckoutSessionInput = z.infer<typeof checkoutSessionSchema>;
