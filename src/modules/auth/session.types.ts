import type { Types } from 'mongoose';

export interface SessionDocumentShape {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  refreshTokenHash: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: Date;
  lastUsedAt: Date;
  expiresAt: Date;
}

export interface PublicSession {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: Date;
  lastUsedAt: Date;
  expiresAt: Date;
  isCurrent: boolean;
}
