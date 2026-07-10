import { Router } from 'express';
import { authRouter } from '../modules/auth/auth.routes.js';
import { userRouter } from '../modules/users/user.routes.js';
import { warehouseRouter } from '../modules/warehouses/warehouse.routes.js';
import { productRouter } from '../modules/products/product.routes.js';
import { inventoryRouter } from '../modules/inventory/inventory.routes.js';
import { supplierRouter } from '../modules/suppliers/supplier.routes.js';
import { purchaseRouter } from '../modules/purchases/purchase.routes.js';
import { writeOffRouter } from '../modules/write-offs/write-off.routes.js';

export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/users', userRouter);
apiRouter.use('/warehouses', warehouseRouter);
apiRouter.use('/products', productRouter);
apiRouter.use('/inventory', inventoryRouter);
apiRouter.use('/suppliers', supplierRouter);
apiRouter.use('/purchases', purchaseRouter);
apiRouter.use('/write-offs', writeOffRouter);
