import { Schema, model, type HydratedDocument } from 'mongoose';
import type { InventoryDocumentShape } from './inventory.types.js';

export type InventoryDocument = HydratedDocument<InventoryDocumentShape>;

const inventorySchema = new Schema<InventoryDocumentShape>(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    productId: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
      index: true,
    },
    warehouseId: {
      type: Schema.Types.ObjectId,
      ref: 'Warehouse',
      required: true,
      index: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    reserved: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
  },
  { timestamps: true },
);

// Exactly one stock record per product per warehouse per company.
inventorySchema.index({ companyId: 1, productId: 1, warehouseId: 1 }, { unique: true });
inventorySchema.index({ companyId: 1, warehouseId: 1 });
inventorySchema.index({ companyId: 1, productId: 1 });

export const InventoryModel = model<InventoryDocumentShape>('Inventory', inventorySchema);
