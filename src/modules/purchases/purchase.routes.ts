import { Router } from 'express';
import * as purchaseController from './purchase.controller.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { requireActiveSubscription } from '../../middlewares/requireActiveSubscription.js';
import { requireRole } from '../../middlewares/requireRole.js';
import { validate } from '../../middlewares/validate.js';
import { isValidId } from '../../middlewares/isValidId.js';
import { Role } from '../users/user.types.js';
import {
  createPurchaseSchema,
  updatePurchaseSchema,
  listPurchasesQuerySchema,
} from './purchase.schema.js';

export const purchaseRouter = Router();

// companyId for every operation below is always derived from the verified
// access token (see purchase.controller.ts), never from the client.
purchaseRouter.use(authenticate);
purchaseRouter.use(requireActiveSubscription);

purchaseRouter.get(
  '/',
  validate({ query: listPurchasesQuerySchema }),
  purchaseController.listPurchases,
);

purchaseRouter.get('/:id', isValidId(), purchaseController.getPurchase);

purchaseRouter.post(
  '/',
  requireRole(Role.OWNER, Role.ADMIN, Role.MANAGER),
  validate({ body: createPurchaseSchema }),
  purchaseController.createPurchase,
);

purchaseRouter.patch(
  '/:id',
  requireRole(Role.OWNER, Role.ADMIN, Role.MANAGER),
  isValidId(),
  validate({ body: updatePurchaseSchema }),
  purchaseController.updatePurchase,
);

purchaseRouter.post(
  '/:id/complete',
  requireRole(Role.OWNER, Role.ADMIN, Role.MANAGER),
  isValidId(),
  purchaseController.completePurchase,
);

purchaseRouter.post(
  '/:id/cancel',
  requireRole(Role.OWNER, Role.ADMIN, Role.MANAGER),
  isValidId(),
  purchaseController.cancelPurchase,
);
