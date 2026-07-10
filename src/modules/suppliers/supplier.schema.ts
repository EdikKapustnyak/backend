import { z } from 'zod';

export const createSupplierSchema = z.object({
  name: z.string().trim().min(2).max(150),
  contactPerson: z.string().trim().max(150).optional(),
  phone: z.string().trim().max(30).optional(),
  email: z.string().trim().toLowerCase().email().optional(),
  address: z.string().trim().max(250).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export const updateSupplierSchema = z
  .object({
    name: z.string().trim().min(2).max(150).optional(),
    contactPerson: z.string().trim().max(150).nullable().optional(),
    phone: z.string().trim().max(30).nullable().optional(),
    email: z.string().trim().toLowerCase().email().nullable().optional(),
    address: z.string().trim().max(250).nullable().optional(),
    notes: z.string().trim().max(1000).nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export const listSuppliersQuerySchema = z.object({
  page: z.string().optional(),
  perPage: z.string().optional(),
  search: z.string().trim().max(150).optional(),
  isActive: z.enum(['true', 'false']).optional(),
});

export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;
export type ListSuppliersQuery = z.infer<typeof listSuppliersQuerySchema>;
