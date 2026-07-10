import type { Types } from 'mongoose';

export enum SubscriptionPlan {
  BASIC = 'basic',
  BUSINESS = 'business',
  ENTERPRISE = 'enterprise',
}

export enum CompanyStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
}

export interface CompanyDocumentShape {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  subscriptionPlan: SubscriptionPlan;
  status: CompanyStatus;
  createdAt: Date;
  updatedAt: Date;
}
