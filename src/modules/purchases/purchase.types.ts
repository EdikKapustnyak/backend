import type { Types } from 'mongoose';

export enum PurchaseStatus {
  DRAFT = 'draft',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export interface PurchaseItemShape {
  productId: Types.ObjectId;
  quantity: number;
  unitPrice: number;
}

export interface PurchaseDocumentShape {
  _id: Types.ObjectId;
  companyId: Types.ObjectId;
  supplierId: Types.ObjectId;
  warehouseId: Types.ObjectId;
  status: PurchaseStatus;
  items: PurchaseItemShape[];
  totalAmount: number;
  notes: string | null;
  createdBy: Types.ObjectId;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicPurchaseItem {
  productId: string;
  quantity: number;
  unitPrice: number;
}

export interface PublicPurchase {
  id: string;
  companyId: string;
  supplierId: string;
  warehouseId: string;
  status: PurchaseStatus;
  items: PublicPurchaseItem[];
  totalAmount: number;
  notes: string | null;
  createdBy: string;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
