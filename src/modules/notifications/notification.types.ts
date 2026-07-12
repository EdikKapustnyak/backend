import type { Types } from 'mongoose';

export enum NotificationType {
  LOW_STOCK = 'low_stock',
  INVENTARIZATION_DISCREPANCY = 'inventarization_discrepancy',
}

export enum NotificationStatus {
  OPEN = 'open',
  RESOLVED = 'resolved',
}

export interface NotificationDocumentShape {
  _id: Types.ObjectId;
  companyId: Types.ObjectId;
  type: NotificationType;
  status: NotificationStatus;
  productId: Types.ObjectId;
  warehouseId: Types.ObjectId;
  message: string;
  /** Present for type: "low_stock". */
  quantity: number | null;
  minStockLevel: number | null;
  /** Present for type: "inventarization_discrepancy". */
  discrepancy: number | null;
  systemQuantity: number | null;
  referenceType: 'inventarization' | null;
  referenceId: Types.ObjectId | null;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicNotification {
  id: string;
  companyId: string;
  type: NotificationType;
  status: NotificationStatus;
  productId: string;
  warehouseId: string;
  message: string;
  quantity: number | null;
  minStockLevel: number | null;
  discrepancy: number | null;
  systemQuantity: number | null;
  referenceType: 'inventarization' | null;
  referenceId: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
