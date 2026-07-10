import type { ClientSession, FilterQuery } from 'mongoose';
import { WriteOffModel, type WriteOffDocument } from './write-off.model.js';
import { WriteOffStatus, type WriteOffDocumentShape, type WriteOffReason } from './write-off.types.js';
import type { PaginationParams } from '../../utils/pagination.js';

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

export const writeOffRepository = {
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
