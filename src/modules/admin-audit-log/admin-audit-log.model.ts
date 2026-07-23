import { Schema, model, type HydratedDocument } from 'mongoose';
import type { AuditLogDocumentShape } from './admin-audit-log.types.js';
import { AuditLogActionType } from './admin-audit-log.types.js';

export type AuditLogDocument = HydratedDocument<AuditLogDocumentShape>;

/**
 * A record of sensitive platform-admin actions (plan/status overrides,
 * impersonation, feature flags) - not tenant data, so no companyId/
 * tenantScopePlugin. `adminEmail` and `companyName` are denormalized
 * snapshots at the time of the action, not live references - an audit
 * log entry must keep reading correctly even if the admin's email later
 * changes or the company is renamed; it's a historical record, not a
 * live view.
 */
const auditLogSchema = new Schema<AuditLogDocumentShape>(
  {
    adminId: {
      type: Schema.Types.ObjectId,
      ref: 'PlatformAdmin',
      required: true,
      index: true,
    },
    adminEmail: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: Object.values(AuditLogActionType),
      required: true,
      index: true,
    },
    what: {
      type: String,
      required: true,
    },
    companyId: {
      type: Schema.Types.ObjectId,
      ref: 'Company',
      default: null,
      index: true,
    },
    companyName: {
      type: String,
      default: null,
    },
    reason: {
      type: String,
      default: null,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

auditLogSchema.index({ createdAt: -1 });

export const AuditLogModel = model<AuditLogDocumentShape>('AuditLog', auditLogSchema);
