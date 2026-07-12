import type { ClientSession, FilterQuery } from 'mongoose';
import { NotificationModel, type NotificationDocument } from './notification.model.js';
import {
  NotificationStatus,
  NotificationType,
  type NotificationDocumentShape,
} from './notification.types.js';
import type { PaginationParams } from '../../utils/pagination.js';

interface ListNotificationsFilter {
  companyId: string;
  productId?: string;
  warehouseId?: string;
  type?: NotificationType;
  status?: NotificationStatus;
}

interface DiscrepancyNotificationInput {
  companyId: string;
  productId: string;
  warehouseId: string;
  message: string;
  discrepancy: number;
  systemQuantity: number;
  referenceId: string;
}

export const notificationRepository = {
  /** Tenant-scoped lookup - always requires companyId to prevent cross-tenant access. */
  async findByIdInCompany(id: string, companyId: string): Promise<NotificationDocument | null> {
    return NotificationModel.findOne({ _id: id, companyId }).exec();
  },

  async findManyInCompany(
    filter: ListNotificationsFilter,
    pagination: PaginationParams,
  ): Promise<{ items: NotificationDocument[]; totalItems: number }> {
    const query: FilterQuery<NotificationDocumentShape> = { companyId: filter.companyId };

    if (filter.productId) query.productId = filter.productId;
    if (filter.warehouseId) query.warehouseId = filter.warehouseId;
    if (filter.type) query.type = filter.type;
    if (filter.status) query.status = filter.status;

    const skip = (pagination.page - 1) * pagination.perPage;

    const [items, totalItems] = await Promise.all([
      NotificationModel.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pagination.perPage)
        .exec(),
      NotificationModel.countDocuments(query).exec(),
    ]);

    return { items, totalItems };
  },

  /**
   * Opens (or refreshes, if already open) a low_stock notification for this
   * product+warehouse. Relies on the partial unique index to stay race-safe
   * under concurrent calls - upsert is atomic at the database level.
   */
  async upsertOpenLowStock(
    companyId: string,
    productId: string,
    warehouseId: string,
    quantity: number,
    minStockLevel: number,
    message: string,
    session?: ClientSession,
  ): Promise<NotificationDocument> {
    const updated = await NotificationModel.findOneAndUpdate(
      {
        companyId,
        productId,
        warehouseId,
        type: NotificationType.LOW_STOCK,
        status: NotificationStatus.OPEN,
      },
      {
        $set: { quantity, minStockLevel, message },
        $setOnInsert: { resolvedAt: null },
      },
      { new: true, upsert: true, session },
    ).exec();
    // upsert:true + new:true guarantees a non-null document.
    return updated as NotificationDocument;
  },

  /** Resolves any OPEN low_stock notification for this product+warehouse, if one exists. */
  async resolveOpenLowStock(
    companyId: string,
    productId: string,
    warehouseId: string,
    session?: ClientSession,
  ): Promise<void> {
    await NotificationModel.updateMany(
      {
        companyId,
        productId,
        warehouseId,
        type: NotificationType.LOW_STOCK,
        status: NotificationStatus.OPEN,
      },
      { $set: { status: NotificationStatus.RESOLVED, resolvedAt: new Date() } },
      { session },
    ).exec();
  },

  /** Creates a one-off inventarization-discrepancy alert. */
  async createDiscrepancyNotification(
    input: DiscrepancyNotificationInput,
    session?: ClientSession,
  ): Promise<NotificationDocument> {
    const [doc] = await NotificationModel.create(
      [
        {
          companyId: input.companyId,
          type: NotificationType.INVENTARIZATION_DISCREPANCY,
          status: NotificationStatus.OPEN,
          productId: input.productId,
          warehouseId: input.warehouseId,
          message: input.message,
          discrepancy: input.discrepancy,
          systemQuantity: input.systemQuantity,
          referenceType: 'inventarization',
          referenceId: input.referenceId,
        },
      ],
      { session },
    );
    return doc as NotificationDocument;
  },

  /** Manually marks any notification (of either type) as resolved. Idempotent. */
  async resolveById(id: string, companyId: string): Promise<NotificationDocument | null> {
    return NotificationModel.findOneAndUpdate(
      { _id: id, companyId, status: NotificationStatus.OPEN },
      { $set: { status: NotificationStatus.RESOLVED, resolvedAt: new Date() } },
      { new: true },
    ).exec();
  },
};
