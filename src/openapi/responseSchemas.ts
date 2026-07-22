import { z } from 'zod';
import { registry } from './registry.js';
import { Role } from '../modules/users/user.types.js';
import { SubscriptionPlan, CompanyStatus } from '../modules/companies/company.types.js';
import { PurchaseStatus } from '../modules/purchases/purchase.types.js';
import { WriteOffStatus, WriteOffReason } from '../modules/write-offs/write-off.types.js';
import { InventarizationStatus } from '../modules/inventarizations/inventarization.types.js';
import { NotificationType, NotificationStatus } from '../modules/notifications/notification.types.js';
import {
  StockMovementType,
  StockMovementReferenceType,
} from '../modules/stock-movements/stock-movement.types.js';
import { ReceiptType } from '../modules/receipts/receipt.types.js';
import { receiptOcrResultSchema } from '../modules/receipts/receipt.schema.js';

// A date field is always an ISO 8601 string on the wire (JSON has no native
// date type) - documented as a plain string rather than z.date() so the
// generated schema matches what a client actually receives, not the
// in-memory Date object this codebase works with server-side.
const isoDate = z.string().openapi({ example: '2026-07-14T12:00:00.000Z' });
const objectId = z.string().openapi({ example: '507f1f77bcf86cd799439011' });

export const publicUserSchema = registry.register(
  'User',
  z.object({
    id: objectId,
    companyId: objectId,
    name: z.string(),
    email: z.string().email(),
    role: z.nativeEnum(Role),
    isActive: z.boolean(),
    passwordSet: z
      .boolean()
      .openapi({ description: 'false until the invited user accepts their invite and sets a password' }),
    createdAt: isoDate,
  }),
);

export const authTokensSchema = registry.register(
  'AuthTokens',
  z.object({
    user: publicUserSchema,
    accessToken: z.string(),
  }),
);

export const publicSessionSchema = registry.register(
  'Session',
  z.object({
    id: objectId,
    userAgent: z.string().nullable(),
    ipAddress: z.string().nullable(),
    createdAt: isoDate,
    lastUsedAt: isoDate,
    expiresAt: isoDate,
    isCurrent: z.boolean(),
  }),
);

export const inviteResultSchema = registry.register(
  'InviteResult',
  z.object({
    user: publicUserSchema,
    inviteLink: z
      .string()
      .nullable()
      .openapi({
        description:
          'Present only when the invite email could not be sent (Resend unconfigured or the send failed) - share it with the invitee manually.',
      }),
  }),
);

export const publicCompanySchema = registry.register(
  'Company',
  z.object({
    id: objectId,
    name: z.string(),
    slug: z.string(),
    subscriptionPlan: z.nativeEnum(SubscriptionPlan),
    status: z.nativeEnum(CompanyStatus),
    currentPeriodEnd: isoDate.nullable(),
    pastDueSince: isoDate.nullable(),
    city: z.string(),
    businessType: z.string().nullable(),
    largeDiscrepancyAbsThreshold: z.number(),
    largeDiscrepancyPercentThreshold: z.number(),
    wasteAnalyticsDefaultLookbackDays: z.number().openapi({ description: 'Default lookback (days) for GET /analytics/waste(/narrative) when `from` is omitted' }),
    localEventsCacheTtlDays: z.number().openapi({ description: 'How many days a GET /local-events result is cached' }),
    createdAt: isoDate,
    updatedAt: isoDate,
  }),
);

export const checkoutSessionResultSchema = registry.register(
  'CheckoutSessionResult',
  z.object({ checkoutUrl: z.string().url() }),
);

export const portalSessionResultSchema = registry.register(
  'PortalSessionResult',
  z.object({ portalUrl: z.string().url() }),
);

export const publicWarehouseSchema = registry.register(
  'Warehouse',
  z.object({
    id: objectId,
    companyId: objectId,
    name: z.string(),
    location: z.string().nullable(),
    isActive: z.boolean(),
    createdAt: isoDate,
    updatedAt: isoDate,
  }),
);

export const publicProductSchema = registry.register(
  'Product',
  z.object({
    id: objectId,
    companyId: objectId,
    name: z.string(),
    sku: z.string(),
    category: z.string().nullable(),
    description: z.string().nullable(),
    purchasePrice: z.number(),
    salePrice: z.number(),
    unit: z.string(),
    minStockLevel: z.number(),
    barcode: z.string().nullable(),
    photos: z.array(z.string().url()),
    isActive: z.boolean(),
    createdAt: isoDate,
    updatedAt: isoDate,
  }),
);

export const publicInventorySchema = registry.register(
  'Inventory',
  z.object({
    id: objectId,
    companyId: objectId,
    productId: objectId,
    warehouseId: objectId,
    quantity: z.number(),
    reserved: z.number(),
    available: z.number().openapi({ description: 'Computed as quantity - reserved, never stored' }),
    createdAt: isoDate,
    updatedAt: isoDate,
  }),
);

export const publicSupplierSchema = registry.register(
  'Supplier',
  z.object({
    id: objectId,
    companyId: objectId,
    name: z.string(),
    contactPerson: z.string().nullable(),
    phone: z.string().nullable(),
    email: z.string().nullable(),
    address: z.string().nullable(),
    notes: z.string().nullable(),
    isActive: z.boolean(),
    createdAt: isoDate,
    updatedAt: isoDate,
  }),
);

const publicPurchaseItemSchema = z.object({
  productId: objectId,
  quantity: z.number(),
  unitPrice: z.number(),
});

export const publicPurchaseSchema = registry.register(
  'Purchase',
  z.object({
    id: objectId,
    companyId: objectId,
    supplierId: objectId,
    warehouseId: objectId,
    status: z.nativeEnum(PurchaseStatus),
    items: z.array(publicPurchaseItemSchema),
    totalAmount: z.number(),
    notes: z.string().nullable(),
    createdBy: objectId,
    completedAt: isoDate.nullable(),
    createdAt: isoDate,
    updatedAt: isoDate,
  }),
);

export const publicWriteOffSchema = registry.register(
  'WriteOff',
  z.object({
    id: objectId,
    companyId: objectId,
    productId: objectId,
    warehouseId: objectId,
    quantity: z.number(),
    reason: z.nativeEnum(WriteOffReason),
    notes: z.string().nullable(),
    status: z.nativeEnum(WriteOffStatus),
    createdBy: objectId,
    confirmedBy: objectId.nullable(),
    confirmedAt: isoDate.nullable(),
    createdAt: isoDate,
    updatedAt: isoDate,
  }),
);

export const publicStockMovementSchema = registry.register(
  'StockMovement',
  z.object({
    id: objectId,
    companyId: objectId,
    productId: objectId,
    warehouseId: objectId,
    type: z.nativeEnum(StockMovementType),
    quantityDelta: z.number().openapi({ description: 'Positive = stock increased, negative = decreased' }),
    quantityAfter: z.number().openapi({ description: 'Snapshot of Inventory.quantity right after this movement' }),
    referenceType: z.nativeEnum(StockMovementReferenceType).nullable(),
    referenceId: objectId.nullable(),
    notes: z.string().nullable(),
    createdBy: objectId,
    createdAt: isoDate,
  }),
);

const publicInventarizationItemSchema = z.object({
  productId: objectId,
  systemQuantity: z.number(),
  countedQuantity: z.number().nullable(),
  discrepancy: z.number().nullable(),
});

export const publicInventarizationSchema = registry.register(
  'Inventarization',
  z.object({
    id: objectId,
    companyId: objectId,
    warehouseId: objectId,
    status: z.nativeEnum(InventarizationStatus),
    items: z.array(publicInventarizationItemSchema),
    notes: z.string().nullable(),
    createdBy: objectId,
    completedBy: objectId.nullable(),
    completedAt: isoDate.nullable(),
    createdAt: isoDate,
    updatedAt: isoDate,
  }),
);

export const publicNotificationSchema = registry.register(
  'Notification',
  z.object({
    id: objectId,
    companyId: objectId,
    type: z.nativeEnum(NotificationType),
    status: z.nativeEnum(NotificationStatus),
    productId: objectId,
    warehouseId: objectId,
    message: z.string(),
    quantity: z.number().nullable().openapi({ description: 'Present for type: low_stock' }),
    minStockLevel: z.number().nullable(),
    discrepancy: z.number().nullable().openapi({ description: 'Present for type: inventarization_discrepancy' }),
    systemQuantity: z.number().nullable(),
    referenceType: z.literal('inventarization').nullable(),
    referenceId: objectId.nullable(),
    resolvedAt: isoDate.nullable(),
    createdAt: isoDate,
    updatedAt: isoDate,
  }),
);

export const publicReceiptSchema = registry.register(
  'Receipt',
  z.object({
    id: objectId,
    companyId: objectId,
    type: z.nativeEnum(ReceiptType),
    category: z.string().nullable(),
    amount: z.number().nullable(),
    date: isoDate,
    notes: z.string().nullable(),
    mimeType: z.string(),
    fileSize: z.number(),
    isActive: z.boolean(),
    uploadedBy: objectId,
    createdAt: isoDate,
    updatedAt: isoDate,
    viewUrl: z.string().url().openapi({ description: 'Time-limited signed URL (15 min) - never a permanent link' }),
  }),
);

// Same schema instance receipt.service.ts validates Claude's raw OCR JSON
// against - registered here (not redefined) so the OpenAPI doc can never
// silently drift from what's actually enforced at runtime.
export const receiptOcrResultResponseSchema = registry.register('ReceiptOcrResult', receiptOcrResultSchema);

const wasteByProductSchema = z.object({
  productId: objectId,
  productName: z.string(),
  quantity: z.number(),
  estimatedCost: z.number(),
});

const wasteByReasonSchema = z.object({
  reason: z.string(),
  quantity: z.number(),
  count: z.number(),
});

export const wasteAnalyticsSchema = registry.register(
  'WasteAnalytics',
  z.object({
    from: isoDate,
    to: isoDate,
    totalQuantity: z.number(),
    totalEstimatedCost: z.number(),
    totalPurchases: z.number(),
    wasteRatioPercent: z.number().openapi({ description: 'Estimated waste cost as % of purchases in the same period' }),
    byProduct: z.array(wasteByProductSchema),
    byReason: z.array(wasteByReasonSchema),
  }),
);

export const wasteAnalyticsNarrativeSchema = registry.register(
  'WasteAnalyticsWithNarrative',
  wasteAnalyticsSchema.extend({
    narrative: z.string().openapi({ description: 'AI-written analysis + recommendations over the numbers above' }),
  }),
);

const revenueByDaySchema = z.object({
  date: z.string().openapi({ description: 'Calendar day, YYYY-MM-DD (UTC)' }),
  amount: z.number(),
});

export const revenueAnalyticsSchema = registry.register(
  'RevenueAnalytics',
  z.object({
    from: isoDate,
    to: isoDate,
    totalRevenue: z.number(),
    daysWithData: z.number().openapi({ description: 'Number of calendar days with at least one revenue receipt logged' }),
    averageDailyRevenue: z.number().openapi({ description: 'totalRevenue divided by the full number of days in range, not just daysWithData' }),
    byDay: z.array(revenueByDaySchema),
  }),
);

const localEventItemSchema = z.object({
  name: z.string(),
  date: z.string(),
  description: z.string(),
  relevance: z.string(),
});

export const publicLocalEventsSchema = registry.register(
  'LocalEvents',
  z.object({
    city: z.string(),
    businessType: z.string().nullable(),
    events: z.array(localEventItemSchema),
    generatedAt: isoDate,
    expiresAt: isoDate,
    fromCache: z.boolean(),
  }),
);
