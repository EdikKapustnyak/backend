import { Router } from 'express';
import * as billingController from './billing.controller.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { requireRole } from '../../middlewares/requireRole.js';
import { validate } from '../../middlewares/validate.js';
import { Role } from '../users/user.types.js';
import { checkoutSessionSchema } from './billing.schema.js';

/**
 * The Stripe webhook is NOT registered here - it's mounted directly on the
 * Express app in app.ts, before the global JSON body-parser, because it
 * needs the raw request body to verify Stripe's signature and must not go
 * through `authenticate` (the caller is Stripe, not a logged-in user).
 * Deliberately excluded from `requireActiveSubscription` too (see
 * routes/index.ts) - a company must be able to pay/manage billing exactly
 * when its subscription isn't active.
 */
export const billingRouter = Router();

billingRouter.use(authenticate);

billingRouter.post(
  '/checkout',
  requireRole(Role.OWNER, Role.ADMIN),
  validate({ body: checkoutSessionSchema }),
  billingController.createCheckoutSession,
);

billingRouter.post('/portal', requireRole(Role.OWNER, Role.ADMIN), billingController.createPortalSession);
