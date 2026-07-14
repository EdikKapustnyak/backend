import { Schema, model, type HydratedDocument } from 'mongoose';
import type { ProductDocumentShape } from './product.types.js';
import { tenantScopePlugin } from '../../utils/tenantScopePlugin.js';

export type ProductDocument = HydratedDocument<ProductDocumentShape>;

const productSchema = new Schema<ProductDocumentShape>(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 150,
    },
    sku: {
      type: String,
      required: true,
      trim: true,
      maxlength: 64,
    },
    category: {
      type: String,
      trim: true,
      maxlength: 100,
      default: null,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: null,
    },
    purchasePrice: {
      type: Number,
      required: true,
      min: 0,
    },
    salePrice: {
      type: Number,
      required: true,
      min: 0,
    },
    unit: {
      type: String,
      required: true,
      trim: true,
      maxlength: 20,
      default: 'pcs',
    },
    minStockLevel: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    barcode: {
      type: String,
      trim: true,
      maxlength: 64,
      default: null,
    },
    photos: {
      type: [String],
      default: [],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

// A company cannot have two products with the same SKU.
productSchema.index({ companyId: 1, sku: 1 }, { unique: true });
// Barcode is optional but must be unique within a company when present.
// A partial index (not sparse) is required here: sparse indexes only skip
// documents where the field is *missing*, but our schema sets barcode to
// an explicit `null` default when not provided - sparse would still index
// that null, causing every barcode-less product in a company to collide.
productSchema.index(
  { companyId: 1, barcode: 1 },
  { unique: true, partialFilterExpression: { barcode: { $type: 'string' } } },
);
productSchema.index({ companyId: 1, isActive: 1 });
productSchema.index({ companyId: 1, category: 1 });

productSchema.plugin(tenantScopePlugin);

export const ProductModel = model<ProductDocumentShape>('Product', productSchema);
