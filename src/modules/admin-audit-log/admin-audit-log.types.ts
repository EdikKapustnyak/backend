import type { Types } from 'mongoose';

export enum AuditLogActionType {
  OVERRIDE = 'override',
  IMPERSONATION = 'impersonation',
  FLAG = 'flag',
}

export interface AuditLogDocumentShape {
  _id: Types.ObjectId;
  adminId: Types.ObjectId;
  adminEmail: string;
  type: AuditLogActionType;
  what: string;
  companyId: Types.ObjectId | null;
  companyName: string | null;
  reason: string | null;
  createdAt: Date;
}

export interface PublicAuditLogEntry {
  id: string;
  adminEmail: string;
  type: AuditLogActionType;
  what: string;
  companyId: string | null;
  companyName: string | null;
  reason: string | null;
  createdAt: string;
}
