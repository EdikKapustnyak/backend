import { Schema, model, type HydratedDocument } from 'mongoose';
import { SubscriptionPlan, CompanyStatus, type CompanyDocumentShape } from './company.types.js';

export type CompanyDocument = HydratedDocument<CompanyDocumentShape>;

const companySchema = new Schema<CompanyDocumentShape>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 120,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    subscriptionPlan: {
      type: String,
      enum: Object.values(SubscriptionPlan),
      default: SubscriptionPlan.BASIC,
    },
    status: {
      type: String,
      enum: Object.values(CompanyStatus),
      default: CompanyStatus.ACTIVE,
    },
  },
  { timestamps: true },
);

export const CompanyModel = model<CompanyDocumentShape>('Company', companySchema);
