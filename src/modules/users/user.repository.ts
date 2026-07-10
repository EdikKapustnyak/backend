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
    return UserModel.findOne({ email: email.toLowerCase() })
      .select('+passwordHash +refreshTokenHash')
      .exec();
  },

  async findByEmail(email: string): Promise<UserDocument | null> {
    return UserModel.findOne({ email: email.toLowerCase() }).exec();
  },

  /** Tenant-scoped lookup - always requires companyId to prevent cross-tenant access. */
  async findByIdInCompany(id: string, companyId: string): Promise<UserDocument | null> {
    return UserModel.findOne({ _id: id, companyId }).exec();
  },

  /** Includes refreshTokenHash - only for token rotation/verification. */
  async findByIdWithRefreshHash(id: string): Promise<UserDocument | null> {
    return UserModel.findById(id).select('+refreshTokenHash').exec();
  },

  async create(input: CreateUserInput): Promise<UserDocument> {
    return UserModel.create(input);
  },

  async existsByEmail(email: string): Promise<boolean> {
    const count = await UserModel.countDocuments({ email: email.toLowerCase() }).exec();
    return count > 0;
  },

  async setRefreshTokenHash(userId: string, hash: string | null): Promise<void> {
    await UserModel.updateOne({ _id: userId }, { refreshTokenHash: hash }).exec();
  },

  async findManyInCompany(companyId: string): Promise<UserDocument[]> {
    return UserModel.find({ companyId }).exec();
  },
};
