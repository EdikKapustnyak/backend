import { z } from 'zod';
import { AuditLogActionType } from './admin-audit-log.types.js';

export const listAuditLogQuerySchema = z.object({
  page: z.string().optional(),
  perPage: z.string().optional(),
  adminId: z.string().optional(),
  type: z.nativeEnum(AuditLogActionType).optional(),
  /** ISO date string - only entries on/after this date. Backs the design's "Период: 90/30/7 дней" filter. */
  since: z.string().datetime().optional(),
});

export type ListAuditLogQuery = z.infer<typeof listAuditLogQuerySchema>;
