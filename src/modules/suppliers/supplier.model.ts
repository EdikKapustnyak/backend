import { Schema, model, type HydratedDocument } from 'mongoose';
import type { SupplierDocumentShape } from './supplier.types.js';

export type SupplierDocument = HydratedDocument<SupplierDocumentShape>;

const supplierSchema = new Schema<SupplierDocumentShape>(
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
    contactPerson: {
      type: String,
      trim: true,
      maxlength: 150,
      default: null,
    },
    phone: {
      type: String,
      trim: true,
      maxlength: 30,
      default: null,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: 150,
      default: null,
    },
    address: {
      type: String,
      trim: true,
      maxlength: 250,
      default: null,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

// A company cannot have two suppliers with the same name.
supplierSchema.index({ companyId: 1, name: 1 }, { unique: true });
supplierSchema.index({ companyId: 1, isActive: 1 });

export const SupplierModel = model<SupplierDocumentShape>('Supplier', supplierSchema);
