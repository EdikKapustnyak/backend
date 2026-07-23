import { z } from 'zod';
import { registry, successResponse, commonErrorResponses, errorResponseSchema, validationErrorResponse } from '../registry.js';
import { listAdminCompaniesQuerySchema, overrideCompanySchema } from '../../modules/admin-companies/admin-company.schema.js';
import { SubscriptionPlan, CompanyStatus } from '../../modules/companies/company.types.js';
import { Role } from '../../modules/users/user.types.js';

const TAG = 'Platform Admin - Companies';

const adminCompanyListItemSchema = registry.register(
  'AdminCompanyListItem',
  z.object({
    id: z.string(),
    name: z.string(),
    ownerEmail: z.string().nullable(),
    tariff: z.nativeEnum(SubscriptionPlan),
    status: z.nativeEnum(CompanyStatus),
    usersCount: z.number(),
    warehousesCount: z.number(),
    registeredAt: z.string(),
    mrr: z.number(),
  }),
);

const adminCompanyDetailSchema = registry.register(
  'AdminCompanyDetail',
  adminCompanyListItemSchema.extend({
    city: z.string(),
    businessType: z.string().nullable(),
    productsCount: z.number(),
    lastActiveAt: z.string().nullable(),
    team: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        email: z.string(),
        role: z.nativeEnum(Role),
      }),
    ),
    invoices: z.array(
      z.object({
        id: z.string(),
        periodStart: z.string(),
        periodEnd: z.string(),
        amount: z.number(),
        status: z.string(),
      }),
    ),
  }),
);

registry.registerPath({
  method: 'get',
  path: '/admin/companies',
  tags: [TAG],
  summary: 'List every company on the platform',
  description:
    'Platform-admin only, deliberately cross-tenant. Searchable by company name or owner email, filterable by tariff/status/registration date. `mrr` is estimated from the plan\'s list price (0 for Basic/suspended), not a live Stripe read - see AdminCompanyListItem\'s doc comment.',
  request: { query: listAdminCompaniesQuerySchema },
  responses: {
    200: {
      description: 'Paginated list',
      content: {
        'application/json': {
          schema: successResponse(
            z.object({
              items: z.array(adminCompanyListItemSchema),
              pagination: z.object({
                page: z.number(),
                perPage: z.number(),
                totalItems: z.number(),
                totalPages: z.number(),
                hasNextPage: z.boolean(),
                hasPreviousPage: z.boolean(),
              }),
            }),
          ),
        },
      },
    },
    ...commonErrorResponses,
  },
});

registry.registerPath({
  method: 'get',
  path: '/admin/companies/{id}',
  tags: [TAG],
  summary: 'Get one company\'s full detail - team, counts, and Stripe invoice history',
  description:
    'Platform-admin only. No admin actions here yet (plan/status override, impersonation) - this is deliberately read-only, per the functional spec\'s priority order (companies list + detail comes before admin actions).',
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: { description: 'Company detail', content: { 'application/json': { schema: successResponse(adminCompanyDetailSchema) } } },
    404: { description: 'Not found', content: { 'application/json': { schema: errorResponseSchema } } },
    ...commonErrorResponses,
  },
});

registry.registerPath({
  method: 'post',
  path: '/admin/companies/{id}/override',
  tags: [TAG],
  summary: 'Manually change a company\'s tariff and/or subscription status',
  description:
    'Platform-admin only. Matches the design\'s Override modal: tariff and statusAction are independent and either/both may be submitted. statusAction "extend_grace" pushes pastDueSince forward 14 days rather than resubmitting the same past_due status - it only applies to a company that is currently past_due. `reason` is mandatory and is written to the audit log (GET /admin/audit-log) along with a human-readable description of exactly what changed.',
  request: {
    params: z.object({ id: z.string() }),
    body: { content: { 'application/json': { schema: overrideCompanySchema } } },
  },
  responses: {
    200: { description: 'Updated company detail', content: { 'application/json': { schema: successResponse(adminCompanyDetailSchema) } } },
    400: { description: 'No changes specified, or extend_grace requested on a non-past_due company', content: { 'application/json': { schema: errorResponseSchema } } },
    404: { description: 'Not found', content: { 'application/json': { schema: errorResponseSchema } } },
    422: validationErrorResponse,
    ...commonErrorResponses,
  },
});
