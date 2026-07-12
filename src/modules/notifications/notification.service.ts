import type { ClientSession } from 'mongoose';
import type { NotificationDocument } from './notification.model.js';
import type { PublicNotification } from './notification.types.js';
import { notificationRepository } from './notification.repository.js';
import { productRepository } from '../products/product.repository.js';
import { companyRepository } from '../companies/company.repository.js';

export function toPublicNotification(notification: NotificationDocument): PublicNotification {
  return {
    id: notification._id.toString(),
    companyId: notification.companyId.toString(),
    type: notification.type,
    status: notification.status,
    productId: notification.productId.toString(),
    warehouseId: notification.warehouseId.toString(),
    message: notification.message,
    quantity: notification.quantity,
    minStockLevel: notification.minStockLevel,
    discrepancy: notification.discrepancy,
    systemQuantity: notification.systemQuantity,
    referenceType: notification.referenceType,
    referenceId: notification.referenceId ? notification.referenceId.toString() : null,
    resolvedAt: notification.resolvedAt,
    createdAt: notification.createdAt,
    updatedAt: notification.updatedAt,
  };
}

/**
 * Opens (or refreshes) a low_stock notification if currentQuantity has
 * dropped to/below the product's minStockLevel, or resolves any existing
 * open one if it's back above threshold. Called after every operation that
 * changes Inventory.quantity (Purchases, Write-offs, manual adjust,
 * Inventarization) - see each module's *.service.ts.
 *
 * Deliberately never throws on a missing product: a notification check is
 * a secondary concern and should never abort the caller's primary
 * transaction (stock change / status flip) over it. In practice productId
 * always exists here, since it's the same id already used earlier in the
 * same transaction to look up or create the Inventory record.
 */
export async function checkLowStock(
  companyId: string,
  productId: string,
  warehouseId: string,
  currentQuantity: number,
  session?: ClientSession,
): Promise<void> {
  const product = await productRepository.findByIdInCompany(productId, companyId);
  if (!product) return;

  if (currentQuantity <= product.minStockLevel) {
    const message = `${product.name}: осталось ${currentQuantity} шт (мин. остаток: ${product.minStockLevel})`;
    await notificationRepository.upsertOpenLowStock(
      companyId,
      productId,
      warehouseId,
      currentQuantity,
      product.minStockLevel,
      message,
      session,
    );
  } else {
    await notificationRepository.resolveOpenLowStock(companyId, productId, warehouseId, session);
  }
}

// Fallback defaults if a company document is somehow missing (shouldn't
// happen in practice) - match Company's own schema defaults.
const DEFAULT_ABS_THRESHOLD = 10;
const DEFAULT_PERCENT_THRESHOLD = 20; // stored/compared as 0-100, not 0-1

function isLargeDiscrepancy(
  discrepancy: number,
  systemQuantity: number,
  absThreshold: number,
  percentThreshold: number,
): boolean {
  if (Math.abs(discrepancy) >= absThreshold) return true;
  if (systemQuantity > 0 && (Math.abs(discrepancy) / systemQuantity) * 100 >= percentThreshold) {
    return true;
  }
  return false;
}

/**
 * Creates a one-off notification if an inventarization item's discrepancy
 * is "large" relative to the caller's own company thresholds (configurable
 * via PATCH /companies/me - largeDiscrepancyAbsThreshold/
 * largeDiscrepancyPercentThreshold). Called from
 * inventarization.service.ts#completeInventarization for each item.
 */
export async function flagDiscrepancyIfLarge(
  companyId: string,
  productId: string,
  warehouseId: string,
  discrepancy: number,
  systemQuantity: number,
  inventarizationId: string,
  session?: ClientSession,
): Promise<void> {
  const company = await companyRepository.findById(companyId);
  const absThreshold = company?.largeDiscrepancyAbsThreshold ?? DEFAULT_ABS_THRESHOLD;
  const percentThreshold = company?.largeDiscrepancyPercentThreshold ?? DEFAULT_PERCENT_THRESHOLD;

  if (!isLargeDiscrepancy(discrepancy, systemQuantity, absThreshold, percentThreshold)) return;

  const product = await productRepository.findByIdInCompany(productId, companyId);
  const productName = product?.name ?? 'Товар';
  const sign = discrepancy > 0 ? '+' : '';
  const message = `${productName}: крупное расхождение при инвентаризации (${sign}${discrepancy} шт, было ${systemQuantity})`;

  await notificationRepository.createDiscrepancyNotification(
    {
      companyId,
      productId,
      warehouseId,
      message,
      discrepancy,
      systemQuantity,
      referenceId: inventarizationId,
    },
    session,
  );
}
