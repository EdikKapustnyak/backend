import type { WarehouseDocument } from './warehouse.model.js';
import type { PublicWarehouse } from './warehouse.types.js';

export function toPublicWarehouse(warehouse: WarehouseDocument): PublicWarehouse {
  return {
    id: warehouse._id.toString(),
    companyId: warehouse.companyId.toString(),
    name: warehouse.name,
    location: warehouse.location,
    isActive: warehouse.isActive,
    createdAt: warehouse.createdAt,
    updatedAt: warehouse.updatedAt,
  };
}
