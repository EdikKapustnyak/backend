import { Schema, model, type HydratedDocument } from 'mongoose';
import { WriteOffReason, WriteOffStatus, type WriteOffDocumentShape } from './write-off.types.js';
import { tenantScopePlugin } from '../../utils/tenantScopePlugin.js';

export type WriteOffDocument = HydratedDocument<WriteOffDocumentShape>;

const writeOffSchema = new Schema<WriteOffDocumentShape>(
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
      min: 1,
    },
    reason: {
      type: String,
      enum: Object.values(WriteOffReason),
      required: true,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: null,
    },
    status: {
      type: String,
      enum: Object.values(WriteOffStatus),
      default: WriteOffStatus.DRAFT,
      index: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    confirmedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    confirmedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

// Supports both audit lookups and the future PDF write-off report.
writeOffSchema.index({ companyId: 1, createdAt: -1 });
writeOffSchema.index({ companyId: 1, productId: 1 });
writeOffSchema.index({ companyId: 1, warehouseId: 1 });
writeOffSchema.index({ companyId: 1, reason: 1 });
writeOffSchema.index({ companyId: 1, status: 1 });

writeOffSchema.plugin(tenantScopePlugin);

export const WriteOffModel = model<WriteOffDocumentShape>('WriteOff', writeOffSchema);
