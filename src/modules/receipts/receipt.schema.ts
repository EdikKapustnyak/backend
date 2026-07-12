import { z } from 'zod';
import { ReceiptType } from './receipt.types.js';

const dateString = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), { message: 'Must be a valid date' })
  .transform((value) => new Date(value));

export const createReceiptSchema = z.object({
  type: z.nativeEnum(ReceiptType),
  category: z.string().trim().max(100).optional(),
  amount: z.coerce.number().nonnegative().optional(),
  date: dateString.optional(),
  notes: z.string().trim().max(1000).optional(),
});

export const updateReceiptSchema = z
  .object({
    category: z.string().trim().max(100).nullable().optional(),
    amount: z.coerce.number().nonnegative().nullable().optional(),
    date: dateString.optional(),
    notes: z.string().trim().max(1000).nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export const listReceiptsQuerySchema = z.object({
  page: z.string().optional(),
  perPage: z.string().optional(),
  type: z.nativeEnum(ReceiptType).optional(),
  category: z.string().trim().max(100).optional(),
  from: dateString.optional(),
  to: dateString.optional(),
});

export type CreateReceiptInput = z.infer<typeof createReceiptSchema>;
export type UpdateReceiptInput = z.infer<typeof updateReceiptSchema>;
export type ListReceiptsQuery = z.infer<typeof listReceiptsQuerySchema>;
