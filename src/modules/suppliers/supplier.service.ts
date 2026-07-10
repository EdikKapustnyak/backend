import type { SupplierDocument } from './supplier.model.js';
import type { PublicSupplier } from './supplier.types.js';

export function toPublicSupplier(supplier: SupplierDocument): PublicSupplier {
  return {
    id: supplier._id.toString(),
    companyId: supplier.companyId.toString(),
    name: supplier.name,
    contactPerson: supplier.contactPerson,
    phone: supplier.phone,
    email: supplier.email,
    address: supplier.address,
    notes: supplier.notes,
    isActive: supplier.isActive,
    createdAt: supplier.createdAt,
    updatedAt: supplier.updatedAt,
  };
}
