import type { Types } from 'mongoose';

export enum InventarizationStatus {
  DRAFT = 'draft',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export interface InventarizationItemShape {
  productId: Types.ObjectId;
  /** Snapshot of Inventory.quantity at the moment this item was added to the count. */
  systemQuantity: number;
  /** Physically counted quantity. Null until someone records a count for it. */
  countedQuantity: number | null;
  /** countedQuantity - systemQuantity. Null until counted. */
  discrepancy: number | null;
}

export interface InventarizationDocumentShape {
  _id: Types.ObjectId;
  companyId: Types.ObjectId;
  warehouseId: Types.ObjectId;
  status: InventarizationStatus;
  items: InventarizationItemShape[];
  notes: string | null;
  createdBy: Types.ObjectId;
  completedBy: Types.ObjectId | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicInventarizationItem {
  productId: string;
  systemQuantity: number;
  countedQuantity: number | null;
  discrepancy: number | null;
}

export interface PublicInventarization {
  id: string;
  companyId: string;
  warehouseId: string;
  status: InventarizationStatus;
  items: PublicInventarizationItem[];
  notes: string | null;
  createdBy: string;
  completedBy: string | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
