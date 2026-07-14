import { Schema, model, type HydratedDocument } from 'mongoose';
import type { InviteDocumentShape } from './invite.types.js';
import { tenantScopePlugin } from '../../utils/tenantScopePlugin.js';

export type InviteDocument = HydratedDocument<InviteDocumentShape>;

const inviteSchema = new Schema<InviteDocumentShape>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  companyId: {
    type: Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
  },
  tokenHash: {
    type: String,
    required: true,
    select: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  expiresAt: {
    type: Date,
    required: true,
  },
});

// Same TTL approach as Session/LocalEventsCache - MongoDB deletes an expired,
// unused invite on its own; no manual cleanup job needed.
inviteSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

inviteSchema.plugin(tenantScopePlugin);

export const InviteModel = model<InviteDocumentShape>('Invite', inviteSchema);
