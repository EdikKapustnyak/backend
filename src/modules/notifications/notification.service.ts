import type { ClientSession } from 'mongoose';
import type { NotificationDocument } from './notification.model.js';
import type { PublicNotification } from './notification.types.js';
import { notificationRepository } from './notification.repository.js';
import { productRepository } from '../products/product.repository.js';
import { companyRepository } from '../companies/company.repository.js';
import { userRepository } from '../users/user.repository.js';
import { mailer, isMailerConfigured } from '../../utils/mailer.js';
import { escapeHtml } from '../../utils/escapeHtml.js';
import { logger } from '../../utils/logger.js';
import { env } from '../../config/env.js';

function buildNotificationEmailHtml(params: { message: string; notificationsUrl: string }): string {
  const message = escapeHtml(params.message);
  const url = escapeHtml(params.notificationsUrl);

  // Same deliberately plain, table-free HTML as buildInviteEmailHtml in
  // user.service.ts - no template dependency for two transactional emails.
  return `
    <p>${message}</p>
    <p><a href="${url}">View in Axis Digital</a></p>
  `.trim();
}

/**
 * Emails the company's owner/admin users about a notification, on top of
 * the in-app notification (which always gets created regardless of email
 * delivery - see checkLowStock/flagDiscrepancyIfLarge below). Mirrors
 * user.service.ts's invite-email philosophy: never throws, degrades
 * silently if RESEND_API_KEY/MAIL_FROM aren't set - see mailer.ts.
 *
 * Deliberately fire-and-forget (`void`, never awaited) at every call site:
 * checkLowStock/flagDiscrepancyIfLarge run inside the caller's own
 * transaction (Purchases/Write-offs/Inventory-adjust/Inventarization), and
 * an external HTTP call to Resend has no business adding latency - or a
 * failure mode - to that transaction's commit. Accepted trade-off: if the
 * enclosing transaction later aborts for an unrelated reason, an email can
 * still go out for a notification that ends up not persisted. No outbox
 * pattern here for a single email send: not worth the complexity yet.
 */
async function notifyAdminsByEmail(companyId: string, subject: string, message: string): Promise<void> {
  if (!isMailerConfigured()) return;

  try {
    const recipients = await userRepository.findAdminRecipientsInCompany(companyId);
    if (recipients.length === 0) return;

    const html = buildNotificationEmailHtml({
      message,
      notificationsUrl: `${env.FRONTEND_URL}/notifications`,
    });

    await Promise.all(
      recipients.map((r) =>
        mailer.sendMail({ to: r.email, subject, html }).catch((err: unknown) => {
          logger.error({ err, email: r.email, companyId }, 'Failed to send notification email');
        }),
      ),
    );
  } catch (err) {
    logger.error({ err, companyId }, 'Failed to look up notification email recipients');
  }
}

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
    const notification = await notificationRepository.upsertOpenLowStock(
      companyId,
      productId,
      warehouseId,
      currentQuantity,
      product.minStockLevel,
      message,
      session,
    );

    // findOneAndUpdate's upsert result doesn't directly say "was this an
    // insert" - Mongoose's timestamps plugin sets createdAt === updatedAt
    // only on the initial insert, so this comparison is the simplest
    // reliable signal without a second query or a rawResult option.
    // Without this check, every stock-changing operation while a product
    // stays below threshold would re-email the same alert.
    const isNewlyOpened = notification.createdAt.getTime() === notification.updatedAt.getTime();
    if (isNewlyOpened) {
      void notifyAdminsByEmail(companyId, `Low stock: ${product.name}`, message);
    }
  } else {
    await notificationRepository.resolveOpenLowStock(companyId, productId, warehouseId, session);
  }
}

// Fallback defaults if a company document is somehow missing (shouldn't
// happen in practice) - match Company's own schema defaults. Exported so
// report.service.ts can fall back identically when building the
// inventarization PDF report.
export const DEFAULT_DISCREPANCY_ABS_THRESHOLD = 10;
export const DEFAULT_DISCREPANCY_PERCENT_THRESHOLD = 20; // stored/compared as 0-100, not 0-1

/**
 * Exported (not just used internally by flagDiscrepancyIfLarge below) so
 * report.service.ts can flag the exact same items as "large" in the
 * inventarization PDF report - one rule, one place, instead of a second
 * copy that could silently drift from what actually triggers a
 * notification.
 */
export function isLargeDiscrepancy(
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
  const absThreshold = company?.largeDiscrepancyAbsThreshold ?? DEFAULT_DISCREPANCY_ABS_THRESHOLD;
  const percentThreshold =
    company?.largeDiscrepancyPercentThreshold ?? DEFAULT_DISCREPANCY_PERCENT_THRESHOLD;

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

  void notifyAdminsByEmail(companyId, `Large discrepancy: ${productName}`, message);
}
