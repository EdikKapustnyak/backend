import type { FilterQuery } from 'mongoose';
import { SupplierModel, type SupplierDocument } from './supplier.model.js';
import { escapeRegex } from '../../utils/escapeRegex.js';
import type { PaginationParams } from '../../utils/pagination.js';
import type { SupplierDocumentShape } from './supplier.types.js';

interface CreateSupplierInput {
  companyId: string;
  name: string;
  contactPerson?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
}

interface UpdateSupplierInput {
  name?: string;
  contactPerson?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
}

interface ListSuppliersFilter {
  companyId: string;
  search?: string;
  isActive?: boolean;
}

export const supplierRepository = {
  /**
   * Every supplier in a company, unpaginated. Used internally (e.g. to
   * resolve names for a PDF report) - never exposed via an unbounded HTTP
   * endpoint. Capped defensively.
   */
  async findAllInCompany(companyId: string): Promise<SupplierDocument[]> {
    return SupplierModel.find({ companyId }).limit(5000).exec();
  },
  async create(input: CreateSupplierInput): Promise<SupplierDocument> {
    return SupplierModel.create(input);
  },

  /** Tenant-scoped lookup - always requires companyId to prevent cross-tenant access. */
  async findByIdInCompany(id: string, companyId: string): Promise<SupplierDocument | null> {
    return SupplierModel.findOne({ _id: id, companyId }).exec();
  },

  async findManyInCompany(
    filter: ListSuppliersFilter,
    pagination: PaginationParams,
  ): Promise<{ items: SupplierDocument[]; totalItems: number }> {
    const query: FilterQuery<SupplierDocumentShape> = { companyId: filter.companyId };

    if (typeof filter.isActive === 'boolean') {
      query.isActive = filter.isActive;
    }
    if (filter.search) {
      const pattern = { $regex: escapeRegex(filter.search), $options: 'i' };
      query.$or = [
        { name: pattern },
        { contactPerson: pattern },
        { email: pattern },
        { phone: pattern },
      ];
    }

    const skip = (pagination.page - 1) * pagination.perPage;

    const [items, totalItems] = await Promise.all([
      SupplierModel.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pagination.perPage)
        .exec(),
      SupplierModel.countDocuments(query).exec(),
    ]);

    return { items, totalItems };
  },

  async updateInCompany(
    id: string,
    companyId: string,
    input: UpdateSupplierInput,
  ): Promise<SupplierDocument | null> {
    return SupplierModel.findOneAndUpdate(
      { _id: id, companyId },
      { $set: input },
      { new: true, runValidators: true },
    ).exec();
  },

  async setActiveInCompany(
    id: string,
    companyId: string,
    isActive: boolean,
  ): Promise<SupplierDocument | null> {
    return SupplierModel.findOneAndUpdate(
      { _id: id, companyId },
      { $set: { isActive } },
      { new: true },
    ).exec();
  },
};
