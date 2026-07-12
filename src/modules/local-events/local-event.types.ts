import type { Types } from 'mongoose';

export interface LocalEventItem {
  name: string;
  date: string;
  description: string;
  relevance: string;
}

export interface LocalEventsCacheDocumentShape {
  _id: Types.ObjectId;
  companyId: Types.ObjectId;
  city: string;
  businessType: string | null;
  events: LocalEventItem[];
  generatedAt: Date;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicLocalEvents {
  city: string;
  businessType: string | null;
  events: LocalEventItem[];
  generatedAt: Date;
  expiresAt: Date;
  /** True if this result came from cache rather than a fresh AI call. */
  fromCache: boolean;
}
