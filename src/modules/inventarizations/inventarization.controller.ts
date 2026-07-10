import type { Request, Response } from 'express';
import { ctrlWrapper } from '../../utils/ctrlWrapper.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { parsePaginationParams, calculatePaginationData } from '../../utils/pagination.js';
import { inventarizationRepository } from './inventarization.repository.js';
import {
  createInventarization as createInventarizationService,
  recordCounts as recordCountsService,
  completeInventarization as completeInventarizationService,
  toPublicInventarization,
} from './inventarization.service.js';
import { InventarizationStatus } from './inventarization.types.js';
import { UnauthorizedError, NotFoundError, ConflictError } from '../../errors/index.js';

export const createInventarization = ctrlWrapper(async (req: Request, res: Response) => {
  if (!req.auth) throw new UnauthorizedError();

  const result = await createInventarizationService(
    {
      warehouseId: req.body.warehouseId,
      productIds: req.body.productIds,
      notes: req.body.notes ?? null,
    },
    req.auth.companyId,
    req.auth.userId,
  );

  sendSuccess(res, result, 'Inventarization created as draft', 201);
});

export const listInventarizations = ctrlWrapper(async (req: Request, res: Response) => {
  if (!req.auth) throw new UnauthorizedError();

  const pagination = parsePaginationParams(req.query as Record<string, unknown>);
  const warehouseId =
    typeof req.query['warehouseId'] === 'string' ? req.query['warehouseId'] : undefined;
  const status =
    typeof req.query['status'] === 'string'
      ? (req.query['status'] as InventarizationStatus)
      : undefined;

  const { items, totalItems } = await inventarizationRepository.findManyInCompany(
    { companyId: req.auth.companyId, warehouseId, status },
    pagination,
  );

  sendSuccess(res, {
    items: items.map(toPublicInventarization),
    pagination: calculatePaginationData(totalItems, pagination.page, pagination.perPage),
  });
});

export const getInventarization = ctrlWrapper(async (req: Request, res: Response) => {
  if (!req.auth) throw new UnauthorizedError();

  const doc = await inventarizationRepository.findByIdInCompany(
    req.params['id'] as string,
    req.auth.companyId,
  );
  if (!doc) throw new NotFoundError('Inventarization not found');

  sendSuccess(res, toPublicInventarization(doc));
});

export const recordCounts = ctrlWrapper(async (req: Request, res: Response) => {
  if (!req.auth) throw new UnauthorizedError();

  const result = await recordCountsService(
    req.params['id'] as string,
    req.auth.companyId,
    req.body.counts,
  );

  sendSuccess(res, result, 'Counts recorded');
});

export const completeInventarization = ctrlWrapper(async (req: Request, res: Response) => {
  if (!req.auth) throw new UnauthorizedError();

  const result = await completeInventarizationService(
    req.params['id'] as string,
    req.auth.companyId,
    req.auth.userId,
  );

  sendSuccess(res, result, 'Inventarization completed and stock adjusted');
});

export const cancelInventarization = ctrlWrapper(async (req: Request, res: Response) => {
  if (!req.auth) throw new UnauthorizedError();
  const id = req.params['id'] as string;

  const existing = await inventarizationRepository.findByIdInCompany(id, req.auth.companyId);
  if (!existing) throw new NotFoundError('Inventarization not found');
  if (existing.status !== InventarizationStatus.DRAFT) {
    throw new ConflictError(
      `Only draft inventarizations can be cancelled (current status: "${existing.status}")`,
    );
  }

  const cancelled = await inventarizationRepository.cancelInCompany(id, req.auth.companyId);
  if (!cancelled) throw new ConflictError('Inventarization is no longer in draft status');

  sendSuccess(res, toPublicInventarization(cancelled), 'Inventarization cancelled');
});
