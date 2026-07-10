import type { Role } from '../modules/users/user.types.js';

export interface AuthContext {
  userId: string;
  companyId: string;
  role: Role;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

export {};
