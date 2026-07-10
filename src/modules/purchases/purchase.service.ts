import mongoose from 'mongoose';
import type { PurchaseDocument } from './purchase.model.js';
import type { PublicPurchase } from './purchase.types.js';
import { PurchaseStatus } from './purchase.types.js';
import { purchaseRepository } from './purchase.repository.js';
import { inventoryRepository } from '../inventory/inventory.repository.js';
import { stockMovementRepository } from '../stock-movements/stock-movement.repository.js';
import { StockMovementType, StockMovementReferenceType } from '../stock-movements/stock-movement.types.js';
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
 * stock increases in the target warehouse, recording one StockMovement per
 * line item along the way.
 *
 * The status flip, every stock increment, and every movement record run
 * inside a single MongoDB transaction (`session.withTransaction`): either
 * all of it commits, or none of it does. If anything fails partway through -
 * a crash, a lost connection, a concurrent conflict - MongoDB rolls the
 * whole operation back, so a purchase can never end up "completed" with
 * only some of its stock (or movement history) applied.
 *
 * This requires MongoDB to be running as a replica set (a single-node
 * replica set is enough - see README "Running MongoDB locally"). Plain
 * standalone MongoDB does not support multi-document transactions.
 */
export async function completePurchase(
  id: string,
  companyId: string,
  userId: string,
): Promise<PublicPurchase> {
  const existing = await purchaseRepository.findByIdInCompany(id, companyId);
  if (!existing) throw new NotFoundError('Purchase not found');
  if (existing.status !== PurchaseStatus.DRAFT) {
    throw new ConflictError(
      `Purchase cannot be completed from status "${existing.status}"`,
    );
  }

  const session = await mongoose.startSession();
  let completed: PurchaseDocument | null = null;

  try {
    await session.withTransaction(async () => {
      completed = await purchaseRepository.completeInCompany(id, companyId, session);
      if (!completed) {
        // Lost a race with a concurrent complete/cancel request.
        throw new ConflictError('Purchase is no longer in draft status');
      }

      for (const item of completed.items) {
        const updatedInventory = await inventoryRepository.incrementOrCreate(
          companyId,
          item.productId.toString(),
          completed.warehouseId.toString(),
          item.quantity,
          session,
        );

        await stockMovementRepository.create(
          {
            companyId,
            productId: item.productId.toString(),
            warehouseId: completed.warehouseId.toString(),
            type: StockMovementType.PURCHASE,
            quantityDelta: item.quantity,
            quantityAfter: updatedInventory.quantity,
            referenceType: StockMovementReferenceType.PURCHASE,
            referenceId: completed._id.toString(),
            createdBy: userId,
          },
          session,
        );
      }
    });
  } finally {
    await session.endSession();
  }

  // withTransaction only resolves without throwing once the callback above
  // has run to completion, so this should be unreachable - but we check
  // instead of casting, since casting null to a Document type is unsound.
  if (!completed) {
    throw new ConflictError('Purchase completion failed unexpectedly');
  }

  return toPublicPurchase(completed);
}
