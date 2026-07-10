import { z } from 'zod';
import { objectIdString } from '../../utils/objectId.js';
import { PurchaseStatus } from './purchase.types.js';

const purchaseItemSchema = z.object({
  productId: objectIdString,
  quantity: z.number().int().positive(),
  unitPrice: z.number().nonnegative(),
});

function hasNoDuplicateProducts(items: { productId: string }[]): boolean {
  return new Set(items.map((item) => item.productId)).size === items.length;
}

export const createPurchaseSchema = z.object({
  supplierId: objectIdString,
  warehouseId: objectIdString,
  items: z
    .array(purchaseItemSchema)
    .min(1, 'At least one item is required')
    .refine(hasNoDuplicateProducts, { message: 'Duplicate productId in items' }),
  notes: z.string().trim().max(1000).optional(),
});

export const updatePurchaseSchema = z
  .object({
    supplierId: objectIdString.optional(),
    warehouseId: objectIdString.optional(),
    items: z
      .array(purchaseItemSchema)
      .min(1, 'At least one item is required')
      .refine(hasNoDuplicateProducts, { message: 'Duplicate productId in items' })
      .optional(),
    notes: z.string().trim().max(1000).nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export const listPurchasesQuerySchema = z.object({
  page: z.string().optional(),
  perPage: z.string().optional(),
  supplierId: objectIdString.optional(),
  warehouseId: objectIdString.optional(),
  status: z.nativeEnum(PurchaseStatus).optional(),
});

export type CreatePurchaseInput = z.infer<typeof createPurchaseSchema>;
export type UpdatePurchaseInput = z.infer<typeof updatePurchaseSchema>;
export type ListPurchasesQuery = z.infer<typeof listPurchasesQuerySchema>;
