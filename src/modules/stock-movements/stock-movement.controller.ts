import type { Request, Response } from 'express';
import { ctrlWrapper } from '../../utils/ctrlWrapper.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { parsePaginationParams, calculatePaginationData } from '../../utils/pagination.js';
import { stockMovementRepository } from './stock-movement.repository.js';
import { toPublicStockMovement } from './stock-movement.service.js';
import type { StockMovementType } from './stock-movement.types.js';
import { UnauthorizedError, NotFoundError } from '../../errors/index.js';

export const listStockMovements = ctrlWrapper(async (req: Request, res: Response) => {
  if (!req.auth) throw new UnauthorizedError();

  const pagination = parsePaginationParams(req.query as Record<string, unknown>);
  const productId =
    typeof req.query['productId'] === 'string' ? req.query['productId'] : undefined;
  const warehouseId =
    typeof req.query['warehouseId'] === 'string' ? req.query['warehouseId'] : undefined;
  const type =
    typeof req.query['type'] === 'string' ? (req.query['type'] as StockMovementType) : undefined;

  const { items, totalItems } = await stockMovementRepository.findManyInCompany(
    { companyId: req.auth.companyId, productId, warehouseId, type },
    pagination,
  );

  sendSuccess(res, {
    items: items.map(toPublicStockMovement),
    pagination: calculatePaginationData(totalItems, pagination.page, pagination.perPage),
  });
});

export const getStockMovement = ctrlWrapper(async (req: Request, res: Response) => {
  if (!req.auth) throw new UnauthorizedError();

  const movement = await stockMovementRepository.findByIdInCompany(
    req.params['id'] as string,
    req.auth.companyId,
  );
  if (!movement) throw new NotFoundError('Stock movement not found');

  sendSuccess(res, toPublicStockMovement(movement));
});
