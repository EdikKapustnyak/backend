import type { Request, Response } from 'express';
import { ctrlWrapper } from '../../utils/ctrlWrapper.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { parsePaginationParams, calculatePaginationData } from '../../utils/pagination.js';
import { inventoryRepository } from './inventory.repository.js';
import { toPublicInventory, adjustInventory as adjustInventoryService } from './inventory.service.js';
import { productRepository } from '../products/product.repository.js';
import { warehouseRepository } from '../warehouses/warehouse.repository.js';
import { UnauthorizedError, NotFoundError } from '../../errors/index.js';

export const createInventory = ctrlWrapper(async (req: Request, res: Response) => {
  if (!req.auth) throw new UnauthorizedError();

  // Foreign keys are always re-verified against the caller's own tenant -
  // a product/warehouse id from another company must 404, never link up.
  const product = await productRepository.findByIdInCompany(
    req.body.productId,
    req.auth.companyId,
  );
  if (!product) throw new NotFoundError('Product not found');

  const warehouse = await warehouseRepository.findByIdInCompany(
    req.body.warehouseId,
    req.auth.companyId,
  );
  if (!warehouse) throw new NotFoundError('Warehouse not found');

  const inventory = await inventoryRepository.create({
    companyId: req.auth.companyId,
    productId: req.body.productId,
    warehouseId: req.body.warehouseId,
    quantity: req.body.quantity,
  });

  sendSuccess(res, toPublicInventory(inventory), 'Inventory record created', 201);
});

export const listInventory = ctrlWrapper(async (req: Request, res: Response) => {
  if (!req.auth) throw new UnauthorizedError();

  const pagination = parsePaginationParams(req.query as Record<string, unknown>);
  const productId =
    typeof req.query['productId'] === 'string' ? req.query['productId'] : undefined;
  const warehouseId =
    typeof req.query['warehouseId'] === 'string' ? req.query['warehouseId'] : undefined;

  const { items, totalItems } = await inventoryRepository.findManyInCompany(
    { companyId: req.auth.companyId, productId, warehouseId },
    pagination,
  );

  sendSuccess(res, {
    items: items.map(toPublicInventory),
    pagination: calculatePaginationData(totalItems, pagination.page, pagination.perPage),
  });
});

export const getInventory = ctrlWrapper(async (req: Request, res: Response) => {
  if (!req.auth) throw new UnauthorizedError();

  const inventory = await inventoryRepository.findByIdInCompany(
    req.params['id'] as string,
    req.auth.companyId,
  );
  if (!inventory) throw new NotFoundError('Inventory record not found');

  sendSuccess(res, toPublicInventory(inventory));
});

/**
 * Applies a manual stock correction. This is also the primitive that
 * Purchases (positive quantityDelta) and Write-offs (negative quantityDelta)
 * build on, and it now also records a StockMovement audit entry - see
 * inventory.service.ts#adjustInventory.
 */
export const adjustInventory = ctrlWrapper(async (req: Request, res: Response) => {
  if (!req.auth) throw new UnauthorizedError();

  const id = req.params['id'] as string;
  const quantityDelta = (req.body.quantityDelta as number | undefined) ?? 0;
  const reservedDelta = (req.body.reservedDelta as number | undefined) ?? 0;

  const result = await adjustInventoryService(
    id,
    req.auth.companyId,
    quantityDelta,
    reservedDelta,
    req.auth.userId,
  );

  sendSuccess(res, result, 'Inventory adjusted');
});
