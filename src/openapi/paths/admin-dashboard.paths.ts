import { z } from 'zod';
import { registry, successResponse, commonErrorResponses } from '../registry.js';
import { SubscriptionPlan, CompanyStatus } from '../../modules/companies/company.types.js';

const TAG = 'Platform Admin - Dashboard';

const adminDashboardSummarySchema = registry.register(
  'AdminDashboardSummary',
  z.object({
    totalCompanies: z.number(),
    companiesByTariff: z.object({ basic: z.number(), business: z.number(), enterprise: z.number() }),
    totalMrr: z.number(),
    activeUsers: z.object({ count: z.number(), totalUsers: z.number(), windowDays: z.number() }),
    newLeads: z.object({ count: z.number(), openCount: z.number(), windowDays: z.number() }),
    needsAttention: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        tariff: z.nativeEnum(SubscriptionPlan),
        status: z.nativeEnum(CompanyStatus),
        hint: z.string(),
      }),
    ),
    recentLeads: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        company: z.string().nullable(),
        status: z.enum(['new', 'progress', 'done']),
        createdAt: z.string(),
      }),
    ),
    health: z.object({
      database: z.object({ ok: z.boolean(), latencyMs: z.number() }),
      stripe: z.object({ configured: z.boolean() }),
      email: z.object({ configured: z.boolean() }),
    }),
  }),
);

registry.registerPath({
  method: 'get',
  path: '/admin/dashboard',
  tags: [TAG],
  summary: 'Platform-wide overview - company counts, MRR, active users, leads, attention list, health',
  description:
    'Platform-admin only. A single aggregate endpoint rather than several small ones, since every widget on the Обзор screen loads together. totalMrr is a current-snapshot estimate (same as the Companies list) - there is no historical MRR tracking yet, so no trend/percentage-change is returned; a fabricated one would be worse than none. health.database is a real ping, not a hardcoded "ok".',
  responses: {
    200: { description: 'Dashboard summary', content: { 'application/json': { schema: successResponse(adminDashboardSummarySchema) } } },
    ...commonErrorResponses,
  },
});
