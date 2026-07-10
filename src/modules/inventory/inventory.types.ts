import type { Types } from 'mongoose';

export interface InventoryDocumentShape {
  _id: Types.ObjectId;
  companyId: Types.ObjectId;
  productId: Types.ObjectId;
  warehouseId: Types.ObjectId;
  quantity: number;
  reserved: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicInventory {
  id: string;
  companyId: string;
  productId: string;
  warehouseId: string;
  quantity: number;
  reserved: number;
  /** Computed as quantity - reserved. Never stored, always derived. */
  available: number;
  createdAt: Date;
  updatedAt: Date;
}
