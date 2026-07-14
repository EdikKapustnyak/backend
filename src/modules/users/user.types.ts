import type { Types } from 'mongoose';

export enum Role {
  OWNER = 'owner',
  ADMIN = 'admin',
  MANAGER = 'manager',
  EMPLOYEE = 'employee',
}

export interface UserDocumentShape {
  _id: Types.ObjectId;
  companyId: Types.ObjectId;
  name: string;
  email: string;
  passwordHash: string;
  /**
   * false for a user created via the invite flow who hasn't clicked their
   * email link and chosen a real password yet - their passwordHash is an
   * unusable random placeholder until then. Always true for users created
   * via registerCompany (the owner sets their own password immediately).
   * login() checks this before comparing passwords.
   */
  passwordSet: boolean;
  role: Role;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Safe, public-facing representation of a user (never includes secrets). */
export interface PublicUser {
  id: string;
  companyId: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  /** true once the user has accepted their invite and chosen a password. */
  passwordSet: boolean;
  createdAt: Date;
}
