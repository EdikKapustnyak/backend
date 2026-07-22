import { Types, type FilterQuery } from 'mongoose';
import { ReceiptModel, type ReceiptDocument } from './receipt.model.js';
import { ReceiptType, type ReceiptDocumentShape } from './receipt.types.js';
import type { PaginationParams } from '../../utils/pagination.js';

export interface RevenueByDay {
  /** Calendar day in YYYY-MM-DD form (UTC), one entry per day that has at least one revenue receipt. */
  date: string;
  amount: number;
}

interface CreateReceiptInput {
  companyId: string;
  type: ReceiptType;
  category?: string | null;
  amount?: number | null;
  date: Date;
  notes?: string | null;
  fileKey: string;
  mimeType: string;
  fileSize: number;
  uploadedBy: string;
}

interface UpdateReceiptInput {
  category?: string | null;
  amount?: number | null;
  date?: Date;
  notes?: string | null;
}

interface ListReceiptsFilter {
  companyId: string;
  type?: ReceiptType;
  category?: string;
  from?: Date;
  to?: Date;
  isActive?: boolean;
}

export const receiptRepository = {
  async create(input: CreateReceiptInput): Promise<ReceiptDocument> {
    return ReceiptModel.create(input);
  },

  /** Tenant-scoped lookup - always requires companyId to prevent cross-tenant access. */
  async findByIdInCompany(id: string, companyId: string): Promise<ReceiptDocument | null> {
    return ReceiptModel.findOne({ _id: id, companyId }).exec();
  },

  async findManyInCompany(
    filter: ListReceiptsFilter,
    pagination: PaginationParams,
  ): Promise<{ items: ReceiptDocument[]; totalItems: number }> {
    const query: FilterQuery<ReceiptDocumentShape> = { companyId: filter.companyId };

    if (typeof filter.isActive === 'boolean') {
      query.isActive = filter.isActive;
    }
    if (filter.type) query.type = filter.type;
    if (filter.category) query.category = filter.category;
    if (filter.from || filter.to) {
      query.date = {};
      if (filter.from) query.date.$gte = filter.from;
      if (filter.to) query.date.$lte = filter.to;
    }

    const skip = (pagination.page - 1) * pagination.perPage;

    const [items, totalItems] = await Promise.all([
      ReceiptModel.find(query)
        .sort({ date: -1 })
        .skip(skip)
        .limit(pagination.perPage)
        .exec(),
      ReceiptModel.countDocuments(query).exec(),
    ]);

    return { items, totalItems };
  },

  async updateInCompany(
    id: string,
    companyId: string,
    input: UpdateReceiptInput,
  ): Promise<ReceiptDocument | null> {
    return ReceiptModel.findOneAndUpdate(
      { _id: id, companyId },
      { $set: input },
      { new: true, runValidators: true },
    ).exec();
  },

  async setActiveInCompany(
    id: string,
    companyId: string,
    isActive: boolean,
  ): Promise<ReceiptDocument | null> {
    return ReceiptModel.findOneAndUpdate(
      { _id: id, companyId },
      { $set: { isActive } },
      { new: true },
    ).exec();
  },

  /**
   * Manually-entered daily revenue (Receipt.type = 'daily_revenue'), grouped
   * by calendar day. Soft-deleted receipts and entries with no amount are
   * excluded. Mirrors writeOffRepository's getWasteByProduct/getWasteByReason
   * aggregation pattern.
   */
  async getRevenueByDay(companyId: string, from: Date, to: Date): Promise<RevenueByDay[]> {
    return ReceiptModel.aggregate<RevenueByDay>([
      {
        $match: {
          companyId: new Types.ObjectId(companyId),
          type: ReceiptType.DAILY_REVENUE,
          isActive: true,
          amount: { $ne: null },
          date: { $gte: from, $lte: to },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
          amount: { $sum: '$amount' },
        },
      },
      { $sort: { _id: 1 } },
      { $project: { _id: 0, date: '$_id', amount: 1 } },
    ]).exec();
  },
};
