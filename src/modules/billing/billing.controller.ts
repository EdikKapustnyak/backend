import type { Request, Response } from 'express';
import { ctrlWrapper } from '../../utils/ctrlWrapper.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { stripeClient } from '../../utils/stripeClient.js';
import { billingService } from './billing.service.js';
import { UnauthorizedError, BadRequestError } from '../../errors/index.js';

export const createCheckoutSession = ctrlWrapper(async (req: Request, res: Response) => {
  if (!req.auth) throw new UnauthorizedError();

  const result = await billingService.createCheckoutSession(req.auth.companyId, req.body);
  sendSuccess(res, result, 'Checkout session created');
});

export const createPortalSession = ctrlWrapper(async (req: Request, res: Response) => {
  if (!req.auth) throw new UnauthorizedError();

  const result = await billingService.createPortalSession(req.auth.companyId);
  sendSuccess(res, result, 'Billing portal session created');
});

/**
 * Deliberately unauthenticated - the caller is Stripe, not a logged-in
 * user (see app.ts for why this route is mounted outside the normal
 * authenticated router tree, with a raw request body). Trust comes
 * entirely from the signature check in constructWebhookEvent, not from a
 * JWT.
 */
export const stripeWebhook = ctrlWrapper(async (req: Request, res: Response) => {
  const signature = req.headers['stripe-signature'];
  if (typeof signature !== 'string') {
    throw new BadRequestError('Missing Stripe-Signature header.');
  }
  if (!Buffer.isBuffer(req.body)) {
    // Would only happen if this route were ever accidentally routed
    // through the global express.json() parser instead of express.raw() -
    // see app.ts. Not a client error, but BadRequestError surfaces it
    // loudly instead of silently failing the signature check below.
    throw new BadRequestError('Expected a raw request body for webhook signature verification.');
  }

  const event = stripeClient.constructWebhookEvent(req.body, signature);
  await billingService.handleWebhookEvent(event);

  sendSuccess(res, { received: true });
});
