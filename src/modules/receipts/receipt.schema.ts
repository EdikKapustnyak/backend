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

/** Step 1 of the direct-to-R2 upload flow - see receipt.service.ts#requestUploadUrl. */
export const requestUploadUrlSchema = z.object({
  mimeType: z.string().trim().min(1),
});

/**
 * Step 2 - same fields as createReceiptSchema, plus the fileKey handed
 * back by step 1. Deliberately not extending createReceiptSchema with
 * `.extend()`: keeping the two schemas textually separate makes each
 * endpoint's full request shape readable on its own, without having to
 * mentally merge two definitions to know what a client actually sends.
 */
export const confirmUploadSchema = z.object({
  fileKey: z.string().trim().min(1),
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

/**
 * Validates Claude's raw OCR JSON output before it's trusted anywhere -
 * "never trust user input" extends to AI output too, since a
 * hallucinated/malformed shape shouldn't silently propagate. Deliberately
 * permissive on the date field (a plain string, not `dateString`'s
 * Date-transform) - the model isn't guaranteed to emit a parseable format,
 * and this is a suggestion for the caller to review, not a value going
 * straight into the database.
 */
export const receiptOcrResultSchema = z.object({
  amount: z.number().nonnegative().nullable(),
  date: z.string().nullable(),
  category: z.string().max(100).nullable(),
  notes: z.string().max(500).nullable(),
});

export type ReceiptOcrResult = z.infer<typeof receiptOcrResultSchema>;

export type CreateReceiptInput = z.infer<typeof createReceiptSchema>;
export type RequestUploadUrlInput = z.infer<typeof requestUploadUrlSchema>;
export type ConfirmUploadInput = z.infer<typeof confirmUploadSchema>;
export type UpdateReceiptInput = z.infer<typeof updateReceiptSchema>;
export type ListReceiptsQuery = z.infer<typeof listReceiptsQuerySchema>;
