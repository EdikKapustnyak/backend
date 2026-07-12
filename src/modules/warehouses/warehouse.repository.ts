import type { FilterQuery } from 'mongoose';
import { WarehouseModel, type WarehouseDocument } from './warehouse.model.js';
import { escapeRegex } from '../../utils/escapeRegex.js';
import type { PaginationParams } from '../../utils/pagination.js';
import type { WarehouseDocumentShape } from './warehouse.types.js';

interface CreateWarehouseInput {
  companyId: string;
  name: string;
  location?: string | null;
}

interface UpdateWarehouseInput {
  name?: string;
  location?: string | null;
}

interface ListWarehousesFilter {
  companyId: string;
  search?: string;
  isActive?: boolean;
}

export const warehouseRepository = {
  /**
   * Every warehouse in a company, unpaginated. Used internally (e.g. to
   * resolve names for a PDF report) - never exposed via an unbounded HTTP
   * endpoint. Capped defensively.
   */
  async findAllInCompany(companyId: string): Promise<WarehouseDocument[]> {
    return WarehouseModel.find({ companyId }).limit(5000).exec();
  },
  async create(input: CreateWarehouseInput): Promise<WarehouseDocument> {
    return WarehouseModel.create(input);
  },

  /** Tenant-scoped lookup - always requires companyId to prevent cross-tenant access. */
  async findByIdInCompany(id: string, companyId: string): Promise<WarehouseDocument | null> {
    return WarehouseModel.findOne({ _id: id, companyId }).exec();
  },

  async findManyInCompany(
    filter: ListWarehousesFilter,
    pagination: PaginationParams,
  ): Promise<{ items: WarehouseDocument[]; totalItems: number }> {
    const query: FilterQuery<WarehouseDocumentShape> = { companyId: filter.companyId };

    if (typeof filter.isActive === 'boolean') {
      query.isActive = filter.isActive;
    }
    if (filter.search) {
      query.name = { $regex: escapeRegex(filter.search), $options: 'i' };
    }

    const skip = (pagination.page - 1) * pagination.perPage;

    const [items, totalItems] = await Promise.all([
      WarehouseModel.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pagination.perPage)
        .exec(),
      WarehouseModel.countDocuments(query).exec(),
    ]);

    return { items, totalItems };
  },

  async updateInCompany(
    id: string,
    companyId: string,
    input: UpdateWarehouseInput,
  ): Promise<WarehouseDocument | null> {
    return WarehouseModel.findOneAndUpdate(
      { _id: id, companyId },
      { $set: input },
      { new: true, runValidators: true },
    ).exec();
  },

  async setActiveInCompany(
    id: string,
    companyId: string,
    isActive: boolean,
  ): Promise<WarehouseDocument | null> {
    return WarehouseModel.findOneAndUpdate(
      { _id: id, companyId },
      { $set: { isActive } },
      { new: true },
    ).exec();
  },
};
