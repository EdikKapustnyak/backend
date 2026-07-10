import type { FilterQuery } from 'mongoose';
import { ProductModel, type ProductDocument } from './product.model.js';
import { escapeRegex } from '../../utils/escapeRegex.js';
import type { PaginationParams } from '../../utils/pagination.js';
import type { ProductDocumentShape } from './product.types.js';

interface CreateProductInput {
  companyId: string;
  name: string;
  sku: string;
  category?: string | null;
  description?: string | null;
  purchasePrice: number;
  salePrice: number;
  unit: string;
  minStockLevel: number;
  barcode?: string | null;
  photos?: string[];
}

interface UpdateProductInput {
  name?: string;
  category?: string | null;
  description?: string | null;
  purchasePrice?: number;
  salePrice?: number;
  unit?: string;
  minStockLevel?: number;
  barcode?: string | null;
  photos?: string[];
}

interface ListProductsFilter {
  companyId: string;
  search?: string;
  category?: string;
  isActive?: boolean;
}

export const productRepository = {
  async create(input: CreateProductInput): Promise<ProductDocument> {
    return ProductModel.create(input);
  },

  /** Tenant-scoped lookup - always requires companyId to prevent cross-tenant access. */
  async findByIdInCompany(id: string, companyId: string): Promise<ProductDocument | null> {
    return ProductModel.findOne({ _id: id, companyId }).exec();
  },

  async findManyInCompany(
    filter: ListProductsFilter,
    pagination: PaginationParams,
  ): Promise<{ items: ProductDocument[]; totalItems: number }> {
    const query: FilterQuery<ProductDocumentShape> = { companyId: filter.companyId };

    if (typeof filter.isActive === 'boolean') {
      query.isActive = filter.isActive;
    }
    if (filter.category) {
      query.category = filter.category;
    }
    if (filter.search) {
      const pattern = { $regex: escapeRegex(filter.search), $options: 'i' };
      query.$or = [{ name: pattern }, { sku: pattern }, { barcode: pattern }];
    }

    const skip = (pagination.page - 1) * pagination.perPage;

    const [items, totalItems] = await Promise.all([
      ProductModel.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pagination.perPage)
        .exec(),
      ProductModel.countDocuments(query).exec(),
    ]);

    return { items, totalItems };
  },

  async updateInCompany(
    id: string,
    companyId: string,
    input: UpdateProductInput,
  ): Promise<ProductDocument | null> {
    return ProductModel.findOneAndUpdate(
      { _id: id, companyId },
      { $set: input },
      { new: true, runValidators: true },
    ).exec();
  },

  async setActiveInCompany(
    id: string,
    companyId: string,
    isActive: boolean,
  ): Promise<ProductDocument | null> {
    return ProductModel.findOneAndUpdate(
      { _id: id, companyId },
      { $set: { isActive } },
      { new: true },
    ).exec();
  },
};
