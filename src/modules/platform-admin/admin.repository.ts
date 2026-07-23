import { PlatformAdminModel, type PlatformAdminDocument } from './admin.model.js';

/**
 * No skipTenantScope anywhere here, unlike userRepository's equivalent
 * methods - PlatformAdminModel never has tenantScopePlugin attached in the
 * first place (see admin.model.ts), so there's no guard to bypass.
 */
export const platformAdminRepository = {
  async findByEmailWithSecrets(email: string): Promise<PlatformAdminDocument | null> {
    return PlatformAdminModel.findOne({ email: email.toLowerCase() }).select('+passwordHash').exec();
  },

  async findById(id: string): Promise<PlatformAdminDocument | null> {
    return PlatformAdminModel.findById(id).exec();
  },

  async existsByEmail(email: string): Promise<boolean> {
    const count = await PlatformAdminModel.countDocuments({ email: email.toLowerCase() }).exec();
    return count > 0;
  },

  async create(input: { email: string; passwordHash: string; name: string }): Promise<PlatformAdminDocument> {
    return PlatformAdminModel.create(input);
  },

  /** Backs the Audit log screen's "Администратор: все" filter dropdown - the full list is small (platform admins, not tenants), no pagination needed. */
  async findAll(): Promise<PlatformAdminDocument[]> {
    return PlatformAdminModel.find({}).sort({ email: 1 }).exec();
  },
};
