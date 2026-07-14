import type { CompanyDocument } from './company.model.js';
import type { PublicCompany } from './company.types.js';

export function toPublicCompany(company: CompanyDocument): PublicCompany {
  return {
    id: company._id.toString(),
    name: company.name,
    slug: company.slug,
    subscriptionPlan: company.subscriptionPlan,
    status: company.status,
    currentPeriodEnd: company.currentPeriodEnd,
    pastDueSince: company.pastDueSince,
    city: company.city,
    businessType: company.businessType,
    largeDiscrepancyAbsThreshold: company.largeDiscrepancyAbsThreshold,
    largeDiscrepancyPercentThreshold: company.largeDiscrepancyPercentThreshold,
    wasteAnalyticsDefaultLookbackDays: company.wasteAnalyticsDefaultLookbackDays,
    localEventsCacheTtlDays: company.localEventsCacheTtlDays,
    createdAt: company.createdAt,
    updatedAt: company.updatedAt,
  };
}
