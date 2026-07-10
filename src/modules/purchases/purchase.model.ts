import { Schema, model, type HydratedDocument } from 'mongoose';
import {
  PurchaseStatus,
  type PurchaseDocumentShape,
  type PurchaseItemShape,
} from './purchase.types.js';

export type PurchaseDocument = HydratedDocument<PurchaseDocumentShape>;

const purchaseItemSchema = new Schema<PurchaseItemShape>(
  {
    productId: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    unitPrice: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: false },
);

const purchaseSchema = new Schema<PurchaseDocumentShape>(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    supplierId: {
      type: Schema.Types.ObjectId,
      ref: 'Supplier',
      required: true,
      index: true,
    },
    warehouseId: {
      type: Schema.Types.ObjectId,
      ref: 'Warehouse',
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(PurchaseStatus),
      default: PurchaseStatus.DRAFT,
      index: true,
    },
    items: {
      type: [purchaseItemSchema],
      required: true,
      validate: {
        validator: (items: PurchaseItemShape[]) => items.length > 0,
        message: 'A purchase must have at least one item',
      },
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: null,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

purchaseSchema.index({ companyId: 1, status: 1 });
purchaseSchema.index({ companyId: 1, supplierId: 1 });
purchaseSchema.index({ companyId: 1, warehouseId: 1 });

export const PurchaseModel = model<PurchaseDocumentShape>('Purchase', purchaseSchema);
