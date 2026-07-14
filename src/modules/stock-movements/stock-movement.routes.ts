import { Router } from 'express';
import * as stockMovementController from './stock-movement.controller.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { requireActiveSubscription } from '../../middlewares/requireActiveSubscription.js';
import { validate } from '../../middlewares/validate.js';
import { isValidId } from '../../middlewares/isValidId.js';
import { listStockMovementsQuerySchema } from './stock-movement.schema.js';

export const stockMovementRouter = Router();

// companyId for every operation below is always derived from the verified
// access token (see stock-movement.controller.ts), never from the client.
stockMovementRouter.use(authenticate);
stockMovementRouter.use(requireActiveSubscription);

// Read-only: there is intentionally no POST here. Movements are only ever
// created as a side effect of Purchases completion, Write-offs confirmation,
// or a manual Inventory adjustment - see those modules' *.service.ts files.
stockMovementRouter.get(
  '/',
  validate({ query: listStockMovementsQuerySchema }),
  stockMovementController.listStockMovements,
);

stockMovementRouter.get('/:id', isValidId(), stockMovementController.getStockMovement);
