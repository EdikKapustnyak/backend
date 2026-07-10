import type { Request, Response } from 'express';
import { ctrlWrapper } from '../../utils/ctrlWrapper.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { parsePaginationParams, calculatePaginationData } from '../../utils/pagination.js';
import { purchaseRepository } from './purchase.repository.js';
import { toPublicPurchase, completePurchase as completePurchaseService } from './purchase.service.js';
import { PurchaseStatus } from './purchase.types.js';
import { supplierRepository } from '../suppliers/supplier.repository.js';
import { warehouseRepository } from '../warehouses/warehouse.repository.js';
import { productRepository } from '../products/product.repository.js';
import { UnauthorizedError, NotFoundError, ConflictError } from '../../errors/index.js';

interface PurchaseItemBody {
  productId: string;
  quantity: number;
  unitPrice: number;
}

async function assertProductsBelongToCompany(
  items: PurchaseItemBody[],
  companyId: string,
): Promise<void> {
  for (const item of items) {
    const product = await productRepository.findByIdInCompany(item.productId, companyId);
    if (!product) throw new NotFoundError(`Product ${item.productId} not found`);
  }
}

export const createPurchase = ctrlWrapper(async (req: Request, res: Response) => {
  if (!req.auth) throw new UnauthorizedError();

  const supplier = await supplierRepository.findByIdInCompany(
    req.body.supplierId,
    req.auth.companyId,
  );
  if (!supplier) throw new NotFoundError('Supplier not found');

  const warehouse = await warehouseRepository.findByIdInCompany(
    req.body.warehouseId,
    req.auth.companyId,
  );
  if (!warehouse) throw new NotFoundError('Warehouse not found');

  await assertProductsBelongToCompany(req.body.items, req.auth.companyId);

  const purchase = await purchaseRepository.create({
    // Tenant identity always comes from the verified JWT, never the body.
    companyId: req.auth.companyId,
    supplierId: req.body.supplierId,
    warehouseId: req.body.warehouseId,
    items: req.body.items,
    notes: req.body.notes ?? null,
    createdBy: req.auth.userId,
  });

  sendSuccess(res, toPublicPurchase(purchase), 'Purchase created as draft', 201);
});

export const listPurchases = ctrlWrapper(async (req: Request, res: Response) => {
  if (!req.auth) throw new UnauthorizedError();

  const pagination = parsePaginationParams(req.query as Record<string, unknown>);
  const supplierId =
    typeof req.query['supplierId'] === 'string' ? req.query['supplierId'] : undefined;
  const warehouseId =
    typeof req.query['warehouseId'] === 'string' ? req.query['warehouseId'] : undefined;
  const status =
    typeof req.query['status'] === 'string'
      ? (req.query['status'] as PurchaseStatus)
      : undefined;

  const { items, totalItems } = await purchaseRepository.findManyInCompany(
    { companyId: req.auth.companyId, supplierId, warehouseId, status },
    pagination,
  );

  sendSuccess(res, {
    items: items.map(toPublicPurchase),
    pagination: calculatePaginationData(totalItems, pagination.page, pagination.perPage),
  });
});

export const getPurchase = ctrlWrapper(async (req: Request, res: Response) => {
  if (!req.auth) throw new UnauthorizedError();

  const purchase = await purchaseRepository.findByIdInCompany(
    req.params['id'] as string,
    req.auth.companyId,
  );
  if (!purchase) throw new NotFoundError('Purchase not found');

  sendSuccess(res, toPublicPurchase(purchase));
});

export const updatePurchase = ctrlWrapper(async (req: Request, res: Response) => {
  if (!req.auth) throw new UnauthorizedError();
  const id = req.params['id'] as string;

  const existing = await purchaseRepository.findByIdInCompany(id, req.auth.companyId);
  if (!existing) throw new NotFoundError('Purchase not found');
  if (existing.status !== PurchaseStatus.DRAFT) {
    throw new ConflictError(
      `Only draft purchases can be edited (current status: "${existing.status}")`,
    );
  }

  if (req.body.supplierId) {
    const supplier = await supplierRepository.findByIdInCompany(
      req.body.supplierId,
      req.auth.companyId,
    );
    if (!supplier) throw new NotFoundError('Supplier not found');
  }
  if (req.body.warehouseId) {
    const warehouse = await warehouseRepository.findByIdInCompany(
      req.body.warehouseId,
      req.auth.companyId,
    );
    if (!warehouse) throw new NotFoundError('Warehouse not found');
  }
  if (req.body.items) {
    await assertProductsBelongToCompany(req.body.items, req.auth.companyId);
  }

  const updated = await purchaseRepository.updateInCompany(id, req.auth.companyId, req.body);
  if (!updated) throw new ConflictError('Purchase is no longer in draft status');

  sendSuccess(res, toPublicPurchase(updated), 'Purchase updated');
});

export const completePurchase = ctrlWrapper(async (req: Request, res: Response) => {
  if (!req.auth) throw new UnauthorizedError();

  const result = await completePurchaseService(req.params['id'] as string, req.auth.companyId);
  sendSuccess(res, result, 'Purchase completed and stock updated');
});

export const cancelPurchase = ctrlWrapper(async (req: Request, res: Response) => {
  if (!req.auth) throw new UnauthorizedError();
  const id = req.params['id'] as string;

  const existing = await purchaseRepository.findByIdInCompany(id, req.auth.companyId);
  if (!existing) throw new NotFoundError('Purchase not found');
  if (existing.status !== PurchaseStatus.DRAFT) {
    throw new ConflictError(
      `Only draft purchases can be cancelled (current status: "${existing.status}")`,
    );
  }

  const cancelled = await purchaseRepository.cancelInCompany(id, req.auth.companyId);
  if (!cancelled) throw new ConflictError('Purchase is no longer in draft status');

  sendSuccess(res, toPublicPurchase(cancelled), 'Purchase cancelled');
});
