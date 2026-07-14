import { Router } from 'express';
import * as inventarizationController from './inventarization.controller.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { requireActiveSubscription } from '../../middlewares/requireActiveSubscription.js';
import { requireRole } from '../../middlewares/requireRole.js';
import { validate } from '../../middlewares/validate.js';
import { isValidId } from '../../middlewares/isValidId.js';
import { Role } from '../users/user.types.js';
import {
  createInventarizationSchema,
  recordCountsSchema,
  listInventarizationsQuerySchema,
} from './inventarization.schema.js';

export const inventarizationRouter = Router();

// companyId for every operation below is always derived from the verified
// access token (see inventarization.controller.ts), never from the client.
inventarizationRouter.use(authenticate);
inventarizationRouter.use(requireActiveSubscription);

inventarizationRouter.get(
  '/',
  validate({ query: listInventarizationsQuerySchema }),
  inventarizationController.listInventarizations,
);

inventarizationRouter.get('/:id', isValidId(), inventarizationController.getInventarization);

// Any authenticated tenant member - including `employee` - can start a count
// and record quantities; that's usually the person physically walking the
// warehouse. Confirming or cancelling is a manager-level decision.
inventarizationRouter.post(
  '/',
  validate({ body: createInventarizationSchema }),
  inventarizationController.createInventarization,
);

inventarizationRouter.patch(
  '/:id/count',
  isValidId(),
  validate({ body: recordCountsSchema }),
  inventarizationController.recordCounts,
);

inventarizationRouter.post(
  '/:id/complete',
  requireRole(Role.OWNER, Role.ADMIN, Role.MANAGER),
  isValidId(),
  inventarizationController.completeInventarization,
);

inventarizationRouter.post(
  '/:id/cancel',
  requireRole(Role.OWNER, Role.ADMIN, Role.MANAGER),
  isValidId(),
  inventarizationController.cancelInventarization,
);
