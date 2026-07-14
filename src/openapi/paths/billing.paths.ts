import { registry, successResponse, commonErrorResponses, validationErrorResponse, errorResponseSchema } from '../registry.js';
import { checkoutSessionSchema } from '../../modules/billing/billing.schema.js';
import { checkoutSessionResultSchema, portalSessionResultSchema } from '../responseSchemas.js';

const TAG = 'Billing';

registry.registerPath({
  method: 'post',
  path: '/billing/checkout',
  tags: [TAG],
  summary: 'Start a Stripe Checkout session to upgrade the plan',
  description:
    "Owner/admin only. Basic isn't sold this way (it's the free default) - only 'business'/'enterprise' are accepted. Creates (or reuses) a Stripe customer for the company. Redirect the browser to the returned checkoutUrl.",
  request: { body: { content: { 'application/json': { schema: checkoutSessionSchema } } } },
  responses: {
    200: {
      description: 'Checkout session created',
      content: { 'application/json': { schema: successResponse(checkoutSessionResultSchema) } },
    },
    422: validationErrorResponse,
    ...commonErrorResponses,
  },
});

registry.registerPath({
  method: 'post',
  path: '/billing/portal',
  tags: [TAG],
  summary: "Get a link to Stripe's Customer Portal (update card, cancel, view invoices)",
  description: 'Owner/admin only. Always reachable regardless of subscription status, so a past_due/suspended company can still fix its payment method.',
  responses: {
    200: {
      description: 'Portal session created',
      content: { 'application/json': { schema: successResponse(portalSessionResultSchema) } },
    },
    400: {
      description: 'No Stripe customer yet - complete checkout first',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
  },
});

// POST /billing/webhook is deliberately not documented here: it's not
// callable by an API client (no JWT, Stripe-Signature verification
// instead) and isn't mounted under /api/v1 the normal way - see app.ts.
// It's covered in the README's "Billing & subscriptions" section instead.
