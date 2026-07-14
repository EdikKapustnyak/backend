import { Schema, model, type HydratedDocument } from 'mongoose';
import {
  InventarizationStatus,
  type InventarizationDocumentShape,
  type InventarizationItemShape,
} from './inventarization.types.js';
import { tenantScopePlugin } from '../../utils/tenantScopePlugin.js';

export type InventarizationDocument = HydratedDocument<InventarizationDocumentShape>;

const inventarizationItemSchema = new Schema<InventarizationItemShape>(
  {
    productId: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    systemQuantity: {
      type: Number,
      required: true,
      min: 0,
    },
    countedQuantity: {
      type: Number,
      default: null,
      min: 0,
    },
    discrepancy: {
      type: Number,
      default: null,
    },
  },
  { _id: false },
);

const inventarizationSchema = new Schema<InventarizationDocumentShape>(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    warehouseId: {
      type: Schema.Types.ObjectId,
      ref: 'Warehouse',
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(InventarizationStatus),
      default: InventarizationStatus.DRAFT,
      index: true,
    },
    items: {
      type: [inventarizationItemSchema],
      required: true,
      validate: {
        validator: (items: InventarizationItemShape[]) => items.length > 0,
        message: 'An inventarization must cover at least one product',
      },
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: null,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    completedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

inventarizationSchema.index({ companyId: 1, warehouseId: 1 });
inventarizationSchema.index({ companyId: 1, status: 1 });

inventarizationSchema.plugin(tenantScopePlugin);

export const InventarizationModel = model<InventarizationDocumentShape>(
  'Inventarization',
  inventarizationSchema,
);
