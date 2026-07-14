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
    stripeCustomerId: {
      type: String,
      default: null,
      index: true,
    },
    stripeSubscriptionId: {
      type: String,
      default: null,
    },
    currentPeriodEnd: {
      type: Date,
      default: null,
    },
    pastDueSince: {
      type: Date,
      default: null,
    },
    city: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },
    businessType: {
      type: String,
      trim: true,
      maxlength: 100,
      default: null,
    },
    largeDiscrepancyAbsThreshold: {
      type: Number,
      required: true,
      min: 0,
      default: 10,
    },
    largeDiscrepancyPercentThreshold: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
      default: 20,
    },
  },
  { timestamps: true },
);

export const CompanyModel = model<CompanyDocumentShape>('Company', companySchema);
