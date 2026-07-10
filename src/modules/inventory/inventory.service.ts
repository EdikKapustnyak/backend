import type { InventoryDocument } from './inventory.model.js';
import type { PublicInventory } from './inventory.types.js';

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
