import { Types, type ClientSession, type FilterQuery } from 'mongoose';
import { WriteOffModel, type WriteOffDocument } from './write-off.model.js';
import { WriteOffStatus, type WriteOffDocumentShape, type WriteOffReason } from './write-off.types.js';
import type { PaginationParams } from '../../utils/pagination.js';

export interface WasteByProduct {
  productId: string;
  productName: string;
  quantity: number;
  estimatedCost: number;
}

export interface WasteByReason {
  reason: WriteOffReason;
  quantity: number;
  count: number;
}

interface CreateWriteOffInput {
  companyId: string;
  productId: string;
  warehouseId: string;
  quantity: number;
  reason: WriteOffReason;
  notes?: string | null;
  createdBy: string;
}

interface ListWriteOffsFilter {
  companyId: string;
  productId?: string;
  warehouseId?: string;
  reason?: WriteOffReason;
  status?: WriteOffStatus;
}

interface WriteOffReportFilter {
  companyId: string;
  from?: Date;
  to?: Date;
  productId?: string;
  warehouseId?: string;
  reason?: WriteOffReason;
  status?: WriteOffStatus;
}

const REPORT_MAX_RECORDS = 2000;

export const writeOffRepository = {
  /**
   * Unpaginated (but capped) fetch for PDF report generation - not exposed
   * directly via a paginated HTTP list endpoint.
   */
  async findManyForReport(filter: WriteOffReportFilter): Promise<WriteOffDocument[]> {
    const query: FilterQuery<WriteOffDocumentShape> = { companyId: filter.companyId };

    if (filter.productId) query.productId = filter.productId;
    if (filter.warehouseId) query.warehouseId = filter.warehouseId;
    if (filter.reason) query.reason = filter.reason;
    if (filter.status) query.status = filter.status;
    if (filter.from || filter.to) {
      query.createdAt = {};
      if (filter.from) query.createdAt.$gte = filter.from;
      if (filter.to) query.createdAt.$lte = filter.to;
    }

    return WriteOffModel.find(query).sort({ createdAt: 1 }).limit(REPORT_MAX_RECORDS).exec();
  },

  /** Confirmed write-offs grouped by product, joined with Product for an estimated cost. */
  async getWasteByProduct(
    companyId: string,
    from: Date,
    to: Date,
    limit = 10,
  ): Promise<WasteByProduct[]> {
    return WriteOffModel.aggregate<WasteByProduct>([
      {
        $match: {
          companyId: new Types.ObjectId(companyId),
          status: WriteOffStatus.CONFIRMED,
          createdAt: { $gte: from, $lte: to },
        },
      },
      {
        $lookup: {
          from: 'products',
          localField: 'productId',
          foreignField: '_id',
          as: 'product',
        },
      },
      { $unwind: '$product' },
      {
        $group: {
          _id: '$productId',
          productName: { $first: '$product.name' },
          quantity: { $sum: '$quantity' },
          estimatedCost: { $sum: { $multiply: ['$quantity', '$product.purchasePrice'] } },
        },
      },
      { $sort: { estimatedCost: -1 } },
      { $limit: limit },
      { $project: { _id: 0, productId: { $toString: '$_id' }, productName: 1, quantity: 1, estimatedCost: 1 } },
    ]).exec();
  },

  /** Confirmed write-offs grouped by reason. */
  async getWasteByReason(companyId: string, from: Date, to: Date): Promise<WasteByReason[]> {
    return WriteOffModel.aggregate<WasteByReason>([
      {
        $match: {
          companyId: new Types.ObjectId(companyId),
          status: WriteOffStatus.CONFIRMED,
          createdAt: { $gte: from, $lte: to },
        },
      },
      { $group: { _id: '$reason', quantity: { $sum: '$quantity' }, count: { $sum: 1 } } },
      { $sort: { quantity: -1 } },
      { $project: { _id: 0, reason: '$_id', quantity: 1, count: 1 } },
    ]).exec();
  },

  /** Always creates as a draft - confirming is a separate, guarded step. */
  async create(input: CreateWriteOffInput): Promise<WriteOffDocument> {
    return WriteOffModel.create({ ...input, status: WriteOffStatus.DRAFT });
  },

  /** Tenant-scoped lookup - always requires companyId to prevent cross-tenant access. */
  async findByIdInCompany(id: string, companyId: string): Promise<WriteOffDocument | null> {
    return WriteOffModel.findOne({ _id: id, companyId }).exec();
  },

  async findManyInCompany(
    filter: ListWriteOffsFilter,
    pagination: PaginationParams,
  ): Promise<{ items: WriteOffDocument[]; totalItems: number }> {
    const query: FilterQuery<WriteOffDocumentShape> = { companyId: filter.companyId };

    if (filter.productId) query.productId = filter.productId;
    if (filter.warehouseId) query.warehouseId = filter.warehouseId;
    if (filter.reason) query.reason = filter.reason;
    if (filter.status) query.status = filter.status;

    const skip = (pagination.page - 1) * pagination.perPage;

    const [items, totalItems] = await Promise.all([
      WriteOffModel.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pagination.perPage)
        .exec(),
      WriteOffModel.countDocuments(query).exec(),
    ]);

    return { items, totalItems };
  },

  /**
   * Atomic draft -> confirmed transition; returns null if not currently a
   * draft. Accepts a session so it can join the same transaction as the
   * stock decrement it's paired with.
   */
  async confirmInCompany(
    id: string,
    companyId: string,
    confirmedBy: string,
    session?: ClientSession,
  ): Promise<WriteOffDocument | null> {
    return WriteOffModel.findOneAndUpdate(
      { _id: id, companyId, status: WriteOffStatus.DRAFT },
      { $set: { status: WriteOffStatus.CONFIRMED, confirmedBy, confirmedAt: new Date() } },
      { new: true, session },
    ).exec();
  },

  /** Atomic draft -> cancelled transition; returns null if not currently a draft. */
  async cancelInCompany(id: string, companyId: string): Promise<WriteOffDocument | null> {
    return WriteOffModel.findOneAndUpdate(
      { _id: id, companyId, status: WriteOffStatus.DRAFT },
      { $set: { status: WriteOffStatus.CANCELLED } },
      { new: true },
    ).exec();
  },
};
