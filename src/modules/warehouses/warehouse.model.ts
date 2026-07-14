import { Schema, model, type HydratedDocument } from 'mongoose';
import type { WarehouseDocumentShape } from './warehouse.types.js';
import { tenantScopePlugin } from '../../utils/tenantScopePlugin.js';

export type WarehouseDocument = HydratedDocument<WarehouseDocumentShape>;

const warehouseSchema = new Schema<WarehouseDocumentShape>(
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
      maxlength: 120,
    },
    location: {
      type: String,
      trim: true,
      maxlength: 250,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

// A company cannot have two warehouses with the same name.
warehouseSchema.index({ companyId: 1, name: 1 }, { unique: true });
// Supports the common "list active warehouses for my company" query.
warehouseSchema.index({ companyId: 1, isActive: 1 });

warehouseSchema.plugin(tenantScopePlugin);

export const WarehouseModel = model<WarehouseDocumentShape>('Warehouse', warehouseSchema);
