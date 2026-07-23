import { z } from 'zod';
import { registry, successResponse, commonErrorResponses } from '../registry.js';
import { listAuditLogQuerySchema } from '../../modules/admin-audit-log/admin-audit-log.schema.js';
import { AuditLogActionType } from '../../modules/admin-audit-log/admin-audit-log.types.js';

const TAG = 'Platform Admin - Audit Log';

const publicAuditLogEntrySchema = registry.register(
  'AuditLogEntry',
  z.object({
    id: z.string(),
    adminEmail: z.string(),
    type: z.nativeEnum(AuditLogActionType),
    what: z.string(),
    companyId: z.string().nullable(),
    companyName: z.string().nullable(),
    reason: z.string().nullable(),
    createdAt: z.string(),
  }),
);

registry.registerPath({
  method: 'get',
  path: '/admin/audit-log',
  tags: [TAG],
  summary: 'List sensitive platform-admin actions (overrides, impersonation, feature flags)',
  description:
    'Platform-admin only, read-only - entries are written by the actions themselves (e.g. POST /admin/companies/:id/override), there is no direct write endpoint. Filterable by admin, action type, and since-date.',
  request: { query: listAuditLogQuerySchema },
  responses: {
    200: {
      description: 'Paginated list',
      content: {
        'application/json': {
          schema: successResponse(
            z.object({
              items: z.array(publicAuditLogEntrySchema),
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
  path: '/admin/audit-log/admins',
  tags: [TAG],
  summary: 'List every platform admin (for the "Администратор" filter dropdown)',
  responses: {
    200: {
      description: 'Admins',
      content: {
        'application/json': {
          schema: successResponse(z.array(z.object({ id: z.string(), email: z.string(), name: z.string() }))),
        },
      },
    },
    ...commonErrorResponses,
  },
});
