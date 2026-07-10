import type { Request, Response } from 'express';
import { ctrlWrapper } from '../../utils/ctrlWrapper.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { parsePaginationParams, calculatePaginationData } from '../../utils/pagination.js';
import { supplierRepository } from './supplier.repository.js';
import { toPublicSupplier } from './supplier.service.js';
import { UnauthorizedError, NotFoundError, ConflictError } from '../../errors/index.js';

export const createSupplier = ctrlWrapper(async (req: Request, res: Response) => {
  if (!req.auth) throw new UnauthorizedError();

  const supplier = await supplierRepository.create({
    // Tenant identity always comes from the verified JWT, never the body.
    companyId: req.auth.companyId,
    name: req.body.name,
    contactPerson: req.body.contactPerson ?? null,
    phone: req.body.phone ?? null,
    email: req.body.email ?? null,
    address: req.body.address ?? null,
    notes: req.body.notes ?? null,
  });

  sendSuccess(res, toPublicSupplier(supplier), 'Supplier created successfully', 201);
});

export const listSuppliers = ctrlWrapper(async (req: Request, res: Response) => {
  if (!req.auth) throw new UnauthorizedError();

  const pagination = parsePaginationParams(req.query as Record<string, unknown>);
  const search = typeof req.query['search'] === 'string' ? req.query['search'] : undefined;
  const isActiveParam = req.query['isActive'];
  const isActive =
    isActiveParam === 'true' ? true : isActiveParam === 'false' ? false : undefined;

  const { items, totalItems } = await supplierRepository.findManyInCompany(
    { companyId: req.auth.companyId, search, isActive },
    pagination,
  );

  sendSuccess(res, {
    items: items.map(toPublicSupplier),
    pagination: calculatePaginationData(totalItems, pagination.page, pagination.perPage),
  });
});

export const getSupplier = ctrlWrapper(async (req: Request, res: Response) => {
  if (!req.auth) throw new UnauthorizedError();

  const supplier = await supplierRepository.findByIdInCompany(
    req.params['id'] as string,
    req.auth.companyId,
  );
  if (!supplier) throw new NotFoundError('Supplier not found');

  sendSuccess(res, toPublicSupplier(supplier));
});

export const updateSupplier = ctrlWrapper(async (req: Request, res: Response) => {
  if (!req.auth) throw new UnauthorizedError();

  const supplier = await supplierRepository.updateInCompany(
    req.params['id'] as string,
    req.auth.companyId,
    req.body,
  );
  if (!supplier) throw new NotFoundError('Supplier not found');

  sendSuccess(res, toPublicSupplier(supplier), 'Supplier updated successfully');
});

/**
 * Soft delete: suppliers are referenced by future Purchase records, so we
 * deactivate rather than physically remove them to preserve referential
 * and audit history.
 */
export const deactivateSupplier = ctrlWrapper(async (req: Request, res: Response) => {
  if (!req.auth) throw new UnauthorizedError();

  const supplier = await supplierRepository.findByIdInCompany(
    req.params['id'] as string,
    req.auth.companyId,
  );
  if (!supplier) throw new NotFoundError('Supplier not found');
  if (!supplier.isActive) throw new ConflictError('Supplier is already inactive');

  const updated = await supplierRepository.setActiveInCompany(
    req.params['id'] as string,
    req.auth.companyId,
    false,
  );
  if (!updated) throw new NotFoundError('Supplier not found');

  sendSuccess(res, toPublicSupplier(updated), 'Supplier deactivated');
});
