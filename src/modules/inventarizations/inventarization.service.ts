import mongoose from 'mongoose';
import type { InventarizationDocument } from './inventarization.model.js';
import {
  InventarizationStatus,
  type PublicInventarization,
} from './inventarization.types.js';
import { inventarizationRepository } from './inventarization.repository.js';
import { inventoryRepository } from '../inventory/inventory.repository.js';
import { warehouseRepository } from '../warehouses/warehouse.repository.js';
import { productRepository } from '../products/product.repository.js';
import { stockMovementRepository } from '../stock-movements/stock-movement.repository.js';
import { StockMovementType, StockMovementReferenceType } from '../stock-movements/stock-movement.types.js';
import { checkLowStock, flagDiscrepancyIfLarge } from '../notifications/notification.service.js';
import { NotFoundError, ConflictError, ValidationAppError } from '../../errors/index.js';

export function toPublicInventarization(doc: InventarizationDocument): PublicInventarization {
  return {
    id: doc._id.toString(),
    companyId: doc.companyId.toString(),
    warehouseId: doc.warehouseId.toString(),
    status: doc.status,
    items: doc.items.map((item) => ({
      productId: item.productId.toString(),
      systemQuantity: item.systemQuantity,
      countedQuantity: item.countedQuantity,
      discrepancy: item.discrepancy,
    })),
    notes: doc.notes,
    createdBy: doc.createdBy.toString(),
    completedBy: doc.completedBy ? doc.completedBy.toString() : null,
    completedAt: doc.completedAt,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

interface CreateInventarizationParams {
  warehouseId: string;
  productIds?: string[];
  notes?: string | null;
}

/**
 * Creates a draft inventarization for a warehouse. If productIds is omitted,
 * every product currently in stock at that warehouse is auto-included,
 * snapshotting its current Inventory.quantity as systemQuantity.
 */
export async function createInventarization(
  params: CreateInventarizationParams,
  companyId: string,
  userId: string,
): Promise<PublicInventarization> {
  const warehouse = await warehouseRepository.findByIdInCompany(params.warehouseId, companyId);
  if (!warehouse) throw new NotFoundError('Warehouse not found');

  let items: Array<{ productId: string; systemQuantity: number }>;

  if (params.productIds && params.productIds.length > 0) {
    items = [];
    for (const productId of params.productIds) {
      const product = await productRepository.findByIdInCompany(productId, companyId);
      if (!product) throw new NotFoundError(`Product ${productId} not found`);

      const inventory = await inventoryRepository.findByProductAndWarehouse(
        companyId,
        productId,
        params.warehouseId,
      );
      if (!inventory) {
        throw new NotFoundError(
          `No stock record exists for product ${productId} in this warehouse`,
        );
      }
      items.push({ productId, systemQuantity: inventory.quantity });
    }
  } else {
    const allInventory = await inventoryRepository.findAllByWarehouseInCompany(
      companyId,
      params.warehouseId,
    );
    if (allInventory.length === 0) {
      throw new NotFoundError('This warehouse has no stock records to inventarize');
    }
    items = allInventory.map((inv) => ({
      productId: inv.productId.toString(),
      systemQuantity: inv.quantity,
    }));
  }

  const inventarization = await inventarizationRepository.create({
    companyId,
    warehouseId: params.warehouseId,
    items,
    notes: params.notes ?? null,
    createdBy: userId,
  });

  return toPublicInventarization(inventarization);
}

/** Records counted quantities for one or more items already on the draft. */
export async function recordCounts(
  id: string,
  companyId: string,
  counts: Array<{ productId: string; countedQuantity: number }>,
): Promise<PublicInventarization> {
  const existing = await inventarizationRepository.findByIdInCompany(id, companyId);
  if (!existing) throw new NotFoundError('Inventarization not found');
  if (existing.status !== InventarizationStatus.DRAFT) {
    throw new ConflictError(
      `Counts can only be recorded while status is "draft" (current: "${existing.status}")`,
    );
  }

  const itemByProductId = new Map(
    existing.items.map((item) => [item.productId.toString(), item]),
  );

  const entries = counts.map((count) => {
    const item = itemByProductId.get(count.productId);
    if (!item) {
      throw new NotFoundError(`Product ${count.productId} is not part of this inventarization`);
    }
    return {
      productId: count.productId,
      countedQuantity: count.countedQuantity,
      discrepancy: count.countedQuantity - item.systemQuantity,
    };
  });

  const updated = await inventarizationRepository.recordCounts(id, companyId, entries);
  if (!updated) {
    throw new ConflictError('Inventarization is no longer in draft status');
  }

  return toPublicInventarization(updated);
}

/**
 * Completes an inventarization: requires every item to have been counted,
 * then applies each non-zero discrepancy to Inventory and logs a
 * StockMovement for it, all inside a single MongoDB transaction alongside
 * the status flip - either the whole thing commits, or none of it does.
 * Requires MongoDB running as a replica set (see README).
 */
export async function completeInventarization(
  id: string,
  companyId: string,
  userId: string,
): Promise<PublicInventarization> {
  const existing = await inventarizationRepository.findByIdInCompany(id, companyId);
  if (!existing) throw new NotFoundError('Inventarization not found');
  if (existing.status !== InventarizationStatus.DRAFT) {
    throw new ConflictError(
      `Inventarization cannot be completed from status "${existing.status}"`,
    );
  }

  const uncounted = existing.items.filter((item) => item.countedQuantity === null);
  if (uncounted.length > 0) {
    throw new ValidationAppError(
      `All items must be counted before completing (${uncounted.length} remaining)`,
    );
  }

  const session = await mongoose.startSession();
  let completed: InventarizationDocument | null = null;

  try {
    await session.withTransaction(async () => {
      for (const item of existing.items) {
        const discrepancy = item.discrepancy ?? 0;
        if (discrepancy === 0) continue; // exact match - nothing to adjust or log

        const inventory = await inventoryRepository.findByProductAndWarehouse(
          companyId,
          item.productId.toString(),
          existing.warehouseId.toString(),
        );
        if (!inventory) {
          throw new ConflictError(
            `Stock record for product ${item.productId.toString()} no longer exists`,
          );
        }

        const adjusted = await inventoryRepository.adjustStock(
          inventory._id.toString(),
          companyId,
          discrepancy,
          0,
          session,
        );
        if (!adjusted) {
          throw new ConflictError(
            `Could not apply the inventarization adjustment for product ${item.productId.toString()} - stock has changed since counting`,
          );
        }

        await stockMovementRepository.create(
          {
            companyId,
            productId: item.productId.toString(),
            warehouseId: existing.warehouseId.toString(),
            type: StockMovementType.INVENTARIZATION,
            quantityDelta: discrepancy,
            quantityAfter: adjusted.quantity,
            referenceType: StockMovementReferenceType.INVENTARIZATION,
            referenceId: existing._id.toString(),
            createdBy: userId,
          },
          session,
        );

        await checkLowStock(
          companyId,
          item.productId.toString(),
          existing.warehouseId.toString(),
          adjusted.quantity,
          session,
        );

        await flagDiscrepancyIfLarge(
          companyId,
          item.productId.toString(),
          existing.warehouseId.toString(),
          discrepancy,
          item.systemQuantity,
          existing._id.toString(),
          session,
        );
      }

      completed = await inventarizationRepository.completeInCompany(
        id,
        companyId,
        userId,
        session,
      );
      if (!completed) {
        // Lost a race with a concurrent complete/cancel request.
        throw new ConflictError('Inventarization is no longer in draft status');
      }
    });
  } finally {
    await session.endSession();
  }

  if (!completed) {
    throw new ConflictError('Inventarization completion failed unexpectedly');
  }

  return toPublicInventarization(completed);
}
