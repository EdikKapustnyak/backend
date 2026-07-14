import Stripe from 'stripe';
import { env } from '../config/env.js';
import { AppError } from '../errors/index.js';

/**
 * Thin wrapper around the Stripe SDK - same "single source of truth for
 * configured state, throw a clear error at the point of use" shape as
 * objectStorage.ts (R2) and anthropicClient.ts. Unlike mailer.ts, there is
 * no fallback for an unconfigured Stripe: checkout, webhook, and portal
 * endpoints simply require it, the same way an upload requires R2.
 *
 * Exported as an object with methods (not bare functions) to match
 * mailer.ts/anthropicClient.ts - besides consistency, this is what makes
 * it reliably mockable via `vi.spyOn(stripeClient, 'getClient')` in tests,
 * the same pattern already used for those two.
 */

let client: Stripe | null = null;

export const stripeClient = {
  isConfigured(): boolean {
    return Boolean(env.STRIPE_SECRET_KEY);
  },

  getClient(): Stripe {
    if (!env.STRIPE_SECRET_KEY) {
      throw new AppError(500, 'INTERNAL_ERROR', 'Billing is not configured (missing STRIPE_SECRET_KEY).');
    }
    if (!client) {
      client = new Stripe(env.STRIPE_SECRET_KEY);
    }
    return client;
  },

  /**
   * Verifies and parses a webhook payload against STRIPE_WEBHOOK_SECRET.
   * `rawBody` must be the untouched request body Buffer (see app.ts, where
   * this one route is deliberately excluded from the global express.json()
   * middleware) - Stripe's signature is computed over the exact bytes it
   * sent, so a body that's been JSON-parsed and re-serialized will never
   * verify, even with byte-identical content.
   *
   * A missing secret and a bad signature are deliberately thrown as the
   * same generic error - both mean "don't trust this request", and
   * distinguishing them in the response would hand an attacker a signal
   * about which check to work around.
   */
  constructWebhookEvent(rawBody: Buffer, signature: string): Stripe.Event {
    if (!env.STRIPE_WEBHOOK_SECRET) {
      throw new AppError(400, 'BAD_REQUEST', 'Invalid Stripe webhook request.');
    }
    try {
      return this.getClient().webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
    } catch {
      throw new AppError(400, 'BAD_REQUEST', 'Invalid Stripe webhook request.');
    }
  },
};
