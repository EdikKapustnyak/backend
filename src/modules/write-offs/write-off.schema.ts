import { z } from 'zod';
import { objectIdString } from '../../utils/objectId.js';
import { WriteOffReason, WriteOffStatus } from './write-off.types.js';

export const createWriteOffSchema = z.object({
  productId: objectIdString,
  warehouseId: objectIdString,
  quantity: z.number().int().positive(),
  reason: z.nativeEnum(WriteOffReason),
  notes: z.string().trim().max(1000).optional(),
});

export const listWriteOffsQuerySchema = z.object({
  page: z.string().optional(),
  perPage: z.string().optional(),
  productId: objectIdString.optional(),
  warehouseId: objectIdString.optional(),
  reason: z.nativeEnum(WriteOffReason).optional(),
  status: z.nativeEnum(WriteOffStatus).optional(),
});

export type CreateWriteOffInput = z.infer<typeof createWriteOffSchema>;
export type ListWriteOffsQuery = z.infer<typeof listWriteOffsQuerySchema>;
