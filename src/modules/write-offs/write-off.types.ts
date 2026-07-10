import type { Types } from 'mongoose';

export enum WriteOffStatus {
  DRAFT = 'draft',
  CONFIRMED = 'confirmed',
  CANCELLED = 'cancelled',
}

export enum WriteOffReason {
  DAMAGED = 'damaged',
  EXPIRED = 'expired',
  ACCOUNTING_ERROR = 'accounting_error',
  LOST = 'lost',
  RETURNED = 'returned',
  OTHER = 'other',
}

export interface WriteOffDocumentShape {
  _id: Types.ObjectId;
  companyId: Types.ObjectId;
  productId: Types.ObjectId;
  warehouseId: Types.ObjectId;
  quantity: number;
  reason: WriteOffReason;
  notes: string | null;
  status: WriteOffStatus;
  createdBy: Types.ObjectId;
  confirmedBy: Types.ObjectId | null;
  confirmedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicWriteOff {
  id: string;
  companyId: string;
  productId: string;
  warehouseId: string;
  quantity: number;
  reason: WriteOffReason;
  notes: string | null;
  status: WriteOffStatus;
  createdBy: string;
  confirmedBy: string | null;
  confirmedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
