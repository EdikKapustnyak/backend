import type { Types } from 'mongoose';

/** What kind of event caused the stock to move. */
export enum StockMovementType {
  PURCHASE = 'purchase',
  WRITE_OFF = 'write_off',
  MANUAL_ADJUSTMENT = 'manual_adjustment',
  INVENTARIZATION = 'inventarization',
}

/** What kind of document (if any) this movement is tied back to. */
export enum StockMovementReferenceType {
  PURCHASE = 'purchase',
  WRITE_OFF = 'write_off',
  INVENTARIZATION = 'inventarization',
}

export interface StockMovementDocumentShape {
  _id: Types.ObjectId;
  companyId: Types.ObjectId;
  productId: Types.ObjectId;
  warehouseId: Types.ObjectId;
  type: StockMovementType;
  /** Positive = stock increased, negative = stock decreased. */
  quantityDelta: number;
  /** Snapshot of Inventory.quantity right after this movement was applied. */
  quantityAfter: number;
  referenceType: StockMovementReferenceType | null;
  referenceId: Types.ObjectId | null;
  notes: string | null;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicStockMovement {
  id: string;
  companyId: string;
  productId: string;
  warehouseId: string;
  type: StockMovementType;
  quantityDelta: number;
  quantityAfter: number;
  referenceType: StockMovementReferenceType | null;
  referenceId: string | null;
  notes: string | null;
  createdBy: string;
  createdAt: Date;
}
