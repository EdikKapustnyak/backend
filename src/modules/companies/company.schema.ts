import { z } from 'zod';

export const updateCompanyProfileSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    city: z.string().trim().min(2).max(100).optional(),
    businessType: z.string().trim().max(100).nullable().optional(),
    largeDiscrepancyAbsThreshold: z.number().int().nonnegative().optional(),
    largeDiscrepancyPercentThreshold: z.number().min(0).max(100).optional(),
    wasteAnalyticsDefaultLookbackDays: z
      .number()
      .int()
      .min(1)
      .max(365)
      .optional()
      .describe('Default lookback window (days) for GET /analytics/waste(/narrative) when `from` is not given'),
    localEventsCacheTtlDays: z
      .number()
      .int()
      .min(1)
      .max(30)
      .optional()
      .describe('How many days a GET /local-events result is cached before the next request calls the AI again'),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export type UpdateCompanyProfileInput = z.infer<typeof updateCompanyProfileSchema>;
