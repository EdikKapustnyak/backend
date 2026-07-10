import type { StockMovementDocument } from './stock-movement.model.js';
import type { PublicStockMovement } from './stock-movement.types.js';

export function toPublicStockMovement(movement: StockMovementDocument): PublicStockMovement {
  return {
    id: movement._id.toString(),
    companyId: movement.companyId.toString(),
    productId: movement.productId.toString(),
    warehouseId: movement.warehouseId.toString(),
    type: movement.type,
    quantityDelta: movement.quantityDelta,
    quantityAfter: movement.quantityAfter,
    referenceType: movement.referenceType,
    referenceId: movement.referenceId ? movement.referenceId.toString() : null,
    notes: movement.notes,
    createdBy: movement.createdBy.toString(),
    createdAt: movement.createdAt,
  };
}
