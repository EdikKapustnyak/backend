import { Router } from 'express';
import * as inventoryController from './inventory.controller.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { requireActiveSubscription } from '../../middlewares/requireActiveSubscription.js';
import { requireRole } from '../../middlewares/requireRole.js';
import { validate } from '../../middlewares/validate.js';
import { isValidId } from '../../middlewares/isValidId.js';
import { Role } from '../users/user.types.js';
import {
  createInventorySchema,
  adjustInventorySchema,
  listInventoryQuerySchema,
} from './inventory.schema.js';

export const inventoryRouter = Router();

// companyId for every operation below is always derived from the verified
// access token (see inventory.controller.ts), never from the client.
inventoryRouter.use(authenticate);
inventoryRouter.use(requireActiveSubscription);

inventoryRouter.get(
  '/',
  validate({ query: listInventoryQuerySchema }),
  inventoryController.listInventory,
);

inventoryRouter.get('/:id', isValidId(), inventoryController.getInventory);

inventoryRouter.post(
  '/',
  requireRole(Role.OWNER, Role.ADMIN, Role.MANAGER),
  validate({ body: createInventorySchema }),
  inventoryController.createInventory,
);

inventoryRouter.patch(
  '/:id/adjust',
  requireRole(Role.OWNER, Role.ADMIN, Role.MANAGER),
  isValidId(),
  validate({ body: adjustInventorySchema }),
  inventoryController.adjustInventory,
);
