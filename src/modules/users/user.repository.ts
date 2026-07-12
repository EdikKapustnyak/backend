import { UserModel, type UserDocument } from './user.model.js';
import type { Role } from './user.types.js';

interface CreateUserInput {
  companyId: string;
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
}

export const userRepository = {
  /** Includes passwordHash - only for authentication flows. */
  async findByEmailWithSecrets(email: string): Promise<UserDocument | null> {
    return UserModel.findOne({ email: email.toLowerCase() }).select('+passwordHash').exec();
  },

  async findByEmail(email: string): Promise<UserDocument | null> {
    return UserModel.findOne({ email: email.toLowerCase() }).exec();
  },

  /** Tenant-scoped lookup - always requires companyId to prevent cross-tenant access. */
  async findByIdInCompany(id: string, companyId: string): Promise<UserDocument | null> {
    return UserModel.findOne({ _id: id, companyId }).exec();
  },

  /**
   * Untenanted lookup - only for the refresh-token flow, where a verified
   * JWT gives us a trustworthy userId but not yet a companyId (the token
   * doesn't carry one). Every other lookup in this repository requires
   * companyId; this is the one deliberate exception.
   */
  async findById(id: string): Promise<UserDocument | null> {
    return UserModel.findById(id).exec();
  },

  async create(input: CreateUserInput): Promise<UserDocument> {
    return UserModel.create(input);
  },

  async existsByEmail(email: string): Promise<boolean> {
    const count = await UserModel.countDocuments({ email: email.toLowerCase() }).exec();
    return count > 0;
  },

  async findManyInCompany(companyId: string): Promise<UserDocument[]> {
    return UserModel.find({ companyId }).exec();
  },
};
