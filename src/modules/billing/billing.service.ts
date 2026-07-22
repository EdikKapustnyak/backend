import type Stripe from 'stripe';
import { stripeClient } from '../../utils/stripeClient.js';
import { logger } from '../../utils/logger.js';
import { env } from '../../config/env.js';
import { companyRepository } from '../companies/company.repository.js';
import type { CompanyDocument } from '../companies/company.model.js';
import { CompanyStatus, SubscriptionPlan } from '../companies/company.types.js';
import { AppError, BadRequestError, ForbiddenError, NotFoundError } from '../../errors/index.js';
import { PLAN_LIMITS, GRACE_PERIOD_DAYS, computeTotalPrice } from './plan.config.js';
import type { CheckoutSessionInput } from './billing.schema.js';
import type { CheckoutSessionResult, PortalSessionResult } from './billing.types.js';

/**
 * Reads a subscription's current period end defensively - Stripe's exact
 * field shape for this has shifted across API versions, and this value is
 * display-only (nothing in requireActiveSubscription/requireFeature reads
 * it), so a shape mismatch degrades to `null` instead of breaking the
 * webhook handler that everything else in this file depends on.
 */
function extractPeriodEnd(subscription: Stripe.Subscription): Date | null {
  const raw = (subscription as unknown as { current_period_end?: number }).current_period_end;
  return typeof raw === 'number' ? new Date(raw * 1000) : null;
}

function customerIdOf(customer: string | Stripe.Customer | Stripe.DeletedCustomer | null): string | null {
  if (!customer) return null;
  return typeof customer === 'string' ? customer : customer.id;
}

export const billingService = {
  /**
   * Creates (or reuses) a Stripe Customer for this company, then a
   * Checkout Session for `plan` at `period` months. Price is computed
   * inline via Stripe's `price_data` (see plan.config.ts) rather than a
   * pre-created Dashboard Price - no per-plan-per-period IDs to keep in
   * sync with this codebase's own pricing table.
   */
  async createCheckoutSession(
    companyId: string,
    input: CheckoutSessionInput,
  ): Promise<CheckoutSessionResult> {
    const company = await companyRepository.findById(companyId);
    if (!company) throw new NotFoundError('Company not found');

    const stripe = stripeClient.getClient();

    let stripeCustomerId = company.stripeCustomerId;
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        name: company.name,
        metadata: { companyId },
      });
      const newCustomerId = customer.id;
      await companyRepository.updateSubscriptionState(companyId, { stripeCustomerId: newCustomerId });
      stripeCustomerId = newCustomerId;
    }

    const totalPrice = computeTotalPrice(input.plan, input.period);

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: stripeCustomerId,
      client_reference_id: companyId,
      metadata: { companyId, plan: input.plan },
      subscription_data: {
        metadata: { companyId, plan: input.plan },
      },
      line_items: [
        {
          price_data: {
            currency: env.STRIPE_CURRENCY,
            product_data: { name: `${input.plan} plan - ${input.period} month(s)` },
            unit_amount: totalPrice,
            recurring: { interval: 'month', interval_count: input.period },
          },
          quantity: 1,
        },
      ],
      success_url: `${env.FRONTEND_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${env.FRONTEND_URL}/billing/cancelled`,
    });

    if (!session.url) {
      throw new AppError(500, 'INTERNAL_ERROR', 'Stripe did not return a checkout URL.');
    }

    return { checkoutUrl: session.url };
  },

  /** Stripe-hosted portal for managing an existing subscription (update card, cancel, view invoices/receipts). */
  async createPortalSession(companyId: string): Promise<PortalSessionResult> {
    const company = await companyRepository.findById(companyId);
    if (!company) throw new NotFoundError('Company not found');
    if (!company.stripeCustomerId) {
      throw new BadRequestError('No billing account yet - complete checkout first.');
    }

    const stripe = stripeClient.getClient();
    const session = await stripe.billingPortal.sessions.create({
      customer: company.stripeCustomerId,
      return_url: `${env.FRONTEND_URL}/settings/billing`,
    });

    return { portalUrl: session.url };
  },

  /**
   * Applies a verified Stripe event (see stripeClient.constructWebhookEvent)
   * to the local Company mirror. Unhandled event types are ignored on
   * purpose - Stripe sends many event types this app doesn't act on, and
   * an unhandled type is not an error.
   */
  async handleWebhookEvent(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const companyId = session.client_reference_id ?? session.metadata?.['companyId'];
        const plan = session.metadata?.['plan'] as SubscriptionPlan | undefined;

        if (!companyId || !plan) {
          logger.warn(
            { eventId: event.id },
            'checkout.session.completed missing companyId/plan metadata - ignoring',
          );
          return;
        }

        const stripeSubscriptionId =
          typeof session.subscription === 'string' ? session.subscription : (session.subscription?.id ?? null);

        await companyRepository.updateSubscriptionState(companyId, {
          subscriptionPlan: plan,
          status: CompanyStatus.ACTIVE,
          stripeSubscriptionId,
          pastDueSince: null,
        });
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const stripeCustomerId = customerIdOf(invoice.customer);
        if (!stripeCustomerId) return;

        const company = await companyRepository.findByStripeCustomerId(stripeCustomerId);
        if (!company) return;

        // Don't stomp an already-recorded pastDueSince - keep the original failure time for grace-period math.
        if (company.status !== CompanyStatus.PAST_DUE) {
          await companyRepository.updateSubscriptionState(company._id.toString(), {
            status: CompanyStatus.PAST_DUE,
            pastDueSince: new Date(),
          });
        }
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        const stripeCustomerId = customerIdOf(invoice.customer);
        if (!stripeCustomerId) return;

        const company = await companyRepository.findByStripeCustomerId(stripeCustomerId);
        if (!company) return;

        let currentPeriodEnd: Date | null = null;
        const subscriptionId =
          typeof invoice.subscription === 'string' ? invoice.subscription : (invoice.subscription?.id ?? null);
        if (subscriptionId) {
          const subscription = await stripeClient.getClient().subscriptions.retrieve(subscriptionId);
          currentPeriodEnd = extractPeriodEnd(subscription);
        }

        await companyRepository.updateSubscriptionState(company._id.toString(), {
          status: CompanyStatus.ACTIVE,
          pastDueSince: null,
          currentPeriodEnd,
        });
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const stripeCustomerId = customerIdOf(subscription.customer);
        if (!stripeCustomerId) return;

        const company = await companyRepository.findByStripeCustomerId(stripeCustomerId);
        if (!company) return;

        await companyRepository.updateSubscriptionState(company._id.toString(), {
          status: CompanyStatus.SUSPENDED,
        });
        break;
      }

      default:
        break;
    }
  },

  /**
   * Lazily escalates PAST_DUE -> SUSPENDED once the grace period has
   * elapsed, for the request/login currently in flight - called from
   * requireActiveSubscription and authService.login, the two places that
   * read company.status for enforcement. This makes the transition
   * visible immediately to whoever is actively hitting the API, without
   * waiting for the next sweep.
   *
   * jobs/gracePeriodSweep.ts runs the same escalation on a timer
   * (GRACE_PERIOD_SWEEP_INTERVAL_MS, hourly by default) as a companion to
   * this - it catches companies that stop making requests entirely during
   * their grace period, which this function alone would never escalate
   * since it only runs when triggered by a request. Stripe's own
   * subscription cancellation (customer.subscription.deleted ->
   * SUSPENDED, see handleWebhookEvent above) remains the actual backstop
   * either way; both of these only affect how promptly our own DB
   * reflects that a grace period ran out.
   */
  async escalateIfGracePeriodElapsed(company: CompanyDocument): Promise<CompanyDocument> {
    if (company.status !== CompanyStatus.PAST_DUE || !company.pastDueSince) {
      return company;
    }

    const graceDeadline = new Date(company.pastDueSince);
    graceDeadline.setDate(graceDeadline.getDate() + GRACE_PERIOD_DAYS);

    if (new Date() < graceDeadline) {
      return company;
    }

    const updated = await companyRepository.updateSubscriptionState(company._id.toString(), {
      status: CompanyStatus.SUSPENDED,
    });
    return updated ?? company;
  },

  /** Throws if `currentCount` is already at (or past) the plan's limit for `resource`. Called before creating a new warehouse/user - see warehouse.controller.ts / user.service.ts. */
  async assertResourceLimit(
    companyId: string,
    resource: 'warehouses' | 'users',
    currentCount: number,
  ): Promise<void> {
    const company = await companyRepository.findById(companyId);
    if (!company) throw new NotFoundError('Company not found');

    const limits = PLAN_LIMITS[company.subscriptionPlan];
    const max = resource === 'warehouses' ? limits.maxWarehouses : limits.maxUsers;

    if (max !== null && currentCount >= max) {
      throw new ForbiddenError(
        `Your ${company.subscriptionPlan} plan allows up to ${max} ${resource}. Upgrade your plan to add more.`,
      );
    }
  },
};
