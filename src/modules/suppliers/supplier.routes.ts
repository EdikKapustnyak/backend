import { Router } from 'express';
import * as supplierController from './supplier.controller.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { requireRole } from '../../middlewares/requireRole.js';
import { validate } from '../../middlewares/validate.js';
import { isValidId } from '../../middlewares/isValidId.js';
import { Role } from '../users/user.types.js';
import {
  createSupplierSchema,
  updateSupplierSchema,
  listSuppliersQuerySchema,
} from './supplier.schema.js';

export const supplierRouter = Router();

// companyId for every operation below is always derived from the verified
// access token (see supplier.controller.ts), never from the client.
supplierRouter.use(authenticate);

supplierRouter.get(
  '/',
  validate({ query: listSuppliersQuerySchema }),
  supplierController.listSuppliers,
);

supplierRouter.get('/:id', isValidId(), supplierController.getSupplier);

supplierRouter.post(
  '/',
  requireRole(Role.OWNER, Role.ADMIN, Role.MANAGER),
  validate({ body: createSupplierSchema }),
  supplierController.createSupplier,
);

supplierRouter.patch(
  '/:id',
  requireRole(Role.OWNER, Role.ADMIN, Role.MANAGER),
  isValidId(),
  validate({ body: updateSupplierSchema }),
  supplierController.updateSupplier,
);

supplierRouter.delete(
  '/:id',
  requireRole(Role.OWNER, Role.ADMIN),
  isValidId(),
  supplierController.deactivateSupplier,
);
