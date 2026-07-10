import { CompanyModel, type CompanyDocument } from './company.model.js';
import type { SubscriptionPlan } from './company.types.js';

interface CreateCompanyInput {
  name: string;
  slug: string;
  subscriptionPlan?: SubscriptionPlan;
}

export const companyRepository = {
  async create(input: CreateCompanyInput): Promise<CompanyDocument> {
    return CompanyModel.create(input);
  },

  async findBySlug(slug: string): Promise<CompanyDocument | null> {
    return CompanyModel.findOne({ slug }).exec();
  },

  async findById(id: string): Promise<CompanyDocument | null> {
    return CompanyModel.findById(id).exec();
  },

  async existsBySlug(slug: string): Promise<boolean> {
    const count = await CompanyModel.countDocuments({ slug }).exec();
    return count > 0;
  },
};
