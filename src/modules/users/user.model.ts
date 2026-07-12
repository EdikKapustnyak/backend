import { Schema, model, type HydratedDocument } from 'mongoose';
import { Role, type UserDocumentShape } from './user.types.js';

export type UserDocument = HydratedDocument<UserDocumentShape>;

const userSchema = new Schema<UserDocumentShape>(
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
    role: {
      type: String,
      enum: Object.values(Role),
      default: Role.EMPLOYEE,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

// Defence in depth: every query on this collection should be tenant-scoped
// at the service layer via companyId. This index makes those queries fast.
userSchema.index({ companyId: 1, role: 1 });

export const UserModel = model<UserDocumentShape>('User', userSchema);
