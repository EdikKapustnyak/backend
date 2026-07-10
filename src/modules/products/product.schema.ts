import { z } from 'zod';

export const createProductSchema = z.object({
  name: z.string().trim().min(2).max(150),
  sku: z.string().trim().min(1).max(64),
  category: z.string().trim().max(100).optional(),
  description: z.string().trim().max(2000).optional(),
  purchasePrice: z.number().nonnegative(),
  salePrice: z.number().nonnegative(),
  unit: z.string().trim().min(1).max(20).default('pcs'),
  minStockLevel: z.number().nonnegative().default(0),
  barcode: z.string().trim().max(64).optional(),
  photos: z.array(z.string().url()).max(10).optional(),
});

export const updateProductSchema = z
  .object({
    name: z.string().trim().min(2).max(150).optional(),
    category: z.string().trim().max(100).nullable().optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    purchasePrice: z.number().nonnegative().optional(),
    salePrice: z.number().nonnegative().optional(),
    unit: z.string().trim().min(1).max(20).optional(),
    minStockLevel: z.number().nonnegative().optional(),
    barcode: z.string().trim().max(64).nullable().optional(),
    photos: z.array(z.string().url()).max(10).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export const listProductsQuerySchema = z.object({
  page: z.string().optional(),
  perPage: z.string().optional(),
  search: z.string().trim().max(150).optional(),
  category: z.string().trim().max(100).optional(),
  isActive: z.enum(['true', 'false']).optional(),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;
