import type { Types } from 'mongoose';

/**
 * Deliberately its own top-level model - NOT a role/flag on the tenant
 * User model, and NOT scoped by companyId or wrapped in tenantScopePlugin.
 * A platform admin doesn't belong to any tenant; they see across all of
 * them. There is no public registration endpoint for this collection -
 * admins are provisioned via scripts/create-platform-admin.ts only (see
 * that script's own doc comment for why).
 */
export interface PlatformAdminDocumentShape {
  _id: Types.ObjectId;
  email: string;
  passwordHash: string;
  name: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicPlatformAdmin {
  id: string;
  email: string;
  name: string;
}
