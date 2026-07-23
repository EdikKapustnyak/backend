import { Schema, model, type HydratedDocument } from 'mongoose';
import type { PlatformAdminDocumentShape } from './admin.types.js';

export type PlatformAdminDocument = HydratedDocument<PlatformAdminDocumentShape>;

const platformAdminSchema = new Schema<PlatformAdminDocumentShape>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 120,
    },
    isActive: {
      type: Boolean,
      required: true,
      default: true,
    },
  },
  { timestamps: true },
);

// Deliberately no tenantScopePlugin - this collection isn't tenant data at
// all, so there is no companyId to scope by in the first place.
export const PlatformAdminModel = model<PlatformAdminDocumentShape>(
  'PlatformAdmin',
  platformAdminSchema,
);
