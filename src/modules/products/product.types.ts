import type { Types } from 'mongoose';

export interface ProductDocumentShape {
  _id: Types.ObjectId;
  companyId: Types.ObjectId;
  name: string;
  sku: string;
  category: string | null;
  description: string | null;
  purchasePrice: number;
  salePrice: number;
  unit: string;
  minStockLevel: number;
  barcode: string | null;
  photos: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicProduct {
  id: string;
  companyId: string;
  name: string;
  sku: string;
  category: string | null;
  description: string | null;
  purchasePrice: number;
  salePrice: number;
  unit: string;
  minStockLevel: number;
  barcode: string | null;
  photos: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
