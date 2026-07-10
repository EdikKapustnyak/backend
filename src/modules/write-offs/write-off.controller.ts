import type { Request, Response } from 'express';
import { ctrlWrapper } from '../../utils/ctrlWrapper.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { parsePaginationParams, calculatePaginationData } from '../../utils/pagination.js';
import { writeOffRepository } from './write-off.repository.js';
import { confirmWriteOff as confirmWriteOffService, toPublicWriteOff } from './write-off.service.js';
import { WriteOffStatus, type WriteOffReason } from './write-off.types.js';
import { productRepository } from '../products/product.repository.js';
import { warehouseRepository } from '../warehouses/warehouse.repository.js';
import { inventoryRepository } from '../inventory/inventory.repository.js';
import { UnauthorizedError, NotFoundError, ConflictError } from '../../errors/index.js';

export const createWriteOff = ctrlWrapper(async (req: Request, res: Response) => {
  if (!req.auth) throw new UnauthorizedError();

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

  const inventory = await inventoryRepository.findByProductAndWarehouse(
    req.auth.companyId,
    req.body.productId,
    req.body.warehouseId,
  );
  if (!inventory) {
    throw new NotFoundError('No stock record exists for this product in this warehouse');
  }

  const writeOff = await writeOffRepository.create({
    // Tenant identity and author always come from the verified JWT, never
    // the request body.
    companyId: req.auth.companyId,
    productId: req.body.productId,
    warehouseId: req.body.warehouseId,
    quantity: req.body.quantity,
    reason: req.body.reason,
    notes: req.body.notes ?? null,
    createdBy: req.auth.userId,
  });

  sendSuccess(res, toPublicWriteOff(writeOff), 'Write-off created as draft', 201);
});

export const listWriteOffs = ctrlWrapper(async (req: Request, res: Response) => {
  if (!req.auth) throw new UnauthorizedError();

  const pagination = parsePaginationParams(req.query as Record<string, unknown>);
  const productId =
    typeof req.query['productId'] === 'string' ? req.query['productId'] : undefined;
  const warehouseId =
    typeof req.query['warehouseId'] === 'string' ? req.query['warehouseId'] : undefined;
  const reason =
    typeof req.query['reason'] === 'string' ? (req.query['reason'] as WriteOffReason) : undefined;
  const status =
    typeof req.query['status'] === 'string' ? (req.query['status'] as WriteOffStatus) : undefined;

  const { items, totalItems } = await writeOffRepository.findManyInCompany(
    { companyId: req.auth.companyId, productId, warehouseId, reason, status },
    pagination,
  );

  sendSuccess(res, {
    items: items.map(toPublicWriteOff),
    pagination: calculatePaginationData(totalItems, pagination.page, pagination.perPage),
  });
});

export const getWriteOff = ctrlWrapper(async (req: Request, res: Response) => {
  if (!req.auth) throw new UnauthorizedError();

  const writeOff = await writeOffRepository.findByIdInCompany(
    req.params['id'] as string,
    req.auth.companyId,
  );
  if (!writeOff) throw new NotFoundError('Write-off not found');

  sendSuccess(res, toPublicWriteOff(writeOff));
});

export const confirmWriteOff = ctrlWrapper(async (req: Request, res: Response) => {
  if (!req.auth) throw new UnauthorizedError();

  const result = await confirmWriteOffService(
    req.params['id'] as string,
    req.auth.companyId,
    req.auth.userId,
  );

  sendSuccess(res, result, 'Write-off confirmed and stock updated');
});

export const cancelWriteOff = ctrlWrapper(async (req: Request, res: Response) => {
  if (!req.auth) throw new UnauthorizedError();
  const id = req.params['id'] as string;

  const existing = await writeOffRepository.findByIdInCompany(id, req.auth.companyId);
  if (!existing) throw new NotFoundError('Write-off not found');
  if (existing.status !== WriteOffStatus.DRAFT) {
    throw new ConflictError(
      `Only draft write-offs can be cancelled (current status: "${existing.status}")`,
    );
  }

  const cancelled = await writeOffRepository.cancelInCompany(id, req.auth.companyId);
  if (!cancelled) throw new ConflictError('Write-off is no longer in draft status');

  sendSuccess(res, toPublicWriteOff(cancelled), 'Write-off cancelled');
});
