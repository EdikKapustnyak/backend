import { z } from 'zod';
import { SubscriptionPlan, CompanyStatus } from '../companies/company.types.js';

export const listAdminCompaniesQuerySchema = z.object({
  page: z.string().optional(),
  perPage: z.string().optional(),
  /** Matches against company name or owner email (same single search box as the design's Companies screen). */
  search: z.string().trim().max(160).optional(),
  tariff: z.nativeEnum(SubscriptionPlan).optional(),
  status: z.nativeEnum(CompanyStatus).optional(),
  /** ISO date string - only companies registered on/after this date. Backs the design's "Регистрация: последние 30/90 дней" filter. */
  registeredAfter: z.string().datetime().optional(),
});

export type ListAdminCompaniesQuery = z.infer<typeof listAdminCompaniesQuerySchema>;

/**
 * Matches the design's Override modal exactly: a separate tariff select
 * and a status select, either or both may be submitted together.
 * "extend_grace" is its own action (+14 days) rather than a plain status
 * value - see admin-company.repository.ts#applyOverride for why it can't
 * just be `status: 'past_due'` again.
 */
export const overrideCompanySchema = z
  .object({
    tariff: z.nativeEnum(SubscriptionPlan).optional(),
    statusAction: z.enum(['active', 'past_due', 'suspended', 'extend_grace']).optional(),
    reason: z.string().trim().min(1, 'Reason is required').max(500),
  })
  .refine((data) => data.tariff !== undefined || data.statusAction !== undefined, {
    message: 'At least one of tariff or statusAction must be provided',
  });

export type OverrideCompanyInput = z.infer<typeof overrideCompanySchema>;
