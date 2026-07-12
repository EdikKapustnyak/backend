import { Schema, model, type HydratedDocument } from 'mongoose';
import type { SessionDocumentShape } from './session.types.js';

export type SessionDocument = HydratedDocument<SessionDocumentShape>;

const sessionSchema = new Schema<SessionDocumentShape>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
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

// MongoDB automatically deletes a session once its refresh token would have
// expired anyway - no manual cleanup job needed.
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const SessionModel = model<SessionDocumentShape>('Session', sessionSchema);
