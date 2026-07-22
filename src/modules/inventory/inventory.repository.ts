import type { ClientSession, FilterQuery } from 'mongoose';
import { Types } from 'mongoose';
import { InventoryModel, type InventoryDocument } from './inventory.model.js';
import type { PaginationParams } from '../../utils/pagination.js';
import type { InventoryDocumentShape } from './inventory.types.js';

export interface StockValueSummary {
  totalValue: number;
  totalQuantity: number;
}

interface CreateInventoryInput {
  companyId: string;
  productId: string;
  warehouseId: string;
  quantity?: number;
}

interface ListInventoryFilter {
  companyId: string;
  productId?: string;
  warehouseId?: string;
}

export const inventoryRepository = {
  async create(input: CreateInventoryInput, session?: ClientSession): Promise<InventoryDocument> {
    const [doc] = await InventoryModel.create(
      [
        {
          companyId: input.companyId,
          productId: input.productId,
          warehouseId: input.warehouseId,
          quantity: input.quantity ?? 0,
          reserved: 0,
        },
      ],
      { session },
    );
    return doc as InventoryDocument;
  },

  /** Tenant-scoped lookup - always requires companyId to prevent cross-tenant access. */
  async findByIdInCompany(id: string, companyId: string): Promise<InventoryDocument | null> {
    return InventoryModel.findOne({ _id: id, companyId }).exec();
  },

  async findByProductAndWarehouse(
    companyId: string,
    productId: string,
    warehouseId: string,
  ): Promise<InventoryDocument | null> {
    return InventoryModel.findOne({ companyId, productId, warehouseId }).exec();
  },

  /**
   * Returns every stock record for a warehouse, unpaginated. Used internally
   * (e.g. to auto-populate an Inventarization draft) - never exposed directly
   * via an unbounded HTTP endpoint.
   */
  async findAllByWarehouseInCompany(
    companyId: string,
    warehouseId: string,
  ): Promise<InventoryDocument[]> {
    return InventoryModel.find({ companyId, warehouseId }).exec();
  },

  async findManyInCompany(
    filter: ListInventoryFilter,
    pagination: PaginationParams,
  ): Promise<{ items: InventoryDocument[]; totalItems: number }> {
    const query: FilterQuery<InventoryDocumentShape> = { companyId: filter.companyId };

    if (filter.productId) query.productId = filter.productId;
    if (filter.warehouseId) query.warehouseId = filter.warehouseId;

    const skip = (pagination.page - 1) * pagination.perPage;

    const [items, totalItems] = await Promise.all([
      InventoryModel.find(query)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(pagination.perPage)
        .exec(),
      InventoryModel.countDocuments(query).exec(),
    ]);

    return { items, totalItems };
  },

  /**
   * Atomically increases (or decreases) quantity, creating the record if it
   * doesn't exist yet. Used by Purchases on completion (positive delta) and
   * will be reused by Write-offs (negative delta) and Inventarization.
   * Unlike adjustStock, this never rejects on negative results below zero
   * for the *upsert* path (a brand-new record can't go negative since it
   * starts at 0 + delta); callers passing a negative delta against an
   * existing record are responsible for using adjustStock instead if the
   * zero-floor invariant must be enforced.
   */
  async incrementOrCreate(
    companyId: string,
    productId: string,
    warehouseId: string,
    quantityDelta: number,
    session?: ClientSession,
  ): Promise<InventoryDocument> {
    const updated = await InventoryModel.findOneAndUpdate(
      { companyId, productId, warehouseId },
      { $inc: { quantity: quantityDelta }, $setOnInsert: { reserved: 0 } },
      { new: true, upsert: true, session },
    ).exec();
    // upsert:true + new:true guarantees a non-null document.
    return updated as InventoryDocument;
  },

  /**
   * Atomically applies quantity/reserved deltas. The update only commits if,
   * post-adjustment: quantity >= 0, reserved >= 0, and reserved <= quantity.
   * Returns null if the record doesn't exist OR the adjustment would violate
   * one of those invariants (caller distinguishes the two by checking
   * existence separately beforehand).
   */
  async adjustStock(
    id: string,
    companyId: string,
    quantityDelta: number,
    reservedDelta: number,
    session?: ClientSession,
  ): Promise<InventoryDocument | null> {
    return InventoryModel.findOneAndUpdate(
      {
        _id: id,
        companyId,
        $expr: {
          $and: [
            { $gte: [{ $add: ['$quantity', quantityDelta] }, 0] },
            { $gte: [{ $add: ['$reserved', reservedDelta] }, 0] },
            {
              $gte: [
                { $add: ['$quantity', quantityDelta] },
                { $add: ['$reserved', reservedDelta] },
              ],
            },
          ],
        },
      },
      { $inc: { quantity: quantityDelta, reserved: reservedDelta } },
      { new: true, session },
    ).exec();
  },

  /**
   * Total value of everything currently on hand, valued at each product's
   * purchase (cost) price - not sale price, since this represents capital
   * tied up in stock, not potential revenue. Includes reserved units (still
   * owned, just earmarked) - only `quantity`, matching standard inventory
   * valuation practice.
   *
   * The $lookup's own pipeline re-matches companyId (not just the outer
   * $match) so a cross-tenant product id could never join in, even in
   * theory - defense in depth on top of the outer scoping.
   */
  async getStockValueSummary(companyId: string): Promise<StockValueSummary> {
    const companyObjectId = new Types.ObjectId(companyId);
    const [result] = await InventoryModel.aggregate<StockValueSummary>([
      { $match: { companyId: companyObjectId } },
      {
        $lookup: {
          from: 'products',
          let: { productId: '$productId' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [{ $eq: ['$_id', '$$productId'] }, { $eq: ['$companyId', companyObjectId] }],
                },
              },
            },
            { $project: { purchasePrice: 1 } },
          ],
          as: 'product',
        },
      },
      { $unwind: '$product' },
      {
        $group: {
          _id: null,
          totalValue: { $sum: { $multiply: ['$quantity', '$product.purchasePrice'] } },
          totalQuantity: { $sum: '$quantity' },
        },
      },
      { $project: { _id: 0, totalValue: 1, totalQuantity: 1 } },
    ]).exec();

    return result ?? { totalValue: 0, totalQuantity: 0 };
  },
};
