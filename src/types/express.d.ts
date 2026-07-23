import type { Role } from '../modules/users/user.types.js';

export interface AuthContext {
  userId: string;
  companyId: string;
  role: Role;
  sessionId: string;
}

/** Deliberately separate from AuthContext above - a platform admin has no companyId/role in the tenant sense at all. */
export interface AdminAuthContext {
  adminId: string;
  sessionId: string;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
      adminAuth?: AdminAuthContext;
    }
  }
}

export {};
