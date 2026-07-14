import type { ClientSession, FilterQuery } from 'mongoose';
import {
  InventarizationModel,
  type InventarizationDocument,
} from './inventarization.model.js';
import {
  InventarizationStatus,
  type InventarizationDocumentShape,
} from './inventarization.types.js';
import type { PaginationParams } from '../../utils/pagination.js';

interface CreateInventarizationInput {
  companyId: string;
  warehouseId: string;
  items: Array<{ productId: string; systemQuantity: number }>;
  notes?: string | null;
  createdBy: string;
}

interface CountEntry {
  productId: string;
  countedQuantity: number;
  discrepancy: number;
}

interface ListInventarizationsFilter {
  companyId: string;
  warehouseId?: string;
  status?: InventarizationStatus;
}

interface InventarizationReportFilter {
  companyId: string;
  from?: Date;
  to?: Date;
  warehouseId?: string;
  status?: InventarizationStatus;
}

const REPORT_MAX_RECORDS = 2000;

export const inventarizationRepository = {
  /**
   * Unpaginated (but capped) fetch for PDF report generation - not exposed
   * directly via a paginated HTTP list endpoint. Same shape as
   * purchaseRepository.findManyForReport / writeOffRepository.findManyForReport.
   */
  async findManyForReport(filter: InventarizationReportFilter): Promise<InventarizationDocument[]> {
    const query: FilterQuery<InventarizationDocumentShape> = { companyId: filter.companyId };

    if (filter.warehouseId) query.warehouseId = filter.warehouseId;
    if (filter.status) query.status = filter.status;
    if (filter.from || filter.to) {
      query.createdAt = {};
      if (filter.from) query.createdAt.$gte = filter.from;
      if (filter.to) query.createdAt.$lte = filter.to;
    }

    return InventarizationModel.find(query).sort({ createdAt: 1 }).limit(REPORT_MAX_RECORDS).exec();
  },

  async create(input: CreateInventarizationInput): Promise<InventarizationDocument> {
    return InventarizationModel.create({
      companyId: input.companyId,
      warehouseId: input.warehouseId,
      items: input.items.map((item) => ({
        productId: item.productId,
        systemQuantity: item.systemQuantity,
        countedQuantity: null,
        discrepancy: null,
      })),
      notes: input.notes ?? null,
      createdBy: input.createdBy,
      status: InventarizationStatus.DRAFT,
    });
  },

  /** Tenant-scoped lookup - always requires companyId to prevent cross-tenant access. */
  async findByIdInCompany(id: string, companyId: string): Promise<InventarizationDocument | null> {
    return InventarizationModel.findOne({ _id: id, companyId }).exec();
  },

  async findManyInCompany(
    filter: ListInventarizationsFilter,
    pagination: PaginationParams,
  ): Promise<{ items: InventarizationDocument[]; totalItems: number }> {
    const query: FilterQuery<InventarizationDocumentShape> = { companyId: filter.companyId };

    if (filter.warehouseId) query.warehouseId = filter.warehouseId;
    if (filter.status) query.status = filter.status;

    const skip = (pagination.page - 1) * pagination.perPage;

    const [items, totalItems] = await Promise.all([
      InventarizationModel.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pagination.perPage)
        .exec(),
      InventarizationModel.countDocuments(query).exec(),
    ]);

    return { items, totalItems };
  },

  /**
   * Atomically records one or more counted quantities (and their computed
   * discrepancy) against the matching items in a single draft document,
   * using arrayFilters so multiple entries update in one round trip.
   * Returns null if the document isn't a draft (or doesn't exist).
   */
  async recordCounts(
    id: string,
    companyId: string,
    counts: CountEntry[],
  ): Promise<InventarizationDocument | null> {
    const setOps: Record<string, unknown> = {};
    const arrayFilters: Record<string, unknown>[] = [];

    counts.forEach((count, index) => {
      const filterName = `elem${index}`;
      setOps[`items.$[${filterName}].countedQuantity`] = count.countedQuantity;
      setOps[`items.$[${filterName}].discrepancy`] = count.discrepancy;
      arrayFilters.push({ [`${filterName}.productId`]: count.productId });
    });

    return InventarizationModel.findOneAndUpdate(
      { _id: id, companyId, status: InventarizationStatus.DRAFT },
      { $set: setOps },
      { new: true, arrayFilters },
    ).exec();
  },

  /** Atomic draft -> completed transition; returns null if not currently a draft. */
  async completeInCompany(
    id: string,
    companyId: string,
    completedBy: string,
    session?: ClientSession,
  ): Promise<InventarizationDocument | null> {
    return InventarizationModel.findOneAndUpdate(
      { _id: id, companyId, status: InventarizationStatus.DRAFT },
      { $set: { status: InventarizationStatus.COMPLETED, completedBy, completedAt: new Date() } },
      { new: true, session },
    ).exec();
  },

  /** Atomic draft -> cancelled transition; returns null if not currently a draft. */
  async cancelInCompany(id: string, companyId: string): Promise<InventarizationDocument | null> {
    return InventarizationModel.findOneAndUpdate(
      { _id: id, companyId, status: InventarizationStatus.DRAFT },
      { $set: { status: InventarizationStatus.CANCELLED } },
      { new: true },
    ).exec();
  },
};
