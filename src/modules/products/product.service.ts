import type { ProductDocument } from './product.model.js';
import type { PublicProduct } from './product.types.js';

export function toPublicProduct(product: ProductDocument): PublicProduct {
  return {
    id: product._id.toString(),
    companyId: product.companyId.toString(),
    name: product.name,
    sku: product.sku,
    category: product.category,
    description: product.description,
    purchasePrice: product.purchasePrice,
    salePrice: product.salePrice,
    unit: product.unit,
    minStockLevel: product.minStockLevel,
    barcode: product.barcode,
    photos: product.photos,
    isActive: product.isActive,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}
