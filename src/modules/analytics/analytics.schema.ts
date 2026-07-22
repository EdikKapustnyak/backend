import { z } from 'zod';

const dateString = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), { message: 'Must be a valid date' })
  .transform((value) => new Date(value));

/** Generic from/to date-range query - reused as-is by both /analytics/waste and /analytics/revenue, name kept for backward compatibility. */
export const wasteAnalyticsQuerySchema = z
  .object({
    from: dateString.optional(),
    to: dateString.optional(),
  })
  .refine((data) => !data.from || !data.to || data.from <= data.to, {
    message: '"from" must be before or equal to "to"',
  });

export type WasteAnalyticsQuery = z.infer<typeof wasteAnalyticsQuerySchema>;
