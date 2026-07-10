import { z } from 'zod';
import { Role } from './user.types.js';

export const inviteUserSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password must be at most 72 characters'),
  role: z
    .nativeEnum(Role)
    .refine((role) => role !== Role.OWNER, {
      message: 'Cannot assign the owner role directly',
    }),
});

export type InviteUserInput = z.infer<typeof inviteUserSchema>;
