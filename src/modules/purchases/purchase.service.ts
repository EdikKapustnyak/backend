import type { PurchaseDocument } from './purchase.model.js';
import type { PublicPurchase } from './purchase.types.js';
import { PurchaseStatus } from './purchase.types.js';
import { purchaseRepository } from './purchase.repository.js';
import { inventoryRepository } from '../inventory/inventory.repository.js';
import { NotFoundError, ConflictError } from '../../errors/index.js';

export function toPublicPurchase(purchase: PurchaseDocument): PublicPurchase {
  return {
    id: purchase._id.toString(),
    companyId: purchase.companyId.toString(),
    supplierId: purchase.supplierId.toString(),
    warehouseId: purchase.warehouseId.toString(),
    status: purchase.status,
    items: purchase.items.map((item) => ({
      productId: item.productId.toString(),
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    })),
    totalAmount: purchase.totalAmount,
    notes: purchase.notes,
    createdBy: purchase.createdBy.toString(),
    completedAt: purchase.completedAt,
    createdAt: purchase.createdAt,
    updatedAt: purchase.updatedAt,
  };
}

/**
 * Transitions a draft purchase to completed and applies its line items as
 * stock increases in the target warehouse.
 *
 * LIMITATION: this is not wrapped in a MongoDB multi-document transaction.
 * On a standalone (non-replica-set) MongoDB instance - the default for local
 * dev and for the test suite here - transactions aren't available. If the
 * process crashes partway through the items loop, the purchase would be
 * marked "completed" while only some line items have been applied to stock.
 * To close this gap: run MongoDB as a single-node replica set and wrap the
 * status transition + stock increments in a `session.withTransaction(...)`
 * block. Flag if you'd like that added now.
 */
export async function completePurchase(
  id: string,
  companyId: string,
): Promise<PublicPurchase> {
  const existing = await purchaseRepository.findByIdInCompany(id, companyId);
  if (!existing) throw new NotFoundError('Purchase not found');
  if (existing.status !== PurchaseStatus.DRAFT) {
    throw new ConflictError(
      `Purchase cannot be completed from status "${existing.status}"`,
    );
  }

  const completed = await purchaseRepository.completeInCompany(id, companyId);
  if (!completed) {
    // Lost a race with a concurrent complete/cancel request.
    throw new ConflictError('Purchase is no longer in draft status');
  }

  for (const item of completed.items) {
    await inventoryRepository.incrementOrCreate(
      companyId,
      item.productId.toString(),
      completed.warehouseId.toString(),
      item.quantity,
    );
  }

  return toPublicPurchase(completed);
}
