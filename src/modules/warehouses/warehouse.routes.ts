import { Router } from 'express';
import * as warehouseController from './warehouse.controller.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { requireActiveSubscription } from '../../middlewares/requireActiveSubscription.js';
import { requireRole } from '../../middlewares/requireRole.js';
import { validate } from '../../middlewares/validate.js';
import { isValidId } from '../../middlewares/isValidId.js';
import { Role } from '../users/user.types.js';
import { createWarehouseSchema, updateWarehouseSchema, listWarehousesQuerySchema } from './warehouse.schema.js';

export const warehouseRouter = Router();

// companyId for every operation below is always derived from the verified
// access token (see warehouse.controller.ts), never from the client.
warehouseRouter.use(authenticate);
warehouseRouter.use(requireActiveSubscription);

warehouseRouter.get('/', validate({ query: listWarehousesQuerySchema }), warehouseController.listWarehouses);

warehouseRouter.get('/:id', isValidId(), warehouseController.getWarehouse);

warehouseRouter.post(
  '/',
  requireRole(Role.OWNER, Role.ADMIN, Role.MANAGER),
  validate({ body: createWarehouseSchema }),
  warehouseController.createWarehouse,
);

warehouseRouter.patch(
  '/:id',
  requireRole(Role.OWNER, Role.ADMIN, Role.MANAGER),
  isValidId(),
  validate({ body: updateWarehouseSchema }),
  warehouseController.updateWarehouse,
);

warehouseRouter.delete(
  '/:id',
  requireRole(Role.OWNER, Role.ADMIN),
  isValidId(),
  warehouseController.deactivateWarehouse,
);
