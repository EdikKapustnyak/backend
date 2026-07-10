import type { ClientSession, FilterQuery } from 'mongoose';
import { StockMovementModel, type StockMovementDocument } from './stock-movement.model.js';
import type {
  StockMovementDocumentShape,
  StockMovementReferenceType,
  StockMovementType,
} from './stock-movement.types.js';
import type { PaginationParams } from '../../utils/pagination.js';

interface CreateStockMovementInput {
  companyId: string;
  productId: string;
  warehouseId: string;
  type: StockMovementType;
  quantityDelta: number;
  quantityAfter: number;
  referenceType?: StockMovementReferenceType | null;
  referenceId?: string | null;
  notes?: string | null;
  createdBy: string;
}

interface ListStockMovementsFilter {
  companyId: string;
  productId?: string;
  warehouseId?: string;
  type?: StockMovementType;
}

export const stockMovementRepository = {
  /**
   * The only write path for this collection. Always called from within
   * another module's transaction (Purchases, Write-offs, Inventory adjust)
   * right after the corresponding Inventory change succeeds - never called
   * directly from an HTTP handler.
   */
  async create(
    input: CreateStockMovementInput,
    session?: ClientSession,
  ): Promise<StockMovementDocument> {
    const [doc] = await StockMovementModel.create(
      [
        {
          ...input,
          referenceType: input.referenceType ?? null,
          referenceId: input.referenceId ?? null,
          notes: input.notes ?? null,
        },
      ],
      { session },
    );
    return doc as StockMovementDocument;
  },

  /** Tenant-scoped lookup - always requires companyId to prevent cross-tenant access. */
  async findByIdInCompany(id: string, companyId: string): Promise<StockMovementDocument | null> {
    return StockMovementModel.findOne({ _id: id, companyId }).exec();
  },

  async findManyInCompany(
    filter: ListStockMovementsFilter,
    pagination: PaginationParams,
  ): Promise<{ items: StockMovementDocument[]; totalItems: number }> {
    const query: FilterQuery<StockMovementDocumentShape> = { companyId: filter.companyId };

    if (filter.productId) query.productId = filter.productId;
    if (filter.warehouseId) query.warehouseId = filter.warehouseId;
    if (filter.type) query.type = filter.type;

    const skip = (pagination.page - 1) * pagination.perPage;

    const [items, totalItems] = await Promise.all([
      StockMovementModel.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pagination.perPage)
        .exec(),
      StockMovementModel.countDocuments(query).exec(),
    ]);

    return { items, totalItems };
  },
};
