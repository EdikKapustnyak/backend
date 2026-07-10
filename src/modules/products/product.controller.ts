import type { Request, Response } from 'express';
import { ctrlWrapper } from '../../utils/ctrlWrapper.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { parsePaginationParams, calculatePaginationData } from '../../utils/pagination.js';
import { productRepository } from './product.repository.js';
import { toPublicProduct } from './product.service.js';
import { UnauthorizedError, NotFoundError, ConflictError } from '../../errors/index.js';

export const createProduct = ctrlWrapper(async (req: Request, res: Response) => {
  if (!req.auth) throw new UnauthorizedError();

  const product = await productRepository.create({
    // Tenant identity always comes from the verified JWT, never the body.
    companyId: req.auth.companyId,
    name: req.body.name,
    sku: req.body.sku,
    category: req.body.category ?? null,
    description: req.body.description ?? null,
    purchasePrice: req.body.purchasePrice,
    salePrice: req.body.salePrice,
    unit: req.body.unit,
    minStockLevel: req.body.minStockLevel,
    barcode: req.body.barcode ?? null,
    photos: req.body.photos ?? [],
  });

  sendSuccess(res, toPublicProduct(product), 'Product created successfully', 201);
});

export const listProducts = ctrlWrapper(async (req: Request, res: Response) => {
  if (!req.auth) throw new UnauthorizedError();

  const pagination = parsePaginationParams(req.query as Record<string, unknown>);
  const search = typeof req.query['search'] === 'string' ? req.query['search'] : undefined;
  const category =
    typeof req.query['category'] === 'string' ? req.query['category'] : undefined;
  const isActiveParam = req.query['isActive'];
  const isActive =
    isActiveParam === 'true' ? true : isActiveParam === 'false' ? false : undefined;

  const { items, totalItems } = await productRepository.findManyInCompany(
    { companyId: req.auth.companyId, search, category, isActive },
    pagination,
  );

  sendSuccess(res, {
    items: items.map(toPublicProduct),
    pagination: calculatePaginationData(totalItems, pagination.page, pagination.perPage),
  });
});

export const getProduct = ctrlWrapper(async (req: Request, res: Response) => {
  if (!req.auth) throw new UnauthorizedError();

  const product = await productRepository.findByIdInCompany(
    req.params['id'] as string,
    req.auth.companyId,
  );
  if (!product) throw new NotFoundError('Product not found');

  sendSuccess(res, toPublicProduct(product));
});

export const updateProduct = ctrlWrapper(async (req: Request, res: Response) => {
  if (!req.auth) throw new UnauthorizedError();

  const product = await productRepository.updateInCompany(
    req.params['id'] as string,
    req.auth.companyId,
    req.body,
  );
  if (!product) throw new NotFoundError('Product not found');

  sendSuccess(res, toPublicProduct(product), 'Product updated successfully');
});

/**
 * Soft delete: products are referenced by future Inventory/Stock Movement/
 * Purchase/Write-off records, so we deactivate rather than physically
 * remove them to preserve referential and audit history.
 */
export const deactivateProduct = ctrlWrapper(async (req: Request, res: Response) => {
  if (!req.auth) throw new UnauthorizedError();

  const product = await productRepository.findByIdInCompany(
    req.params['id'] as string,
    req.auth.companyId,
  );
  if (!product) throw new NotFoundError('Product not found');
  if (!product.isActive) throw new ConflictError('Product is already inactive');

  const updated = await productRepository.setActiveInCompany(
    req.params['id'] as string,
    req.auth.companyId,
    false,
  );
  if (!updated) throw new NotFoundError('Product not found');

  sendSuccess(res, toPublicProduct(updated), 'Product deactivated');
});
