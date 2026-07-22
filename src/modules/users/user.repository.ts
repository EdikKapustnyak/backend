import { UserModel, type UserDocument } from './user.model.js';
import { Role } from './user.types.js';

interface CreateUserInput {
  companyId: string;
  name: string;
  email: string;
  passwordHash: string;
  passwordSet: boolean;
  role: Role;
}

export const userRepository = {
  /**
   * Untenanted by design - email is globally unique across the platform
   * (see README Assumption #1), so login has to find a user by email
   * alone, before any companyId is known. Includes passwordHash - only for
   * authentication flows.
   */
  async findByEmailWithSecrets(email: string): Promise<UserDocument | null> {
    return UserModel.findOne({ email: email.toLowerCase() })
      .select('+passwordHash')
      .setOptions({ skipTenantScope: true })
      .exec();
  },

  /** Untenanted for the same reason as findByEmailWithSecrets above. Currently unused, kept for parity/future use. */
  async findByEmail(email: string): Promise<UserDocument | null> {
    return UserModel.findOne({ email: email.toLowerCase() })
      .setOptions({ skipTenantScope: true })
      .exec();
  },

  /** Tenant-scoped lookup - always requires companyId to prevent cross-tenant access. */
  async findByIdInCompany(id: string, companyId: string): Promise<UserDocument | null> {
    return UserModel.findOne({ _id: id, companyId }).exec();
  },

  /**
   * Untenanted lookup - only for the refresh-token flow, where a verified
   * JWT gives us a trustworthy userId but not yet a companyId (the token
   * doesn't carry one). setPassword() below is untenanted for the same
   * reason (accept-invite is a public endpoint, no auth context yet).
   * Every other lookup in this repository requires companyId.
   */
  async findById(id: string): Promise<UserDocument | null> {
    return UserModel.findById(id).setOptions({ skipTenantScope: true }).exec();
  },

  async create(input: CreateUserInput): Promise<UserDocument> {
    return UserModel.create(input);
  },

  /** Used only by the accept-invite flow to replace the placeholder hash with the user's real, chosen password. */
  async setPassword(id: string, passwordHash: string): Promise<UserDocument | null> {
    return UserModel.findByIdAndUpdate(
      id,
      { $set: { passwordHash, passwordSet: true } },
      { new: true },
    )
      .setOptions({ skipTenantScope: true })
      .exec();
  },

  /** Untenanted for the same reason as findByEmailWithSecrets above - a global uniqueness check. */
  async existsByEmail(email: string): Promise<boolean> {
    const count = await UserModel.countDocuments({ email: email.toLowerCase() })
      .setOptions({ skipTenantScope: true })
      .exec();
    return count > 0;
  },

  async findManyInCompany(companyId: string): Promise<UserDocument[]> {
    return UserModel.find({ companyId }).exec();
  },

  async countInCompany(companyId: string): Promise<number> {
    return UserModel.countDocuments({ companyId }).exec();
  },

  /**
   * Active owner/admin users' name+email, for notification emails
   * (notification.service.ts) - deliberately not "everyone", since
   * employees/managers typically aren't the ones acting on a low-stock or
   * discrepancy alert. Projected to just what the caller needs.
   */
  async findAdminRecipientsInCompany(companyId: string): Promise<{ name: string; email: string }[]> {
    return UserModel.find(
      { companyId, isActive: true, role: { $in: [Role.OWNER, Role.ADMIN] } },
      { name: 1, email: 1, _id: 0 },
    )
      .lean()
      .exec();
  },
};
