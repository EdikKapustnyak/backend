import { z } from 'zod';
import { objectIdString } from '../../utils/objectId.js';
import { InventarizationStatus } from './inventarization.types.js';

function hasNoDuplicateProducts(entries: { productId: string }[]): boolean {
  return new Set(entries.map((entry) => entry.productId)).size === entries.length;
}

export const createInventarizationSchema = z.object({
  warehouseId: objectIdString,
  // If omitted, every product currently in stock at this warehouse is
  // auto-included, snapshotting its current quantity.
  productIds: z
    .array(objectIdString)
    .min(1)
    .refine((ids) => new Set(ids).size === ids.length, {
      message: 'Duplicate productId in productIds',
    })
    .optional(),
  notes: z.string().trim().max(1000).optional(),
});

export const recordCountsSchema = z.object({
  counts: z
    .array(
      z.object({
        productId: objectIdString,
        countedQuantity: z.number().int().nonnegative(),
      }),
    )
    .min(1, 'At least one count is required')
    .refine(hasNoDuplicateProducts, { message: 'Duplicate productId in counts' }),
});

export const listInventarizationsQuerySchema = z.object({
  page: z.string().optional(),
  perPage: z.string().optional(),
  warehouseId: objectIdString.optional(),
  status: z.nativeEnum(InventarizationStatus).optional(),
});

export type CreateInventarizationInput = z.infer<typeof createInventarizationSchema>;
export type RecordCountsInput = z.infer<typeof recordCountsSchema>;
export type ListInventarizationsQuery = z.infer<typeof listInventarizationsQuerySchema>;
