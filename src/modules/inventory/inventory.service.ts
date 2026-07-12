import mongoose from 'mongoose';
import type { InventoryDocument } from './inventory.model.js';
import type { PublicInventory } from './inventory.types.js';
import { inventoryRepository } from './inventory.repository.js';
import { stockMovementRepository } from '../stock-movements/stock-movement.repository.js';
import { StockMovementType } from '../stock-movements/stock-movement.types.js';
import { checkLowStock } from '../notifications/notification.service.js';
import { NotFoundError, ConflictError } from '../../errors/index.js';

export function toPublicInventory(inventory: InventoryDocument): PublicInventory {
  return {
    id: inventory._id.toString(),
    companyId: inventory.companyId.toString(),
    productId: inventory.productId.toString(),
    warehouseId: inventory.warehouseId.toString(),
    quantity: inventory.quantity,
    reserved: inventory.reserved,
    available: inventory.quantity - inventory.reserved,
    createdAt: inventory.createdAt,
    updatedAt: inventory.updatedAt,
  };
}

/**
 * Creates a new stock record and immediately checks whether its starting
 * quantity is already at/below the product's minStockLevel (e.g. someone
 * records a product they just started tracking with a low count). Wrapped
 * in a transaction since it's now a two-document write (Inventory +
 * possibly Notification).
 */
export async function createInventoryRecord(
  companyId: string,
  productId: string,
  warehouseId: string,
  quantity: number | undefined,
): Promise<PublicInventory> {
  const session = await mongoose.startSession();
  let created: InventoryDocument | null = null;

  try {
    await session.withTransaction(async () => {
      created = await inventoryRepository.create(
        { companyId, productId, warehouseId, quantity },
        session,
      );

      await checkLowStock(companyId, productId, warehouseId, created.quantity, session);
    });
  } finally {
    await session.endSession();
  }

  if (!created) {
    throw new ConflictError('Inventory creation failed unexpectedly');
  }

  return toPublicInventory(created);
}

/**
 * Applies a manual stock correction and, if the physical quantity actually
 * changed, records a StockMovement in the same transaction. Pure reservation
 * changes (reservedDelta only, quantityDelta of 0) don't create a movement -
 * nothing physically moved, stock was just earmarked or released.
 *
 * This is the same "atomic Inventory change + audit record" pattern used by
 * Purchases completion and Write-offs confirmation. Requires MongoDB running
 * as a replica set (see README).
 */
export async function adjustInventory(
  id: string,
  companyId: string,
  quantityDelta: number,
  reservedDelta: number,
  userId: string,
): Promise<PublicInventory> {
  const existing = await inventoryRepository.findByIdInCompany(id, companyId);
  if (!existing) throw new NotFoundError('Inventory record not found');

  const session = await mongoose.startSession();
  let updated: InventoryDocument | null = null;

  try {
    await session.withTransaction(async () => {
      updated = await inventoryRepository.adjustStock(
        id,
        companyId,
        quantityDelta,
        reservedDelta,
        session,
      );
      if (!updated) {
        throw new ConflictError(
          'Adjustment rejected: it would result in negative stock or reserved exceeding quantity',
        );
      }

      if (quantityDelta !== 0) {
        await stockMovementRepository.create(
          {
            companyId,
            productId: updated.productId.toString(),
            warehouseId: updated.warehouseId.toString(),
            type: StockMovementType.MANUAL_ADJUSTMENT,
            quantityDelta,
            quantityAfter: updated.quantity,
            createdBy: userId,
          },
          session,
        );

        await checkLowStock(
          companyId,
          updated.productId.toString(),
          updated.warehouseId.toString(),
          updated.quantity,
          session,
        );
      }
    });
  } finally {
    await session.endSession();
  }

  if (!updated) {
    throw new ConflictError('Adjustment failed unexpectedly');
  }

  return toPublicInventory(updated);
}
