import type { UserDocument } from './user.model.js';
import type { PublicUser } from './user.types.js';

export function toPublicUser(user: UserDocument): PublicUser {
  return {
    id: user._id.toString(),
    companyId: user.companyId.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt,
  };
}
