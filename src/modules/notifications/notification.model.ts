import { Schema, model, type HydratedDocument } from 'mongoose';
import {
  NotificationStatus,
  NotificationType,
  type NotificationDocumentShape,
} from './notification.types.js';
import { tenantScopePlugin } from '../../utils/tenantScopePlugin.js';

export type NotificationDocument = HydratedDocument<NotificationDocumentShape>;

const notificationSchema = new Schema<NotificationDocumentShape>(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: Object.values(NotificationType),
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(NotificationStatus),
      default: NotificationStatus.OPEN,
      index: true,
    },
    productId: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
      index: true,
    },
    warehouseId: {
      type: Schema.Types.ObjectId,
      ref: 'Warehouse',
      required: true,
      index: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    quantity: { type: Number, default: null },
    minStockLevel: { type: Number, default: null },
    discrepancy: { type: Number, default: null },
    systemQuantity: { type: Number, default: null },
    referenceType: {
      type: String,
      enum: ['inventarization'],
      default: null,
    },
    referenceId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

notificationSchema.index({ companyId: 1, status: 1, createdAt: -1 });
notificationSchema.index({ companyId: 1, type: 1 });

// Only one OPEN low_stock notification can exist per product+warehouse -
// re-triggers update the existing one (via upsert) instead of piling up
// duplicates. Resolved notifications are exempt (kept for history).
notificationSchema.index(
  { companyId: 1, productId: 1, warehouseId: 1, type: 1 },
  {
    unique: true,
    partialFilterExpression: {
      type: NotificationType.LOW_STOCK,
      status: NotificationStatus.OPEN,
    },
  },
);

notificationSchema.plugin(tenantScopePlugin);

export const NotificationModel = model<NotificationDocumentShape>(
  'Notification',
  notificationSchema,
);
