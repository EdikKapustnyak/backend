import { Router } from 'express';
import * as productController from './product.controller.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { requireActiveSubscription } from '../../middlewares/requireActiveSubscription.js';
import { requireRole } from '../../middlewares/requireRole.js';
import { validate } from '../../middlewares/validate.js';
import { isValidId } from '../../middlewares/isValidId.js';
import { Role } from '../users/user.types.js';
import {
  createProductSchema,
  updateProductSchema,
  listProductsQuerySchema,
} from './product.schema.js';

export const productRouter = Router();

// companyId for every operation below is always derived from the verified
// access token (see product.controller.ts), never from the client.
productRouter.use(authenticate);
productRouter.use(requireActiveSubscription);

productRouter.get(
  '/',
  validate({ query: listProductsQuerySchema }),
  productController.listProducts,
);

productRouter.get('/:id', isValidId(), productController.getProduct);

productRouter.post(
  '/',
  requireRole(Role.OWNER, Role.ADMIN, Role.MANAGER),
  validate({ body: createProductSchema }),
  productController.createProduct,
);

productRouter.patch(
  '/:id',
  requireRole(Role.OWNER, Role.ADMIN, Role.MANAGER),
  isValidId(),
  validate({ body: updateProductSchema }),
  productController.updateProduct,
);

productRouter.delete(
  '/:id',
  requireRole(Role.OWNER, Role.ADMIN),
  isValidId(),
  productController.deactivateProduct,
);
