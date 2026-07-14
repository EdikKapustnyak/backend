import { Schema, model, type HydratedDocument } from 'mongoose';
import {
  StockMovementReferenceType,
  StockMovementType,
  type StockMovementDocumentShape,
} from './stock-movement.types.js';
import { tenantScopePlugin } from '../../utils/tenantScopePlugin.js';

export type StockMovementDocument = HydratedDocument<StockMovementDocumentShape>;

const stockMovementSchema = new Schema<StockMovementDocumentShape>(
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
    type: {
      type: String,
      enum: Object.values(StockMovementType),
      required: true,
    },
    quantityDelta: {
      type: Number,
      required: true,
      validate: {
        validator: (value: number) => value !== 0,
        message: 'quantityDelta cannot be zero - there is no movement to record',
      },
    },
    quantityAfter: {
      type: Number,
      required: true,
      min: 0,
    },
    referenceType: {
      type: String,
      enum: Object.values(StockMovementReferenceType),
      default: null,
    },
    referenceId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 500,
      default: null,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true },
);

// Primary access pattern: "history for this company, newest first", plus
// per-product / per-warehouse / per-type breakdowns for future reporting.
stockMovementSchema.index({ companyId: 1, createdAt: -1 });
stockMovementSchema.index({ companyId: 1, productId: 1 });
stockMovementSchema.index({ companyId: 1, warehouseId: 1 });
stockMovementSchema.index({ companyId: 1, type: 1 });
stockMovementSchema.index({ companyId: 1, referenceType: 1, referenceId: 1 });

stockMovementSchema.plugin(tenantScopePlugin);

export const StockMovementModel = model<StockMovementDocumentShape>(
  'StockMovement',
  stockMovementSchema,
);
