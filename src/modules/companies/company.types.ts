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
  /** Used by the local-events AI feature to search for relevant events. Required since registration. */
  city: string;
  /** Free text (e.g. "кофейня", "ресторан") - used to make AI recommendations relevant. */
  businessType: string | null;
  /** A discrepancy of at least this many units is flagged as "large" during inventarization. */
  largeDiscrepancyAbsThreshold: number;
  /** A discrepancy of at least this % of the counted item's systemQuantity is flagged as "large". Stored as 0-100, not 0-1. */
  largeDiscrepancyPercentThreshold: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicCompany {
  id: string;
  name: string;
  slug: string;
  subscriptionPlan: SubscriptionPlan;
  status: CompanyStatus;
  city: string;
  businessType: string | null;
  largeDiscrepancyAbsThreshold: number;
  largeDiscrepancyPercentThreshold: number;
  createdAt: Date;
  updatedAt: Date;
}
