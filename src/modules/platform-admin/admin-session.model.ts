import { Schema, model, type HydratedDocument, type Types } from 'mongoose';

/**
 * Mirrors modules/auth/session.model.ts (the tenant refresh-token session)
 * exactly, as its own separate collection - a platform admin's refresh
 * tokens are tracked/revocable the same way a tenant user's are, just
 * never in the same table, so revoking one system's sessions can never
 * touch the other's.
 */
export interface PlatformAdminSessionDocumentShape {
  _id: Types.ObjectId;
  adminId: Types.ObjectId;
  refreshTokenHash: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: Date;
  lastUsedAt: Date;
  expiresAt: Date;
}

export type PlatformAdminSessionDocument = HydratedDocument<PlatformAdminSessionDocumentShape>;

const platformAdminSessionSchema = new Schema<PlatformAdminSessionDocumentShape>({
  adminId: {
    type: Schema.Types.ObjectId,
    ref: 'PlatformAdmin',
    required: true,
    index: true,
  },
  refreshTokenHash: {
    type: String,
    required: true,
    select: false,
  },
  userAgent: {
    type: String,
    default: null,
  },
  ipAddress: {
    type: String,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  lastUsedAt: {
    type: Date,
    default: Date.now,
  },
  expiresAt: {
    type: Date,
    required: true,
  },
});

// Same TTL cleanup as the tenant Session model - MongoDB deletes the row
// once the refresh token would have expired anyway.
platformAdminSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const PlatformAdminSessionModel = model<PlatformAdminSessionDocumentShape>(
  'PlatformAdminSession',
  platformAdminSessionSchema,
);
