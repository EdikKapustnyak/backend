import { Types, type ClientSession, type FilterQuery } from 'mongoose';
import { PurchaseModel, type PurchaseDocument } from './purchase.model.js';
import { PurchaseStatus, type PurchaseDocumentShape, type PurchaseItemShape } from './purchase.types.js';
import type { PaginationParams } from '../../utils/pagination.js';

interface PurchaseItemInput {
  productId: string;
  quantity: number;
  unitPrice: number;
}

interface CreatePurchaseInput {
  companyId: string;
  supplierId: string;
  warehouseId: string;
  items: PurchaseItemInput[];
  notes?: string | null;
  createdBy: string;
}

interface UpdatePurchaseInput {
  supplierId?: string;
  warehouseId?: string;
  items?: PurchaseItemInput[];
  notes?: string | null;
}

interface ListPurchasesFilter {
  companyId: string;
  supplierId?: string;
  warehouseId?: string;
  status?: PurchaseStatus;
}

interface PurchaseReportFilter {
  companyId: string;
  from?: Date;
  to?: Date;
  supplierId?: string;
  warehouseId?: string;
  status?: PurchaseStatus;
}

const REPORT_MAX_RECORDS = 2000;

function computeTotalAmount(items: PurchaseItemInput[] | PurchaseItemShape[]): number {
  return items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
}

export const purchaseRepository = {
  /**
   * Unpaginated (but capped) fetch for PDF report generation - not exposed
   * directly via a paginated HTTP list endpoint.
   */
  async findManyForReport(filter: PurchaseReportFilter): Promise<PurchaseDocument[]> {
    const query: FilterQuery<PurchaseDocumentShape> = { companyId: filter.companyId };

    if (filter.supplierId) query.supplierId = filter.supplierId;
    if (filter.warehouseId) query.warehouseId = filter.warehouseId;
    if (filter.status) query.status = filter.status;
    if (filter.from || filter.to) {
      query.createdAt = {};
      if (filter.from) query.createdAt.$gte = filter.from;
      if (filter.to) query.createdAt.$lte = filter.to;
    }

    return PurchaseModel.find(query).sort({ createdAt: 1 }).limit(REPORT_MAX_RECORDS).exec();
  },

  /** Sum of totalAmount for completed purchases in a period - used to compute a waste ratio. */
  async getTotalCompletedAmount(companyId: string, from: Date, to: Date): Promise<number> {
    const result = await PurchaseModel.aggregate<{ total: number }>([
      {
        $match: {
          companyId: new Types.ObjectId(companyId),
          status: PurchaseStatus.COMPLETED,
          createdAt: { $gte: from, $lte: to },
        },
      },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } },
    ]).exec();
    return result[0]?.total ?? 0;
  },

  async create(input: CreatePurchaseInput): Promise<PurchaseDocument> {
    return PurchaseModel.create({
      companyId: input.companyId,
      supplierId: input.supplierId,
      warehouseId: input.warehouseId,
      items: input.items,
      totalAmount: computeTotalAmount(input.items),
      notes: input.notes ?? null,
      createdBy: input.createdBy,
      status: PurchaseStatus.DRAFT,
    });
  },

  /** Tenant-scoped lookup - always requires companyId to prevent cross-tenant access. */
  async findByIdInCompany(id: string, companyId: string): Promise<PurchaseDocument | null> {
    return PurchaseModel.findOne({ _id: id, companyId }).exec();
  },

  async findManyInCompany(
    filter: ListPurchasesFilter,
    pagination: PaginationParams,
  ): Promise<{ items: PurchaseDocument[]; totalItems: number }> {
    const query: FilterQuery<PurchaseDocumentShape> = { companyId: filter.companyId };

    if (filter.supplierId) query.supplierId = filter.supplierId;
    if (filter.warehouseId) query.warehouseId = filter.warehouseId;
    if (filter.status) query.status = filter.status;

    const skip = (pagination.page - 1) * pagination.perPage;

    const [items, totalItems] = await Promise.all([
      PurchaseModel.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pagination.perPage)
        .exec(),
      PurchaseModel.countDocuments(query).exec(),
    ]);

    return { items, totalItems };
  },

  /** Only succeeds while the purchase is still a draft (guarded in the query itself). */
  async updateInCompany(
    id: string,
    companyId: string,
    input: UpdatePurchaseInput,
  ): Promise<PurchaseDocument | null> {
    const update: Record<string, unknown> = { ...input };
    if (input.items) {
      update['totalAmount'] = computeTotalAmount(input.items);
    }

    return PurchaseModel.findOneAndUpdate(
      { _id: id, companyId, status: PurchaseStatus.DRAFT },
      { $set: update },
      { new: true, runValidators: true },
    ).exec();
  },

  /** Atomic draft -> completed transition; returns null if not currently a draft. */
  async completeInCompany(
    id: string,
    companyId: string,
    session?: ClientSession,
  ): Promise<PurchaseDocument | null> {
    return PurchaseModel.findOneAndUpdate(
      { _id: id, companyId, status: PurchaseStatus.DRAFT },
      { $set: { status: PurchaseStatus.COMPLETED, completedAt: new Date() } },
      { new: true, session },
    ).exec();
  },

  /** Atomic draft -> cancelled transition; returns null if not currently a draft. */
  async cancelInCompany(id: string, companyId: string): Promise<PurchaseDocument | null> {
    return PurchaseModel.findOneAndUpdate(
      { _id: id, companyId, status: PurchaseStatus.DRAFT },
      { $set: { status: PurchaseStatus.CANCELLED } },
      { new: true },
    ).exec();
  },
};
