import { Schema, model, type HydratedDocument } from 'mongoose';
import { ReceiptType, type ReceiptDocumentShape } from './receipt.types.js';
import { tenantScopePlugin } from '../../utils/tenantScopePlugin.js';

export type ReceiptDocument = HydratedDocument<ReceiptDocumentShape>;

const receiptSchema = new Schema<ReceiptDocumentShape>(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: Object.values(ReceiptType),
      required: true,
    },
    category: {
      type: String,
      trim: true,
      maxlength: 100,
      default: null,
    },
    amount: {
      type: Number,
      min: 0,
      default: null,
    },
    date: {
      type: Date,
      required: true,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: null,
    },
    fileKey: {
      type: String,
      required: true,
    },
    mimeType: {
      type: String,
      required: true,
    },
    fileSize: {
      type: Number,
      required: true,
      min: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    uploadedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true },
);

receiptSchema.index({ companyId: 1, type: 1 });
receiptSchema.index({ companyId: 1, category: 1 });
receiptSchema.index({ companyId: 1, date: -1 });
receiptSchema.index({ companyId: 1, isActive: 1 });

receiptSchema.plugin(tenantScopePlugin);

export const ReceiptModel = model<ReceiptDocumentShape>('Receipt', receiptSchema);
