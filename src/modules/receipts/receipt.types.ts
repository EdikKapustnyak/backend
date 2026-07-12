import type { Types } from 'mongoose';

export enum ReceiptType {
  DAILY_REVENUE = 'daily_revenue',
  PURCHASE = 'purchase',
  EXPENSE = 'expense',
}

export interface ReceiptDocumentShape {
  _id: Types.ObjectId;
  companyId: Types.ObjectId;
  type: ReceiptType;
  category: string | null;
  amount: number | null;
  date: Date;
  notes: string | null;
  fileKey: string;
  mimeType: string;
  fileSize: number;
  isActive: boolean;
  uploadedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicReceipt {
  id: string;
  companyId: string;
  type: ReceiptType;
  category: string | null;
  amount: number | null;
  date: Date;
  notes: string | null;
  mimeType: string;
  fileSize: number;
  isActive: boolean;
  uploadedBy: string;
  createdAt: Date;
  updatedAt: Date;
  /** Time-limited signed URL to view/download the file - never permanent. */
  viewUrl: string;
}
