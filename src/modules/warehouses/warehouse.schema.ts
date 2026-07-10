import { z } from 'zod';

export const createWarehouseSchema = z.object({
  name: z.string().trim().min(2).max(120),
  location: z.string().trim().max(250).optional(),
});

export const updateWarehouseSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    location: z.string().trim().max(250).nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export const listWarehousesQuerySchema = z.object({
  page: z.string().optional(),
  perPage: z.string().optional(),
  search: z.string().trim().max(120).optional(),
  isActive: z.enum(['true', 'false']).optional(),
});

export type CreateWarehouseInput = z.infer<typeof createWarehouseSchema>;
export type UpdateWarehouseInput = z.infer<typeof updateWarehouseSchema>;
export type ListWarehousesQuery = z.infer<typeof listWarehousesQuerySchema>;
