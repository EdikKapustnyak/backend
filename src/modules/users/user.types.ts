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
  createdAt: Date;
}
