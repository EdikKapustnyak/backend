import type { Types } from 'mongoose';

export interface WarehouseDocumentShape {
  _id: Types.ObjectId;
  companyId: Types.ObjectId;
  name: string;
  location: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicWarehouse {
  id: string;
  companyId: string;
  name: string;
  location: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
