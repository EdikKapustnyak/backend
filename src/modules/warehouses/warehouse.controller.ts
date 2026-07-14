import type { Request, Response } from 'express';
import { ctrlWrapper } from '../../utils/ctrlWrapper.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { parsePaginationParams, calculatePaginationData } from '../../utils/pagination.js';
import { warehouseRepository } from './warehouse.repository.js';
import { toPublicWarehouse } from './warehouse.service.js';
import { billingService } from '../billing/billing.service.js';
import { UnauthorizedError, NotFoundError, ConflictError } from '../../errors/index.js';

export const createWarehouse = ctrlWrapper(async (req: Request, res: Response) => {
  if (!req.auth) throw new UnauthorizedError();

  const currentCount = await warehouseRepository.countActiveInCompany(req.auth.companyId);
  await billingService.assertResourceLimit(req.auth.companyId, 'warehouses', currentCount);

  const warehouse = await warehouseRepository.create({
    // Tenant identity always comes from the verified JWT, never the body.
    companyId: req.auth.companyId,
    name: req.body.name,
    location: req.body.location ?? null,
  });

  sendSuccess(res, toPublicWarehouse(warehouse), 'Warehouse created successfully', 201);
});

export const listWarehouses = ctrlWrapper(async (req: Request, res: Response) => {
  if (!req.auth) throw new UnauthorizedError();

  const pagination = parsePaginationParams(req.query as Record<string, unknown>);
  const search = typeof req.query['search'] === 'string' ? req.query['search'] : undefined;
  const isActiveParam = req.query['isActive'];
  const isActive =
    isActiveParam === 'true' ? true : isActiveParam === 'false' ? false : undefined;

  const { items, totalItems } = await warehouseRepository.findManyInCompany(
    { companyId: req.auth.companyId, search, isActive },
    pagination,
  );

  sendSuccess(res, {
    items: items.map(toPublicWarehouse),
    pagination: calculatePaginationData(totalItems, pagination.page, pagination.perPage),
  });
});

export const getWarehouse = ctrlWrapper(async (req: Request, res: Response) => {
  if (!req.auth) throw new UnauthorizedError();

  const warehouse = await warehouseRepository.findByIdInCompany(
    req.params['id'] as string,
    req.auth.companyId,
  );
  if (!warehouse) throw new NotFoundError('Warehouse not found');

  sendSuccess(res, toPublicWarehouse(warehouse));
});

export const updateWarehouse = ctrlWrapper(async (req: Request, res: Response) => {
  if (!req.auth) throw new UnauthorizedError();

  const warehouse = await warehouseRepository.updateInCompany(
    req.params['id'] as string,
    req.auth.companyId,
    req.body,
  );
  if (!warehouse) throw new NotFoundError('Warehouse not found');

  sendSuccess(res, toPublicWarehouse(warehouse), 'Warehouse updated successfully');
});

/**
 * Soft delete: warehouses are referenced by future inventory/stock-movement
 * records, so we deactivate rather than physically remove them to preserve
 * referential and audit history. See README "Assumptions".
 */
export const deactivateWarehouse = ctrlWrapper(async (req: Request, res: Response) => {
  if (!req.auth) throw new UnauthorizedError();

  const warehouse = await warehouseRepository.findByIdInCompany(
    req.params['id'] as string,
    req.auth.companyId,
  );
  if (!warehouse) throw new NotFoundError('Warehouse not found');
  if (!warehouse.isActive) throw new ConflictError('Warehouse is already inactive');

  const updated = await warehouseRepository.setActiveInCompany(
    req.params['id'] as string,
    req.auth.companyId,
    false,
  );
  if (!updated) throw new NotFoundError('Warehouse not found');

  sendSuccess(res, toPublicWarehouse(updated), 'Warehouse deactivated');
});
