import { z } from 'zod';
import { Role } from './user.types.js';

export const inviteUserSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email(),
  role: z
    .nativeEnum(Role)
    .refine((role) => role !== Role.OWNER, {
      message: 'Cannot assign the owner role directly',
    }),
});

export type InviteUserInput = z.infer<typeof inviteUserSchema>;
