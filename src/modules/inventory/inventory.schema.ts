import { z } from 'zod';
import { objectIdString } from '../../utils/objectId.js';

export const createInventorySchema = z.object({
  productId: objectIdString,
  warehouseId: objectIdString,
  quantity: z.number().int().nonnegative().optional(),
});

export const adjustInventorySchema = z
  .object({
    quantityDelta: z.number().int().optional(),
    reservedDelta: z.number().int().optional(),
  })
  .refine(
    (data) =>
      (data.quantityDelta !== undefined && data.quantityDelta !== 0) ||
      (data.reservedDelta !== undefined && data.reservedDelta !== 0),
    {
      message:
        'At least one non-zero delta (quantityDelta or reservedDelta) must be provided',
    },
  );

export const listInventoryQuerySchema = z.object({
  page: z.string().optional(),
  perPage: z.string().optional(),
  productId: objectIdString.optional(),
  warehouseId: objectIdString.optional(),
});

export type CreateInventoryInput = z.infer<typeof createInventorySchema>;
export type AdjustInventoryInput = z.infer<typeof adjustInventorySchema>;
export type ListInventoryQuery = z.infer<typeof listInventoryQuerySchema>;
