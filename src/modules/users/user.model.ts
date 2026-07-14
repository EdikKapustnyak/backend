import { Schema, model, type HydratedDocument } from 'mongoose';
import { Role, type UserDocumentShape } from './user.types.js';
import { tenantScopePlugin } from '../../utils/tenantScopePlugin.js';

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
    // Defaults to true because registerCompany creates a user with a real,
    // owner-chosen password immediately. userRepository.create() overrides
    // this explicitly to false for invite-flow users.
    passwordSet: {
      type: Boolean,
      default: true,
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

// Every query on this collection is now structurally required to be
// tenant-scoped by companyId (see tenantScopePlugin.ts) - the handful of
// deliberate exceptions (global email lookups, the refresh-token flow,
// accept-invite) opt out explicitly in user.repository.ts. This index
// makes the tenant-scoped queries fast.
userSchema.index({ companyId: 1, role: 1 });

userSchema.plugin(tenantScopePlugin);

export const UserModel = model<UserDocumentShape>('User', userSchema);
