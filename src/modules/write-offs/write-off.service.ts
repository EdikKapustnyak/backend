import mongoose from 'mongoose';
import type { WriteOffDocument } from './write-off.model.js';
import { WriteOffStatus, type PublicWriteOff } from './write-off.types.js';
import { writeOffRepository } from './write-off.repository.js';
import { inventoryRepository } from '../inventory/inventory.repository.js';
import { NotFoundError, ConflictError } from '../../errors/index.js';

export function toPublicWriteOff(writeOff: WriteOffDocument): PublicWriteOff {
  return {
    id: writeOff._id.toString(),
    companyId: writeOff.companyId.toString(),
    productId: writeOff.productId.toString(),
    warehouseId: writeOff.warehouseId.toString(),
    quantity: writeOff.quantity,
    reason: writeOff.reason,
    notes: writeOff.notes,
    status: writeOff.status,
    createdBy: writeOff.createdBy.toString(),
    confirmedBy: writeOff.confirmedBy ? writeOff.confirmedBy.toString() : null,
    confirmedAt: writeOff.confirmedAt,
    createdAt: writeOff.createdAt,
    updatedAt: writeOff.updatedAt,
  };
}

/**
 * Confirms a draft write-off and decreases stock in the same MongoDB
 * transaction: either the status flip AND the stock decrement both commit,
 * or neither does. Stock sufficiency is re-checked HERE (not at draft
 * creation time), since time may have passed and other operations may have
 * consumed the stock in the meantime - the draft is a proposal, not a
 * reservation. Requires MongoDB running as a replica set (see README).
 */
export async function confirmWriteOff(
  id: string,
  companyId: string,
  confirmedBy: string,
): Promise<PublicWriteOff> {
  const existing = await writeOffRepository.findByIdInCompany(id, companyId);
  if (!existing) throw new NotFoundError('Write-off not found');
  if (existing.status !== WriteOffStatus.DRAFT) {
    throw new ConflictError(
      `Write-off cannot be confirmed from status "${existing.status}"`,
    );
  }

  const inventory = await inventoryRepository.findByProductAndWarehouse(
    companyId,
    existing.productId.toString(),
    existing.warehouseId.toString(),
  );
  if (!inventory) {
    throw new NotFoundError('No stock record exists for this product in this warehouse');
  }

  const session = await mongoose.startSession();
  let confirmed: WriteOffDocument | null = null;

  try {
    await session.withTransaction(async () => {
      const adjusted = await inventoryRepository.adjustStock(
        inventory._id.toString(),
        companyId,
        -existing.quantity,
        0,
        session,
      );
      if (!adjusted) {
        throw new ConflictError('Insufficient stock to confirm this write-off');
      }

      confirmed = await writeOffRepository.confirmInCompany(id, companyId, confirmedBy, session);
      if (!confirmed) {
        // Lost a race with a concurrent confirm/cancel request.
        throw new ConflictError('Write-off is no longer in draft status');
      }
    });
  } finally {
    await session.endSession();
  }

  if (!confirmed) {
    throw new ConflictError('Write-off confirmation failed unexpectedly');
  }

  return toPublicWriteOff(confirmed);
}
